---
title: Run a maintenance task with the harness
description: ct-agent harness run, a bounded local-LLM agent scoped to one manifest's own bundle directory -- run for real, including every rejection path.
order: 23
---

# Run a maintenance task with the harness

The **harness** (CADS-agent-marketplace Phase 2, `ct-agent harness run`) lets a signed,
publisher-authored task drive a bounded local-LLM agent against a service you've already
[installed from a manifest]({{ '/how-to/install-an-agent-manifest/' | relative_url }}) — think
"apply this fix," not "run whatever code I feel like." It is a separate mechanism from
[manifest install]({{ '/how-to/install-an-agent-manifest/' | relative_url }}) — that page gets a
service running; this one lets a trusted publisher's signed instructions maintain it afterward,
without ever handing that publisher shell access to your machine. Every command and every output
below was actually run, against a real locally-built `ct-agent` and `manifest-core` — including
every rejection path.

## Why this is safe to run at all

Three things bound what a task can actually do, source-grounded in
`CADS-agent-marketplace/crates/harness-core`:

- **No shell, three tools total.** `read_file`, `write_file`, and `rebuild` (`docker compose build`
  only — never `up`/`down`) are the entire attack surface (`tools.rs`). There is no bash tool, no
  arbitrary command execution, at all.
- **Real containment, not a lexical check.** Every file path is resolved and symlink-canonicalized
  against the bundle directory before use (`containment.rs`) — a `..` or absolute path is refused
  before it's even joined, and a symlink a malicious bundle planted to point *outside* the bundle is
  caught too, because containment is checked against the real, resolved filesystem path, not the
  string. `.env` — the installer's own secrets file — is refused by name at any depth, regardless of
  what a task's prompt asks for.
- **A hard local ceiling on top of the signed one.** A task's own `max_turns` is part of what it
  signs (tampering with it after signing invalidates the signature), but nothing upstream bounds how
  high a compromised or buggy publisher key could set it — so the harness itself refuses anything
  over **200 turns**, regardless of what's signed. This matters specifically because the `rebuild`
  tool never touches your LiteLLM spend budget at all, so a task that calls `rebuild` every turn
  burns real `docker compose build` time completely unbounded by any token-spend cap.

Two independent allowlists gate a run before any of this even starts: the manifest's own publisher
trust allowlist (same one `manifest activate` uses) and a **separate** harness-side model allowlist
— even a trusted publisher's task naming a model you haven't allowed is refused, so a compromised
trust-allowlisted key can't be used to drive spend against an arbitrary, expensive model.

## 1. Have an activated manifest to run against

The harness needs a real, already-installed bundle — reusing exactly the
[manifest install]({{ '/how-to/install-an-agent-manifest/' | relative_url }}) recipe:

```bash
mkdir bundle && cd bundle
printf '#!/bin/sh\necho "docs-example manifest installed successfully"\n' > hello.sh
printf '#!/bin/sh\necho "verify.sh: ok"\nexit 0\n' > verify.sh
chmod +x hello.sh verify.sh
cd .. && tar -czf bundle.tar.gz -C bundle .

./ct-agent channel init   # if you don't already have a holder identity
```

```bash
CT_MANIFEST_NAME=docs-harness-example CT_MANIFEST_VERSION=0.1.0 \
CT_MANIFEST_BUNDLE_URL="$PWD/bundle.tar.gz" \
CT_MANIFEST_BUNDLE_SHA256=$(sha256sum bundle.tar.gz | cut -d' ' -f1) \
CT_MANIFEST_KIND=binary CT_MANIFEST_COMPOSE_FILE=hello.sh CT_MANIFEST_VERIFY_SCRIPT=verify.sh \
CT_MANIFEST_VERIFY_TIMEOUT_SECS=30 ./ct-agent manifest create > unsigned.json

CT_MANIFEST_HOLDER_KEY=<from channel init> CT_MANIFEST_IN=unsigned.json \
./ct-agent manifest sign > signed.json

mkdir work
CT_MANIFEST_URL="$PWD/signed.json" \
CT_MANIFEST_TRUST_ALLOWLIST=<your holder pubkey> \
CT_MANIFEST_PROJECT_NAME=docs-harness-proof \
CT_MANIFEST_WORK_DIR="$PWD/work" \
./ct-agent manifest activate
```

