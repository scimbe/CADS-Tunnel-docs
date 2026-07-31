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

## What's actually different

Mesh Plane routes by an **opaque routing token**, not a hostname the operator's edge has to read to
route — the SNI/hostname-leakage Browser Plane accepts as a tradeoff simply doesn't apply. It's also not
HTTP-shaped at all: any protocol, including UDP, over a Noise-encrypted session your Client
authenticates end-to-end, with no TLS certificate anywhere in the path (no Rot/Gelb/Grün story here —
that's entirely a Browser Plane concept).

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

<div class="callout warn">
<strong>Honest scope of this page.</strong> This describes the real, source-verified Capability format
and the design it implements — it does not walk through building or running a Mesh Plane Client, and
this pass didn't click-test a live Mesh Plane connection the way the Agent-Fabric channel pages do.
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
derived from those two things still being live.
