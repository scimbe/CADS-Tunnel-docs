---
title: Invite someone into your channel with a link
description: Mint a single-use link bound to a specific identity, instead of pre-allow-listing an e-mail and waiting.
order: 24
---

# Invite someone into your channel with a link

[Self-serve a channel membership grant]({{ '/how-to/self-service-channel-grant/' | relative_url }}) covers
the case where you know the *e-mail* of who should join and allow-list it ahead of time. This page covers
the other case: you already know exactly *which identity* should join — a demo's waiting room, a
participant a bridge is handing something concrete to — because they've already generated their key
material and sent you the public half. Instead of asking for their e-mail and hoping they log in with a
matching one, you mint a link bound to that specific identity. They log in, click confirm, and land with a
real membership under their own account.

<div class="callout warn">
Same caveat as the e-mail allow-list flow, confirmed against the same handler chain
(<code>claim_invite_confirm</code> runs the identical <code>do_claim</code> as
<code>POST /portal/channels/:channel/claim</code>): confirming an invite adds a <code>channel_members</code>
row, it does not mint or return a <code>CT_CHANNEL_GRANT</code>. A standard <code>ct-agent channel</code>
client still needs a real grant from the operator (<code>ct-agent channel grant</code>) after confirming —
see the same warning on
[Self-serve a channel membership grant]({{ '/how-to/self-service-channel-grant/' | relative_url }}#1-the-channel-owner-allow-lists-an-e-mail)
for what happens if you skip that step.
</div>

## 1. The joiner generates key material locally and sends you the public half

Same primitive [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})'s step 1 and
the e-mail allow-list flow's step 3 both use — private keys never leave the machine that generates them:

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

They send you `holder_pubkey`, `noise_pubkey` and `noise_attestation` — the three public values, nothing
private.

## 2. The channel owner mints the invite

API-only today — no portal button for this step yet, unlike the confirm side below. Owner-scoped, same
bearer token as every other `/me/channels` call
(see [Self-service channel registry]({{ '/reference/api-endpoints/#self-service-channel-registry' | relative_url }})):

```bash
curl -X POST https://bunsenbrenner.org/me/channels/<64 hex channel id>/claim-invites \
  -H "Authorization: Bearer <your OIDC token>" \
  -H "Content-Type: application/json" \
  -d '{"holder":"<holder_pubkey>","noise_pubkey":"<noise_pubkey>","noise_attestation":"<noise_attestation>","label":"optional name"}'
```

```json
{"invite":"<token>","url":"https://bunsenbrenner.org/portal/claim?invite=<token>","expires_at":1234567890}
```

The attestation is checked at mint time, not left for the joiner to hit as a confusing failure — a bad key
fails right here with a `400`. The link is single-use and expires in 15 minutes; send the `url` to the
joiner however you'd normally reach them (there's no in-band delivery, this only mints the link).

## 3. The joiner opens the link and confirms

Not logged in yet? The link round-trips through login and back to itself. Once logged in, the page shows
the channel, the label (if the owner set one), and the holder's identity, with a single **Join channel**
button — nothing to type, no channel id to communicate separately. Confirming records the membership under
the joiner's own sign-in, exactly like the allow-list-and-claim flow, so it shows up on both accounts'
[channels page]({{ '/how-to/manage-a-channel-from-the-portal/' | relative_url }}) and the owner can revoke
it the same way.

A used or expired link shows a plain "already used" / "expired" message rather than a raw error — safe to
click twice by accident, the second click just won't do anything.

## See also

- [Self-serve a channel membership grant]({{ '/how-to/self-service-channel-grant/' | relative_url }}) — the
  e-mail-allow-list alternative, better when you don't yet have the joiner's key material in hand.
- [API reference: owner-minted claim invites]({{ '/reference/api-endpoints/#owner-minted-claim-invites-514' | relative_url }})
  — exact request/response shapes and status codes.
