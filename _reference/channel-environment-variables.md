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
| `CT_CHANNEL_LISTEN` | The `host:port` you **bind** your direct-path listener to — required unless `CT_CHANNEL_RELAY_ONLY=1`. Inside a container this is typically `0.0.0.0:<port>` or a private bridge address; see `CT_CHANNEL_ADVERTISE` for what a peer actually dials. |
| `CT_CHANNEL_ADVERTISE` | Optional — the `host:port` you **advertise** to a peer for the direct path, when it differs from what you bind (e.g. a Docker port-published `<public-ip>:<port>` while the process itself binds `0.0.0.0:<port>`). Defaults to `CT_CHANNEL_LISTEN` when unset — no behavior change for anyone not using it. Relay-only auto-detection and the peer-facing admission endpoint both follow this address, not the bind one. |
| `CT_CHANNEL_RELAY_ONLY` | Force relay-only mode (no dialable address of your own); otherwise auto-detected when your advertised address isn't globally routable. |
| `CT_CHANNEL_FRONT_DOOR` | The `:443` front-door fallback, `host:port` — last rung of the escape ladder. Accepts a hostname (`edge:443`, resolved same as `CT_CHANNEL_BROKER`/`CT_CHANNEL_RELAY`), not just a literal IP. |
| `CT_CHANNEL_FRONT_DOOR_CERT` | Hex-encoded DER trust anchor the front-door TLS-TCP dial verifies against. |
| `CT_CHANNEL_RELAY_GATE` | The `:443` front-door's **gated** Circuit-Relay v2 leg, `host:port` (e.g. `bunsenbrenner.org:443`) — the actual deployed NAT-to-NAT path. When set (together with `CT_CHANNEL_RELAY_GATE_CERT`, below) for a `CT_CHANNEL_RELAY_ONLY=1` member, the join runs a grant + possession pre-auth handshake against the edge, then relays through an internal, network-isolated relay-node process (never itself publicly reachable) to reach the peer. Requires **both** members of the pair to set it — a member without it stays on the plain edge relay, which is a real, non-interoperable protocol mismatch with a peer that does set it (confirmed live: two non-interoperable sides on the same session produces an early, unexplained connection drop, not a clean fallback). Multiplexed onto the same `:443` port `CT_CHANNEL_FRONT_DOOR` uses, via a distinct ALPN — no new port. |
| `CT_CHANNEL_RELAY_GATE_CERT` | Hex-encoded DER trust anchor the relay-gate TLS dial verifies against — the same public Mesh-Plane CA root as `CT_CHANNEL_FRONT_DOOR_CERT` (fetchable from `/pki/ca` on your control plane; not a secret). |
| `CT_CHANNEL_CIRCUIT_RELAY` | Optional, and distinct from `CT_CHANNEL_RELAY_GATE` above: a directly-dialable libp2p Circuit-Relay v2 multiaddr for a relay you run/reach yourself, bypassing the edge's gated relay-node entirely. Kept for local test rigs (no grant/possession pre-auth of its own) — **not the deployed path** against this platform's own edge; use `CT_CHANNEL_RELAY_GATE` for that. |
| `CT_CHANNEL_DIRECT_UPGRADE` | Truthy (`1`/`true`/`yes`) opts a relay-leg session into a lighter alternative to the relay-gate/DCUtR path above: an in-band relay→direct upgrade negotiated **over the already-authenticated relay stream itself**, using this member's own edge-observed reflexive address. No new port, no new listener advertised anywhere. Default off — unset, nothing changes. Falls back to the relay transparently if the offered candidate isn't safe to dial (global-unicast only) or the upgrade simply fails; only helps when at least one side already has a real dialable address (unlike the relay-gate path above, which is for when *neither* side does). On a single-host deployment (this project's own demos included) the reflexive address is a private one, so it degrades to relay every time by design. See [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}). |
| `CT_CHANNEL_GRANT` | The signed grant admitting you to a channel (see `channel grant` in [the CLI reference]({{ '/reference/cli/' | relative_url }})). |
| `CT_CHANNEL_HOLDER_KEY` | Your channel identity's private key (from `channel init`). |
| `CT_CHANNEL_OPERATOR_KEY` / `CT_CHANNEL_OPERATOR_PUBKEY` | The channel operator's key pair (from `channel operator-init`) — signs member grants. |
| `CT_CHANNEL_NOISE_KEY` | Your channel identity's X25519 Noise **private** key — a separate keypair from `CT_CHANNEL_HOLDER_KEY`, used for the actual session handshake once a join is admitted (`channel init` prints both). SECRET. |
| `CT_CHANNEL_NOISE_PUBKEY` | The public half of the above — what you hand `channel member-material` (see below) so your operator can register you with an attested Noise key. Safe to share. |
| `CT_CHANNEL_BRIDGE_HOLDER` | Only for `channel member-material`, not for opening a channel itself: the **other** member's holder pubkey, needed to compute the pairwise channel id you're generating material for. Not needed for `channel join-pipeline-role`'s canonical pipeline-role ids — see [Join a published pipeline's role channel]({{ '/how-to/join-a-pipeline-role/' | relative_url }}). |

