---
title: Serve a tunnel (Browser Plane) and a channel from the same service
description: Two independent ct-agent processes, one machine — an HTTPS site plus an Agent-Fabric channel, wired together.
order: 16
---

# Serve a tunnel (Browser Plane) and a channel from the same service

[The Browser Plane]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }}) (`CT_AGENT_MODE=browser`)
gives you a real, browser-reachable HTTPS address for a service you run. An
[Agent-Fabric channel]({{ '/explanation/agent-fabric-channels/' | relative_url }}) gives that same service
a direct, encrypted, machine-to-machine path to another agent — for tool calls, not page loads. Neither
one gives you the other: they're deliberately separate mechanisms, run as **two independent `ct-agent`
processes on the same machine**, not one combined mode.

**The cardinality is asymmetric, and worth stating plainly:** one onboarded `ct-agent` install has
*exactly one* tunnel — `ct-agent onboard` redeems exactly one join token into exactly one routing token
and hostname, and there's no "add a second tunnel to this install" concept; a second public HTTPS
address means a second, independently-onboarded `ct-agent` process. Channels have no such limit — a
channel is just a process using its own separate holder/noise identity (from `ct-agent channel init`,
unrelated to the tunnel's origin key), so one machine or account can join as many channels as it wants,
each its own process and its own grant. This is why the Agent-bridges toggle
([Manage your tunnel]({{ '/how-to/manage-your-tunnel/' | relative_url }})) lives on a *tunnel's* row
specifically: it's a property of the one tunnel that row represents, not of "the agent" as a whole —
channels aren't portal-discoverable at all today.

This is the real, running shape of every one of this project's own multi-agent demos (e.g. the
[a2a-demo](https://github.com/scimbe/CADS-a2a-demo) and
[auction-demo](https://github.com/scimbe/CADS-auction-demo) repos): an **origin** process serves the
actual HTTP(S) content, a **browser-plane `ct-agent`** exposes it at a real hostname, and a **separate
channel process** (the same machine, a different `ct-agent channel` invocation) handles the agent-to-agent
side. Nothing here is a new mechanism — this page is the missing "how these two you already know about
fit together" step.

## 1. The tunnel side — unchanged from a normal tunnel

Follow [Install ct-agent]({{ '/how-to/install-ct-agent/' | relative_url }}) / your tunnel's own **Install**
page as usual. The `.env` it hands you already includes what Browser Plane needs:

```
CT_AGENT_MODE=browser
CT_AGENT_HOSTNAME=your-tunnel.example.org   # this tunnel's own assigned hostname
CT_AGENT_ORIGIN=127.0.0.1:8080              # <- your actual service
```

Run it (`./ct-agent onboard`, or plain `./ct-agent` once already onboarded) — this is one process,
serving one job: your origin, reachable at `https://your-tunnel.example.org`.

## 2. The channel side — a second, separate process

On the **same machine** (or any machine — the channel side doesn't need to be co-located with the tunnel
at all, it just usually is for a single-service demo), bring up a channel member exactly as
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) or
[Set up a broker-mediated channel]({{ '/how-to/broker-mediated-channel/' | relative_url }}) describes:

```bash
./ct-agent channel init          # once, to mint this service's channel identity
# ... register/grant/allow-list as usual ...
CT_CHANNEL_ROLE=accept CT_CHANNEL_ADDR=127.0.0.1:19402 \
CT_CHANNEL_NOISE_KEY=<this service's noise private key> \
CT_CHANNEL_PEER_NOISE_KEY=<the calling agent's noise public key> \
./ct-agent channel
```

This second process is what another agent actually calls (a tool invocation, an MCP request) — see
[Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }}) for
wiring its stdin/stdout to a real handler script instead of a raw echo.

## Why two processes, not one

The tunnel and the channel solve different problems with different threat models: a tunnel exposes one
TCP/TLS port to arbitrary browsers on the public internet; a channel is a pre-admitted, pairwise
Noise-authenticated link to specific known peers. Collapsing them into one process would mean one config
mistake in either role leaking into the other. Keeping them separate also means you can restart, scale, or
revoke either independently — revoking the tunnel (see [Manage your tunnel]({{ '/how-to/manage-your-tunnel/' | relative_url }}))
does not touch the channel's grants, and vice versa.

## In the Topology Editor

The [Topology Editor]({{ '/explanation/topology-editor/' | relative_url }}) lets you attach a real,
already-registered channel id to an edge between two agent nodes — purely as link-info/documentation of
which channel that edge represents, not a new authorization path (the edge's actual admission is still
governed by the topology's own operator binding). If one of those nodes is also the origin behind a
browser-plane tunnel, that's exactly the shape this page describes: note the channel on the edge, and
separately keep the tunnel's own Install page / `.env` for the browser-facing side — the editor doesn't
need to know about the tunnel at all for the channel wiring to be correct.
