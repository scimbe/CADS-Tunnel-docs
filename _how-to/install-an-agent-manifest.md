---
title: Install an agent manifest
description: ct-agent manifest activate, fetch/verify/install a signed service bundle -- run for real, including the rejection path.
order: 22
---

# Install an agent manifest

A **manifest** is a signed description of an installable service bundle -- name, version, where
to fetch it, its sha256, and how to verify it actually came up healthy -- published to the
[CADS-agent-marketplace](https://github.com/scimbe/CADS-agent-marketplace) registry (or any
`https://` location, or shared as a plain file) so any agent can install it self-service, without
trusting the publisher to run anything on your behalf beyond what the signature covers. This is a
separate mechanism from [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})
and [Publish an agent card]({{ '/how-to/publish-an-agent-card/' | relative_url }}) -- those are
about *identity and messaging*; a manifest is about *installing a runnable service*. Every command
and every output below was actually run, against a real locally-built `ct-agent` -- including the
rejection path.

## The four subcommands

```
ct-agent manifest create     Build an unsigned manifest skeleton from CT_MANIFEST_* env
ct-agent manifest sign       Sign a manifest with your holder key (CT_MANIFEST_HOLDER_KEY)
ct-agent manifest publish    Publish signed JSON to object storage or the registry
ct-agent manifest activate   Fetch, verify and install a signed manifest
```

The three-step **publish** side (`create` → `sign` → `publish`) exists so your holder private key
is only ever needed once, offline: `create` needs no key and no network, `sign` needs the key but
no network, `publish` needs the network but not the key. This page walks the **consumer** side,
`activate` -- what an operator runs to actually install something.