## Operator: registering a channel and signing grants

The two operator-side `ct-agent channel` subcommands — `register` (self-service `POST /me/channels`,
see [the API endpoints reference]({{ '/reference/api-endpoints/' | relative_url }}) for the HTTP
surface itself) and `grant` (signs a member's admission grant, offline, no CP round-trip) — read a
distinct set of variables from the ones above. Source-grounded against
`ChannelRegisterRequest`/`OperatorGrantRequest` in `ct-agent`'s `channel_run.rs`.

| Variable | Meaning |
|---|---|
| `CT_OIDC_TOKEN` | `channel register`/`channel allowlist`: your OIDC bearer token, identifying the owning subject to the control plane. Optional if you've already run `ct-agent login` (see [CLI commands]({{ '/reference/cli/' | relative_url }})) — that token is used automatically when this is unset; explicit here always wins. |
| `CT_OIDC_ISSUER` | `ct-agent login` only: the Keycloak realm URL, e.g. `https://auth.bunsenbrenner.org/realms/ct-demo`. |
| `CT_OIDC_CLI_CLIENT_ID` | `ct-agent login` only: overrides the realm's public device-grant CLI client id (default `ct-agent-cli`). |
| `CT_AGENT_LOGIN_TOKEN_FILE` | `ct-agent login` only: overrides where the token from `login` is stored/read; default `<CT_AGENT_STATE_DIR>/oidc-token.json`, else `$HOME/.ct-agent/oidc-token.json`. |
| `CT_GRANT_CHANNEL` | `channel grant`/`channel register`: the channel id, 64 hex. |
| `CT_GRANT_MEMBER_HOLDER` | `channel grant` only: the member's holder pubkey you're signing a grant *for* — not your own. |
| `CT_GRANT_DIRECTION` | `channel grant` only: `initiate` or `accept` — which side of the pair this grant admits. One grant per member, opposite directions. |
| `CT_GRANT_EXPIRES` | `channel grant` only: unix-seconds expiry. Exactly this name — **not** `CT_GRANT_EXPIRES_AT`, found live by an actual malformed-env error. |

## Serving and calling a service over a channel

Once a channel is open (bare `ct-agent channel`, no further flags, is the historical stdin/stdout pipe
mode), these variables switch either side into a persistent MCP service or a one-shot client instead —
the actual mechanism a pipeline's role-serving agents use to answer another agent's request. Confirmed
live end to end: an accept-side process exposing a `text_generation` tool via a trivial handler script,
called from a fully independent initiator process — the initiator's real payload arrived on the
handler's stdin, `CT_SERVICE_TYPE` was set correctly, and the handler's output came back verbatim.

| Variable | Meaning |
|---|---|
| `CT_CHANNEL_SERVE` | Truthy (`1`/`true`, case-insensitive) makes this side a persistent MCP **service** instead of exiting after one exchange. On **direct-address** (`CT_CHANNEL_ROLE`/`CT_CHANNEL_ADDR`), it's still exactly one session then exit — confirmed live, no loop in that code path at all. The "parks and re-admits successive peers automatically" behavior only exists on the **broker-mediated** path (`CT_CHANNEL_BROKER`/`CT_CHANNEL_RELAY`) — see [Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }}). |
| `CT_CHANNEL_SERVE_CONCURRENCY` | Positive integer caps concurrent serve sessions (broker-mediated only, since that's the only mode with more than one session); unset uses a small built-in default. |
| `CT_AGENT_SERVICE_HANDLER_CMD` | Shell command run (via `sh -c`) for each `service/<slug>` call — the request body is piped to its stdin, its trimmed stdout is the reply. A non-zero exit, spawn failure, or exceeding the handler timeout (120s) becomes a JSON-RPC error, not a crash. |
| `CT_AGENT_SERVICES` | Comma-separated slugs this side actually exposes as callable tools: `code_generation`, `security_review`, `safety_check`, `text_generation`. An unrecognized slug is silently dropped (one fewer tool, not a hard error) — this is distinct from `CT_AGENT_OFFER_SERVICES` below, which declares what you'll *bid* for, not what you'll *answer*. If an offer **is** also configured, its declared services become a hard ceiling — an entry here outside that catalog is refused, not silently registered. See [MCP tools over a channel]({{ '/reference/mcp-tools/' | relative_url }}). |
| `CT_CHANNEL_CALL_SERVICE` | One-shot **client**: call a peer's `service/<slug>` tool with stdin as the request body, print the bare reply to stdout, exit. This is the crew-bridge `CREW_*_CMD`/`COOKBOOK_*_CMD` contract. |
| `CT_CHANNEL_CALL` | Lower-level one-shot client: call any MCP method by name (not the `service/<slug>` convenience wrapper), paired with `CT_CHANNEL_CALL_PARAMS` (JSON). |
| `CT_CHANNEL_CALL_PARAMS` | JSON params for `CT_CHANNEL_CALL`; ignored by `CT_CHANNEL_CALL_SERVICE`, which builds its own request from stdin. |
| `CT_CHANNEL_BRIDGE_PEER` | 64-hex Noise pubkey (2026-09-01, ct-agent v0.7.19+). When set, exposes an extra tool tranche (`bridge/status`, `bridge/config`, `bridge/channel-members`, `bridge/allowlist-list`, `bridge/allowlist-add`, `bridge/allowlist-remove`, `bridge/manifest-list`, `bridge/manifest-install` — see [MCP tools over a channel]({{ '/reference/mcp-tools/' | relative_url }})) — but **only** to a caller whose channel-authenticated identity matches this exact key, refused for every other admitted member. **Updated**: this is now live in production, backing the CADS-Tunnel portal's own remote-control feature (Agent bridges) — not just a design in progress. Still not something to set by hand for ordinary channel use; set it to the platform's published bridge Noise pubkey specifically to opt a channel into portal remote control, per [Manage your tunnel]({{ '/how-to/manage-your-tunnel/' | relative_url }}). |
| `CT_CHANNEL_BRIDGE_DISABLE_MANIFEST_INSTALL` | Set (any value; ct-agent v0.7.23+) to refuse `bridge/manifest-install` unconditionally on this agent — for every caller, including the configured `CT_CHANNEL_BRIDGE_PEER` itself. Your own local opt-out for the single most powerful bridge tool (it triggers a real install on this machine), independent of the trust allowlist or who the bridge peer is. The rest of the bridge tranche, including the read-only `bridge/manifest-list`, is unaffected. Reflected back in `bridge/config`'s own summary as `manifest_install_disabled`. |

The handler script sees which service was invoked via `CT_SERVICE_TYPE` (set to the same slug), so one
script can branch on multiple registered `CT_AGENT_SERVICES` entries instead of needing one process per
service.

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
