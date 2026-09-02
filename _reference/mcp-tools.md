---
title: MCP tools over a channel
description: The JSON-RPC 2.0 tools/list and tools/call surface a served channel actually exposes.
order: 5
---

# MCP tools over a channel

Once you're serving a channel (see
[Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }})),
your peer talks to you over real [Model Context Protocol](https://modelcontextprotocol.io) — JSON-RPC 2.0
`initialize` / `tools/list` / `tools/call`, protocol version `2024-11-05` — not just a raw payload pipe.
This page is what's actually reachable, driven entirely by which env vars you set.

## What's live

| Tool | On by default? | Enabled by |
|---|---|---|
| `ping` | Yes | Nothing — every served channel has it. |
| `agent/card` | No | `CT_AGENT_CARD_*` (see [Publish an agent card]({{ '/how-to/publish-an-agent-card/' | relative_url }})). |
| `auction/offer`, `auction/bid` | No | `CT_AGENT_OFFER_*` (see [Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }})). |
| `service/<slug>` | No | `CT_AGENT_SERVICE_HANDLER_CMD` + `CT_AGENT_SERVICES` — fixed `{input: string} -> {output: string}` shape. |
| `channel/grant` | No | `CT_CHANNEL_OPERATOR_KEY` — issue a grant to any admitted caller, same fields `channel grant --interactive` prompts for (see [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})). **Not** peer-restricted — any admitted channel member can call it, unlike the `bridge/*` tools below. |
| `bridge/status`, `bridge/config`, `bridge/channel-members`, `bridge/allowlist-list`, `bridge/allowlist-add`, `bridge/allowlist-remove`, `bridge/manifest-list`, `bridge/manifest-install` | No | `CT_CHANNEL_BRIDGE_PEER` (64-hex Noise pubkey) — the Agent-bridges-v2 tranche (see [Manage your tunnel]({{ '/how-to/manage-your-tunnel/' | relative_url }})). **Peer-restricted**: every handler independently re-checks the caller's Noise pubkey against this one configured value and refuses anyone else, even an otherwise-admitted channel member — registering the tool at all doesn't mean anyone on the channel can call it. `bridge/cert-status` and `bridge/channel-revoke` are the two tools from this tranche's own design scope that don't exist yet (cross-process state and revocation flow, respectively). `bridge/manifest-install` — the one tool in this tranche that actually runs/writes on the agent's own machine — has its own separate local opt-out: `CT_CHANNEL_BRIDGE_DISABLE_MANIFEST_INSTALL` refuses it unconditionally, for every caller including the configured bridge peer (ct-agent v0.7.23+; see [Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }})). |

**Call `tools/list` first.** It only ever lists what your own env actually turned on, so it's the
authoritative answer for "what can I call on this peer" — no need to guess from the table above.

<div class="callout warn">
Real gap, worth knowing: <code>ct_common::mcp</code> also defines <code>chat</code>, <code>propose</code>,
and <code>settlement/*</code> tools (real, tested code — checked their own test coverage directly). But
no shipped <code>ct-agent</code> binary ever calls the functions that would register them
(<code>register_chat_tool</code>/<code>register_propose_tool</code>/<code>register_settlement_tools</code>)
— confirmed by grepping <code>channel_run.rs</code>'s non-test code for every call site. Don't expect
them in a live <code>tools/list</code>; only the rows in the table above are reachable today.
</div>

## Verified live: `tools/list`

Started a real serve process exposing two services, then queried it from a separate process:

```bash
CT_CHANNEL_CALL=tools/list ./ct-agent channel   # + the CT_CHANNEL_* join env for your channel
```

Real response:

```json
{"jsonrpc":"2.0","id":1,"result":{"tools":[
  {"description":"liveness check → returns pong","name":"ping"},
  {"description":"typed safety_check service — fixed {input:string} -> {output:string} shape","name":"service/safety_check"},
  {"description":"typed text_generation service — fixed {input:string} -> {output:string} shape","name":"service/text_generation"}
]}}
```

No `agent/card` (no `CT_AGENT_CARD_*` set for this run) and no `auction/*` (no offer configured) —
exactly matching the table above.

## Verified live: `tools/call`

```bash
CT_CHANNEL_CALL=tools/call \
CT_CHANNEL_CALL_PARAMS='{"name":"ping"}' \
./ct-agent channel
```

Real response:

```json
{"jsonrpc":"2.0","id":1,"result":{"reply":"pong"}}
```

`CT_CHANNEL_CALL_SERVICE=<slug>` (covered in
[Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }})) is a
convenience wrapper around exactly this — `tools/call` with `{"name": "service/<slug>", ...}` — for the
one shape most callers actually need.

## A signed offer caps what `CT_AGENT_SERVICES` can register

Found reading the source for this page, not previously documented: if you configure **both** an offer
(`CT_AGENT_OFFER_*`, which includes `CT_AGENT_OFFER_SERVICES`) and `CT_AGENT_SERVICES`, the offer's
declared service catalog becomes a hard ceiling, not just a separate advertisement. Any
`CT_AGENT_SERVICES` entry outside the offer's declared services is **refused, not silently registered**
— `ct-agent` logs exactly which ones and why:

```
ct-agent channel: REFUSING 1 service tool(s) not in the signed offer's declared catalog (#167): [...]
```

The reasoning: a buyer can cryptographically verify your signed offer's claims, so what you actually
serve should never be able to exceed what that signature promises. With no offer configured,
`CT_AGENT_SERVICES` stands alone — the unchanged self-asserted regime described in
[Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }}).
