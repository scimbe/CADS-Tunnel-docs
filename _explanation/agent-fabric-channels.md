---
title: Agent-Fabric channels
description: How agent-to-agent connections actually work — direct, relay, and the :443 escape hatch.
order: 3
---

# Agent-Fabric channels

The browser tunnel ([Zero-knowledge architecture]({{ '/explanation/zero-knowledge/' | relative_url }}))
gets your service *to* a browser. Agent-Fabric channels are the separate mechanism for connecting your
agent directly to *another agent* — what powers MCP tool-calling and workflow-pipeline coordination. This
page covers how a channel actually gets established, grounded in `ct-agent`'s own source
(`src/channel_run.rs`), not just the concept.

## Two ways to open a channel

**Direct address** (`CT_CHANNEL_ROLE=initiate|accept`, `CT_CHANNEL_ADDR=host:port`): the simplest case —
you already know the other agent's reachable address. No broker involved at all.

**Broker-mediated** (`CT_CHANNEL_BROKER`, `CT_CHANNEL_RELAY`, plus either `CT_CHANNEL_LISTEN` or
`CT_CHANNEL_RELAY_ONLY=1`): for the common case where you don't have a stable, dialable address for the
peer — most agents behind NAT or a firewall. The edge's broker helps two agents that have never directly
communicated find and verify each other.

## The fallback ladder

Whichever mode, the connection attempt follows a strict order, same encrypted session throughout — only
the transport route changes:

1. **Direct dial** — try to reach the peer's own address straight away.
2. **Relay ports** — if direct fails, route through the edge's dedicated relay.
3. **`:443` front door** (`CT_CHANNEL_FRONT_DOOR`, `CT_CHANNEL_FRONT_DOOR_CERT`) — if even the relay
   ports are blocked, fall all the way to the same port every browser's HTTPS traffic already uses. One
   of the few outbound ports almost no restrictive network blocks.

At every rung, the broker/relay only ever handles **ciphertext**, or — during initial rendezvous — an
attested public key the two agents need to verify each other. It never sees plaintext application data,
and it's never a permanent hub sitting in the middle of an established session: once two agents connect,
subsequent traffic isn't routed through a third party unless the relay rung is what succeeded.

## Admitting someone else's agent

Everything above assumes you're connecting your own agents to each other. The same channel mechanism
also supports admitting an agent that belongs to a *different* account: a redeemable invitation, proven
by an ed25519 signature over the invitation, single-use and expiring
(`consume_invitation` — replay is rejected, an expired invitation is rejected, confirmed directly against
the control plane's storage layer). This is what makes a pipeline able to span accounts, not just your
own devices — see
[One service, several devices on the landing page](https://bunsenbrenner.org/#pipelines-usecase) for the
composition side of that.

## What this doesn't cover yet

The `CT_AGENT_CARD_*` (capability card / discovery) and `CT_AGENT_OFFER_*` (capacity offers for the
pipeline auction) environment variables are real and referenced from
[the CLI reference]({{ '/reference/cli/' | relative_url }}), but a full reference for them isn't written
yet — flagged as a known gap, not silently skipped.
