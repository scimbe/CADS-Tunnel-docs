---
title: Authorize a new pipeline hostname (operator side)
description: Two authorize-host endpoints look interchangeable and aren't — one of them silently blocks Grün later.
order: 11
---

# Authorize a new pipeline hostname

This is the operator-side counterpart to [Publish your own pipeline]({{ '/how-to/publish-a-pipeline/' | relative_url }}):
before a headless pipeline agent can bind a hostname and go live, someone with the shared edge
admin token has to authorize that hostname for the agent's routing token. There are **two**
endpoints that look like they do the same thing. Only one of them actually finishes the job —
found the hard way, live, bringing two real demo hostnames up this session.

## The two endpoints

- **`POST /admin/authorize-host/:token/:host`** — the **edge's own** admin API (loopback-only in
  production; `CT_EDGE_ADMIN_LISTEN`). Authorizes the hostname at the edge's local `host_auth`
  map. That's it. Nothing else observes this call.
- **`POST /registry/authorize-host/:token/:host`** — a **control-plane** proxy to the exact same
  edge call (admin-token gated, same shared `CT_EDGE_ADMIN_TOKEN`/`CT_CP_EDGE_ADMIN_TOKEN`), reachable
  over the public HTTPS control plane rather than edge loopback. It does the edge call **and**
  records `(token, hostname)` ownership in the control plane's own mesh-ownership registry (see
  [The edge mesh registry]({{ '/explanation/edge-mesh-registry/' | relative_url }})).

<div class="callout warn">
Calling only the edge endpoint works fine right up until you try to reach <b>Grün</b>. Every fresh
tunnel gets synchronously pushed to the shared wildcard-cert <b>Gelb</b> tier as part of normal
onboarding (<a href="{{ '/explanation/certificate-tiers/' | relative_url }}">certificate tiers</a>)
— that's independent of which authorize-host endpoint you used. Promoting to Grün
(<code>POST /agent/acme-issuance-complete/:token/:host</code>,
see <a href="{{ '/how-to/gelb-to-gruen/' | relative_url }}">Go from Gelb to Grün</a>) checks
ownership against that same mesh-ownership registry — and if you only ever called the raw edge
endpoint, there's no record there at all. The real, reproduced symptom: a clean
<code>403 "this token is not the recorded owner of this hostname"</code>, forever, no matter how
many times you re-authorize at the edge directly. Confirmed live: two demo hostnames
(<code>a2a-demo.bunsenbrenner.org</code>, <code>auction-demo.bunsenbrenner.org</code>) sat on the
shared wildcard cert with their real, already-issued per-hostname certificates completely unused,
until switching to the control-plane endpoint fixed it in one call each.
</div>

## The correct sequence

```bash
# 1. Authorize through the control plane, not the edge directly.
curl -X POST "https://<your-cp-host>/registry/authorize-host/<routing-token>/<hostname>" \
  -H "x-ct-admin-token: <CT_EDGE_ADMIN_TOKEN>"

# 2. Bring the agent up with that same routing token (CT_AGENT_TOKEN=<routing-token>).
#    It's live now, on the shared Gelb wildcard cert.

# 3. Once a real per-hostname certificate is installed at the origin, promote to Grün:
curl -X POST "https://<your-cp-host>/agent/acme-issuance-complete/<routing-token>/<hostname>"
```

`scripts/authorize-pipeline.sh` in the CADS-Tunnel repo already does step 1 correctly (it calls
`/registry/authorize-host`, confirmed by reading it directly) — this gotcha only bites you if you
reach for the edge's `/admin/authorize-host` yourself, e.g. from a script or a manual `curl` against
`CT_CP_EDGE_ADMIN_URL` (a loopback-only convenience some deployments expose), rather than going
through the control plane.

## Related

- [Certificate tiers explained]({{ '/explanation/certificate-tiers/' | relative_url }}) — what
  Rot/Gelb/Grün actually mean and why a fresh tunnel always starts on the shared cert.
- [Go from Gelb to Grün]({{ '/how-to/gelb-to-gruen/' | relative_url }}) — the promotion step this
  page's sequence ends on, including the bring-your-own-certificate path used above.
- [The edge mesh registry]({{ '/explanation/edge-mesh-registry/' | relative_url }}) — what
  ownership recording actually is and why it's a separate, durable, control-plane-side fact instead
  of something the edge tracks on its own.
