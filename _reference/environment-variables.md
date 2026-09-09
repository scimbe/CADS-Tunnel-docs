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
If you're not sure which of the several things `ct-agent` can do is the one you actually want,
[Example configurations by use case]({{ '/reference/example-configurations/' | relative_url }}) gives
a complete, working `.env` per use case, side by side.

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
| `CT_AGENT_ORIGIN_TLS` | No | `passthrough` | `passthrough` or `terminate`. `passthrough` forwards the stream verbatim — TLS (if any) terminates at the Origin, unchanged behavior. `terminate` has the Agent itself terminate TLS (only for streams that begin with a TLS ClientHello — anything else still forwards raw) and hand the Origin plaintext; this is what lets [`ct-agent ssh`]({{ '/reference/cli/' | relative_url }}) reach a plain local `sshd`. Any other value is a startup error naming the variable, not a silent fallback. |
| `CT_AGENT_TLS_CERT` | No, only used with `CT_AGENT_ORIGIN_TLS=terminate` | the ACME output dir's `fullchain.pem` (`CT_AGENT_CERT_OUT_DIR`, or its own default) | PEM certificate chain (leaf first) the Agent serves when terminating TLS. Defaults to the same cert [Go from Gelb to Grün]({{ '/how-to/gelb-to-gruen/' | relative_url }}) already issues — you only need to set this if you're supplying a certificate from somewhere else. |
| `CT_AGENT_TLS_KEY` | No, only used with `CT_AGENT_ORIGIN_TLS=terminate` | the ACME output dir's `privkey.pem` | PEM private key matching `CT_AGENT_TLS_CERT`. Same default-location pairing as above. |
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

<div class="callout warn">
<strong>If <code>ct-agent</code> exits immediately with <code>Error: "control-plane returned status 409 Conflict"</code></strong>
— your <code>.env</code> (or process manager) still has <code>CT_AGENT_JOIN_TOKEN</code> set from an
earlier successful onboarding. Its mere presence makes a bare <code>ct-agent</code> re-enter the
one-command onboarding path on every start (see the row above) — but a join token is single-use, so a
second redeem of an already-consumed one is refused. Control-plane-side there is exactly one enrollment
failure that maps to this status code, so a bare 409 here always means "this exact token was already
redeemed", never a network or config issue elsewhere.
<br><br>
Two things to check: (1) drop <code>CT_AGENT_JOIN_TOKEN</code> from the environment before starting —
you're already enrolled, no need to onboard again; (2) set <code>CT_AGENT_STATE_DIR</code> to a
directory that survives process/container restarts (not a tmpfs or ephemeral volume). With a state
directory set, <code>ct-agent</code> restores the already-bound identity on every later boot instead of
re-redeeming, so this can't recur after the next restart either — the exact mechanism that fixed an
earlier crash-loop outage on this platform's own infrastructure.
</div>

## Observability — metrics and forensics stay on your side

Per [ADR-0016](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0016-agent-side-observability.md):
since the operator is payload-blind, per-connection observability can only exist at your own agent.
`ct-agent` can serve its own metrics and status locally, in your own open format, to your own stack —
nothing routes through the platform.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `CT_AGENT_METRICS_LISTEN` | No | unset (no metrics server) | `host:port` to serve `GET /metrics`, `/status`, `/healthz`, and `/events` on — point your own Prometheus/Grafana at the first, a container/systemd/load-balancer probe at the second. |

