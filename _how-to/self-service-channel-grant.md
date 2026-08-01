---
title: Self-serve a channel membership grant
description: Allow-list an e-mail once instead of hand-signing a grant for every new member.
order: 13
---

# Self-serve a channel membership grant

[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})'s step 4 — the operator
hand-signing a `CT_CHANNEL_GRANT` for every member and getting it to them out of band — works, but it's a
manual round trip *every time* someone new joins, or needs to relaunch after losing their old grant. This
page is the self-service alternative: the owner allow-lists an e-mail once, and from then on anyone who
logs into the portal with that verified e-mail can claim their own membership directly — no operator
round trip needed to get *added as a member*.

<div class="callout warn">
What claiming does <strong>not</strong> do, confirmed against the handler source (<code>ClaimResp</code>
in <code>portal_api.rs</code> carries only <code>claimed: bool</code>, nothing else): it inserts a
<code>channel_members</code> row, it does not mint or return a <code>CT_CHANNEL_GRANT</code>. The edge's
broker still cryptographically verifies an operator-signed grant for both sides before pairing a channel
(<code>channel_broker.rs</code>'s <code>verify(operator_pubkey, ...)</code> on each presented grant) — that
check is entirely separate from, and unaffected by, the membership row this page's claim flow creates. A
standard <code>ct-agent channel</code> client still needs a real <code>CT_CHANNEL_GRANT</code> from the
operator (<code>ct-agent channel grant</code>) after claiming, exactly as before. Live-reproduced
2026-08-01: a claimed member with no separate grant gets exactly as far as the edge accepting the dial and
then a connection failure once the peer looks for a grant that was never issued — see
[Recover a channel when the operator key is lost]({{ '/how-to/recover-lost-channel-operator-key/' | relative_url }})
for the full, live-verified case this surfaced from.
</div>

## 1. The channel owner allow-lists an e-mail

Either from the CLI:

```bash
CT_AGENT_CP_URL=https://bunsenbrenner.org \
CT_GRANT_CHANNEL=<64 hex channel id> \
CT_OIDC_TOKEN=<your OIDC bearer token> \
./ct-agent channel allowlist add teammate@example.com
```

or the portal web UI — the same `POST /me/channels/:channel/allowlist` call either way, see
[Self-service channel allow-list & claim]({{ '/reference/api-endpoints/#self-service-channel-allow-list--claim' | relative_url }}).
This is owner-scoped: only the subject that registered the channel (`POST /me/channels`, see
[Self-service channel registry]({{ '/reference/api-endpoints/#self-service-channel-registry' | relative_url }}))
can manage its allow-list.

## 2. The invitee logs into the portal and finds the channel

No channel id needs to be communicated out of band anymore — once allow-listed, the channel shows up
automatically on **Your Channels** (linked in the nav on every portal page, e.g. from
[bunsenbrenner.org/portal/account](https://bunsenbrenner.org/portal/account)), matched against the
session's own verified sign-in e-mail. A channel not yet claimed shows a **Pending** badge and a **Claim**
link; the portal never shows another subject's invitations — the query is keyed to exactly the logged-in
session's own e-mail, nothing else.

<div class="callout">
Portal login is one of the endpoints this whole page depends on — if login itself fails on a
self-hosted deployment, check <code>GET /status</code>'s <code>oidc_enabled</code> field
(see <a href="{{ '/reference/api-endpoints/#status-and-network-info' | relative_url }}">API
endpoints</a>) before assuming a misconfiguration. <code>false</code> means the control plane's
own OIDC verifier isn't up right now — a known, recurring boot-race, not something wrong with
your allow-list or claim.
</div>

## 3. Generate key material locally

Same primitive [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})'s step 1
uses — private keys never leave the machine that generates them, and the claim form only ever asks for
the three *public* values it prints:

```bash
CT_CHANNEL_OPERATOR_PUBKEY=<channel operator's pubkey> \
CT_CHANNEL_BRIDGE_HOLDER=<the peer's holder_pubkey> \
CT_CHANNEL_HOLDER_KEY=<your own holder private key> \
CT_CHANNEL_NOISE_PUBKEY=<your own noise public key> \
./ct-agent channel member-material
```

```
holder_pubkey     = ...
noise_pubkey      = ...
channel_id        = ...
noise_attestation = ...
```

The claim form doesn't need `channel_id` from this output — you're claiming the channel already listed
on `/portal/channels`, and the control plane checks the attestation against *that* channel id server-side
(a mismatched `channel_id` here would simply fail attestation verification, not silently claim the wrong
channel).

## 4. Submit the claim

Paste `holder_pubkey`, `noise_pubkey`, and `noise_attestation` into the form on the channel's Claim page.
The server-side check is exactly [`verify_member_noise_attestation`]({{ '/reference/api-endpoints/#self-service-channel-registry' | relative_url }})
— the same one `POST /me/channels/:channel/members` runs for an owner-driven grant — so a forged or
un-attested key is rejected here too; the allow-list only ever authorizes *which* e-mail may join, never
*what key*. On success the page shows "Claimed -- you're now a member of this channel," and the
`/portal/channels` status flips from Pending to Claimed.

<div class="callout warn">
Live-verified end to end on 2026-08-01 against the real production control plane: a real portal account,
a real registered channel, a real allow-list entry, a real claim through the HTML form with a genuine
Ed25519-signed attestation — not just read from the handler code. Test data cleaned up afterward.
</div>

## When to still use the manual grant instead

The allow-list only gates *joining* — it doesn't replace
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})'s direct-address
connection step, and de-listing an e-mail (`POST /me/channels/:channel/allowlist/:email/remove`) stops a
*future* claim without revoking an already-claimed membership — that's still
`POST /me/channels/:channel/members/:holder/remove`. If a member never needs to log into the portal at
all (a fully headless/automated participant with no human behind it), the manual
`ct-agent channel grant` flow is still the more direct path — this page is for the case where a real
person is doing the joining and would otherwise need a raw channel id and grant hex handed to them out of
band.
