---
title: Environment variables (core tunnel)
description: The CT_AGENT_* variables a browser-tunnel setup actually uses.
order: 1
---

# Environment variables — core tunnel

This covers the variables you need for a standard browser tunnel (what
[Your first tunnel]({{ '/tutorials/first-tunnel/' | relative_url }}) and
[Install ct-agent]({{ '/how-to/install-ct-agent/' | relative_url }}) use). `ct-agent` also has a much
larger set of variables for Agent-Fabric channels, MCP tool exposure, and capacity offers/auctions
(`CT_CHANNEL_*`, `CT_AGENT_CARD_*`, `CT_AGENT_OFFER_*`) — those aren't covered here yet; see the
`ct-agent` source (`src/config.rs`, `src/channel_run.rs`) in the meantime.

Pulled directly from `ct-agent`'s source, not from memory — if this drifts from the code, that's a bug
in this page.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `CT_AGENT_CP_URL` | Yes | — | Your control plane's base URL (`https://bunsenbrenner.org` for the hosted platform). |
| `CT_AGENT_JOIN_TOKEN` | Yes (first onboard) | — | Single-use join token from the portal's Install page. Presence of this variable is what triggers the one-command onboarding path at all. |
| `CT_AGENT_TOKEN` | Yes | — | Your tunnel's routing token. |
| `CT_AGENT_HOSTNAME` | Yes | — | The hostname this tunnel serves. |
| `CT_AGENT_ORIGIN` | Yes | `127.0.0.1:8080` | Where your actual service is running — `host:port`. |
| `CT_AGENT_ORIGIN_PROTO` | Yes | `tcp` | `tcp` or `udp` — the transport `ct-agent` uses to reach `CT_AGENT_ORIGIN`. **Not** `http`/`https` — this is the raw transport, not an application protocol; a plain web server is still `tcp`. |
| `CT_AGENT_MODE` | No | unset | Set to `browser` for the raw-TLS-passthrough browser tunnel mode (what the setup script configures by default). Unset means Mesh Plane (Noise) mode instead. |
| `CT_AGENT_EDGE` | No, but see setup.sh | — | `host:port` of the mesh edge. The guided setup script derives this automatically from `CT_AGENT_CP_URL` + `/network-info`; only set it by hand if you're not using the setup script. |
| `CT_AGENT_EDGE_CERT_URL` | No, but recommended | — | Base URL the agent fetches the edge's CA root from. Leaving this unset on a non-CADS-Tunnel deployment makes the agent hang indefinitely rather than error — the guided setup script defaults it to `CT_AGENT_CP_URL` for you. |
| `CT_AGENT_ID` | No | `agent-<timestamp>-<pid>` | Stable identity key used to match persisted state on restart (`onboard_or_restore`). The guided setup script persists and reuses this across runs automatically — don't regenerate it by hand between runs of the same tunnel, or restore will fail to match and it'll try to re-onboard with an already-spent token. |
| `CT_AGENT_STATE_DIR` | No | `./.ct-agent-state` (via setup script) | Where the bound identity/tenant/capability get persisted. |
| `CT_AGENT_CAPABILITY_OUT` | No | `/shared/capability.bin` (agent's own default — **not** suitable outside CADS-Tunnel's own compose network) | Where the fetched capability material is written. The guided setup script overrides this to `$CT_AGENT_STATE_DIR/capability.bin`. |
| `CT_BOOTSTRAP` | Alternative to `CT_AGENT_JOIN_TOKEN`+`CT_AGENT_TOKEN` | — | A single short-lived bootstrap token the setup script redeems server-side for the two tokens above, so they never touch disk/shell history beyond the resulting `.env`. |

## Grün-specific (certificate issuance)

| Variable | Required | Meaning |
|---|---|---|
| `CT_ACME_CERT_OUT_DIR` | Yes, for `ct-agent certificate` | Where the issued `fullchain.pem`/`privkey.pem`/`acme-account-key.der` are written. |

## Deployment-only (you won't set these against the hosted platform)

`CT_RELEASE_BASE` (setup script only — override where release binaries are downloaded from) and
`NO_COLOR` (disable colored setup-script output) are the only two documented environment overrides for
the setup scripts themselves, as opposed to `ct-agent`.
