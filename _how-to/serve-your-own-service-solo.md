---
title: Serve your own service, solo (no pipeline, no known peer)
description: The minimal path when you're both the operator and the only member so far — and the one control-plane step that's easy to miss.
order: 18
---

# Serve your own service, solo (no pipeline, no known peer)

[Set up a broker-mediated channel]({{ '/how-to/broker-mediated-channel/' | relative_url }}) and
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) both assume two
people coordinating — an operator and a member who already know each other's public key. This page
is for the narrower, very common case: you're standing up a persistent `--serve` process for your
own service (a local model relay, a tool, anything with a stdin/stdout handler) and *you're both the
channel operator and, for now, the only member* — there's no second party's `holder_pubkey` to
derive a link id against yet, and possibly never will be one you know in advance.

<div class="callout warn">
<strong>The one thing worth internalizing before anything else on this page:</strong> the direct-address
path (<code>CT_CHANNEL_ADDR</code>) needs no control plane at all — but broker-mediated mode
(<code>CT_CHANNEL_BROKER</code>/<code>CT_CHANNEL_RELAY</code>, what persistent <code>--serve</code>
actually uses) is <strong>never</strong> offline, no exception. Confirmed directly against the edge's
own source (<code>crates/edge/src/channel_authorize.rs</code>): every single broker-mediated join calls
<code>POST {control-plane}/internal/channel/authorize</code>, and the control plane's durable
<code>channel_members</code> table is the <em>only</em> source of truth for who's admitted — the edge
itself holds no membership state of its own. A correctly-signed <code>CT_CHANNEL_GRANT</code> alone is
necessary but not sufficient; skip <code>channel register</code> + the membership POST below and every
join fails with <code>edge broker refused the channel join</code>, however valid your grant's signature
is. See <a href="{{ '/explanation/channel-admission/' | relative_url }}">How the edge decides whether to
admit a channel join</a> for the full picture.
</div>

## 1. Identities, same as any channel

```bash
./ct-agent channel operator-init   # once — you're the operator
./ct-agent channel init            # once — you're also the (first) member
```

## 2. Derive a channel id — self-referentially

[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})'s step 3 derives the
channel id from *two* known holder pubkeys (`channel_id_for_link(operator, holder_a, holder_b)`). With
no second party yet, set `CT_CHANNEL_BRIDGE_HOLDER` to **your own** `holder_pubkey`:

```bash
CT_CHANNEL_OPERATOR_PUBKEY=<your operator pubkey> \
CT_CHANNEL_BRIDGE_HOLDER=<your OWN holder_pubkey, from step 1> \
CT_CHANNEL_HOLDER_KEY=<your own holder private key> \
CT_CHANNEL_NOISE_PUBKEY=<your own noise public key> \
./ct-agent channel member-material
```

<div class="callout">
This is source-verified sound, not a guess: <code>channel_id_for_link</code> hashes a canonically
ordered <code>(lo, hi)</code> pair of the two holder pubkeys — well-defined even when they're
identical (<code>lo == hi == your holder</code>, nothing rejects that). More importantly,
<code>verify_member_noise_attestation</code> — the actual server-side check on the membership POST
below — verifies only <code>(channel, holder, noise_pubkey, signature)</code>. It never sees or checks
<code>bridge_holder</code> at all; that value only ever shapes which channel id you land on
client-side. There's nothing for a self-referential derivation to fail structurally — it's a
legitimate way to get a deterministic id and a real, correctly-signed attestation when there's no
second party to derive against yet.
</div>

Keep the printed `channel_id` — you'll reuse it in every step below, and hand it to anyone you later
grant `initiate` access (they'll need it, plus their own grant).

## 3. Register the channel and yourself as a member

The step [Set up a broker-mediated channel]({{ '/how-to/broker-mediated-channel/' | relative_url }})'s
step 2 covers for the two-party case, unchanged here:

```bash
CT_AGENT_CP_URL=https://<your-plane> \
CT_GRANT_CHANNEL=<channel_id from step 2> \
CT_CHANNEL_OPERATOR_KEY=<from step 1> \
CT_OIDC_TOKEN=<your bearer token> \
./ct-agent channel register
```

Then register your own holder as a member — **no CLI wrapper exists for this today**, it's a raw
authenticated HTTP call:

```bash
curl -X POST https://<your-plane>/me/channels/<channel_id>/members \
  -H "Authorization: Bearer <your OIDC token>" -H 'content-type: application/json' \
  -d '{"holder":"<your holder_pubkey>","noise_pubkey":"<your noise_pubkey>","noise_attestation":"<from step 2>"}'
```

## 4. Grant yourself `accept`

```bash
CT_CHANNEL_OPERATOR_KEY=<from step 1> \
CT_GRANT_CHANNEL=<channel_id> \
CT_GRANT_MEMBER_HOLDER=<your own holder_pubkey> \
CT_GRANT_DIRECTION=accept \
CT_GRANT_EXPIRES=<unix seconds> \
./ct-agent channel grant
```

## 5. Run persistent serve

```bash
CT_CHANNEL_ROLE=accept CT_CHANNEL_SERVE=1 CT_CHANNEL_RELAY_ONLY=1 \
CT_CHANNEL_BROKER=<edge host>:4435 CT_CHANNEL_RELAY=<edge host>:4436 \
CT_CHANNEL_HOLDER_KEY=<your holder private key> CT_CHANNEL_NOISE_KEY=<your noise private key> \
CT_CHANNEL_GRANT=<from step 4> \
CT_AGENT_SERVICE_HANDLER_CMD=<your handler> CT_AGENT_SERVICES=<service, snake_case — see the callout below> \
./ct-agent channel
```

Fetch `CT_CHANNEL_BROKER`/`CT_CHANNEL_RELAY` from `GET {cp_url}/network-info` rather than hardcoding
`4435`/`4436` — see [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}).

<div class="callout warn">
<code>CT_AGENT_SERVICES</code> takes the snake_case slug (<code>text_generation</code>,
<code>code_generation</code>, <code>security_review</code>, <code>safety_check</code>) — NOT the
PascalCase form (<code>TextGeneration</code>) that a published pipeline spec's JSON uses for the same
service. The two are easy to conflate reading across docs; only the snake_case form is valid here. See
[Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }}).
</div>

## Letting someone else call it later

Whoever you later want to admit as a caller needs three things from you: the `channel_id` from step 2,
a `CT_GRANT_DIRECTION=initiate` grant from step 4's command (their own `holder_pubkey`, your operator
key), and to register their own membership the same way step 3 did for you (their own
`member-material`/attestation — most naturally with `CT_CHANNEL_BRIDGE_HOLDER` set to *your* holder
pubkey this time, since now there really is a second, known party). None of this requires touching a
pipeline spec or the pipeline registry — this whole page is the piece [Join a workflow pipeline
role]({{ '/how-to/join-a-pipeline-role/' | relative_url }}) and [Publish a
pipeline]({{ '/how-to/publish-a-pipeline/' | relative_url }}) build on top of, not a prerequisite for
either.

## Related

- [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) — the two-known-parties
  version of steps 1–2 above.
- [Set up a broker-mediated channel]({{ '/how-to/broker-mediated-channel/' | relative_url }}) — the
  two-known-parties version of steps 3–5, fully click-tested against production.
- [Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }}) —
  the handler contract and what `CT_CHANNEL_SERVE=1` actually does once you're past admission.
- [How the edge decides whether to admit a channel join]({{ '/explanation/channel-admission/' | relative_url }})
  — why step 3 isn't optional.
