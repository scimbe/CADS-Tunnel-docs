---
title: ct-agent CLI commands
description: Every ct-agent subcommand — what it does, and whether it exits or keeps running.
order: 3
---

# ct-agent CLI commands

Pulled directly from `ct-agent`'s `src/main.rs` argument dispatch. `ct-agent --help` (or `-h`) prints a
real usage summary — this page goes further, adding the one thing `--help` doesn't tell you: whether each
command exits or keeps running.

## Whether a command exits

The single most useful fact about each subcommand, since it changes how you'd script around it:

| Command | Exits after running? |
|---|---|
| `ct-agent onboard` / bare with `CT_AGENT_JOIN_TOKEN` set | **No** — onboards, then serves indefinitely. |
| `ct-agent rotate` | **Yes** — rotates the origin key, prints the result, exits. Restart the agent to pick it up. |
| `ct-agent certificate` | **No** — obtains a certificate, then keeps running as a renewal daemon (checks every 6 hours). Stop it yourself once you've confirmed Grün, if you don't want it running long-term. |
| `ct-agent channel init` | **Yes** — prints a fresh channel identity env block, exits. |
| `ct-agent channel operator-init` | **Yes** — prints a fresh operator identity env block, exits. |
| `ct-agent channel member-material` | **Yes** — computes and prints what a member hands their operator, exits. |
| `ct-agent channel join-pipeline-role` | **Yes** — same idea, derived from a published pipeline's role instead of a pairwise link, exits. |
| `ct-agent channel grant` (+ `--interactive`) | **Yes** — as the operator, signs a member's grant and prints it, exits. `--interactive` prompts for each field with validation/retry instead of reading raw `CT_GRANT_*` env vars — see [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}). |
| `ct-agent channel invite` | **Yes** — as the operator, signs a redeemable invitation for an identity you don't already have holder/noise material for (the cross-account case `grant` can't cover), prints it, exits. |
| `ct-agent channel bind-topology` | **Yes** — as the operator, signs the proof-of-possession the Topology Editor's operator-binding step needs, prints it, exits. |
| `ct-agent channel super-peer` | **No** — runs as an opt-in LAN-local relay for other same-network channel members, indefinitely. See [Run a super-peer]({{ '/how-to/run-a-super-peer/' | relative_url }}). |
| `ct-agent login` | **Yes** — runs the OIDC device-code flow, saves the resulting token, exits. |
| `ct-agent channel register [--rekey]` | **Yes** — registers the operator's channel authority with the control plane, exits. Re-registering an already-owned channel with a *different* operator key is refused (`409`) unless `--rekey` (or `CT_CHANNEL_REKEY=1`) explicitly confirms the rotation (CADS-Tunnel#747, v0.7.24+) — closes a real silent-takeover gap. Same operator key twice is always a harmless no-op. |
| `ct-agent channel allowlist add\|remove\|list [email]` | **Yes** — manages a channel's self-service e-mail allow-list against the control plane, exits. |
| `ct-agent channel agent-card` | **Yes** — writes the signed AgentCard (and auto-registers it with `/registry/agents` if the right env vars are set), exits. |
| `ct-agent channel agent-card --verify <file>` | **Yes** — re-verifies a card's signature and expiry, prints the result, exits non-zero on failure. |
| `ct-agent channel` (no further subcommand) | **No** — joins/serves a channel, runs indefinitely. |
| `ct-agent manifest create\|sign\|publish\|activate` | **Yes**, all four — build/sign/publish a manifest, or fetch+verify+install one, then exit. `activate` exits non-zero when the install itself failed or was rejected. |
| `ct-agent harness run` | **Yes** — runs a signed, bounded local-LLM maintenance task against one already-activated manifest's bundle, prints a JSON report, exits. Non-zero exit unless the report's `status` is `"ok"`. See [Run a maintenance task with the harness]({{ '/how-to/run-a-harness-task/' | relative_url }}). |
| `ct-agent signup <name>` | **Yes** — self-service tunnel registration (no join token needed), prints the routing token to set and run `ct-agent` with, exits. |
| `ct-agent update` | **Yes** — checks GitHub Releases for a newer tag than this binary's own version and self-updates if one exists, exits. |
| `ct-agent local-auth set\|reset\|rotate` | **Yes** — manages the credential `CT_AGENT_LOCAL_AUTH` checks against, without starting the serve loop; `reset`/`rotate` print a fresh generated credential once, exits. |
| `ct-agent relay-node` | **No** — runs the internal-only Circuit-Relay v2 + DCUtR relay node, indefinitely. Never bind its listen address publicly. |

