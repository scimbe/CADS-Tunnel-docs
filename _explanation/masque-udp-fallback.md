---
title: MASQUE — a third transport rung for networks that block UDP outright
description: What RFC 9298 CONNECT-UDP buys you when even the existing TCP fallback isn't enough, and why it has to run over HTTP/2, not HTTP/3.
order: 14
---

# MASQUE — a third transport rung for networks that block UDP outright

The data plane already has two rungs: QUIC (UDP) first, a TCP-framed fallback when UDP
dialing fails outright. That fallback works, but it isn't QUIC — no RFC 9000 connection
migration, and it's measurably more fragile under active interactive load on a hostile,
DPI-filtered network than QUIC's own loss/migration handling would be. MASQUE
([ADR-0024](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0024-masque-connect-udp-fallback.md))
is a third rung for exactly that gap: a network that blocks UDP at the DPI level, not
just drops a slow path.

## What it actually does

RFC 9298 (CONNECT-UDP) lets an agent reach a proxy over a connection the network *does*
allow, and tunnel arbitrary UDP datagrams through it — including a real QUIC connection,
so the agent gets QUIC's migration and loss-recovery properties back even though the
network itself never sees raw UDP on the wire.

**The one detail that makes or breaks this for the actual problem it solves**:
production MASQUE deployments (Cloudflare WARP, iCloud Private Relay) mostly run
CONNECT-UDP over HTTP/3 — itself QUIC/UDP — because their clients *can* reach the proxy
over UDP and want the performance. That's the opposite of this platform's failure case:
the agent's network blocks UDP outright, so an HTTP/3-native MASQUE proxy would be
exactly as unreachable as raw QUIC. RFC 9298's CONNECT-UDP method is built on Extended
CONNECT (RFC 9220), which is *also* defined for HTTP/2 over ordinary TCP/TLS on `:443` —
the same port and transport already open in a DPI-filtered network. This deployment
runs the MASQUE tunnel over **HTTP/2-over-TCP/443**, not HTTP/3, specifically because
getting that backwards would produce a feature that cannot help the one environment it
exists for.

## Where it sits

```
agent (UDP blocked) ──HTTP/2 CONNECT-UDP, TCP/443── masque-proxy ──UDP── edge's internal QUIC listener
```

`crates/masque-proxy` is a standalone service — an HTTP/2 CONNECT-UDP proxy
(RFC 9297 capsule framing) that accepts a tunneled connection and forwards its
datagrams to the edge's own internal QUIC listener. On the agent side,
`crate::masque::dial_quic_via_masque` (`ct-agent`, `native/src/masque/`) is a third dial
rung tried only after both QUIC and the TCP fallback have already failed.

## Opt-in on both ends

Nothing here is on by default — both sides need explicit configuration, and each side's
config independently gates the feature:

- **Agent**: all four of `CT_AGENT_MASQUE_PROXY` (proxy address), `CT_AGENT_MASQUE_SNI_HOST`,
  `CT_AGENT_MASQUE_TARGET` (the RFC 9298 CONNECT-UDP target, must byte-for-byte match the
  proxy's own target below), and `CT_AGENT_MASQUE_TOKEN` (a shared secret, presented as
  `x-ct-masque-token`) must be set together — leaving any one unset leaves MASQUE disabled
  and the agent falls back to plain TCP as before.
- **Operator** (the deployed `masque-proxy` service): `CT_MASQUE_PROXY_LISTEN`,
  `CT_MASQUE_PROXY_TARGET_ADDR`, `CT_MASQUE_PROXY_TOKEN` (must match the agent's token
  above — this is what stops the proxy being an open relay to anywhere, target-restriction
  alone isn't enough since the edge's own internal QUIC listener is otherwise reachable to
  anyone who can guess the target), plus `CT_MASQUE_PROXY_IDLE_TIMEOUT_SECS` and
  `CT_MASQUE_PROXY_MAX_TUNNELS` for resource bounds.

## Status

M1 (feasibility spike) through M4 (a real field trial on a UDP-blocked host) are all
complete and merged. This is a fallback rung an agent reaches for automatically once
configured — there's no separate command to run it; it's part of the same dial ladder
every `ct-agent` already walks (QUIC → TCP → MASQUE).

## Related

- [ADR-0024](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0024-masque-connect-udp-fallback.md)
  — the full design record, including the M1–M4 milestone history.
- [The three DNS-01 backends behind every cert on this platform]({{ '/explanation/dns-01-providers/' | relative_url }})
  — a similar "why three options, not one" piece about a different part of the transport story.
