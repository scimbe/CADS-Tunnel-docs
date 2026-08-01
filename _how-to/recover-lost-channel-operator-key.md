---
title: Recover a channel when the operator key is lost
description: The operator private key can't be recovered — provision a fresh channel instead, without disturbing either member's existing identity.
order: 14
---

# Recover a channel when the operator key is lost

[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) covers the normal path:
an operator mints a keypair (`ct-agent channel operator-init`), registers a channel, and signs a
`CT_CHANNEL_GRANT` for each member. This page covers what to do when that operator's **private** key —
`CT_CHANNEL_OPERATOR_KEY` — is gone: not misplaced-but-findable, actually gone (a password manager entry
never saved, scrollback that rolled off, a machine that's been wiped).

## Why there's no "recover" step

`CT_CHANNEL_OPERATOR_KEY` is an Ed25519 private key. There is no operation that derives a private key
back from its public half, by design — that's the entire point of asymmetric cryptography holding up here.
Nobody, including the platform operator, can re-sign a grant against an existing channel's registered
`operator_pubkey` without the matching private key. If you don't have it, that channel's ability to admit
*new* signed grants is permanently gone; already-issued grants for it keep working until they expire, but
you can't mint another one.

The forward path isn't recovery — it's provisioning a **new** channel with a **new** operator identity,
reusing both members' *existing* holder/noise identities unchanged. Neither member has to regenerate
anything or lose continuity; only the channel id and the grants change.

## What you need before starting

- A `ct-agent` binary (any release; this doesn't need a CADS-Tunnel checkout — the standalone binary from
  a running agent container works, e.g. `docker exec <container> ct-agent ...`).
- Each member's existing **holder public key** (not their private key — you never need it, and it should
  never leave their machine). If a member also still has shell access to wherever their private holder key
  lives, they can print their own public key locally without exposing the private one — see
  [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) for `channel init`'s
  output shape, which prints both.
- An OIDC bearer token for whichever account should own the new channel registration (any account works —
  channel ownership is bookkeeping, not a security boundary; see
  [Self-service channel registry]({{ '/reference/api-endpoints/#self-service-channel-registry' | relative_url }})).

## 1. Mint a fresh operator identity

```bash
ct-agent channel operator-init
```

```
# Agent-Fabric channel OPERATOR identity — generated locally, keep the key secret.
# Register this PUBLIC key as the channel authority (POST /channel/register):
#   operator_pubkey = <64 hex>
export CT_CHANNEL_OPERATOR_KEY=<64 hex — SECRET, never leaves this machine>
```

Store `CT_CHANNEL_OPERATOR_KEY` somewhere durable this time — a secrets manager, an encrypted `.env` next
to whatever provisioned the last one — precisely because losing it again means repeating this whole page.

## 2. Derive the new channel id from both members' existing public keys

`channel_id_for_link` is deterministic and **order-independent** — run it once, from either member's
perspective, with the operator pubkey from step 1 and the *other* member's holder pubkey as
`CT_CHANNEL_BRIDGE_HOLDER`:

```bash
CT_CHANNEL_OPERATOR_PUBKEY=<new operator_pubkey> \
CT_CHANNEL_BRIDGE_HOLDER=<member B's existing holder_pubkey> \
CT_CHANNEL_HOLDER_KEY=<member A's existing holder PRIVATE key> \
CT_CHANNEL_NOISE_PUBKEY=<member A's existing noise public key> \
ct-agent channel member-material
```

This prints `channel_id`, plus member A's `noise_attestation` for the next step. If you only have access
to member A's keys (the common case when you're recovering on behalf of one side and the other member has
to do their own half independently — see step 5), that's enough to compute the *same* channel id member B
will independently derive when they run their own `member-material` with the operator pubkey you give
them.

## 3. Register the channel and every member you have real material for

