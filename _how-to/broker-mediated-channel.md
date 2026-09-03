---
title: Set up a broker-mediated channel, fully click-tested
description: The path join-a-channel.md flagged as unverified — now run for real, twice, against the production edge.
order: 12
---

# Set up a broker-mediated channel, fully click-tested

[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) walks through the
**direct-address** path and explicitly flags the broker-mediated path as not click-tested in that
pass. This page closes that gap — every command below was actually run against the real production
edge and control plane while building a real demo this session, including a real reply crossing a
real Noise session between two genuinely separate processes reachable only through the broker/relay.

## When you need this instead of direct-address

Direct-address (`CT_CHANNEL_ADDR`) needs you to already know the peer's reachable host:port. Broker-
mediated needs no such thing — the edge's broker resolves two members to each other by channel id
alone, which is what makes it work for members that don't share a network, or don't have a stable
address at all (`CT_CHANNEL_RELAY_ONLY=1`). It also needs one extra piece direct-address doesn't:
**the control plane has to know your channel exists**, because the edge asks the control plane
"is this holder actually a member of this channel?" on every join attempt (see
[How the edge decides whether to admit a channel join]({{ '/explanation/channel-admission/' | relative_url }})).

## 1. Identities and the channel id — same as direct-address

```bash
./ct-agent channel operator-init   # once per channel
./ct-agent channel init            # once per member (run twice, for two members)
```

Derive the shared channel id and each member's noise attestation exactly as in
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})'s step 3
(`ct-agent channel member-material`).

## 2. Register the channel with the control plane

