---
title: Install ct-agent
description: Direct-host or Docker, and what each setup flag actually does.
order: 1
---

# Install ct-agent

`ct-agent` has a guided setup script for Linux/macOS (`setup.sh`) and Windows (`setup.ps1`) — the one
supported install path, no repo clone needed. This page covers the two install modes and the flags —
for the full walkthrough, see [Your first tunnel]({{ '/tutorials/first-tunnel/' | relative_url }}).

## Installing

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/scimbe/ct-agent/main/scripts/setup.sh | bash
```

```powershell
# Windows
irm https://raw.githubusercontent.com/scimbe/ct-agent/main/scripts/setup.ps1 | iex
```

Both run directly on this host by default and ask you to confirm first (see below for why). To pass a
flag through the pipe, it's not just appended after the URL — each shell needs its own syntax:

```bash
# Linux / macOS: -s -- hands everything after it to the script as $1, $2, ...
curl -fsSL https://raw.githubusercontent.com/scimbe/ct-agent/main/scripts/setup.sh | bash -s -- --docker
```

```powershell
# Windows: iex alone can't take parameters, so build a scriptblock and invoke it with them
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/scimbe/ct-agent/main/scripts/setup.ps1))) -Docker
```

`ct-agent` is a network-facing process. Direct-host is simpler and has less overhead, but it's designed
to run inside something isolated — a VM, a container, or a dedicated host — not on a machine holding
data or credentials you wouldn't want reachable if the agent were ever compromised. `--docker`/`-Docker`
is the safer default if you're unsure; it builds a minimal image from the latest published release binary
(no Rust toolchain or repo checkout needed) and runs it with your `.env` and a persistent state volume.

<div class="callout">
<code>--help</code>/<code>-h</code> works the same way through the pipe as running the script from a
local file — <code>curl -fsSL ... | bash -s -- --help</code> prints the full flag list without installing
anything.
</div>

## Flags

| Flag | Effect |
|---|---|
| `--yes` | Skip the interactive direct-host confirmation. Required if running non-interactively (e.g. from a script or CI). |
| `--docker` | Run as a Docker container instead of directly on the host. |
| `--template` | Also download and unpack the starter site template into `./template/`. |
| `--green`/`-Green` | Push straight through to the Grün tier (your own certificate) as part of setup, instead of stopping at Gelb — direct-host only; combined with `--docker`/`-Docker` both scripts print the `docker exec`/`docker cp` commands to run yourself instead of automating it (source-confirmed, `scripts/setup.sh::poll_status` and `scripts/setup.ps1::Wait-ForTier` alike). See [Go from Gelb to Grün]({{ '/how-to/gelb-to-gruen/' | relative_url }}) if you'd rather do this as a separate step later. |

## Restarting or re-running

The script is idempotent: if `.ct-agent-state/` already holds a bound identity, re-running `setup.sh`
detects it and restores from it rather than re-onboarding — it won't try to replay your (by then already
consumed) join token. This is what makes it *safe* to just re-run the script after a reboot or a crash —
but "safe" isn't the same as "automatic".

<div class="callout warn">
<strong>Nothing restarts the agent for you unless you set that up yourself.</strong> The guided setup
script starts the direct-host agent as a plain backgrounded process (<code>nohup ./ct-agent &amp;</code>,
source-confirmed in <code>setup.sh</code>) — no supervisor, no restart-on-crash, no restart-on-reboot.
If the process dies (an unhandled panic, an OOM kill, or the host simply rebooting) and nobody notices
to re-run the script by hand, the tunnel stays down indefinitely — the outside world sees only a
generic connection-reset, with nothing in the platform's own logs beyond "no agent tunnel for this
token" (the edge is working correctly; there's just nothing on the other end to route to). This is a
real, live-observed failure mode, not a hypothetical one — and it's silent from the platform side by
design: a payload-blind operator has no way to know your origin is supposed to be running.
<br><br>
Put the agent under a real supervisor instead:
</div>

**Direct-host — systemd** (the most robust option on a Linux host you control):

```ini
# /etc/systemd/system/ct-agent.service
[Unit]
Description=ct-agent tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/ct-agent          # <- wherever your .env and .ct-agent-state/ live
EnvironmentFile=/opt/ct-agent/.env
ExecStart=/opt/ct-agent/ct-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ct-agent
systemctl status ct-agent               # confirm it's actually running
```

`Restart=always` covers both a crash and a clean exit — including the exact scenario above, where the
process died and nobody was watching. Combine with `CT_AGENT_METRICS_LISTEN` and point a `systemd`
watchdog or your own monitoring at `GET /healthz` (see
[Environment variables]({{ '/reference/environment-variables/' | relative_url }})) if you want to be
alerted rather than just silently recovered.

**Docker** — the same gap exists here too, source-confirmed: the setup script's `docker run` doesn't
set a restart policy at all (`docker run -d --name ct-agent ...`, no `--restart` flag), so a crashed or
OOM-killed container, or a host reboot, leaves it stopped exactly like the direct-host case. Fix it once,
after the initial `docker run` from setup:

```bash
docker update --restart unless-stopped ct-agent
```

{% raw %}
```bash
docker inspect ct-agent --format '{{.HostConfig.RestartPolicy.Name}}'
# should print: unless-stopped
```
{% endraw %}

`unless-stopped` also needs Docker's own service enabled to start on boot (`systemctl enable docker` on
most Linux distributions — usually already the case if you installed Docker normally) to survive a full
host reboot, not just an in-place crash.

## Stopping and resetting

The script's own final report prints the exact commands for your install, but in short:

```bash
# stop (direct-host)
kill $(cat ./ct-agent.pid) 2>/dev/null

# stop (docker)
docker rm -f ct-agent

# full reset: clear local state and onboard from scratch with a NEW join token
kill $(cat ./ct-agent.pid) 2>/dev/null; rm -rf ./.ct-agent-state ./ct-agent.pid
```

A full reset only clears your *local* state — it does not revoke the tunnel itself on the platform side.
For that, use the portal UI (**Revoke** on your [tunnels page]({{ '/how-to/manage-your-tunnel/' | relative_url }})); there's
no CLI/script equivalent today.

<div class="callout">
Rotating just your origin's signing key, without re-onboarding or touching the tunnel's identity at all,
is <code>./ct-agent rotate</code> — see the <a href="https://github.com/scimbe/ct-agent">ct-agent
README</a>.
</div>
