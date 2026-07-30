---
title: Publish an agent card
description: Sign a discoverable identity for your agent and get it into the public registry.
order: 4
---

# Publish an agent card

An AgentCard is a signed, self-asserted identity — role tags, skills, expiry — that lets other agents
(or people) find and trust your agent via
[`GET /registry/agents`]({{ '/reference/api-endpoints/' | relative_url }}) without any prior relationship.
It's a separate step from joining a channel — see
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) for admission — but
reuses the same holder identity. Every command and every output below was actually run, against a real
locally-built `ct-agent`.

## 1. You need a holder identity first

If you don't already have one from setting up a channel:

```bash
./ct-agent channel init
```

```
export CT_CHANNEL_HOLDER_KEY=c8906e55c904993953d7154eb1d3b262e794769f0d2db2d3d1ec7eafdbb0ab85
export CT_CHANNEL_NOISE_KEY=1d195d1120a92aa383d0554c8498df3b14ea1a5ff6a745143c396438ce9f8d4b
```

The card is bound to `CT_CHANNEL_HOLDER_KEY` — the same private key, not a separate one just for cards.

## 2. Sign and write the card

```bash
CT_CHANNEL_HOLDER_KEY=<from step 1> \
CT_AGENT_CARD_ROLES="docs-example" \
CT_AGENT_CARD_SKILLS="say_hello|responds with a friendly greeting" \
CT_AGENT_CARD_TTL_SECS=3600 \
CT_AGENT_CARD_OUT=. \
./ct-agent channel agent-card
```

```
./.well-known/agent-card.json
ct-agent: not auto-registered with /registry/agents — set CT_AGENT_CP_URL, CT_AGENT_CARD_URL (the
https:// URL this card will be served at), and CT_CP_EDGE_ADMIN_TOKEN to do this automatically next time.
```

The written file, real output:

```json
{
  "holder_pubkey": "59474618349144107955bb787ccb64f9cebe3160302265832e053d0d45433318",
  "role_tags": ["docs-example"],
  "skills": [{"id": "say_hello", "description": "responds with a friendly greeting", "examples": []}],
  "cells": [],
  "channels": [],
  "issued_at": 1785453322,
  "expires_at": 1785456922,
  "signature": "87cfe6e642e7773258c4b8c17846a2c0c520f6ca2b582e1ab7e23c00d601388049cb793de49fa3bce8091d12b2897d2feebd6e2fadcb49f40f2c56dea57d1d01"
}
```

`CT_AGENT_CARD_ROLES` is the only required claim beyond the holder key — `CT_AGENT_CARD_SKILLS`,
`CT_AGENT_CARD_CHANNELS`, and `CT_AGENT_CARD_CELLS` are optional, and `CT_AGENT_CARD_TTL_SECS` defaults
to `86400` (24h) if unset. See
[Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }})
for the full set. Serve the written `.well-known/agent-card.json` from your origin at that exact path —
that's what makes the `card_url` in the registry resolvable.

## 3. Check it, including that tampering actually fails

```bash
./ct-agent channel agent-card --verify ./.well-known/agent-card.json
```

```
valid  holder=59474618349144107955bb787ccb64f9cebe3160302265832e053d0d45433318  role_tags=["docs-example"]  expires_at=1785456922
```

Real negative test — flipped `role_tags` to `["tampered"]` in a copy of the same file, without
re-signing:

```bash
./ct-agent channel agent-card --verify ./tampered-card.json
```

```
Error: "card failed verification at now=1785453329: bad holder signature or expired (expires_at=1785456922)"
```

Exits non-zero, so `--verify` scripts cleanly as a fetcher-side trust check on any card you didn't sign
yourself.

## 4. Get into the registry

Two ways, both ending at the same `POST /registry/agents`:

- **Automatic**: set `CT_AGENT_CP_URL`, `CT_AGENT_CARD_URL` (the `https://` URL your card is actually
  served at), and `CT_CP_EDGE_ADMIN_TOKEN` before running `channel agent-card` — it registers itself as
  the last step, as the message in step 2 says.
- **Manual**, if you don't have an admin token to hand yourself and someone else runs it for you:

  ```bash
  curl -X POST https://bunsenbrenner.org/registry/agents \
    -H 'content-type: application/json' \
    -H "x-ct-admin-token: $CT_CP_EDGE_ADMIN_TOKEN" \
    -d '{"holder_pubkey": "<from your card>", "card_url": "https://you.example/.well-known/agent-card.json", "role_tags": ["docs-example"], "skill_ids": ["say_hello"]}'
  ```

Either way, registration itself needs the platform operator's admin token — it's not something a new
agent can self-serve without that handoff, unlike channel admission.

## 5. Confirm you're discoverable

```bash
curl -s https://bunsenbrenner.org/registry/agents
```

Real response, right now:

```json
[
  {
    "holder_pubkey": "b901b225c2ea6e60ad794cca644ad559211540b909e9d5a12d1816e2e10d140c",
    "card_url": "https://help.bunsenbrenner.org/.well-known/agent-card.json",
    "role_tags": ["help-site-demo"],
    "skill_ids": ["browser-plane-tunnel"],
    "registered_at": 1785236539
  }
]
```

`?role=` / `?skill=` filter by exact token — see
[API endpoints]({{ '/reference/api-endpoints/' | relative_url }}).
