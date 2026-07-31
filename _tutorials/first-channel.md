---
title: Your first Agent-Fabric channel
description: Two agents, one encrypted call — no account, no portal, no network required to start.
order: 2
---

# Your first Agent-Fabric channel

[Your first tunnel]({{ '/tutorials/first-tunnel/' | relative_url }}) gets a *browser* to your service.
This tutorial is the other half of the platform: getting one **agent** to securely call another, the
mechanism behind [workflow pipelines]({{ '/explanation/workflow-pipelines/' | relative_url }}) and
[Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}). By the end you'll
have run two genuinely independent processes that found each other, ran a real Noise-encrypted handshake,
and exchanged a real request/response — entirely on your own machine. No account, no portal sign-up, no
network access needed for any of it; every command and every line of output below was actually run to
write this page.

## What you'll need

- The `ct-agent` binary — see [Install ct-agent]({{ '/how-to/install-ct-agent/' | relative_url }}) if you
  don't already have one from the tunnel tutorial (the guided setup script is overkill here; a bare
  downloaded binary is enough).
- Two terminals (or one, backgrounding the first command) in the same empty directory.
- 5 minutes.

## 1. Give each side an identity

`ct-agent channel init` generates a keypair entirely locally — no network call, nothing to wait for:

```bash
./ct-agent channel init
```

```
# Agent-Fabric channel identity — generated locally, keep the private keys secret.
# Give these PUBLIC keys to the channel operator (to sign your grant / register):
#   holder_pubkey = 1fd8e630107f150745795c1f5018fb13600f7a1fcf1313cec1952ea41762af7e
#   noise_pubkey  = a60855c7cc7a2848698690d8872fd2cc29d5fcdd486ba66b6edd623a78742c11
export CT_CHANNEL_HOLDER_KEY=ee801a34bcd15fdf4f3c2892c3951bfa799ef7e6c7dca454e191b548cf7530d6
export CT_CHANNEL_NOISE_KEY=e19f5c8c316ab5f93a41831eb912261b5bce63d1deea36d684a3a8bce703ebea
```

Run it again for the second side:

```
export CT_CHANNEL_HOLDER_KEY=75d519d79e7440a5516e3276164c8223fbcda5a7c701818c34827a719da90556
export CT_CHANNEL_NOISE_KEY=4fe96373135837fe637e72f66e2f9363bce20bcd6e78cbcac65b76d8a4577b49
```

(Your own values will differ — every key here is real but freshly generated for this page, not a shared
secret.) Note each side's `noise_pubkey` — that's what you hand the other side to authenticate you,
[the same role a Capability plays for Mesh Plane tunnels]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }}).
This tutorial uses the **direct-address** path: no operator, no grant, just each side pinning the other's
public key directly — the fastest way to see it work. [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})
covers the operator-granted path a real multi-party deployment uses instead.

## 2. Give one side something to say

The side that will *answer* calls just needs a script: read one line from stdin, write a reply to stdout.

```bash
cat > handler.sh <<'EOF'
#!/bin/sh
read -r INPUT
echo "hello from your agent, you said: ${INPUT}"
EOF
chmod +x handler.sh
```

## 3. Start the side that answers

In your first terminal — this uses the *second* identity's keys above, and pins the *first* identity's
`noise_pubkey` as the peer it'll accept:

```bash
CT_CHANNEL_ROLE=accept CT_CHANNEL_ADDR=127.0.0.1:19701 \
CT_CHANNEL_NOISE_KEY=4fe96373135837fe637e72f66e2f9363bce20bcd6e78cbcac65b76d8a4577b49 \
CT_CHANNEL_PEER_NOISE_KEY=a60855c7cc7a2848698690d8872fd2cc29d5fcdd486ba66b6edd623a78742c11 \
CT_CHANNEL_SERVE=1 CT_AGENT_SERVICE_HANDLER_CMD=./handler.sh CT_AGENT_SERVICES=text_generation \
./ct-agent channel
```

Real output — leave this running:

```
ct-agent channel: --serve mode (MCP-over-channel; tool: ping — set CT_AGENT_CARD_* to also expose agent/card)
ct-agent channel: --serve also exposing 1 service tool(s) via CT_AGENT_SERVICE_HANDLER_CMD
ct-agent channel: listening on 127.0.0.1:19701 (responder); peer must set CT_CHANNEL_PEER_CERT=3082015e...
```

Copy the full hex string after `CT_CHANNEL_PEER_CERT=` (truncated above) — the other side needs it in the
next step. `CT_AGENT_SERVICES` must be one of `code_generation`, `security_review`, `safety_check`,
`text_generation` — see [Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }}).

## 4. Call it from a second, fully independent process

In your second terminal, using the *first* identity's keys, the *second* identity's `noise_pubkey`, and
the cert you just copied:

```bash
echo "what's the airspeed velocity of an unladen swallow?" | \
CT_CHANNEL_ROLE=initiate CT_CHANNEL_ADDR=127.0.0.1:19701 \
CT_CHANNEL_NOISE_KEY=ee801a34bcd15fdf4f3c2892c3951bfa799ef7e6c7dca454e191b548cf7530d6 \
CT_CHANNEL_PEER_NOISE_KEY=10df5f4b4d293c6f6e2eefde7e08a063963318a45b49301ee9a151b87d91ef5b \
CT_CHANNEL_PEER_CERT=<the cert string from step 3> \
CT_CHANNEL_CALL_SERVICE=text_generation \
./ct-agent channel
```

Real output, this exact run:

```
ct-agent channel: --call-service text_generation (one service call over the channel, then exit)
ct-agent channel: connected to 127.0.0.1:19701 (initiator)
hello from your agent, you said: what's the airspeed velocity of an unladen swallow?
```

That reply crossed a real Noise_IK-encrypted session between two OS processes that have never talked
before this run, each one only trusting the other because it presented the exact public key you told it
to expect — the same trust model, minus the routing-token/edge indirection, that
[Mesh Plane]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }}) tunnels use.

## What you have now

A working answer to "how does one agent securely call another" — no operator coordination, no shared
secret beyond the public keys you exchanged, all four processes involved running on hardware you own.
This exact `--serve`/`--call-service` shape is what a real
[workflow pipeline]({{ '/explanation/workflow-pipelines/' | relative_url }})'s role-serving agents use in
production, just over the operator-granted or broker-mediated path instead of direct-address.

## Next

- [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) — the operator-granted
  path this tutorial skipped, for when you're not just testing on one machine.
- [Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }}) — the
  broker-mediated version of step 3 that keeps serving new callers instead of exiting after one.
- [Publish an agent card]({{ '/how-to/publish-an-agent-card/' | relative_url }}) — make your agent
  discoverable by role/skill instead of requiring someone to already have your public key.
- [Publish your own pipeline]({{ '/how-to/publish-a-pipeline/' | relative_url }}) — turn a handful of
  serving agents like the one above into a published, joinable workflow.
