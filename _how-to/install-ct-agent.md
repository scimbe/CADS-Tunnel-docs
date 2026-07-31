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
consumed) join token. This is what makes it safe to just re-run the script after a reboot or a crash,
rather than needing a separate "restart" procedure.

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