**`GET /metrics`** — Prometheus text exposition format. Twelve series as of ct-agent v0.7.28+
(#177/#178/#180), confirmed against source (`ct_common::metrics::TunnelMetrics::render_prometheus`
plus this crate's own `status`/`events`/`masque`/`task_guard` renderers, in that fixed order):

```
ct_tunnels_opened_total                       — tunnels successfully established
ct_tunnels_failed_total                       — tunnel attempts that failed before or during the handshake
ct_bytes_to_origin_total                      — bytes relayed from client to origin
ct_bytes_to_client_total                      — bytes relayed from origin to client
ct_handshakes_total                           — completed Noise handshakes
ct_handshake_millis_total                     — cumulative handshake latency, milliseconds
ct_agent_registered                           — gauge, 1 while registered with the plane, else 0
ct_agent_reconnects_total                     — reconnect attempts since process start
ct_agent_transport{transport="quic"|"tcp-fallback"|"masque"|"none"} — gauge, 1 for the current transport, 0 for the other three
ct_agent_events_total{kind="..."}             — one series per event taxonomy kind (below)
ct_agent_masque_dropped_datagrams_total{direction="outbound"|"inbound"} — MASQUE pump drops on a full channel (never blocks; UDP semantics)
ct_agent_tasks_live                           — gauge, JoinSet-tracked tasks currently running
```

**`GET /status`** — JSON snapshot of the same state `ct-agent status` prints (below):
`version`, `session` (16 hex, per process), `conn`, `uptime_secs`, `transport`, `registered`
(bool) + `registered_since`, `last_seen_secs_ago`, `reconnects`, `last_error`, `tasks_live`,
`update_state`, `oidc_credential`, `masque_dropped_datagrams`, `events_ring_write_errors`,
`healthy` (bool, the same check `/healthz` makes).

**`GET /healthz`** — `200 ok` when registered and the edge was heard from within the last 90
seconds (a 15-second QUIC liveness tick keeps an idle-but-healthy tunnel from going stale); `503`
with the reason as the plain-text body otherwise (`"not registered"`, or `"nothing heard in
Ns"`).

**`GET /events?n=<1..1000>`** — the last `n` lines (default 100) of the on-disk event ring as
`application/x-ndjson`, newest last. Twelve taxonomy kinds including `registered`,
`disconnected`, `credential_degraded`, `update_applied`; each line is also appended to
`<state_dir>/events.jsonl` (1 MiB cap, rotated to `.1`) regardless of whether this listener is
configured at all.

Re-verified hermetically for this page, not assumed from an earlier pass:
`cargo test observe:: -p ct-agent` — `9 passed; 0 failed`, binding a real TCP listener and
scraping/fetching all four routes over it, plus the private-state unit tests for `/status`,
`/healthz`, and `/events`' clamping behavior.

## Self-update (`ct-agent update`)

`ct-agent update` (see [the CLI reference]({{ '/reference/cli/' | relative_url }})) checks GitHub
Releases for a newer tag than the running binary's own `CARGO_PKG_VERSION` and, if one exists,
downloads the matching platform asset and replaces itself in place. These variables control that
path and its always-on auto-update mode; none are required for a one-shot manual `ct-agent update`.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `CT_AGENT_AUTO_UPDATE` | No | unset (manual `ct-agent update` only) | Truthy (`1`/`true`) starts a background loop that checks for and applies updates automatically on `CT_AGENT_AUTO_UPDATE_INTERVAL_SECS`, instead of only updating when you run `ct-agent update` yourself. |
| `CT_AGENT_AUTO_UPDATE_INTERVAL_SECS` | No | `86400` (24h) | How often the auto-update loop checks GitHub Releases. Only read when `CT_AGENT_AUTO_UPDATE` is on. |
| `CT_AGENT_UPDATE_SKIP_VERIFY` | No | unset (verify) | Disables **only** the per-asset sha256 checksum check the update pipeline publishes next to every release asset — every use is logged loudly to stderr. For a private/unofficial build whose release has no `.sha256` file; never needed against the real hosted releases. |
| `CT_AGENT_RELEASE_PUBKEY` | No | the public key(s) compiled into this build | Pins an Ed25519 public key an update's `release-manifest.json` + detached signature must verify against, for a private build using its own signing key instead of this project's compiled-in one. Hex-encoded. |

<div class="callout">
Every downloaded update is checked against its published sha256 **before** anything is written to
disk (a mismatch, missing, or unparsable checksum all refuse the update) — bounded to a 60s
whole-request timeout, 20s connect timeout, and a 256 MiB size cap, so a stalled or runaway
transfer can never wedge the update or fill the disk. A per-asset checksum alone only proves the
download wasn't corrupted in transit, not who published it — a separately signed
`release-manifest.json` (verified against the pinned Ed25519 key above) additionally proves the
release itself came from the expected signer, once a signing key exists for the release you're
pulling from.
</div>

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
