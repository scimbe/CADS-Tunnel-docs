---
title: Environment variables (core tunnel)
description: The CT_AGENT_* variables a browser-tunnel setup actually uses.
order: 1
---

# Environment variables — core tunnel

This covers the variables you need for a standard browser tunnel (what
[Your first tunnel]({{ '/tutorials/first-tunnel/' | relative_url }}) and
[Install ct-agent]({{ '/how-to/install-ct-agent/' | relative_url }}) use). `ct-agent` also has a
separate set of variables for Agent-Fabric channels, MCP/AgentCard discoverability, and capacity
offers/auctions — see
[Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }}).

Pulled directly from `ct-agent`'s source, not from memory — if this drifts from the code, that's a bug
in this page.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `CT_AGENT_CP_URL` | Yes | — | Your control plane's base URL (`https://bunsenbrenner.org` for the hosted platform). |
| `CT_AGENT_JOIN_TOKEN` | Yes (first onboard) | — | Single-use join token from the portal's Install page. Presence of this variable is what triggers the one-command onboarding path at all. |
| `CT_AGENT_TOKEN` | Yes | — | Your tunnel's routing token. |
| `CT_AGENT_HOSTNAME` | Yes | — | The hostname this tunnel serves. |
| `CT_AGENT_ORIGIN` | Yes | `127.0.0.1:8080` | Where your actual service is running — `host:port`. |
| `CT_AGENT_ORIGIN_PROTO` | No | `tcp` | `tcp` or `udp` — the transport `ct-agent` uses to reach `CT_AGENT_ORIGIN`. **Not** `http`/`https` — this is the raw transport, not an application protocol; a plain web server is still `tcp`. The portal's own generated `.env` snippet doesn't set this line at all, which is fine — the guided setup script used to wrongly hard-require it before falling through to this same default; fixed to match the agent's own behavior. |
| `CT_AGENT_MODE` | No | unset | Set to `browser` for the raw-TLS-passthrough browser tunnel mode (what the setup script configures by default). Unset means [Mesh Plane]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }}) (Noise) mode instead — the actual default, opaque-token routed, no TLS anywhere in the path. |
| `CT_AGENT_EDGE` | No, but see setup.sh | — | `host:port` of the mesh edge. The guided setup script derives this automatically from `CT_AGENT_CP_URL` + `/network-info`; only set it by hand if you're not using the setup script. |
| `CT_AGENT_EDGE_CERT_URL` | No, but recommended | — | Base URL the agent fetches the edge's CA root from (`GET {url}/pki/ca` — see [The internal Mesh-Plane CA]({{ '/explanation/mesh-plane-ca/' | relative_url }}) for what that root actually is and why a CA root instead of a pinned cert). Leaving this unset on a non-CADS-Tunnel deployment makes the agent wait indefinitely by default rather than error (see the two variables below for making that visible/bounded) — the guided setup script defaults it to `CT_AGENT_CP_URL` for you. |
| `CT_AGENT_EDGE_CERT` | No | `/shared/edge-cert.der` (not suitable outside CADS-Tunnel's own compose network) | Local path the fetched edge CA cert is cached to — the on-disk counterpart to `CT_AGENT_EDGE_CERT_URL` above. When `CT_AGENT_EDGE_CERT_URL` is unset, the agent instead polls this path on disk for the cert to show up. |
| `CT_AGENT_EDGE_CERT_WAIT_SECS` | No | unset (wait indefinitely) | Only applies when `CT_AGENT_EDGE_CERT_URL` is unset. Bounds the wait for `CT_AGENT_EDGE_CERT` to appear on disk — past it, the agent exits with `edge cert not available within <n>s at <path>` instead of waiting forever. Leave unset for a real tunnel that must survive a slow/delayed edge; set it for a fail-fast CI/smoke run, same reasoning as `CT_AGENT_ONBOARD_TIMEOUT_SECS`. |
| `CT_AGENT_EDGE_CERT_LOG_INTERVAL_SECS` | No | `5` | Only applies when `CT_AGENT_EDGE_CERT_URL` is unset. How often the agent logs `waiting for edge cert at <path> ...` while it waits — the wait itself was never silent, this only controls how chatty it is. |
| `CT_AGENT_ID` | No | `agent-<timestamp>-<pid>` | Stable identity key used to match persisted state on restart (`onboard_or_restore`). The guided setup script persists and reuses this across runs automatically — don't regenerate it by hand between runs of the same tunnel, or restore will fail to match and it'll try to re-onboard with an already-spent token. |
| `CT_AGENT_STATE_DIR` | No | `./.ct-agent-state` (via setup script) | Where the bound identity/tenant/capability get persisted. |
| `CT_AGENT_CAPABILITY_OUT` | No | `/shared/capability.bin` (agent's own default — **not** suitable outside CADS-Tunnel's own compose network) | Where the [Capability]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }}) — the self-contained Mesh Plane connection grant you distribute to your own Clients out of band — is written. Not fetched from anywhere: the agent **mints** it locally (`mint_capability`, a fresh random routing token by default), from material it already has. The guided setup script overrides the output path to `$CT_AGENT_STATE_DIR/capability.bin`. |
| `CT_AGENT_ORIGIN_KEY` | No | ephemeral, generated fresh per process | File path persisting the origin's static Noise private key. Set it (on a shared volume) to make the key durable and shareable across multiple agent processes — required for both [running redundant agents]({{ '/how-to/run-redundant-agents/' | relative_url }}) and `ct-agent rotate`. Owner-only permissions; it's the key that makes possession of your Capability enough to be trusted as your origin. |
| `CT_AGENT_ORIGIN_KEY_DIR` | No | — | Where `ct-agent rotate` retires the previous origin key during a zero-downtime rotation window, so the agent can keep serving both the old and new identity until every client has the new Capability. |
| `CT_BOOTSTRAP` | Alternative to `CT_AGENT_JOIN_TOKEN`+`CT_AGENT_TOKEN` | — | A single short-lived bootstrap token the setup script redeems server-side for the two tokens above, so they never touch disk/shell history beyond the resulting `.env`. |
| `CT_AGENT_ONBOARD_TIMEOUT_SECS` | No | unset (wait indefinitely) | Bounds the one-shot onboarding call. Leave it unset for a real tunnel — `CT_AGENT_JOIN_TOKEN` is single-use, so a timeout that fires *after* the control plane already redeemed it leaves you with a dead token and no way to retry, unless `CT_AGENT_STATE_DIR` is also set (restart then restores the already-bound identity instead of re-redeeming). Only set this for a fail-fast CI/smoke-test run — `scripts/e2e-smoke.sh` defaults it to `30`. |

