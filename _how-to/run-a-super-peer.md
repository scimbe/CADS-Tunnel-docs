---
title: Run a super-peer for a LAN of channel members
description: One opt-in relay process lets an entire local network share a single upstream connection to the edge.
order: 15
---

# Run a super-peer for a LAN of channel members

If several [Agent-Fabric channel]({{ '/explanation/agent-fabric-channels/' | relative_url }}) members
live on the same local network (a home LAN, an office, a cluster of VMs on one hypervisor), each one
independently dialing out to the edge's broker/relay is wasteful and, on a locked-down network, may not
even be possible for all of them. `ct-agent channel super-peer` is an **opt-in** process one machine on
that LAN runs: it holds the single real connection out to the edge, and every other member on the LAN
routes through it instead of dialing out itself.

This is purely a **transport optimization** — it changes nothing about identity, admission, or
encryption. A super-peer is byte-transparent: it relays already-Noise-encrypted traffic between LAN
members and the edge, and cannot read it. Every member still has its own holder/noise identity, its own
grant or allow-list entry, same as [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})
walks through — a super-peer changes *how* their bytes reach the edge, not *who* they are on the channel.

## The two required settings

Confirmed directly against the real binary (`ct-agent channel super-peer` with nothing set fails fast,
naming exactly what's missing, one variable at a time):

```bash
CT_CHANNEL_SUPER_PEER_LISTEN=0.0.0.0:9443 \
CT_CHANNEL_SUPER_PEER_UPSTREAM=edge.example.com:4435 \
./ct-agent channel super-peer
```

| Variable | What it is |
|---|---|
| `CT_CHANNEL_SUPER_PEER_LISTEN` | `host:port` this machine binds on the LAN — the address every other LAN member points at instead of the real edge. `0.0.0.0:<port>` to accept from anywhere on the LAN, or a specific interface IP to restrict it. |
| `CT_CHANNEL_SUPER_PEER_UPSTREAM` | The edge's real broker host and port (e.g. `edge.example.com:4435` — the same host:port a direct member would use for `CT_CHANNEL_BROKER` in the [broker-mediated path]({{ '/how-to/broker-mediated-channel/' | relative_url }})). Must be a real, resolvable `host:port` — a bare hostname without a port, or an address the process can't parse, is rejected immediately rather than failing later at connect time. |

Once both are set, the process blocks, listening — there's no separate "ready" message beyond that; if it
hasn't exited, it's up.

## Pointing LAN members at it

A LAN member that would normally dial the edge directly instead points its own broker/relay address at
the super-peer's `CT_CHANNEL_SUPER_PEER_LISTEN` address rather than the real edge — everything else about
that member's setup (`CT_CHANNEL_ROLE`, its own keys, its grant) is unchanged from
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) or
[Set up a broker-mediated channel]({{ '/how-to/broker-mediated-channel/' | relative_url }}).

## In the Topology Editor

A node's **kind** in the [Topology Editor]({{ '/explanation/topology-editor/' | relative_url }}) can be
marked `super-peer` (a checkbox in the editor UI, rendered with a distinct border and an "SP" badge) —
this is a purely informational/visual marker on the graph, matching what that agent is actually doing on
the network; it does not itself start the process above or change how the topology's edges are
authorized. Mark the node, then bring the real process up on that machine with the two variables above.

<div class="callout warn">
The super-peer relay itself doesn't need its own channel identity or grant — it never terminates the
Noise session, only forwards already-encrypted bytes. Don't confuse it with a regular member: nothing
here overlaps with <code>ct-agent channel init</code>.
</div>
