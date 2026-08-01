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

**`POST /registry/authorize-host/:routing_token/:hostname`** — no body, `200` on success. Proxies to
the edge's own admin API (loopback-only in production) so a remote pipeline maintainer holding just
the shared admin token can self-serve host authorization over the public HTTPS control plane, and —
this is the part that matters — **records** the `(routing_token, hostname)` pair as owned in the
control plane's own durable registry.

<div class="callout warn">
This recording is not cosmetic: <code>POST /agent/acme-issuance-complete</code> above checks exactly
this record before promoting a tunnel to Grün. Calling the edge's raw
<code>/admin/authorize-host/:token/:host</code> directly (e.g. against a loopback
<code>CT_CP_EDGE_ADMIN_URL</code>) authorizes the hostname at the edge just as well, but skips this
recording step entirely — Grün promotion then fails forever with a clean, otherwise-unexplained
<code>403 "this token is not the recorded owner of this hostname"</code>. Reproduced live, twice, this
session. Always prefer this control-plane endpoint over the raw edge one; see
<a href="{{ '/how-to/authorize-a-pipeline-hostname/' | relative_url }}">Authorize a new pipeline
hostname</a> for the full real-world trap and fix.
</div>

**`POST /admin/provision-tunnel`** `{"subject": "...", "name": "...", "hostname": "..."}` →
`{"routing_token": "...", "hostname": "..."}`

**`POST /accounts/open`** no body → `{"account": "..."}` (mints a fresh account, once per customer),
**`POST /payment/intent`** `{"account": "...", "credits": <n>}` → `{"payment": "..."}`, and
**`POST /billing/issue`** `{"account": "...", "price": <n>}` → `{"token": "..."}` (a minted routing
token). Same
`x-ct-admin-token` gate as the two endpoints above — these are the server-side steps a payment-provider
integration runs after a real payment (open the account once, create an intent, then on the provider's
signed webhook confirming payment issue the credit), not something a customer or a customer-facing client
calls directly. They also fail closed: on a deployment that hasn't set `CT_CP_EDGE_ADMIN_TOKEN`, they're
absent entirely (`404`), not just unauthenticated, since crediting an account by name with no possession
proof would otherwise be an open door. The customer-facing balance paths are the session-authed portal's
`POST /portal/account/credits` top-up and the OIDC-bearer-authed `POST /me/issue` — this admin-gated trio
is deliberately not one of them.

## Portal / OIDC login

**`GET /portal/login`** — redirects to Keycloak's login form (`/protocol/openid-connect/auth`).
Query params: `kc_idp_hint` (`google`|`github`|`gitlab`, skips straight to that provider),
`login_hint` (pre-fills the email field), `register` (any value — routes to Keycloak's registration
form instead of login).

**`POST /me/pipelines`** `{spec}` — publish a pipeline spec, owned by the caller's bearer-token subject.
Requires an OIDC bearer token from a real portal login, not an admin token.

### Getting a bearer token without a browser

Every `/me/*` endpoint on this page needs one. A real portal login mints one automatically; scripting
against these endpoints needs the same token minted headlessly — standard OAuth2 Resource Owner Password
Credentials against Keycloak's own token endpoint, no CADS-Tunnel-specific API involved:

```bash
curl -X POST https://auth.bunsenbrenner.org/realms/ct-demo/protocol/openid-connect/token \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d 'grant_type=password' \
  --data-urlencode 'client_id=admin-cli' \
  --data-urlencode 'username=<your account email>' \
  --data-urlencode 'password=<your password>'
```

Returns a JSON body with `access_token` — send it as `Authorization: Bearer <token>`. Confirmed live: a
bad credential against this exact endpoint returns `401`, not a routing error. `client_id=admin-cli` is
Keycloak's built-in public client with direct-access-grants already enabled for this realm, not something
CADS-Tunnel had to add. Tokens are short-lived (a Keycloak realm default is minutes) — mint fresh per
scripting session rather than caching one.

