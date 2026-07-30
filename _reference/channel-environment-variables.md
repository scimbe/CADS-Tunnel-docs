---
title: Environment variables (channels, cards, offers)
description: CT_CHANNEL_*, CT_AGENT_CARD_*, and CT_AGENT_OFFER_* — the Agent-Fabric / MCP variable set.
order: 4
---

# Environment variables — channels, cards, offers

The variable set behind [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }})
and [Workflow pipelines & the auction model]({{ '/explanation/workflow-pipelines/' | relative_url }}).
Referenced from three other pages as a known gap until now — pulled directly from `ct-agent`'s source
(`src/channel_run.rs`), not recalled.

## Opening a channel

| Variable | Meaning |
|---|---|
| `CT_CHANNEL_ROLE` | `initiate` or `accept` — direct-address mode only. |
| `CT_CHANNEL_ADDR` | Peer's `host:port` — direct-address mode only. |
| `CT_CHANNEL_BROKER` | Edge rendezvous endpoint — broker-mediated mode. |
| `CT_CHANNEL_RELAY` | Edge relay endpoint, used on direct-dial failure. |
| `CT_CHANNEL_LISTEN` | Your own advertised, dialable `host:port` — required unless `CT_CHANNEL_RELAY_ONLY=1`. |
| `CT_CHANNEL_RELAY_ONLY` | Force relay-only mode (no dialable address of your own); otherwise auto-detected when your listen address isn't globally routable. |
| `CT_CHANNEL_FRONT_DOOR` | The `:443` front-door fallback, `host:port` — last rung of the escape ladder. |
| `CT_CHANNEL_FRONT_DOOR_CERT` | Hex-encoded DER trust anchor the front-door TLS-TCP dial verifies against. |
| `CT_CHANNEL_GRANT` | The signed grant admitting you to a channel (see `channel grant` in [the CLI reference]({{ '/reference/cli/' | relative_url }})). |
| `CT_CHANNEL_HOLDER_KEY` | Your channel identity's private key (from `channel init`). |
| `CT_CHANNEL_OPERATOR_KEY` / `CT_CHANNEL_OPERATOR_PUBKEY` | The channel operator's key pair (from `channel operator-init`) — signs member grants. |

## Publishing an AgentCard (discoverability)

Backs `ct-agent channel agent-card` — see
[Discoverable by agents you've never met](https://bunsenbrenner.org/#mcp) on the landing page for the
concept.

| Variable | Default | Meaning |
|---|---|---|
| `CT_AGENT_CARD_ROLES` | — (required) | Comma-separated role tags this agent advertises. |
| `CT_AGENT_CARD_SKILLS` | — | `;`-separated `id\|description` entries (or bare `id`). |
| `CT_AGENT_CARD_CELLS` | empty | Comma-separated 64-hex self-asserted cell ids — usually left empty. |
| `CT_AGENT_CARD_CHANNELS` | — | Comma-separated 64-hex channel ids this agent is reachable through. |
| `CT_AGENT_CARD_TTL_SECS` | `86400` | Validity window in seconds. |
| `CT_AGENT_CARD_OUT` | `.` | Directory `.well-known/agent-card.json` is written under. |
| `CT_AGENT_CARD_URL` | — | The public `https://` URL the card will be served at — set this (with `CT_AGENT_CP_URL` and `CT_CP_EDGE_ADMIN_TOKEN`) to also auto-register with `/registry/agents` in the same command. |

## Publishing a capacity offer (the auction)

Backs the `CT_AGENT_OFFER_*`-driven offer construction — `AgentOfferCliConfig::build_offer` returns a
real `ct_common::channel::CapacityOffer`, the **exact same type**
[`PipelineSpec::convene`]({{ '/explanation/workflow-pipelines/' | relative_url }}) consumes. Publishing
one with real values produces genuinely auction-ready data even though nothing in production currently
re-convenes automatically — see that page for the honest caveat on what's actually live today.

| Variable | Default | Meaning |
|---|---|---|
| `CT_AGENT_OFFER_KIND` | — (required) | `cloud` or `local`. |
| `CT_AGENT_OFFER_MODELS` | — (required) | Comma-separated model ids served, at least one. |
| `CT_AGENT_OFFER_UNITS` | — (required) | Units offered. |
| `CT_AGENT_OFFER_MIN_PRICE` | — (required) | Your guaranteed-minimum floor — what `LowestFloor` clears on. |
| `CT_AGENT_OFFER_CURRENCY` | — (required) | Opaque settlement-currency id. |
| `CT_AGENT_OFFER_TTL_SECS` | `86400` | Validity window in seconds. |
| `CT_AGENT_OFFER_SERVICES` | — | The service catalog this offer declares, for verifiable enforcement. |
| `CT_AGENT_OFFER_MAX_BIDS` | `60` | Per-consumer bid rate limit. |
| `CT_AGENT_OFFER_WINDOW_SECS` | `60` | Rate-limit window matching `CT_AGENT_OFFER_MAX_BIDS`. |
