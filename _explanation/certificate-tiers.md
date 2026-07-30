---
title: Certificate tiers — Rot, Gelb, Grün
description: Why three tiers exist, and what's actually different between them.
order: 1
---

# Certificate tiers — Rot, Gelb, Grün

Every tunnel moves through up to three certificate states. The names are German for red/yellow/green —
a traffic-light metaphor for "not reachable yet" → "reachable, shared trust" → "reachable, your own
trust."

## Rot

A tunnel that's been created but hasn't yet authorized at the edge — the hostname exists in the control
plane's records, but the edge doesn't know to route it to your agent yet. This should be near-instant:
authorizing the hostname at the edge happens synchronously as part of the same request that creates the
routing, not on a background delay. (It wasn't always — see the note below.)

## Gelb

The edge terminates TLS for your hostname using a certificate shared across every Gelb-tier tunnel on
the platform (a wildcard covering the whole zone). This is what a freshly-onboarded tunnel gets, and
it's normal and sufficient for most uses: your browser sees a real, trusted certificate; the connection
is genuinely encrypted; nothing about "shared certificate" weakens the transport security between the
browser and the edge.

What Gelb does *not* give you: a certificate that names your specific service, or one you hold the
private key for. If that distinction matters for your use case, that's what Grün is for.

## Grün

Your tunnel gets its own, individually-issued certificate (`ct-agent certificate` — see
[Go from Gelb to Grün]({{ '/how-to/gelb-to-gruen/' | relative_url }})), obtained via ACME/DNS-01 against
a real CA (Let's Encrypt or ZeroSSL, depending on current CA rotation and headroom). Once issued, the
edge stops terminating TLS on the platform's shared certificate for your hostname and instead passes the
connection through to your own origin, which now terminates TLS with its own certificate.

## Why the delay between Rot and Gelb used to matter

Historically, the platform advertised that Rot→Gelb was synchronous but a bug meant the promotion
actually only happened on the periodic admission-sweep tick (up to 60 seconds) — a real defect, since
Rot→Gelb involves no certificate-authority work at all, unlike Gelb→Grün which genuinely does. This was
found and fixed; a fresh tunnel now reaches Gelb in the same request that authorizes it at the edge, not
on a delay. The periodic sweep still exists as a safety net for the cases that can't be synchronous
(edge-admin transiently unreachable, a race on restart), not as the primary mechanism.

## What happens to an already-authorized tunnel if the edge restarts

A separate question from Rot→Gelb timing: if your tunnel is already Gelb or Grün and the platform's edge
process itself restarts (a maintenance redeploy, for example), does your hostname have to be
re-authorized from scratch? Confirmed live, not assumed: no — the edge rehydrates every hostname
authorization it owns from the control plane's persistent registry on boot, before serving any traffic.
A fresh edge process starting today logs exactly this:

```
ct-edge: mesh-registry heartbeat/rehydration enabled against http://control-plane:8090 (CT_EDGE_ID=primary)
ct-edge: rehydrated 36 hostname authorization(s) from http://control-plane:8090 (edge_id=primary)
```

Practically: your `ct-agent` process reconnecting after an edge restart is a normal transport
reconnection, not a re-authorization — the edge already knows your hostname is yours again by the time
your agent redials. This closes the class of outage where an edge restart used to make every hostname
look unclaimed until each tunnel's agent happened to redial and re-register.

## Should you go to Grün?

Only if you specifically need your own certificate — for compliance reasons, to run your own cert
pinning, or because you want your origin, not the platform, holding the private key. If you don't have a
specific reason, Gelb is not a "lesser" tier to eventually upgrade away from; it's the intended steady
state for most tunnels.
