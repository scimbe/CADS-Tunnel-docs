---
title: Bring up a channel member with one command
description: The copy-paste alternative to setting CT_CHANNEL_* by hand — and why it never puts your private key in shell history.
order: 10
---

# Bring up a channel member with one command

[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) shows the direct
path: mint keys, set `CT_CHANNEL_*` env vars yourself, run `ct-agent channel`. This page covers a
second, undocumented-until-now path to the exact same result — a single piped command, served
live by this deployment and confirmed working for this page:

```
$ curl -s https://bunsenbrenner.org/channel.sh | head -5
#!/bin/sh
# CADS-Tunnel agent-to-agent channel runner (#100). Piped from the operator one-liner:
#   curl -fsSL <portal>/channel.sh | CT_BOOTSTRAP=... sh
# Brings this machine up as a channel member and pipes stdin/stdout over the
# encrypted agent-to-agent tunnel.
```

`GET {cp_url}/channel.sh` (POSIX) and `GET {cp_url}/channel.ps1` (PowerShell) are real, served
routes — `crates/control-plane/src/installer.rs`'s `render_channel_sh`/`render_channel_ps1`,
mounted in `installer_router`. Detects OS/arch, downloads the matching `ct-agent` binary from
GitHub Releases, and execs `ct-agent channel` — the same subcommand
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) documents you
running directly.

<div class="callout warn">
Don't confuse this with <code>/install.sh</code>. That route (the tunnel-install one-liner) now
just <strong>redirects</strong> to <code>ct-agent</code>'s own richer setup script — see
<a href="{{ '/how-to/install-ct-agent/' | relative_url }}">Install ct-agent</a>. <code>/channel.sh</code>
and <code>/channel.ps1</code> are a completely different, still-live mechanism for the
Agent-Fabric-channel path specifically, unaffected by that redirect.
</div>

## Why a copy-paste command exists for this at all

The direct path needs several secrets set as environment variables before `ct-agent channel` will
run — most sensitively, your Noise (X25519) **private** key
(`CT_CHANNEL_NOISE_KEY`). Typing or pasting `CT_CHANNEL_NOISE_KEY=<your private key> ct-agent
channel` directly into a shell puts that key in your shell history and briefly in `ps` output —
avoidable, but easy to get wrong under time pressure.

<div class="callout warn">
<strong>Updated 2026-09-06</strong> — an inline-secret one-liner renderer (<code>channel_one_liner</code>)
used to exist in source for this case, but was deleted
(<a href="https://github.com/scimbe/CADS-Tunnel/issues/620">#620</a>): it had no caller anywhere
(the live install page renders its own commands independently) and, like its unwired siblings,
interpolated a peer-supplied <code>host:port</code> value into a shell line unquoted — a real
code-execution shape on the customer's machine, latent only because nothing was wired to it. It
was removed rather than hardened. The bootstrap-token form below is unaffected and remains the
only supported copy-paste path.
</div>

## The bootstrap-token form — what actually ships

What `/channel.sh` and `/channel.ps1` are built to consume is the **bootstrap-token** form
(tracked as issue #100 / SEC90b): a command that carries only a short-lived, single-use opaque
token — never the real Noise private key. `render_channel_sh`/`render_channel_ps1`
(`crates/control-plane/src/installer.rs`) are the served renderers behind this — unaffected by
#620's cleanup above, which only removed the separate, never-wired inline-secret renderers:

```
curl -fsSL https://bunsenbrenner.org/channel.sh | CT_BOOTSTRAP=<token> sh
```
```powershell
$env:CT_BOOTSTRAP='<token>'; irm https://bunsenbrenner.org/channel.ps1 | iex
```

Whoever hands you this command minted `<token>` server-side via `POST /bootstrap/mint`
(admin-token-gated — minting hands off control of a real secret bundle, confirmed live: calling it
without `x-ct-admin-token` returns `401`). The script you run redeems it for you:

1. `POST {portal}/bootstrap/redeem {"token": "<token>"}` — **no auth beyond the token itself**;
   possession of this short-lived, single-use value is the authorization. Confirmed live against
   this deployment: a well-formed-but-unknown token returns `404`, a malformed one `400`. The
   response carries your real `CT_CHANNEL_*` config as JSON, over TLS, in the body — never as a URL
   or command-line argument.
2. The script extracts each field with `sed` (POSIX) or a regex match (PowerShell) — no `eval` of
   server data, no nested-JSON parser needed, because the bundle's own format
   (`CT_CHANNEL_ROLE=...;CT_CHANNEL_ADDR=...;...`) is deliberately flat and shell-tractable.
3. Every recovered value is `export`ed, then `ct-agent channel` runs exactly as it would from the
   manual path — it has no idea whether its environment came from a human or a redeemed bundle.
4. Missing anything after that (no `CT_BOOTSTRAP` *and* no `CT_CHANNEL_ROLE` etc. set manually) —
   the script fails fast with a specific `set CT_BOOTSTRAP (or CT_CHANNEL_ROLE: ...)` message per
   variable, not a generic error.

## The bootstrap token itself expires and is single-use

`BOOTSTRAP_TTL_SECS` defaults to 600 seconds server-side (the mint call can override it via
`ttl_secs`). A redeem after expiry is `410 Gone`; a second redeem of an already-used token is `409
Conflict` — checked directly against `bootstrap_redeem`'s source, not assumed. If your one-liner
stops working, it most likely simply expired; ask whoever generated it for a fresh one rather than
retrying the same command.

## Should you use this?

If you already have your own keys and are comfortable exporting `CT_CHANNEL_*` yourself, the direct
path in [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) works
identically — `channel.sh`'s bootstrap form is a secret-hygiene convenience for handing a
ready-to-run command to someone else (a teammate, a second machine), not a different underlying
mechanism.
