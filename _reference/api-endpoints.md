---
title: API endpoints (public-facing)
description: Control-plane endpoints you can call directly, verified against the live deployment.
order: 2
---

# API endpoints — public-facing

Every response shape on this page was captured from a real call against `https://bunsenbrenner.org`,
not written from the source alone.

## Status and network info

**`GET /status`** — no auth. Aggregated operator counts (tunnels, agents, published pipelines,
discoverable agents, uptime, readiness). This is what the landing page's live status section polls.

**`GET /network-info`** — no auth.

```json
{"mesh_edge_port":4433,"channel_broker_port":4435,"channel_relay_port":4436}
```

Note: **ports only**, not full `host:port` strings — the host is whatever `CT_AGENT_CP_URL` points at.
The guided setup script combines them itself; if you're doing this by hand, do the same.

## Certificate admission status

**`GET /agent/acme-admission/:routing_token/:hostname`** — authenticated by the tunnel's own routing
token in the path (no separate header).

```json
{
  "status": "gruen",
  "may_issue_now": true,
  "assigned_ca": {
    "name": "zerossl",
    "directory_url": "https://acme.zerossl.com/v2/DV90",
    "requires_eab": true,
    "eab_kid": "...",
    "eab_hmac_key_b64url": "..."
  },
  "claim_deadline": null
}
```

`status` is one of `rot`, `gelb`, `gruen`. `claim_deadline` is set only while a Gelb→Grün claim window is
open; `null` once the tunnel is permanently Grün or hasn't entered the queue.

## Enrollment (admin-gated)

These require `x-ct-admin-token: <CT_CP_EDGE_ADMIN_TOKEN>` — they're for the operator's own tooling
(e.g. minting tokens for a specific tenant out-of-band), not something a regular user calls. A normal
user's join token comes from the portal's Install button instead.

**`POST /enroll/issue`** `{"tenant": "..."}` → `{"token": "..."}`

**`POST /admin/provision-tunnel`** `{"subject": "...", "name": "...", "hostname": "..."}` →
`{"routing_token": "...", "hostname": "..."}`

## Portal / OIDC login

**`GET /portal/login`** — redirects to Keycloak's login form (`/protocol/openid-connect/auth`).
Query params: `kc_idp_hint` (`google`|`github`|`gitlab`, skips straight to that provider),
`login_hint` (pre-fills the email field), `register` (any value — routes to Keycloak's registration
form instead of login).

**`POST /me/pipelines`** `{spec}` — publish a pipeline spec, owned by the caller's bearer-token subject.
Requires an OIDC bearer token from a real portal login, not an admin token.

## Agent directory

**`POST /registry/agents`** `{"holder_pubkey", "card_url", "role_tags"?, "skill_ids"?}` — admin-token
gated. `card_url` must be `https://`.

**`GET /registry/agents?role=&skill=`** — public, no auth. Search by exact role/skill token.

## Legal / static

**`GET /impressum`**, **`GET /datenschutz`**, **`GET /nutzungsbedingungen`** — real operator facts, not
placeholders. **`GET /llms.txt`** — the machine-readable onboarding doc, plain text.
