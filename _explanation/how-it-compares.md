---
title: How CADS-Tunnel compares
description: Point tunneling tools, mesh VPNs, zero-trust platforms — and where CADS-Tunnel actually differs, not just what it shares.
order: 12
---

# How CADS-Tunnel compares

[awesome-tunneling](https://github.com/anderspitman/awesome-tunneling) catalogs 80+ tools that solve
the same base problem: get traffic from outside to a service behind NAT/firewall. CADS-Tunnel does
that job too — `ct-agent onboard`, one command — and on that job alone it's a reasonable but
unremarkable entrant among ngrok, Cloudflare Tunnel, frp, rathole, chisel, bore, and the rest. This
page is about what's on top of that base: once two pieces of software can reach each other through a
hostile network, what do they actually do with the connection?

## Three buckets, not eighty rows

Scoring 80 tools individually mostly measures implementation details (Go vs. Rust, SSH vs. WebSocket
vs. QUIC) rather than architecture. Grouped by what they let you *build*, not how they're built:

1. **Point tunneling tools** — ngrok, Cloudflare Tunnel, frp, rathole, chisel, bore, localtunnel,
   sish, playit.gg, Pinggy, tunnelto, zrok, and roughly 60 others. One tunnel exposes one local
   service to one set of clients. No tool in this bucket has any notion of one tunneled agent
   addressing *another* tunneled agent — connectivity is always client↔service, never service↔service.
2. **Mesh/overlay VPNs** — Tailscale, headscale, NetBird, Nebula, ZeroTier, innernet, Firezone. These
   connect node-to-node, and Tailscale in particular uses the same hole-punch-then-relay pattern
   CADS-Tunnel uses for its own client↔agent path. But connectivity is network-wide — any two nodes
   the ACLs allow can generally reach each other — rather than an explicit, scoped, revocable,
   per-pair grant one side mints for the other.
3. **Zero-trust app-access platforms** — OpenZiti, Teleport, Pritunl, Octelium. Identity-gated access
   to an app/service, but the relationship is policy administered for humans/services, not an
   addressable unit two autonomous agents negotiate for themselves.

CADS-Tunnel sits in bucket 1 for the base tunnel job, but adds two things no tool in any of the three
buckets has: **agent-initiated, self-service, scoped connectivity between agents**
([Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }})), and a **live
auction** that decides who actually does the work once agents are connected
([Workflow pipelines and the crew auction]({{ '/explanation/workflow-pipelines/' | relative_url }})).

## At a glance

| | Point tunneling tools | Mesh/overlay VPNs | Zero-trust platforms | **CADS-Tunnel** |
|---|---|---|---|---|
| Core unit of connectivity | one tunnel = one exposed service | one node on a private network | one identity-gated app route | a tunnel **and** an addressable [Channel]({{ '/explanation/agent-fabric-channels/' | relative_url }}) between agents |
| NAT traversal | mostly relay-through-provider; some hole-punch | hole-punch first, relay fallback | varies | direct dial first, edge-relay fallback, `:443` front door as a last resort — see [the fallback ladder]({{ '/explanation/agent-fabric-channels/' | relative_url }}#the-fallback-ladder) |
| Payload confidentiality from the operator | mostly no — several terminate or see plaintext at the edge | yes, by design (WireGuard is E2E) | varies | yes — Noise, operator relays ciphertext only, see [Zero-knowledge architecture]({{ '/explanation/zero-knowledge/' | relative_url }}) |
| Agent-to-agent addressing | none | node-to-node exists but flat (network-wide ACLs, not per-pair scoped grants) | app-to-app is identity-gated, not agent-initiated | **Agent Fabric**: named Channels, grants scoped by direction/rights/expiry/delegability |
| Marketplace / auction-based work allocation | none | none | none | **crew auction**: role-scoped capacity offers cleared by policy, with signed escrow settlement underneath |
| Ad-hoc topology composition | none (star: provider ↔ each tunnel) | manual ACL graphs | manual policy graphs | [Topology Editor]({{ '/explanation/topology-editor/' | relative_url }}): a latency-weighted overlay optimizer over agent-drawn edges |
| Self-hosting | many are | most are | most are | yes — same binaries, hosted or self-host, one compose file |

## Where it actually differs

The base tunnel job (bucket 1) is table stakes — dozens of tools do it well. What's distinctive is
what CADS-Tunnel adds *on top*:

- **Agent-Fabric channels** give two agents a scoped, expiring, directional grant to talk to each
  other directly — not a flat bearer token, not network-wide reachability. See
  [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) for how a
  channel actually gets established, and
  [How the edge decides whether to admit a channel join]({{ '/explanation/channel-admission/' | relative_url }})
  for the admission mechanics underneath.
- **The crew auction** clears real, priced work among competing providers instead of routing to one
  fixed backend — see [Workflow pipelines and the crew auction]({{ '/explanation/workflow-pipelines/' | relative_url }}).
- **The Topology Editor** lets agents draw an overlay by hand and optimizes it, rather than requiring
  a manually-maintained ACL/policy graph — see
  [The Topology Editor]({{ '/explanation/topology-editor/' | relative_url }}).

## What we don't claim yet

Honesty is part of the pitch — this site doesn't fold "designed but not yet live" into the same
sentence as what's actually running. Two things worth being explicit about, since they're easy to
overstate by analogy to mesh VPNs' NAT-to-NAT hole-punching:

- **NAT-to-NAT relaying through a gated Circuit-Relay v2 node is live** (`CT_CHANNEL_RELAY_GATE`,
  see [the environment variable reference]({{ '/reference/channel-environment-variables/' | relative_url }})) —
  confirmed with two genuinely separate real members on separate networks, both sides NAT'd, no lab
  topology: grant + possession pre-auth against the edge, then a real reservation and circuit
  accepted on an internal, network-isolated relay-node, then a real Noise session and a real
  application reply carried over it. **What's still unconfirmed**: the further DCUtR *direct
  upgrade* — cutting the session over to a bare peer-to-peer link that bypasses the relay-node too,
  not just the edge relay. Every live session confirmed so far completed over the relay-node's
  circuit; none has shown a completed hole-punch handoff yet. So: real NAT-to-NAT reachability via a
  gated relay hop, not yet a confirmed zero-relay direct link.
- **Anonymity, censorship resistance, and immunity from lawful process** are explicitly not claimed —
  see [Zero-knowledge architecture]({{ '/explanation/zero-knowledge/' | relative_url }})'s own "What
  zero-knowledge does *not* mean" section. Accounts are conventional Keycloak/OIDC; the honest claim
  is payload confidentiality, not anonymity of who's running it.

## Related

- [What CADS-Tunnel is, and why]({{ '/explanation/what-and-why/' | relative_url }}) — the same
  proof-backed approach applied to CADS-Tunnel on its own, not against the landscape.
- [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) — the mechanism
  this page's "agent-to-agent addressing" row is about, in depth.
- [Workflow pipelines and the crew auction]({{ '/explanation/workflow-pipelines/' | relative_url }}) —
  the mechanism this page's "marketplace" row is about, in depth.
- [The Topology Editor]({{ '/explanation/topology-editor/' | relative_url }}) — the mechanism this
  page's "topology composition" row is about, in depth.
- [Zero-knowledge architecture]({{ '/explanation/zero-knowledge/' | relative_url }}) — what payload
  confidentiality actually covers, and what it doesn't.