## Observability — metrics stay on your side

Per [ADR-0016](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0016-agent-side-observability.md):
since the operator is payload-blind, per-connection observability can only exist at your own agent.
`ct-agent` can serve its own metrics locally, in your own open format, to your own stack — nothing routes
through the platform.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `CT_AGENT_METRICS_LISTEN` | No | unset (no metrics server) | `host:port` to serve `GET /metrics` on, in Prometheus text exposition format — point your own Prometheus/Grafana at it. |

Six counters, confirmed against source (`ct_common::metrics::TunnelMetrics::render_prometheus`):

```
ct_tunnels_opened_total       — tunnels successfully established
ct_tunnels_failed_total       — tunnel attempts that failed before or during the handshake
ct_bytes_to_origin_total      — bytes relayed from client to origin
ct_bytes_to_client_total      — bytes relayed from origin to client
ct_handshakes_total           — completed Noise handshakes
ct_handshake_millis_total     — cumulative handshake latency, milliseconds
```

Not click-tested against a live tunnel this pass (would mean standing up a throwaway production
account/tunnel just to scrape it) — validated instead via `ct-agent`'s own passing test suite, which
binds a real TCP listener, serves the real `/metrics` handler, and scrapes it with a raw HTTP request:
`cargo test observe:: -p ct-agent` — `3 passed; 0 failed`, re-run hermetically for this page, not
assumed from an earlier pass.

## Reliability and connectivity fallbacks

| Variable | Default | Meaning |
|---|---|---|
| `CT_AGENT_RECONNECT_MAX_ATTEMPTS` | unbounded (retries forever) | **Updated** — this used to default to `10`, but a real production outage (2026-08-13, `sort.bunsenbrenner.org`) traced to exactly that: the agent burned its 10-attempt budget (~2 minutes of backoff) during an edge redeploy that took slightly longer, exited, and stayed dead for hours until a human restarted it by hand — an edge restart/deploy/network partition longer than ~2 minutes turned a bounded default into a permanent, human-only-recoverable outage. `CT_AGENT_JOIN_TOKEN` is single-use, so exiting can't cleanly re-onboard either, and a bare process-manager restart just crash-loops redeeming an already-spent token. Set this explicitly to a finite count only for a short-lived/scripted run where failing fast is genuinely wanted; `0` also means unbounded, equivalent to leaving it unset. |
| `CT_AGENT_FALLBACK_443` | `false` | If the configured edge port is blocked, also try the edge's unified `:443` front door (TLS-TCP, `ALPN=ct-edge`). Any non-empty value except `0`/`false` (case-insensitive) counts as true — not the `1`/`true`/`yes` convention used elsewhere in this reference, checked directly against the parsing code. |
| `CT_AGENT_TCP_FALLBACK_POOL_SIZE` | `6` | How many pooled connections the TCP-fallback path keeps warm. Must be at least 1 if set — `0` is a hard config error, not "disabled". |
| `CT_AGENT_DIRECT_ADVERTISE` | unset | An IP to advertise for a direct P2P path in [Mesh Plane]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }}) mode, bypassing the relay. Only meaningful there — Browser Plane has no P2P/relay distinction. |

## Grün-specific (certificate issuance)

| Variable | Required | Meaning |
|---|---|---|
| `CT_ACME_CERT_OUT_DIR` | Yes, for `ct-agent certificate` | Where the issued `fullchain.pem`/`privkey.pem`/`acme-account-key.der` are written. |

## Deployment-only (you won't set these against the hosted platform)

`CT_RELEASE_BASE` (setup script only — override where release binaries are downloaded from) and
`NO_COLOR` (disable colored setup-script output) are the only two documented environment overrides for
the setup scripts themselves, as opposed to `ct-agent`.