<div class="callout">
This page does not cover installing a manifest through the portal's "Agent bridges" page.
<strong>Fixed (2026-09-06)</strong> -- the portal-to-agent dial (<code>bridge/status</code> and the
rest of the tranche) now works: a request-framing bug in the control plane's bridge dialer meant
every real call silently timed out after 20s
(<a href="https://github.com/scimbe/CADS-Tunnel/issues/745">CADS-Tunnel#745</a>, closed, verified
live against a real sidecar post-deploy). The portal's "Agent bridges" page is now a working
alternative to the CLI flow below for manifest install, provided you've granted the bridge into
your channel -- see
[Manage your tunnel from the portal]({{ '/how-to/manage-your-tunnel/' | relative_url }}#agent-bridge--the-registry-toggle-for-real-remote-control).
</div>

## 1. Build and sign a manifest (the publisher side)

A minimal **binary**-kind bundle -- just an executable and a verify script, tarred up:

```bash
mkdir bundle && cd bundle
printf '#!/bin/sh\necho "docs-example manifest installed successfully"\n' > hello.sh
printf '#!/bin/sh\necho "verify.sh: ok"\nexit 0\n' > verify.sh
chmod +x hello.sh verify.sh
cd .. && tar -czf bundle.tar.gz -C bundle .
sha256sum bundle.tar.gz
```

```
914028c02c141293d7b7968990b6eea6c8daaf28331a0c35581ee854eceffe94  bundle.tar.gz
```

```bash
CT_MANIFEST_NAME=docs-example \
CT_MANIFEST_VERSION=0.1.0 \
CT_MANIFEST_BUNDLE_URL="$PWD/bundle.tar.gz" \
CT_MANIFEST_BUNDLE_SHA256=914028c02c141293d7b7968990b6eea6c8daaf28331a0c35581ee854eceffe94 \
CT_MANIFEST_KIND=binary \
CT_MANIFEST_COMPOSE_FILE=hello.sh \
CT_MANIFEST_VERIFY_SCRIPT=verify.sh \
CT_MANIFEST_VERIFY_TIMEOUT_SECS=30 \
./ct-agent manifest create > unsigned.json
```

`CT_MANIFEST_KIND` defaults to `compose` (a Docker Compose service, the common case) if unset --
`binary` (a bare executable, what this page uses to keep the demo Docker-free) and `k8s`
(schema-only today) are the other two. Whichever kind you pick, `CT_MANIFEST_COMPOSE_FILE` names
the path *inside the bundle* to run -- the compose file for Compose kind, the executable for
Binary kind, one field either way.

```bash
./ct-agent channel init   # if you don't already have a holder identity
```

```
export CT_CHANNEL_HOLDER_PUBKEY=579b4997c649a9f7341756f54fefaf2155276670987756d72aa281437e2a3784
export CT_CHANNEL_HOLDER_KEY=69bcbc4d6d2e022d301237e09a9e8aa3f69ecf8664241793206d8aa3fc6d0c4f
```

```bash
CT_MANIFEST_HOLDER_KEY=69bcbc4d6d2e022d301237e09a9e8aa3f69ecf8664241793206d8aa3fc6d0c4f \
CT_MANIFEST_IN=unsigned.json \
./ct-agent manifest sign > signed.json
```

`signed.json` now carries `publisher_pubkey` (your holder pubkey), a deterministic `manifest_id`,
and the `signature` -- this is the file `publish` uploads, or that you hand someone directly.

## 2. Install it (the consumer side)

`activate` needs to know **which publishers you trust** -- an empty or absent allowlist is a
deliberate hard refusal, not an "allow all" default:

```bash
mkdir work
CT_MANIFEST_URL="$PWD/signed.json" \
CT_MANIFEST_ALLOW_LOCAL_PATH=1 \
CT_MANIFEST_TRUST_ALLOWLIST=579b4997c649a9f7341756f54fefaf2155276670987756d72aa281437e2a3784 \
CT_MANIFEST_PROJECT_NAME=docs-example-proof \
CT_MANIFEST_WORK_DIR="$PWD/work" \
./ct-agent manifest activate
```

Real output (`install_dir` is new since ct-agent v0.7.27, added next to the report's own fields
-- see the callout below):

```json
{
  "status": "ok",
  "manifest_id": "da58172ed335a31a0a0ffab3cdee8d5583b44867a9125dd4d14e7406bbae5e02",
  "publisher_pubkey": "579b4997c649a9f7341756f54fefaf2155276670987756d72aa281437e2a3784",
  "project_name": "docs-example-proof",
  "compose_up": { "exit_code": 0, "duration_ms": 1 },
  "verify": { "exit_code": 0, "duration_ms": 2 },
  "captured_stdout": "docs-example manifest installed successfully\n",
  "install_dir": "/path/to/work/docs-example-proof"
}
```

`compose_up` is `docker compose up` for Compose kind, or the executable's own run for Binary kind
-- one field either way. `captured_stdout` is only populated for Binary kind (Compose's stdout is
`docker compose`'s own, not the service's). `manifest activate` exits `0` exactly when `status` is
`"ok"`, so `ct-agent manifest activate && …` scripts correctly.

<div class="callout warn">
<strong>Since ct-agent v0.7.27 (#165):</strong> <code>CT_MANIFEST_WORK_DIR</code> is the *parent*
directory, not the install target itself -- each activation unpacks into
<code>&lt;CT_MANIFEST_WORK_DIR&gt;/&lt;CT_MANIFEST_PROJECT_NAME&gt;</code> (here,
<code>work/docs-example-proof</code>), refusing to proceed if that specific path already exists
and isn't an empty directory (naming what's occupying it instead). A successful activation also
writes <code>.ct-agent-activation.json</code> inside it (manifest id, publisher, project name,
timestamp, ct-agent version) -- this is what <a href="{{ '/how-to/run-a-harness-task/' | relative_url }}">running a harness task</a>
against the same directory later verifies before it will run.
</div>

`CT_MANIFEST_URL` and `CT_MANIFEST_BUNDLE_URL` both accept either an `https://` URL or a local file
path -- plain `http://` is refused outright (a manifest fetched over plaintext would leak *which*
manifest you're installing and is tamperable in transit before the signature ever gets checked).

<div class="callout warn">
<strong>Since ct-agent v0.7.29 (#170):</strong> a local file path (as used throughout this page)
now needs <code>CT_MANIFEST_ALLOW_LOCAL_PATH=1</code> set on the agent as well -- without it, a
bare path is refused the same way <code>http://</code> is. The variable name matters: this is
something the operator running the agent decides, never something a caller (like the portal
bridge) can set on your behalf. Fetching a real manifest over <code>https://</code> in production
never needs this flag; it exists for exactly the local dev/proof workflow this page walks through.
</div>

<div class="callout warn">
<strong>Since ct-agent v0.7.29 (#183):</strong> activating a <strong>Binary</strong>-kind manifest
(like this page's example) now requires a working sandbox backend (a <code>bwrap</code> probe:
user/PID/network namespaces, private loopback) -- activation fails closed on a host where that
probe doesn't pass, naming <code>CT_ALLOW_UNSANDBOXED=1</code> as the explicit opt-out. This is a
new precondition for the walkthrough below on a host without a usable sandbox (a container already
running unprivileged, or Ubuntu 24.04's own unprivileged-userns restriction, are both realistic
ways to hit it) -- not click-tested against a real disallowed host for this update, so if `activate`
now refuses for you with a sandbox-related message, that's this new check working as designed, not
a bug in the walkthrough. Check readiness *before* you hit that refusal with
<code>ct-agent doctor sandbox</code> (v0.7.30+) -- it runs the same probe `activate` does and prints
one line per failing check with its concrete fix, or `--json` for a fleet-wide script; exit `0`
means activation will work, `1` means it won't (without the opt-out), `2` means an unsupported OS
(Windows/macOS -- Compose manifests and `manifest plan` only there).
</div>

## 3. The rejection path, for real

Same manifest, trust allowlist pointed at a different (unrelated) publisher instead:

```bash
mkdir work2
CT_MANIFEST_URL="$PWD/signed.json" \
CT_MANIFEST_ALLOW_LOCAL_PATH=1 \
CT_MANIFEST_TRUST_ALLOWLIST=0000000000000000000000000000000000000000000000000000000000000000 \
CT_MANIFEST_PROJECT_NAME=docs-example-proof-2 \
CT_MANIFEST_WORK_DIR="$PWD/work2" \
./ct-agent manifest activate
```

```json
{
  "status": "rejected",
  "reason": "publisher_not_on_trust_allowlist",
  "manifest_id": "da58172ed335a31a0a0ffab3cdee8d5583b44867a9125dd4d14e7406bbae5e02",
  "install_dir": "/path/to/work2/docs-example-proof-2"
}
```

Exit code `1`. Nothing in the bundle is ever fetched, unpacked, or run once the trust check fails
-- rejection happens before any of that. `install_dir` still appears (since v0.7.27): the empty
per-project directory is claimed *before* the trust check runs, so a rejection leaves behind an
empty directory at that path, not nothing.

## Reference

- `CT_MANIFEST_TRUST_ALLOWLIST` (comma-separated 64-hex publisher pubkeys) or
  `CT_MANIFEST_TRUST_ALLOWLIST_FILE` (one per line) -- exactly one of the two, required.
- `CT_MANIFEST_ENV_FILE` -- optional local `KEY=value` secrets file, supplied to the installed
  service; never comes from the manifest itself.
- `CT_MANIFEST_PROTECTED_NAMES` -- comma-separated substrings that must never appear in
  `CT_MANIFEST_PROJECT_NAME`, nor collide with an already-running container/volume -- the guard
  against a proof run like this one touching real infrastructure.
- **Registry ledger mode** (optional): set `CT_MANIFEST_REGISTRY_URL` and a successful activation
  also POSTs a ledger-only activation event, needing `CT_MANIFEST_REGISTRY_WRITE_TOKEN` and
  `CT_MANIFEST_ACTIVATOR_PUBKEY` (your own holder pubkey, reported -- not cryptographically
  proven -- as the activator; honest bookkeeping, not a payment-grade attestation).
- `manifest publish` needs exactly one of `CT_MANIFEST_PUBLISH_URL` (a plain `https://` object-storage
  PUT) or `CT_MANIFEST_REGISTRY_URL` + `CT_MANIFEST_BUNDLE_PATH` + `CT_MANIFEST_REGISTRY_WRITE_TOKEN`
  (the Phase 3 registry's own `POST /manifests`, which also lists what's already published via
  `GET /manifests`).

Once installed, a trusted publisher can maintain a service with a signed, bounded local-LLM task
instead of a full reinstall -- see
[Run a maintenance task with the harness]({{ '/how-to/run-a-harness-task/' | relative_url }}).