<div class="callout warn">
Getting a token this way is unaffected by the <code>/me/*</code> outage note below — token minting is
pure Keycloak, entirely separate from the control plane's own OIDC verifier. A freshly-minted token can
still come back <code>404</code> when you actually use it against <code>/me/*</code> if that verifier
itself is down; the token being valid and the endpoint being reachable are two different things.
</div>

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

## Self-service channel allow-list & claim

The self-service alternative to hand-signing a grant for every new member (the flow above, and
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})'s step 4): the owner
allow-lists an e-mail once, and anyone who logs into the portal with that verified e-mail can claim their
own membership — no grant hex to generate, sign, or hand off out of band. Full walkthrough:
[Self-serve a channel membership grant]({{ '/how-to/self-service-channel-grant/' | relative_url }}).

Owner-scoped management, same bearer-token auth as `/me/channels` above:

**`POST /me/channels/:channel/allowlist`** `{"email": "someone@example.com"}` — allow-list an e-mail
(stored lowercased). `403` if you're not the channel's owner.

**`GET /me/channels/:channel/allowlist`** — list allow-listed e-mails for a channel you own. `{"emails": [...]}`.

**`POST /me/channels/:channel/allowlist/:email/remove`** — de-list an e-mail, no body. Stops a *future*
claim; does **not** revoke an already-claimed membership (that's still `POST
/me/channels/:channel/members/:holder/remove` above — allow-listing and membership are deliberately
separate).

Session-cookie-authed (a real portal login, not a bearer token — this is a browser-facing surface):

**`GET /portal/channels`** — the logged-in session's own "Your Channels" view: every channel the
session's *verified* e-mail is allow-listed for, each with a Pending/Claimed status. Redirects to
`/portal` if not logged in; renders a plain-language empty state (not an error) when the session has no
verified e-mail or no invitations at all.

**`GET /portal/channels/:channel/claim`** — the claim form for one channel (also linked from the row on
`/portal/channels`).

**`POST /portal/channels/:channel/claim`** `{"holder": "<64 hex>", "noise_pubkey": "<64 hex>", "noise_attestation": "<128 hex>"}`
— the JSON API a script can call instead of the HTML form (`.../claim-form`, url-encoded, same fields).
Same `noise_attestation` verification as the owner-driven `/me/channels/:channel/members` above (a
forged/un-attested key is rejected even though the caller isn't the owner) — the allow-list only
authorizes *which* e-mail may join, never *what key*. `403` if the session's verified e-mail isn't
allow-listed for this channel; `401`/redirect if not logged in at all.

<div class="callout warn">
Live-verified end to end on 2026-08-01: a real portal account, a real channel registered via
<code>POST /me/channels</code>, the account's own e-mail allow-listed via
<code>POST /me/channels/:channel/allowlist</code>, the channel showing up as <em>Pending</em> on
<code>/portal/channels</code>, a real Ed25519-signed Noise attestation submitted through the claim form,
and the status flipping to <em>Claimed</em> afterward — the exact round trip described above, not just
read from the handler code. Test channel and account cleaned up afterward.
</div>

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

<strong>Found live, 2026-08-01</strong> (<a href="https://github.com/scimbe/CADS-Tunnel/issues/328">#328</a>):
this isn't only a misconfiguration symptom — the JWKS fetch is a one-shot check at boot with no ongoing
retry, so a <em>correctly</em>-configured deployment that raced Keycloak at exactly the wrong moment
during its own restart (e.g. Keycloak still warming up) silently loses the entire <code>/me/*</code>
surface for the rest of that process's life, with no self-healing — confirmed on this very deployment,
which had worked for hours before a routine restart hit this window. A restart of the control plane
process (not the whole stack) is the actual fix once this happens; there's currently no way to tell it's
happening short of an operator noticing the 404s or checking the boot log for <code>CT_OIDC_ISSUER set
but the realm JWKS had no usable RS256 key after retrying</code>.
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