## Onboarding and serving

`ct-agent onboard` and simply running `ct-agent` bare with `CT_AGENT_JOIN_TOKEN` set in the environment
are **the same code path** — presence of that variable is what triggers onboarding, not the literal word
`onboard`. On a restart against existing state (`CT_AGENT_STATE_DIR`), it restores the previously bound
identity instead of re-onboarding, provided `CT_AGENT_ID` matches what was persisted at onboard time —
see [Environment variables]({{ '/reference/environment-variables/' | relative_url }}).

## Certificate issuance

Covered end to end in [Go from Gelb to Grün]({{ '/how-to/gelb-to-gruen/' | relative_url }}).

## Origin key rotation

```bash
CT_AGENT_ORIGIN_KEY=./origin.key CT_AGENT_ORIGIN_KEY_DIR=./retired-keys ./ct-agent rotate
```

Re-mints the capability under the *same* routing token with a new origin key, retiring the old one into
`CT_AGENT_ORIGIN_KEY_DIR`. Restart the agent (with that directory set) to serve both the new and the
still-retiring old identity during the handover window.

## Logging in (`ct-agent login`)

`channel register`/`channel allowlist` need an OIDC bearer token proving who the channel owner is.
Rather than obtaining one by hand and setting `CT_OIDC_TOKEN` yourself every time, log in once:

```bash
CT_OIDC_ISSUER=https://auth.bunsenbrenner.org/realms/ct-demo ./ct-agent login
```

An [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628) device-code flow: prints a URL and a short code,
you authorize in any browser (doesn't have to be the same machine), and the token is stored locally —
`channel register`/`allowlist` pick it up automatically from then on, refreshing it before it expires.
`CT_OIDC_TOKEN` set explicitly in the environment still always takes priority, so nothing changes for a
script that already sets it. Full reference: `docs/channel.md` in the
[`ct-agent` repo](https://github.com/scimbe/ct-agent/blob/main/docs/channel.md#getting-the-oidc-bearer-token-ct-agent-login).

**Using the portal instead of the CLI for channels?** You don't need `ct-agent login` at all — see
[Manage a channel from the portal]({{ '/how-to/manage-a-channel-from-the-portal/' | relative_url }}),
which authenticates via your browser session instead.

## The `manifest` subcommands

A separate mechanism from `channel` — installing a signed, publisher-attested service bundle rather
than joining a channel. Full walkthrough, including the trust-allowlist rejection path, run for real:
[Install an agent manifest]({{ '/how-to/install-an-agent-manifest/' | relative_url }}).

## The `channel` subcommands

These back the Agent-Fabric / MCP layer — see the
[Direct, agent to agent diagram on the landing page](https://bunsenbrenner.org/#mcp) for the shape of
what they enable, and
[Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }})
for every `CT_CHANNEL_*`/`CT_AGENT_CARD_*`/`CT_AGENT_OFFER_*` variable these commands read.

## `channel allowlist` — self-service, no grant hex to hand out

```bash
CT_AGENT_CP_URL=https://your-cp \
CT_GRANT_CHANNEL=<64 hex channel id> \
CT_OIDC_TOKEN=<your OIDC bearer token, channel owner only> \
./ct-agent channel allowlist add someone@example.com
```

Same env vars as `channel register` — `CT_OIDC_TOKEN` here is optional if you've already run
`ct-agent login` (see above); shown explicit above only to keep the example self-contained. This is the
CLI counterpart to the portal web UI's allow-list management, hitting the same owner-scoped
`/me/channels/:channel/allowlist` routes (see
[Self-service channel allow-list & claim]({{ '/reference/api-endpoints/#self-service-channel-allow-list--claim' | relative_url }})).
`add`/`remove` take one email argument and print a confirmation to stderr; `list` takes none and prints
every currently-allow-listed address to stdout, one per line (or `channel <id> has no allow-listed
emails` on stderr when empty) — pulled directly from `main.rs`'s dispatch, not run live against the
production control plane for this pass. Full walkthrough:
[Self-serve a channel membership grant]({{ '/how-to/self-service-channel-grant/' | relative_url }}).