This is the step direct-address never needs. Requires a real OIDC bearer token for the account that
will own the channel — see
[Getting a bearer token without a browser]({{ '/reference/api-endpoints/' | relative_url }}#getting-a-bearer-token-without-a-browser)
if you're scripting this rather than using a browser session.

```bash
CT_AGENT_CP_URL=https://<your-plane> \
CT_GRANT_CHANNEL=<channel_id from step 1> \
CT_CHANNEL_OPERATOR_KEY=<operator private key, from operator-init> \
CT_OIDC_TOKEN=<bearer token> \
./ct-agent channel register
```

Real output, actually run: `registered channel add9ea39...ce with the control plane` — a plain
`eprintln!`, exit `0`. Re-running it for a channel you already own with the **same** operator key is
harmless (idempotent, nothing written), confirmed by running it twice. Re-running it with a
**different** `operator_pubkey` is not: since
[#747](https://github.com/scimbe/CADS-Tunnel/issues/747) the control plane refuses that with `409`
and writes nothing — before, it silently replaced the operator, and every grant the old key had signed
stopped verifying. Rotating an operator on purpose is an explicit, audit-logged opt-in on the HTTP API
(`"confirm_rekey": true`, see
[API endpoints]({{ '/reference/api-endpoints/' | relative_url }}#self-service-channel-registry)); a
`ct-agent` released today has no flag for it and just reports the `409`.

<div class="callout warn">
<strong>Before you run <code>channel register</code>, check which channel id it's about to target.</strong>
It reads <code>CT_GRANT_CHANNEL</code> (the allow-list commands also accept <code>CT_CHANNEL_ID</code>),
and a stale export from an earlier session is the real near-miss behind #747: a leftover value made
<code>channel register</code> point at an existing production channel instead of the freshly derived
one — no damage that time only because the operator key happened to be the same. Run
<code>echo "$CT_CHANNEL_ID" "$CT_GRANT_CHANNEL"</code> first and <code>unset</code> anything you didn't
set on purpose in this shell.
</div>

There's no CLI wrapper for the next part — register each member directly against the HTTP API
(`POST /me/channels/:channel/members`, see [API endpoints]({{ '/reference/api-endpoints/' | relative_url }})
for the exact shape: `holder`, `noise_pubkey`, and the `noise_attestation` step 1 already computed).
Do this once per member, same bearer token.

## 3. Grants — same command as direct-address

```bash
CT_CHANNEL_OPERATOR_KEY=<from step 1> \
CT_GRANT_CHANNEL=<channel_id> \
CT_GRANT_MEMBER_HOLDER=<this member's holder_pubkey> \
CT_GRANT_DIRECTION=accept \
CT_GRANT_EXPIRES=<unix seconds> \
./ct-agent channel grant
```

One per member, opposite `CT_GRANT_DIRECTION` for the other side, exactly as in the direct-address
walkthrough.

## 4. Connect for real — broker-mediated

```bash
# Accept side, relay-only (no dialable address of its own):
CT_CHANNEL_ROLE=accept \
CT_CHANNEL_BROKER=<edge host>:4435 CT_CHANNEL_RELAY=<edge host>:4436 CT_CHANNEL_RELAY_ONLY=1 \
CT_CHANNEL_HOLDER_KEY=<accept member's holder private key> \
CT_CHANNEL_NOISE_KEY=<accept member's noise private key> \
CT_CHANNEL_GRANT=<accept member's grant hex, from step 3> \
./ct-agent channel
```

Real log line, actually observed: `ct-agent channel: plane-brokered Accept (relay <ip>:4436) —
persistent serve: concurrent sessions (#200)` (add `CT_CHANNEL_SERVE=1` to get this parked,
persistent-serve behavior instead of the default one-shot).

<div class="callout warn">
What happens when re-admission keeps failing: a persistent <code>--serve</code> loop treats two
kinds of admission failure very differently (source-verified against
<code>ct-agent</code>'s <code>channel_run.rs</code> and its passing test suite — real numbers, not
approximated). A <strong>transient</strong> error (a brief control-plane blip, the <code>#140</code>
stall) always retries at the fast, unchanged base backoff (200ms in production) — a genuine hiccup
should recover quickly. A <strong>definitive refusal</strong> — <code>edge broker refused the
channel join</code>, meaning this holder genuinely isn't a member of the channel and retrying
won't fix that without an operator adding it — instead backs off <em>exponentially</em>
(200ms, 400ms, 800ms, ... doubling per consecutive refusal), capped at 30s. This is
<a href="https://github.com/scimbe/CADS-Tunnel/issues/231">#231</a>: an orphaned process retrying a
not-member holder at the old flat rate was live-measured at ~24-47 admission attempts/second against
the production edge — real, sustained load on the edge's admission path from a single stray process.
If your own persistent serve process seems to have "gone quiet" after a burst of
<code>admission error, re-admitting (#200)</code> lines, this is very likely why — check that its
holder is actually still a member of the channel it's presenting a grant for.
</div>

```bash
# Initiate side, in a separate process (a genuinely different container in the real test):
echo "hello over the real broker" | CT_CHANNEL_ROLE=initiate \
CT_CHANNEL_BROKER=<edge host>:4435 CT_CHANNEL_RELAY=<edge host>:4436 CT_CHANNEL_RELAY_ONLY=1 \
CT_CHANNEL_HOLDER_KEY=<initiate member's holder private key> \
CT_CHANNEL_NOISE_KEY=<initiate member's noise private key> \
CT_CHANNEL_GRANT=<initiate member's grant hex> \
./ct-agent channel
```

Real result: `ct-agent channel: plane-brokered Initiate (relay <ip>:4436)`, then
`ct-agent channel: peer is relay-only (no dialable address) — using the edge relay (#121)`, then the
accept side's stdin arrived verbatim on the initiate side's stdout — two fully independent processes,
zero shared address, connected purely by channel id through the production broker/relay.

## The one real trap: same host, public hostname

If you test both members on the same machine that's *also* running the edge, pointing
`CT_CHANNEL_BROKER`/`CT_CHANNEL_RELAY` at the edge's **public hostname** can fail with
`channel join admission exchange stalled (#140)` on both sides — not a channel bug, a hairpin-NAT
routing quirk of connecting to your own public IP from the same host. Point at `127.0.0.1` (or the
edge's container-network name, if you're both inside the same Docker Compose network) instead; a real
deployed topology with the members on different hosts never hits this.

## Related

- [Serve your own service, solo]({{ '/how-to/serve-your-own-service-solo/' | relative_url }}) — this
  same sequence, adapted for when you're both the operator and the only member so far, with no known
  second party to derive a channel id against.
- [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) — the
  direct-address path this one complements.
- [How the edge decides whether to admit a channel join]({{ '/explanation/channel-admission/' | relative_url }})
  — what the edge actually checks on every join this page's step 4 triggers.
- [Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }})
  — broker-mediated `CT_CHANNEL_SERVE=1` is what lets an accept-side member serve many calls without
  restarting; this page only shows the bare connect.
