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

**`POST /agent/acme-issuance-complete/:routing_token/:hostname`** — same path-based auth, no body. `200`
on success. Confirmed live: `403` on a bad token.

<div class="callout">
This is what actually flips a tunnel to Grün — <code>ct-agent certificate</code> calls it once its own
Let's Encrypt/ZeroSSL order finishes, but nothing about it is coupled to that specific flow. The
control plane doesn't verify a certificate exists; it trusts the routing token and reverts the edge to
passthrough. This is the real, previously-undocumented mechanism behind
<a href="https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0003-agent-held-certificates.md">ADR-0003</a>'s
"strict/air-gapped customers may instead supply their own certificate and key directly" — install your
own cert (from any CA) on your origin yourself, then call this endpoint to tell the platform you're
ready, and it's genuinely Grün, no ACME order ever run against this deployment.
</div>

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

## Self-service channel registry

The HTTP surface behind `ct-agent channel register` (see
[ct-agent CLI commands]({{ '/reference/cli/' | relative_url }})) and the self-service provisioning flow
in [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}). All three require an
OIDC bearer token, same as `/me/pipelines`; the `owner` is always the verified token subject, never a
request field, so a caller can only register or manage channels they own.

**`POST /me/channels`** `{"channel": "<64 hex>", "operator_pubkey": "<64 hex>"}` — register a channel
you own. `channel` is any 32-byte hex id you pick (doesn't have to be derived — `channel_id_for_link` or
`channel_id_for_pipeline_role` are just the conventions this platform's own tooling uses to avoid an
out-of-band ID exchange, not a server-enforced requirement). `403` if that channel id is already owned by
a different subject.

**`POST /me/channels/:channel/members`** `{"holder": "<64 hex>", "noise_pubkey": "<64 hex>", "noise_attestation": "<128 hex>"}`
— add a member. `noise_attestation` is the member's own ed25519 signature over
`member_noise_attest_bytes(channel, holder, noise_pubkey)` — the control plane verifies it server-side,
so an owner can't seed a forged or un-attested Noise key even for a channel they own. `400` if it doesn't
verify; `403` if you're not the channel's owner.

**`POST /me/channels/:channel/members/:holder/remove`** — revoke a member, no body. Same `403` if you're
not the owner.

## Cross-account channel invitations

How [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }})' "admitting
someone else's agent" actually works over HTTP. Unlike everything else on this page below "Portal / OIDC
login", these two are **public, unauthenticated, and unaffected by the `/me/*` outage noted below** — no
bearer token, no admin token. They're proof-gated instead: only someone holding the right signatures can
do anything with them.

**`POST /channel/invite/challenge`** — no body. `{"challenge": "<hex>"}`, a fresh single-use nonce the
invitee binds into its redemption signature (defense-in-depth against a captured redemption being
replayed, independent of the invitation's own single-use record).

**`POST /channel/invite/redeem`** `{"invitation": "<hex>", "redeem_sig": "<128 hex>", "holder": "<64 hex>", "noise_pubkey": "<64 hex>", "noise_attestation": "<128 hex>", "challenge": "<64 hex, optional>"}`
— redeem an operator-signed invitation into real channel membership. `invitation` is the operator's
signed grant of entry (hex-encoded `SignedChannelInvitation`); `redeem_sig` is the invitee's own
signature proving *they* accepted and chose this `holder` key, not just that they possess someone else's
invitation. `404` on an unknown channel, `410` on an expired invitation, `403` on any other verification
failure.

<div class="callout warn">
Honest gap: there's no <code>ct-agent</code> CLI command to actually <em>issue</em> a
<code>SignedChannelInvitation</code> today (only <code>ct_common::channel</code>'s library primitives)
— the endpoint shapes above are cross-checked directly against the handler code and its request/response
structs, but this pass didn't build a standalone signer to click-test a full round-trip the way
<a href="{{ '/how-to/join-a-channel/' | relative_url }}">the direct-address channel connection</a> was.
Flagged here rather than presented as verified end to end.
</div>

<div class="callout warn">
This and every other <code>/me/*</code> endpoint only exist when the control plane's OIDC verifier is
configured <em>and</em> found a usable signing key in the realm's JWKS at boot — if either isn't true,
the whole <code>/me/*</code> surface is silently absent (a plain <code>404</code>, not <code>401</code>),
not just unauthorized. If you get a 404 here instead of a login-required response, that's what's
happening, not a wrong path.
</div>

## Pipeline registry

**`POST /registry/pipelines`** `{owner?, spec}` — admin-token gated, upserts a published `PipelineSpec`
(machine-writer path; a human publishing their own pipeline uses `POST /me/pipelines` above instead).

**`GET /registry/pipelines`** — public, no auth. `[{"id", "owner"}]` for every published pipeline —
what [Workflow pipelines & the auction model]({{ '/explanation/workflow-pipelines/' | relative_url }})
and the landing page's pipeline registry table both read.

**`GET /registry/pipelines/:id`** — public, no auth. The full spec:

```json
{
  "id": "flappy-demo",
  "roles": [
    {"service": "TextGeneration", "units": 1, "tag": "physics", "selection_policy": null},
    {"service": "TextGeneration", "units": 1, "tag": "art", "selection_policy": null},
    {"service": "SafetyCheck", "units": 1, "tag": "safety_check", "selection_policy": null}
  ],
  "operator_pubkey_hex": null,
  "selection_policy": "LowestFloor"
}
```

`selection_policy` is the pipeline-wide default (`LowestFloor`/`RoundRobin`/`LeastCalls`); a role can
override it individually via its own `selection_policy`, `null` here meaning "inherit the pipeline
default." `ct-agent channel join-pipeline-role` reads this to derive a role's channel id without needing
a pairwise key exchange first — see
[ct-agent CLI commands]({{ '/reference/cli/' | relative_url }}).

## Agent directory

**`POST /registry/agents`** `{"holder_pubkey", "card_url", "role_tags"?, "skill_ids"?}` — admin-token
gated. `card_url` must be `https://`.

**`GET /registry/agents?role=&skill=`** — public, no auth. Search by exact role/skill token.

## Legal / static

**`GET /impressum`**, **`GET /datenschutz`**, **`GET /nutzungsbedingungen`** — real operator facts, not
placeholders. **`GET /llms.txt`** — the machine-readable onboarding doc, plain text.
