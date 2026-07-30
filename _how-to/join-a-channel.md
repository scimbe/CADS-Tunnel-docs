---
title: Set up an Agent-Fabric channel
description: Generate identities, derive a link, and admit a member — the direct-address path.
order: 3
---

# Set up an Agent-Fabric channel

This walks through the identity and admission side of an Agent-Fabric channel — what
[Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) covers
conceptually. Every command below was actually run to produce the example output (real keys, real
derived channel id) — see the note at the end for the one step not click-tested in this pass.

## 1. Each member generates their own identity

Locally, on each machine that will join the channel — private keys never leave the machine that
generates them:

```bash
./ct-agent channel init
```

```
# Agent-Fabric channel identity — generated locally, keep the private keys secret.
# Give these PUBLIC keys to the channel operator (to sign your grant / register):
#   holder_pubkey = 7f1377cfd7c09d9becea9c540eb176ee636b0663caf553b7ce4040b88cc8baa6
#   noise_pubkey  = 87807a01c7787ea9777744ada2decb682e2530aa16f9767d316d78e1c4cf985e
export CT_CHANNEL_HOLDER_KEY=...
export CT_CHANNEL_NOISE_KEY=...
```

Only the two `pubkey` lines get handed to anyone else. Run this once per member (two shown here, but
the same command for however many will join).

## 2. The operator generates their own authority key

One per channel, not per member:

```bash
./ct-agent channel operator-init
```

```
# Agent-Fabric channel OPERATOR identity — generated locally, keep the key secret.
# Register this PUBLIC key as the channel authority (POST /channel/register):
#   operator_pubkey = 8811994f5a8324533652fab69d3074fc2cc6045c402f23c207a199dc9df93593
export CT_CHANNEL_OPERATOR_KEY=...
```

## 3. Derive the channel id

A member computes the deterministic id for their link to another member (order-independent — both
sides land on the same value), and produces the noise-key attestation the operator needs:

```bash
CT_CHANNEL_OPERATOR_PUBKEY=<operator's pubkey> \
CT_CHANNEL_BRIDGE_HOLDER=<the OTHER member's holder_pubkey> \
CT_CHANNEL_HOLDER_KEY=<your own holder private key> \
CT_CHANNEL_NOISE_PUBKEY=<your own noise public key> \
./ct-agent channel member-material
```

```
holder_pubkey     = 7f1377cfd7c09d9becea9c540eb176ee636b0663caf553b7ce4040b88cc8baa6
noise_pubkey      = 87807a01c7787ea9777744ada2decb682e2530aa16f9767d316d78e1c4cf985e
channel_id        = 0ef16c2cdef3f55a893a8a0c75fb80f0a4350b61cd66631b0c248eb58ecd2d04
noise_attestation = 34b2e7078f4860ba786fddcd73a22c1c5e36a8a08c44ce241826c26a4142e7f16a85e0e45d92cd26eb94b93e8368a3b3544efd1250336bfdd014911b4bae550e
```

## 4. The operator grants both members

One grant per member, same `channel_id`, opposite `CT_GRANT_DIRECTION`:

```bash
CT_CHANNEL_OPERATOR_KEY=<from step 2> \
CT_GRANT_CHANNEL=<channel_id from step 3> \
CT_GRANT_MEMBER_HOLDER=<this member's holder_pubkey> \
CT_GRANT_DIRECTION=initiate \
CT_GRANT_EXPIRES=<unix seconds> \
./ct-agent channel grant
```

Real output is a single hex blob (the signed grant) — hand it to that member as their
`CT_CHANNEL_GRANT`. Repeat with `CT_GRANT_DIRECTION=accept` and the other member's holder pubkey for
the responder side.

<div class="callout warn">
The env var is <code>CT_GRANT_EXPIRES</code>, not <code>CT_GRANT_EXPIRES_AT</code> — found by actually
running it and reading the real error message, not assumed.
</div>

## What this doesn't cover yet

Steps 1–4 above were all run for real to produce the example output on this page. Actually **connecting**
the two members — either direct-address (`ct-agent channel` with `CT_CHANNEL_ROLE`/`CT_CHANNEL_ADDR`,
pinning Noise keys directly, no grant needed at all for this specific path) or broker-mediated (using the
grant from step 4) — is accurately described in
[the CLI reference]({{ '/reference/cli/' | relative_url }}) and
[Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}), grounded in source,
but wasn't click-tested end-to-end in this pass (it needs two coordinated long-running processes and a
dynamically-generated QUIC cert exchanged between them, which needs more careful orchestration than a
single command). Flagged here rather than silently presented as verified.