`work/` — `CT_MANIFEST_WORK_DIR` above — is exactly the directory the harness will later be
containment-scoped to (`CT_HARNESS_BUNDLE_DIR` below), because it's what actually holds the
manifest's unpacked files.

## 2. Sign a task

<div class="callout warn">
There is no production CLI for this yet, deliberately called out rather than glossed over: the only
way to produce a signed task today is <code>manifest-core</code>'s own <code>examples/
dev_sign_task.rs</code> — its own doc comment literally calls itself a "local dev tool." A real
<code>ct-agent task sign</code>-style subcommand (mirroring <code>manifest create</code>/<code>manifest
sign</code>'s shape) doesn't exist as of this writing. Until it does, a publisher wanting to sign a
task for real needs this example binary (or their own small program calling
<code>SignedTask::sign_new</code> directly) — not a gap in this page, a gap in the tooling.
</div>

```bash
git clone https://github.com/scimbe/CADS-agent-marketplace.git
cd CADS-agent-marketplace

CT_TASK_HOLDER_KEY=<your holder key, same one that signed the manifest, or any trusted publisher key> \
CT_TASK_MANIFEST_ID=<manifest_id from signed.json> \
CT_TASK_PROMPT="Say hello" \
CT_TASK_MODEL="gpt-4o-mini" \
CT_TASK_MAX_TURNS=6 \
cargo run --example dev_sign_task -p manifest-core > task.json
```

`CT_TASK_NOW`/`CT_TASK_EXPIRES_IN_SECS`/`CT_TASK_MAX_OUTPUT_TOKENS`/`CT_TASK_ID` all have defaults —
see the example's own source for the exact fallback values. Real output:

```json
{
  "publisher_pubkey": "f8c7fafde5c2521fa30ecfd92af6478fd0d275ad4091c1f8317f927819b61c7b",
  "task_id": "0808080808080808080808080808080808080808080808080808080808080808",
  "manifest_id": "7349ea7913a1f2eaefc3b828a95f72fe6617e83c636bb00b510fec402f4e6a12",
  "prompt": "Say hello",
  "model": "gpt-4o-mini",
  "max_turns": 6,
  "max_output_tokens": 2048,
  "issued_at": 1788352163,
  "expires_at": 1788355763,
  "signature": "f4c4ee7f…"
}
```

## 3. Run it

```bash
CT_HARNESS_TASK_URL_OR_PATH="$PWD/task.json" \
CT_HARNESS_MANIFEST_URL_OR_PATH="$PWD/signed.json" \
CT_HARNESS_TRUST_ALLOWLIST=<your holder pubkey> \
CT_HARNESS_ALLOWED_MODELS=gpt-4o-mini \
CT_HARNESS_BUNDLE_DIR="$PWD/work" \
CT_HARNESS_LITELLM_URL=<your own LiteLLM proxy's base URL> \
CT_HARNESS_LITELLM_KEY_FILE=<path to a file holding a budget-capped LiteLLM virtual key> \
./ct-agent harness run
```

`CT_HARNESS_LITELLM_KEY_FILE` is a **file**, never an inline env var — the same file-based-secret
discipline `ct-agent`'s own `CT_AGENT_CAPABILITY_OUT` uses, so the key never lands in a `ps`/
process-env dump. `CT_HARNESS_MANIFEST_URL_OR_PATH` is re-fetched and re-verified here (signature,
expiry, trust allowlist) even though the manifest was already activated in step 1 — the harness
re-confirms `CT_HARNESS_BUNDLE_DIR` really looks installed from the manifest the task claims to be
scoped to before trusting anything in it, a defense-in-depth check independent of what
`manifest activate` already did.

<div class="callout warn">
<strong>Honest gap.</strong> The path below this point — a real model turn actually calling
<code>read_file</code>/<code>write_file</code>/<code>rebuild</code> and finishing with
<code>"status": "ok"</code> — needs a real LiteLLM proxy to click-test against, which this pass
didn't have. What's verified live below is everything up to and including the first real HTTP call
to it (every rejection path, plus the exact request shape once nothing else is left to reject) —
not the full successful round-trip. If you run this against a real LiteLLM deployment and hit
something this page gets wrong, the source above is the fastest way to check what actually happens
next.
</div>

Confirmed live, in order — nothing in the bundle is ever touched once any check fails:

**Manifest trust allowlist doesn't match** (checked before the task's own publisher check even
runs):
```json
"the manifest fetched from CT_HARNESS_MANIFEST_URL_OR_PATH is signed by a publisher not on CT_HARNESS_TRUST_ALLOWLIST -- refusing to trust its bundle.compose_file"
```

