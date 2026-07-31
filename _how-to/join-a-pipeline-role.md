---
title: Join a published pipeline's role channel
description: Derive a role's channel id from public information, no pairwise key exchange first.
order: 6
---

# Join a published pipeline's role channel

`ct-agent channel join-pipeline-role` is the generic-provisioning analogue of `channel member-material`
(covered in [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})): instead of
two members exchanging keys to derive a pairwise link's channel id, everyone who wants to serve or dial a
*published pipeline's* role derives the **same** channel id independently, from information that's
supposed to be entirely public. Every command below was actually run.

<div class="callout warn">
<strong>Honest gap, found writing this page.</strong> The design intent — see
<a href="{{ '/reference/api-endpoints/' | relative_url }}">API endpoints</a> and the tool's own error
text — is that <code>CT_CHANNEL_OPERATOR_PUBKEY</code> comes from a pipeline's published
<code>operator_pubkey_hex</code>, discoverable via <code>GET /registry/pipelines/:id</code> with no prior
relationship needed. Checked live, right now: both real published pipelines
(<a href="https://bunsenbrenner.org/registry/pipelines/flappy-demo">flappy-demo</a>,
<a href="https://bunsenbrenner.org/registry/pipelines/cookbook-demo">cookbook-demo</a>) have
<code>operator_pubkey_hex: null</code> — neither has ever actually published one. So the mechanism below
is real and works exactly as described, but today you'd still need the operator's pubkey handed to you
out-of-band for either live demo, not fetched from the registry as the design intends. The example below
uses a locally-generated demonstration operator key, not either demo's real one (which doesn't exist
publicly yet).

</div>

## 1. What you need

- **`CT_CHANNEL_OPERATOR_PUBKEY`** — the pipeline's operator, in principle from
  `GET /registry/pipelines/:id`'s `operator_pubkey_hex` (see the caveat above for why that's null on both
  live demos today).
- **`CT_PIPELINE_ID`** and **`CT_PIPELINE_ROLE`** — both genuinely public right now. Real values fetched
  live:

  ```bash
  curl -s https://bunsenbrenner.org/registry/pipelines/flappy-demo
  ```
  ```json
  {"id":"flappy-demo","roles":[{"service":"TextGeneration","units":1,"tag":"physics",...},
  {"service":"TextGeneration","units":1,"tag":"art",...},
  {"service":"SafetyCheck","units":1,"tag":"safety_check",...}],
  "operator_pubkey_hex":null,"selection_policy":"LowestFloor"}
  ```
  `CT_PIPELINE_ID=flappy-demo`, `CT_PIPELINE_ROLE` is any of `physics`/`art`/`safety_check` — each
  role's `tag`.
- Your own holder key and noise public key, same as any channel — see
  [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) step 1.

## 2. Derive the role's channel id

```bash
CT_CHANNEL_OPERATOR_PUBKEY=<the pipeline's operator pubkey> \
CT_PIPELINE_ID=flappy-demo \
CT_PIPELINE_ROLE=physics \
CT_CHANNEL_HOLDER_KEY=<your holder private key> \
CT_CHANNEL_NOISE_PUBKEY=<your noise public key> \
./ct-agent channel join-pipeline-role
```

Real output:

```
pipeline_id       = flappy-demo
role              = physics
holder_pubkey     = cd0d06c85be979754ec6d90ead28fb5a71904d15b67d5028a024444fb6237ea9
noise_pubkey      = e30617616430b1055c0cade9817e4cd18d131f9f46116b8ab4c83e9264d49a57
channel_id        = 151bac005cedddb04eb1776926547f08418206a7c69a4c63a9115eecdc79c533
noise_attestation = 80a20a42582cdd42e8f10e49097e615436e17c99dfe21cee3827fe20a2842832c31...
```

## 3. It's genuinely order-independent — proven, not just claimed

Re-ran the exact same command with a **second, completely different holder identity**, same operator
pubkey, same pipeline, same role:

```
pipeline_id       = flappy-demo
role              = physics
holder_pubkey     = c16fdea9e35aa49af1523099f7b720d957a871c899949950ba0c4f7ea66891b2   ← different
noise_pubkey      = 465b0f98ffaf7884499b6d74ec6428cad16f2f38227b9f1e9a43c0eac35d562c    ← different
channel_id        = 151bac005cedddb04eb1776926547f08418206a7c69a4c63a9115eecdc79c533   ← identical
noise_attestation = ac72d22fe2f27852126914c0471b25f6047dbf9738608aedf49c856dc46f7e0...
```

`channel_id` matches byte-for-byte across both runs. This is what makes it useful: the pipeline's bridge
and every role-serving candidate can each compute the same channel id on their own, from public
information only — nobody has to relay it.

## 4. Hand it off

`render()`'s output (the block above minus `channel_id`, which the recipient already has) is what you
hand the pipeline's channel owner — whoever ran `POST /me/channels` for this role — so they can
`POST /me/channels/:channel/members` on your behalf. See
[API endpoints]({{ '/reference/api-endpoints/' | relative_url }}) for both calls.
