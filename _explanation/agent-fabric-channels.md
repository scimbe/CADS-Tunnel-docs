---
title: Agent-Fabric channels
description: How agent-to-agent connections actually work — direct, relay, and the :443 escape hatch.
order: 3
---

# Agent-Fabric channels

The browser tunnel ([Zero-knowledge architecture]({{ '/explanation/zero-knowledge/' | relative_url }}))
gets your service *to* a browser. Agent-Fabric channels are the separate mechanism for connecting your
agent directly to *another agent* — what powers MCP tool-calling and workflow-pipeline coordination. This
page covers how a channel actually gets established, grounded in `ct-agent`'s own source
(`src/channel_run.rs`), not just the concept.

## Two ways to open a channel

**Direct address** (`CT_CHANNEL_ROLE=initiate|accept`, `CT_CHANNEL_ADDR=host:port`): the simplest case —
you already know the other agent's reachable address. No broker involved at all.

**Broker-mediated** (`CT_CHANNEL_BROKER`, `CT_CHANNEL_RELAY`, plus either `CT_CHANNEL_LISTEN` or
`CT_CHANNEL_RELAY_ONLY=1`): for the common case where you don't have a stable, dialable address for the
peer — most agents behind NAT or a firewall. The edge's broker helps two agents that have never directly
communicated find and verify each other.

<figure>
<img src="{{ '/assets/img/usecase-mcp.png' | relative_url }}" alt="The landing page's MCP section, showing an animated diagram of two agents connecting directly with a relay fallback path, plus a diagram of the public agent registry.">
<figcaption>The same diagrams, live on the landing page.</figcaption>
</figure>

## The fallback ladder

Whichever mode, the connection attempt follows a strict order, same encrypted session throughout — only
the transport route changes:

1. **Direct dial** — try to reach the peer's own address straight away.
2. **Relay ports** — if direct fails, route through the edge's dedicated relay.
3. **`:443` front door** (`CT_CHANNEL_FRONT_DOOR`, `CT_CHANNEL_FRONT_DOOR_CERT`) — if even the relay
   ports are blocked, fall all the way to the same port every browser's HTTPS traffic already uses. One
   of the few outbound ports almost no restrictive network blocks.

At every rung, the broker/relay only ever handles **ciphertext**, or — during initial rendezvous — an
attested public key the two agents need to verify each other. It never sees plaintext application data,
and it's never a permanent hub sitting in the middle of an established session: once two agents connect,
subsequent traffic isn't routed through a third party unless the relay rung is what succeeded.

## Upgrading from relay to direct, in-band

The fallback ladder above describes the *initial* connection attempt. There's a separate, later
opportunity: once a session has landed on the relay rung, `CT_CHANNEL_DIRECT_UPGRADE=1` opts it into
trying to cut over to a real direct link **mid-session**, negotiated **over the already-authenticated
relay stream itself** — no new port, no new listener, no restart of the handshake. Each side offers the
other its own edge-observed reflexive (post-NAT) address; the peer attempts one real UDP dial to it. If
that succeeds, the session cuts over to the direct link; if not, it stays on relay, transparently, with
no dropped bytes either way.

<div class="callout warn">
Real, live-tested result (2026-07-31, both directions independently confirmed — see
<a href="https://github.com/scimbe/CADS-Tunnel/issues/248">scimbe/CADS-Tunnel#248</a> for the full
traces): tested against two genuinely separate real networks — one peer with a public IP, one behind a
home NAT. In **both** cases the negotiation worked exactly as designed (candidate offered, a real direct
dial attempted, e.g. <code>#104 upgrade — direct dial to 89.56.48.254:1024 failed (Unreachable) —
staying on relay</code>) and the session continued cleanly on relay. In **neither** case did the direct
dial actually succeed. That's not a bug or an incomplete result — a bare UDP dial to a NAT'd address,
with no coordinated hole-punching on the other side, has essentially no chance of connecting. This
mechanism proves the negotiation and fallback are correct and safe in production; it is not, by itself,
a NAT-traversal solution. Real direct connectivity across NATs would need an actual hole-punch
coordinator (see <code>CT_CHANNEL_CIRCUIT_RELAY</code> below) — a distinct, larger piece of work, not
attempted by this mechanism.
</div>

Falls back automatically if the upgrade simply fails, or if a candidate isn't safe to dial — checked
**symmetrically on both sides** (global-unicast only, so a private or loopback address can never be
smuggled in as a "direct" target): the responder refuses to dial an unsafe address the peer offered
(`upgrade_safe_endpoint`, #137), and — since 2026-08-01 — the initiator applies the identical check to
its **own** reflexive address before ever offering it at all (`build_upgrade_candidate`, ct-agent
`883e20f`). Default off — unset, nothing about the fallback ladder above changes.

<div class="callout warn">
Found live, 2026-08-01: before the initiator-side check above existed, a member co-located with the edge
on the same Docker host (this project's own demos included — the edge observes that member's reflexive
address as a private Docker-bridge address, e.g. <code>172.18.0.19</code>) would still *offer* that
address as a direct-upgrade candidate. The responder's own guard correctly refused to dial it, but the
initiator had no timeout on that reply wait — so instead of a clean, fast fallback to relay, the whole
session hung for the full outer session timeout. Symptom looked like a generic stall, not an obviously
address-related bug. The fix (the symmetric check described above) makes the initiator skip offering the
doomed candidate in the first place, so a single-host deployment now degrades to relay-only
<strong>immediately</strong>, same as if the edge had reported no reflexive address at all — not after a
wasted round trip. Full trace: <a href="https://github.com/scimbe/CADS-Tunnel/issues/248">#248</a>.
</div>

## Admitting someone else's agent

Everything above assumes you're connecting your own agents to each other. The same channel mechanism
also supports admitting an agent that belongs to a *different* account: a redeemable invitation
(`POST /channel/invite/challenge` + `POST /channel/invite/redeem` — see
[API endpoints]({{ '/reference/api-endpoints/' | relative_url }}) for the exact shapes), proven by an
ed25519 signature over the invitation, single-use and expiring
(`consume_invitation` — replay is rejected, an expired invitation is rejected, confirmed directly against
the control plane's storage layer). Both endpoints are public and unauthenticated — proof-gated by the
signatures themselves, not a bearer token — so this is unaffected by whether `/me/*` is up. This is what
makes a pipeline able to span accounts, not just your own devices — see
[One service, several devices on the landing page](https://bunsenbrenner.org/#pipelines-usecase) for the
composition side of that.

## Related

- [How the edge decides whether to admit a channel join]({{ '/explanation/channel-admission/' | relative_url }})
  — what actually happens at the admission step this page's fallback ladder leads into, including a
  real reliability fix (fail-static vs. fail-closed) that shipped the same day this page was last
  touched.
- [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) — establish one for
  real: identity, admission, a live connection.
- [Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }}) —
  what an established channel is actually *for*: exposing a tool a peer can call.
- [Publish an agent card]({{ '/how-to/publish-an-agent-card/' | relative_url }}) — the discoverability
  layer this page's "Admitting someone else's agent" section assumes, made concrete.
- Every `CT_CHANNEL_*`/`CT_AGENT_CARD_*`/`CT_AGENT_OFFER_*` variable is documented in
  [Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }}).
