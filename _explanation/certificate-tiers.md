---
title: Certificate tiers — Rot, Gelb, Grün
description: Why three tiers exist, and what's actually different between them.
order: 1
---

# Certificate tiers — Rot, Gelb, Grün

Every tunnel moves through up to three certificate states. The names are German for red/yellow/green —
a traffic-light metaphor for "not reachable yet" → "reachable, shared trust" → "reachable, your own
trust."

This page is entirely about your own **browser-facing** subdomain's public certificate, issued by a
real public CA (Let's Encrypt) so ordinary browsers trust it. It's a different system from
[the internal Mesh-Plane CA]({{ '/explanation/mesh-plane-ca/' | relative_url }}) that Agents and
Clients trust for the tunnel's own transport — that one never goes through Rot/Gelb/Grün at all.

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
a real CA. Once issued, the edge stops terminating TLS on the platform's shared certificate for your
hostname and instead passes the connection through to your own origin, which now terminates TLS with
its own certificate.

<div class="callout warn">
As of 2026-08-01, every new hostname is assigned Let's Encrypt specifically — ZeroSSL and Google Trust
Services were deliberately pulled from the assignable rotation (operator decision,
<a href="https://github.com/scimbe/CADS-Tunnel/issues/262">#262</a>). Both require an EAB (External
Account Binding) credential, and the admission broker discloses that credential to every agent it
assigns to that CA — one fixed, operator-wide secret shared across every mutually-untrusted customer on
the platform, not scoped per tenant. Let's Encrypt needs no EAB at all, closing that exposure for every
hostname assigned going forward. This doesn't retroactively change anything already issued — a handful
of already-live hostnames (including this project's own demo tunnels) are still assigned ZeroSSL from
before this change and keep renewing against it; migrating them off is a separate, deliberately
unhurried piece of work, not something this change forces.
</div>

## The Gelb→Grün admission queue

Unlike Rot→Gelb, Gelb→Grün genuinely does certificate-authority work — and every CA enforces its own
issuance-rate limits. To stay inside those limits platform-wide, the control plane runs a periodic
admission sweep (confirmed live in production, ticking every 60 seconds) that tracks each active CA's
issuance budget over a rolling window and only offers a CA to a hostname when that CA still has headroom
— picking whichever eligible CA currently has the *most* headroom, and skipping any CA the deployment
hasn't configured credentials for (EAB) even if it looks technically eligible otherwise. If every active
CA is out of budget, your hostname simply waits at the back of a FIFO queue until headroom frees up.

Once the sweep offers you a CA, you're in a **48-hour claim window**: `ct-agent certificate` needs to
actually complete an order against that CA before the window closes. Miss it — the agent wasn't running,
the DNS-01 exchange kept failing, whatever the reason — and the offer lapses: the CA assignment is
cleared and your hostname doesn't automatically re-enter the queue. From the portal's tunnels page, a
lapsed hostname shows a **Erneut anfragen** ("request again") button that puts it back at the end of the
line; there's no equivalent from `ct-agent` itself today — see
[Manage your tunnel from the portal]({{ '/how-to/manage-your-tunnel/' | relative_url }}#if-your-certificate-offer-lapsed-erneut-anfragen)
for exactly what clicking it does.

An automatic-requeue fix plus a permanent opt-out checkbox are merged
([CADS-Tunnel#758](https://github.com/scimbe/CADS-Tunnel/issues/758)) but not yet deployed to this control
plane — many tunnels never run `ct-agent certificate` at all (a browser-tunnel-only setup has no reason
to), so every one of them silently dead-ends at "lapsed" today, a real fleet-wide gap the merged fix
closes once it ships.

<div class="callout">
The public <code>GET /agent/acme-admission/:routing_token/:hostname</code> endpoint (see
<a href="{{ '/reference/api-endpoints/' | relative_url }}">API endpoints</a>) intentionally exposes less
than the portal does: <code>claim_deadline</code> tells you an offer is open and when it closes, but
there's no <code>queue_position</code> or explicit "queued vs. offered vs. lapsed" field in the API
response — that finer state only renders in the portal's own tunnels page. If <code>ct-agent
certificate</code> looks like it's waiting, checking the portal is how you'd actually see whether that's
"queued, no CA offered yet" or "offered, counting down."
</div>

In practice this queue is invisible on a lightly-loaded deployment — a fresh tunnel usually gets offered a
CA on the very next sweep tick. It only becomes visible under real contention for a CA's rate limit
(this platform, being self-hosted at modest scale, cares about this enough to track CA budgets
per-CA rather than assume unlimited headroom).

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

The registry behind this — what it durably records, and the edge-to-edge relay leg it also
enables for a future second edge — is covered in
[The edge mesh registry]({{ '/explanation/edge-mesh-registry/' | relative_url }}).

## Should you go to Grün?

Only if you specifically need your own certificate — for compliance reasons, to run your own cert
pinning, or because you want your origin, not the platform, holding the private key. If you don't have a
specific reason, Gelb is not a "lesser" tier to eventually upgrade away from; it's the intended steady
state for most tunnels.
