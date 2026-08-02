---
title: Mesh Plane and Capabilities
description: The default access mode — opaque-token routing and an out-of-band trust grant, not TLS.
order: 5
---

# Mesh Plane and Capabilities

Every other page on this site — [Your first tunnel]({{ '/tutorials/first-tunnel/' | relative_url }}),
`CT_AGENT_ORIGIN_PROTO`, the whole Rot/Gelb/Grün story — describes **Browser Plane** mode
(`CT_AGENT_MODE=browser`): an ordinary browser reaching an ordinary HTTPS site. It's not the default.
Leave `CT_AGENT_MODE` unset and `ct-agent` runs **Mesh Plane** instead — the mode
[ADR-0010](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0010-mesh-plane-first.md)
prioritized first, specifically because Browser Plane "structurally leaks the hostname to the operator"
via TLS SNI. Mesh Plane doesn't.

Browser Plane and an [Agent-Fabric channel]({{ '/explanation/agent-fabric-channels/' | relative_url }})
are not mutually exclusive — see
[Serve a tunnel and a channel together]({{ '/how-to/tunnel-plus-channel/' | relative_url }}) for running
both on the same service, as two independent `ct-agent` processes.

## What's actually different

Mesh Plane routes by an **opaque routing token**, not a hostname the operator's edge has to read to
route — the SNI/hostname-leakage Browser Plane accepts as a tradeoff simply doesn't apply. It's also not
HTTP-shaped at all: any protocol, including UDP, over a Noise-encrypted session your Client
authenticates end-to-end, with no TLS certificate anywhere in the path (no Rot/Gelb/Grün story here —
that's entirely a Browser Plane concept).

The UDP path specifically is real, not aspirational — `CT_AGENT_ORIGIN_PROTO=udp` (see
[Environment variables]({{ '/reference/environment-variables/' | relative_url }})) bridges datagrams
instead of a stream, and both ends are hermetically tested against a real UDP origin, re-confirmed
passing for this page: `ct-agent`'s `serve_noise_udp_bridges_datagrams_to_origin` on the Agent side, and
`ct-client`'s `udp_selftest`/`run_bench_udp` on the Client side. Same caveat as everywhere else on this
page: the Agent side is yours to configure with one env var, but consuming it still needs a Client that
speaks Mesh Plane's own framing over UDP — there's no browser or `curl` equivalent for this leg any more
than there is for TCP.

## The Capability: how a Client gets in, without the operator vouching for anything

A Browser Plane client just needs a public hostname to type into an address bar; a Mesh Plane Client
needs the routing token and a way to authenticate your Origin *before* the Noise handshake even runs.
Per [ADR-0014](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0014-out-of-band-capabilities.md),
`ct-agent` bundles exactly that into one self-contained artifact — a **Capability** — that you distribute
to your own authorized Clients through your own out-of-band channel (Signal, a password manager, however
you'd share any other credential). The operator only ever stores an opaque token-to-tunnel mapping; it
never holds your Origin's key and can't forge or be compelled to hand over what it doesn't have.

`CT_AGENT_CAPABILITY_OUT` (see
[Environment variables (core tunnel)]({{ '/reference/environment-variables/' | relative_url }})) is
where your agent writes this file — not fetched from the control plane, **minted locally**
(`mint_capability`, source-confirmed) from material the agent already has: a fresh random routing token
by default, its own Origin identity, and the edge address. The token it picks is simply what gets
registered in the platform's Tunnel Registry afterward — the agent originates the trust material, the
operator just records it.

The exact wire format, confirmed directly against `ct_common::Capability::encode`/`decode` in source:

```
routing_token (32 bytes) | origin_identity (32 bytes) | addr_len (u32 LE) | edge_addr (addr_len bytes)
```

`routing_token` is the same routing token your tunnel already has; `origin_identity` is your Origin's
static Noise public key, which a Client pins to authenticate the Origin end-to-end — this is the piece
that makes possession of the Capability alone sufficient to reach and trust your Origin, with no
operator involvement in that trust decision at all.

## How a Client actually reaches your Origin

Per [ADR-0015](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0015-p2p-mesh-with-rendezvous.md)
— the Tailscale/DERP model — holding a Capability doesn't mean traffic routes through the platform at
all. The edge only ever acts as a **rendezvous**: the Client presents its routing token (gated by a
small proof-of-work, so rendezvous itself can't be used as a cheap DoS lever), and if your Agent has
advertised a reachable direct address, the edge hands it to the Client to try. If that succeeds, traffic
flows Client↔Agent directly — the operator is genuinely out of the data path, not just claiming to be.
Otherwise the connection relays through the edge.

<div class="callout warn">
<strong>Correction to an earlier version of this page.</strong> This previously described the direct
path as automatic "NAT hole-punching" attempted for every connection. Checked again, properly this time,
by tracing where <code>CT_AGENT_DIRECT_ADVERTISE</code> is actually consumed
(<code>ct-agent</code>'s <code>serve.rs::run_agent</code>): the real shipped mechanism for <strong>Mesh
Plane tunnels</strong> is simpler and opt-in, not automatic STUN-style traversal — your Agent only
advertises a direct address at all if you set
<a href="{{ '/reference/environment-variables/' | relative_url }}"><code>CT_AGENT_DIRECT_ADVERTISE</code></a>
to an IP it's genuinely reachable at (a public IP, or one you've port-forwarded yourself); the guided
setup script doesn't set it, so a default onboarded tunnel is relay-only until you configure this
yourself. Real NAT-traversal engineering (libp2p's DCUtR hole-punch) does exist in this codebase, source-
confirmed in <code>ct-agent</code>'s <code>p2p.rs</code> — but it's for the separate
<a href="{{ '/explanation/agent-fabric-channels/' | relative_url }}">Agent-Fabric channel</a> system
(#121), not Mesh Plane tunnels, and even there it's only validated against a real 2-NAT lab setup, not
proven for every real-world NAT.
</div>

Confirmed real and currently passing, not just described in the ADR: `ct-client`'s own test suite
(`cargo test -p ct-client rendezvous::`, re-run hermetically for this page — 16 passed, 0 failed)
includes `client_tunnels_directly_to_agent` (a Client dialing an Agent's advertised address straight,
no edge involved) and `p2p_falls_back_to_relay_when_direct_fails` (an unreachable advertised address
degrades cleanly to relay) — both exercise the advertise-then-dial-or-relay mechanism above, not NAT
traversal. Also covered: both QUIC and the TCP/HTTP2 fallback transport, bidirectional streaming, and a
live `https_website_through_the_tunnel_with_client_side_cert_validation` case.

<div class="callout warn">
<strong>Honest scope of this page.</strong> The Capability format and the connection-establishment
mechanics above are both real, source- and test-suite-confirmed — but this pass didn't click-test a live
Mesh Plane connection against the production deployment the way the Agent-Fabric channel pages do.
<code>crates/client</code> in this repo (<code>ct-client</code>) reads like an internal smoke-test/bench
tool ("verifying the round-trip", printing labeled CSV rows for a latency sweep) rather than a
customer-facing application — consistent with the design itself: a Capability is meant to be consumed
by <em>your own</em> Client implementing the Noise handshake
(<a href="https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0013-noise-mesh-handshake.md">ADR-0013</a>),
not necessarily any specific binary this repo ships.
</div>

## Revocation

Per ADR-0014: revoking access is rotating the routing token and/or the Origin key — there's no separate
"Capability revocation" mechanism to reason about, because a Capability's own validity is entirely
derived from those two things still being live. Concretely:

- **Retire the routing token entirely** (every Capability minted against it stops working, permanently) —
  [Revoke on your tunnels page]({{ '/how-to/manage-your-tunnel/' | relative_url }}#revoke-a-tunnel).
- **Rotate just the Origin key** (invalidates Capabilities minted with the old key, without touching the
  routing token or requiring re-onboarding) — `ct-agent rotate`, in the
  [CLI reference]({{ '/reference/cli/' | relative_url }}#origin-key-rotation).