```bash
curl -X POST https://<your plane>/me/channels \
  -H "Authorization: Bearer <token>" -H 'content-type: application/json' \
  -d '{"channel":"<channel_id>","operator_pubkey":"<new operator_pubkey>"}'

curl -X POST https://<your plane>/me/channels/<channel_id>/members \
  -H "Authorization: Bearer <token>" -H 'content-type: application/json' \
  -d '{"holder":"<member_holder_pubkey>","noise_pubkey":"<member_noise_pubkey>","noise_attestation":"<from step 2>"}'
```

`noise_attestation` only verifies if it was signed by the exact holder private key behind the
`holder_pubkey` in the same request — a member's `member-material` output can't be forged or reused for a
different holder, so this step is safe to run with material anyone genuinely possessing that holder key
generated, not just the original operator.

## 4. Mint a grant for each member

```bash
CT_CHANNEL_OPERATOR_KEY=<new operator private key> \
CT_GRANT_CHANNEL=<channel_id> \
CT_GRANT_MEMBER_HOLDER=<member_holder_pubkey> \
CT_GRANT_DIRECTION=initiate \
CT_GRANT_EXPIRES=<unix seconds> \
ct-agent channel grant
```

Direction has to match how each side actually connects — the side that dials out uses `initiate`, the side
running a long-lived `--serve`/listener uses `accept`. Getting this backwards doesn't create a security
issue (it's a fresh, scoped, expiring grant either way) — it just fails admission cleanly and needs
re-minting with the direction flipped.

The output is the hex `CT_CHANNEL_GRANT` value for that member — hand it to them (chat, a shared secret
store, however you'd relay any credential) along with the new `channel_id`. Never hand over
`CT_CHANNEL_OPERATOR_KEY` itself to a member; they only ever need their own grant.

## 5. If you don't have one member's private keys at all

This is the realistic case: you're recovering on behalf of an operator who lost the key, but a *member*
still has their own private holder/noise keys safely on their own machine — you were never meant to have
those. That member runs step 2's `member-material` command themselves, locally, with the new operator
pubkey you give them and *your* holder pubkey (or whichever other member's) as `CT_CHANNEL_BRIDGE_HOLDER`,
and pastes back just the four printed public/attestation values — nothing secret crosses the wire. You take
that output straight into step 3's member-registration call, then mint their grant in step 4 using the
`holder_pubkey` they gave you — you never needed their private key for any of this.

If that member would rather go through the portal instead of running `ct-agent` locally, allow-listing
their e-mail and pointing them at
[Self-serve a channel membership grant]({{ '/how-to/self-service-channel-grant/' | relative_url }}) covers
the *membership* half of this identically. It does not cover step 4 — claiming never mints a grant (see
that page's callout) — so you still owe them a grant hex afterward regardless of which path they used to
get registered as a member.

## 6. Point the client config at the new channel

Wherever the old `channel_id` / `CT_CHANNEL_GRANT` pair was configured — a compose file's environment, a
systemd unit, a config management value — update both to the new ones from steps 2 and 4. Nothing else
about either member's setup needs to change: not their holder key, not their noise key, not their address
or listen configuration.

<div class="callout warn">
Live-verified 2026-08-01 against the real production control plane, for exactly this scenario: an
operator key genuinely lost, a fresh operator identity provisioned, both members' existing (unchanged)
holder keys carried over, a new channel registered end to end. The re-provisioned side's connection
attempt reached the broker and was admitted (<code>plane-brokered Initiate (relay ...)</code> in its log)
— proving the new operator/channel/grant chain verifies correctly — before failing with a plain connection
error because the *other* member hadn't updated their own config yet. That's the expected, correct state
partway through this procedure, not a bug in it.
</div>

## Related

- [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) — the normal,
  first-time provisioning flow this page's steps mirror.
- [Self-serve a channel membership grant]({{ '/how-to/self-service-channel-grant/' | relative_url }}) —
  the portal-driven alternative to step 5's manual paste-back, and what it does and doesn't cover.
- [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) and
  [How the edge decides whether to admit a channel join]({{ '/explanation/channel-admission/' | relative_url }})
  — the admission mechanics this recovery procedure has to satisfy.
