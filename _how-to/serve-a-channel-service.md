---
title: Serve a callable service over a channel
description: Expose a tool one peer can call, and call it from a second, independent process.
order: 5
---

# Serve a callable service over a channel

This is the actual mechanism a workflow pipeline's role-serving agents use to answer another agent's
request — the same one the flappy-demo and cookbook-demo crew bridges call. See
[Workflow pipelines & the auction model]({{ '/explanation/workflow-pipelines/' | relative_url }}) for how
that fits into an auction, and
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) for admission if you
need a grant instead of the direct-address path used here. Every command and every line of output below
was actually run — two fully independent, separately-started processes, real Noise transport, no
shortcuts.

## 1. Two identities, same as any channel

```bash
./ct-agent channel init   # peer A — will call the service
./ct-agent channel init   # peer B — will serve it
```

Each prints its own `CT_CHANNEL_HOLDER_KEY`/`CT_CHANNEL_NOISE_KEY` — see
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) if this is new.

## 2. Write a handler

The handler is just a script: it reads the request on stdin, writes its reply to stdout.
`CT_SERVICE_TYPE` tells it which registered service was actually invoked, useful if one script backs
several.

```bash
cat > handler.sh <<'EOF'
#!/bin/sh
read -r INPUT
echo "hello from the physics service, you said: ${INPUT}"
EOF
chmod +x handler.sh
```

## 3. Peer B: serve it

```bash
CT_CHANNEL_ROLE=accept CT_CHANNEL_ADDR=127.0.0.1:19601 \
CT_CHANNEL_NOISE_KEY=<peer B's noise private key> \
CT_CHANNEL_PEER_NOISE_KEY=<peer A's noise public key> \
CT_CHANNEL_SERVE=1 CT_AGENT_SERVICE_HANDLER_CMD=./handler.sh CT_AGENT_SERVICES=text_generation \
./ct-agent channel
```

Real output — note the second line confirming the handler actually registered, and the printed cert the
initiator needs (same direct-address pattern as a plain channel connection):

```
ct-agent channel: --serve mode (MCP-over-channel; tool: ping — set CT_AGENT_CARD_* to also expose agent/card)
ct-agent channel: --serve also exposing 1 service tool(s) via CT_AGENT_SERVICE_HANDLER_CMD
ct-agent channel: listening on 127.0.0.1:19601 (responder); peer must set CT_CHANNEL_PEER_CERT=308201...
```

`CT_AGENT_SERVICES` must be one of `code_generation`, `security_review`, `safety_check`,
`text_generation` — see
[Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }})
for the full set, including how to expose more than one.

## 4. Peer A: call it, once, from a separate process

```bash
echo "what is g on Mars?" | \
CT_CHANNEL_ROLE=initiate CT_CHANNEL_ADDR=127.0.0.1:19601 \
CT_CHANNEL_NOISE_KEY=<peer A's noise private key> \
CT_CHANNEL_PEER_NOISE_KEY=<peer B's noise public key> \
CT_CHANNEL_PEER_CERT=<the hex cert peer B printed> \
CT_CHANNEL_CALL_SERVICE=text_generation \
./ct-agent channel
```

Real output, actually run against a fresh accept-side process in a second terminal:

```
ct-agent channel: --call-service text_generation (one service call over the channel, then exit)
ct-agent channel: connected to 127.0.0.1:19601 (initiator)
hello from the physics service, you said: what is g on Mars?
```

Peer A's stdin became `handler.sh`'s stdin on Peer B, over the real Noise-encrypted channel; the
handler's stdout came straight back as Peer A's stdout, and it exited `0`.

<div class="callout warn">
<strong>Correction to an earlier version of this page.</strong> It previously claimed Peer B's process
"keeps running afterward... not a one-shot." Checked again, properly this time: the
<strong>direct-address</strong> accept path shown above serves <em>exactly one</em> session and then
exits — confirmed by re-running the whole sequence and finding the process gone immediately after, and
by reading <code>run_channel_command</code>'s source directly: its accept branch calls
<code>endpoint.accept()</code> once, runs one session, and returns — no loop at all. A second call
against the same still-running process fails with a real, reproduced <code>TimedOut</code>, not a
guess.
</div>

## Serving many calls without restarting: the broker-mediated path

The "stays parked, serves whoever dials next" behavior is real — it's just gated on
<strong>broker-mediated</strong> mode (<code>CT_CHANNEL_BROKER</code>/<code>CT_CHANNEL_RELAY</code>, see
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})), not direct-address.
An accept-side member with <code>CT_CHANNEL_SERVE=1</code> there parks, serves a peer, and loops back to
admit the next automatically — no external restart loop needed, and (per a later hardening pass) admits
a new peer even while a slow session is still in flight, rather than waiting for it to finish first. This
is exactly what a crew bridge dials repeatedly in production.

Not click-tested against a live edge in this pass — same honest gap as
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})'s broker-mediated
section — but it's real, source-confirmed (`should_serve_loop`, gated on accept-side + serve mode) and
covered by `ct-agent`'s own test suite, including a dedicated regression test that admits five
concurrent peers while one session is deliberately kept slow.

## Building a real pipeline role from this

A crew bridge's `CREW_<ROLE>_CMD` (or `COOKBOOK_<ROLE>_CMD`) is exactly the command from step 4 —
`CT_CHANNEL_CALL_SERVICE=<service>` with the grant/broker variables from a real admitted channel instead
of the direct-address ones shown here. The role-serving side is the broker-mediated pattern above, kept
running long-term — **not** step 3's direct-address version, which is genuinely single-shot.