**Model not on the harness's own allowlist** (`CT_HARNESS_ALLOWED_MODELS` doesn't include the
task's `model`, even with the trust allowlist satisfied):
```json
{
  "status": "rejected",
  "reason": "model 'gpt-4o-mini' is not on this host's harness model allowlist",
  "task_id": "0808080808080808080808080808080808080808080808080808080808080808"
}
```

**`max_turns` over the local ceiling** (a task signed with `max_turns=500`):
```json
{
  "status": "rejected",
  "reason": "task.max_turns (500) exceeds this harness's local ceiling of 200 turns -- refusing regardless of the LiteLLM budget cap, since the rebuild tool never touches that budget",
  "task_id": "0808080808080808080808080808080808080808080808080808080808080808"
}
```

**Everything above passes, then the actual model call** (against a deliberately unreachable
LiteLLM URL, `http://127.0.0.1:9`) — this is the exact HTTP shape a real run makes, an OpenAI-
compatible `/chat/completions` POST:
```json
{
  "status": "failed",
  "task_id": "0808080808080808080808080808080808080808080808080808080808080808",
  "manifest_id": "7349ea7913a1f2eaefc3b828a95f72fe6617e83c636bb00b510fec402f4e6a12",
  "turns_used": 0,
  "reason": "model call failed: POST http://127.0.0.1:9/chat/completions: error sending request for url (http://127.0.0.1:9/chat/completions)"
}
```

`harness run` exits `0` exactly when `status` is `"ok"`, same convention as `manifest activate` —
`ct-agent harness run && …` scripts correctly. A `"failed"` report (task passed every check, then
something went wrong mid-run) still carries `turns_used` and, on later turns, whichever files the
loop had already changed before the failure — check `<bundle_dir>/.harness-transcript.jsonl` for the
full turn-by-turn record either way (`report.rs`'s `TranscriptEntry` log, append-only, written
regardless of the run's final outcome).

## Reference

- `CT_HARNESS_TASK_URL_OR_PATH` — `https://` URL or local path to the signed task JSON.
- `CT_HARNESS_MANIFEST_URL_OR_PATH` — the same manifest reference used at `manifest activate` time.
- `CT_HARNESS_TRUST_ALLOWLIST` (comma-separated 64-hex publisher pubkeys) or
  `CT_HARNESS_TRUST_ALLOWLIST_FILE` (one per line) — exactly one of the two, required; an empty
  allowlist is refused outright rather than silently allowing everything.
- `CT_HARNESS_BUNDLE_DIR` — the manifest's own already-activated work directory (`CT_MANIFEST_WORK_DIR`
  from step 1).
- `CT_HARNESS_LITELLM_URL` / `CT_HARNESS_LITELLM_KEY_FILE` — your own LiteLLM proxy and a
  budget-capped virtual key file for it.
- `CT_HARNESS_ALLOWED_MODELS` — comma-separated model names the harness may call; no default, ever.
- The three tools a task can call: `read_file`, `write_file` (both containment-checked, 4&nbsp;MiB
  cap each), `rebuild` (`docker compose -f <compose_file> build`, 300s timeout, process-group-killed
  on timeout — never `up`/`down`).

Full reference for `manifest`'s own subcommands and env vars:
[Install an agent manifest]({{ '/how-to/install-an-agent-manifest/' | relative_url }}).
