---
title: ct-agent CLI commands
description: Every ct-agent subcommand — what it does, and whether it exits or keeps running.
order: 3
---

# ct-agent CLI commands

Pulled directly from `ct-agent`'s `src/main.rs` argument dispatch, not from `--help` — see the warning
below.

<div class="callout warn">
<code>ct-agent</code> has no working <code>--help</code>/<code>-h</code> flag. An unrecognized first
argument falls through to the default serve path (which then blocks waiting on its own configuration)
instead of printing usage. This page is the actual reference.
</div>

## Whether a command exits

The single most useful fact about each subcommand, since it changes how you'd script around it:

| Command | Exits after running? |
|---|---|
| `ct-agent onboard` / bare with `CT_AGENT_JOIN_TOKEN` set | **No** — onboards, then serves indefinitely. |
| `ct-agent rotate` | **Yes** — rotates the origin key, prints the result, exits. Restart the agent to pick it up. |
| `ct-agent certificate` | **No** — obtains a certificate, then keeps running as a renewal daemon (checks every 6 hours). Stop it yourself once you've confirmed Grün, if you don't want it running long-term. |
| `ct-agent channel init` | **Yes** — prints a fresh channel identity env block, exits. |
| `ct-agent channel operator-init` | **Yes** — prints a fresh operator identity env block, exits. |
| `ct-agent channel member-material` | **Yes** — computes and prints what a member hands their operator, exits. |
| `ct-agent channel join-pipeline-role` | **Yes** — same idea, derived from a published pipeline's role instead of a pairwise link, exits. |
| `ct-agent channel grant` | **Yes** — as the operator, signs a member's grant and prints it, exits. |
| `ct-agent channel register` | **Yes** — registers the operator's channel authority with the control plane, exits. |
| `ct-agent channel agent-card` | **Yes** — writes the signed AgentCard (and auto-registers it with `/registry/agents` if the right env vars are set), exits. |
| `ct-agent channel agent-card --verify <file>` | **Yes** — re-verifies a card's signature and expiry, prints the result, exits non-zero on failure. |
| `ct-agent channel` (no further subcommand) | **No** — joins/serves a channel, runs indefinitely. |

## Onboarding and serving

`ct-agent onboard` and simply running `ct-agent` bare with `CT_AGENT_JOIN_TOKEN` set in the environment
are **the same code path** — presence of that variable is what triggers onboarding, not the literal word
`onboard`. On a restart against existing state (`CT_AGENT_STATE_DIR`), it restores the previously bound
identity instead of re-onboarding, provided `CT_AGENT_ID` matches what was persisted at onboard time —
see [Environment variables]({{ '/reference/environment-variables/' | relative_url }}).

## Certificate issuance

Covered end to end in [Go from Gelb to Grün]({{ '/how-to/gelb-to-gruen/' | relative_url }}).

## Origin key rotation

```bash
CT_AGENT_ORIGIN_KEY=./origin.key CT_AGENT_ORIGIN_KEY_DIR=./retired-keys ./ct-agent rotate
```

Re-mints the capability under the *same* routing token with a new origin key, retiring the old one into
`CT_AGENT_ORIGIN_KEY_DIR`. Restart the agent (with that directory set) to serve both the new and the
still-retiring old identity during the handover window.

## The `channel` subcommands

These back the Agent-Fabric / MCP layer — see the
[Direct, agent to agent diagram on the landing page](https://bunsenbrenner.org/#mcp) for the shape of
what they enable. A full reference for the `CT_CHANNEL_*`/`CT_AGENT_CARD_*`/`CT_AGENT_OFFER_*`
environment variables these commands read is not written yet — flagged as a known gap, not silently
skipped.
