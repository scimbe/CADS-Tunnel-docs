---
title: The Topology Editor
description: Compose an overlay network from your agents — a draggable graph, honestly scoped.
order: 6
---

# The Topology Editor

Every other explanation page on this site covers a fixed shape: one tunnel, one channel, one
pipeline. The Topology Editor (`/me/topologies/*`) is different — it lets you compose your **own**
agents (yours, or ones shared to you) into a named graph, view it as a draggable node-graph, and get
algorithmic suggestions for how to wire it. Source-grounded throughout (`crates/control-plane/src/
topology.rs`, `service.rs`'s `authed_topology_router`), and re-run hermetically for this page — 17/17
topology tests passing right now.

## Creating one, and what a "node" actually is

`POST /me/topologies` (OIDC bearer, same `/me/*` gate as everywhere else on this site) creates a
topology owned by your subject, returning a generated `id` and a separate `net_uuid` — the id you
address it by, the uuid that keys its public status page (below). Under the hood, **a topology node's
id is literally your agent's 32-byte holder key**, the exact same identity Agent-Fabric channels
already use — there's no separate node-registration step or id mapping to keep in sync.

- `POST /me/topologies/:id/agents {"agent": "<holder-key-hex>"}` — assign one of your agents into the
  topology.
- `POST` / `DELETE /me/topologies/:id/edges {"a": "...", "b": "..."}` — add or remove an undirected
  edge between two node ids. Removing someone else's edge (or one that doesn't exist) is a `404`,
  deliberately indistinguishable from "not your topology" — a non-owner learns nothing about the
  graph's shape either way.
- `GET /me/topologies/:id` — the graph as JSON: `agents`, `edges`, `overlay_mode`.
- `GET /me/topologies/:id/editor` — the same graph as a **self-contained, draggable SVG node-graph**
  page, click-to-connect for composing edges visually instead of raw JSON calls.

**Exclusive membership, not shared:** an agent belongs to at most one topology at a time. Assigning an
already-assigned agent is a `409`; the only way back is a revoke, which returns the agent to its
*original owner* — not free-for-all claimable by whichever topology reaches for it next.

## A public, read-only status page

`GET /net/:net_uuid` (no auth) renders the topology's current agents and edges — confirmed live:
querying an unknown uuid returns a real `404`, not a silent empty page. This is the one part of the
feature unaffected by the ongoing `/me/*` outage note elsewhere on this site, since it was designed to
be public from the start (an easy link to share a network's current shape, the same instinct behind
this platform's other public read surfaces like `GET /registry/pipelines`).

## Overlay modes and "suggest" — a planner, not a live router

Each topology has an **overlay mode**: `baseline` (direct — every declared pair relays straight to
each other) or one of three complex-adaptive modes (`smart-route`, `shortcut`, `random-mesh`),
settable via `PUT /me/topologies/:id/mode`.

<div class="callout warn">
Checked directly against source before writing this: <code>RoutingApproach</code> (the overlay-mode
type) is used by exactly three places in the whole workspace — the control plane's HTTP handler, its
storage layer, and the type definition itself. It is <strong>never read by <code>ct-edge</code>,
<code>ct-agent</code>, or <code>ct-client</code></strong>. Choosing a mode, and the
<code>suggest</code> endpoint below, do not currently change how your agents actually connect — this
is a network <em>planning</em> tool, not a live traffic-routing control, however natural it would be
to assume otherwise from the UI alone.
</div>

`POST /me/topologies/:id/suggest {"links": [{"a","b","cost"}], "shortcut_budget": <n>}` is a real,
non-trivial algorithm, not a stub: it computes the minimum-latency spanning tree over your
caller-supplied candidate link costs, and in `shortcut` mode adds capped extra edges on top
(`shortcut_budget`, hard-capped at 16 server-side against O(budget·n³) blowup). `baseline` mode
returns `409` — direct-only has nothing to optimize. What you get back is a **suggested** plan
(links, total cost, whether it's fully connected) for you to act on yourself — see the next section
for what "acting on it" currently means.

## The genuinely real part: an edge can authorize a live channel — almost

This is the one place the graph *does* reach into live behavior, and it's worth being precise about
exactly how far that reaches today.

Per `authorized_channels`/`topology_authorizes` in `storage.rs` (both covered by passing tests,
re-confirmed for this page): the channel-admission gate consults declared topology edges
**additively**, alongside the existing channel-members mechanism documented in
[Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}). Concretely — a
declared edge `(a, b)` in a topology authorizes the corresponding channel's admission for both `a`
and `b`, derived the same way [`channel_id_for_link`]({{ '/how-to/join-a-channel/' | relative_url }})
already computes it elsewhere on this site. Remove the edge and the authorization is gone too — "no
per-channel bookkeeping," straight from the source comment.

<div class="callout warn">
<strong>But only for a topology bound to a real channel operator key</strong> — and there is currently
no HTTP route to do that binding. <code>storage.rs::set_operator</code> exists, is proof-of-possession
gated, and is exercised by a real passing test
(<code>topology_operator_binding_is_owner_scoped_authenticated_and_drives_authorized_channels</code>)
— but grepped every route registered in <code>service.rs</code>'s <code>authed_topology_router</code>
and found no endpoint that calls it. An unbound topology "authorizes nothing" (the source's own
words). So today: draw all the edges you like, but until an operator-binding endpoint ships, they
don't yet grant real channel admission for anyone — the enforcement logic is real and tested, the way
to actually reach it from outside the control plane isn't there yet.
</div>

## Should you use this today?

For visualizing and planning which of your agents should talk to whom — yes, it's real and working.
For actually establishing those connections, use
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) or
[the self-service channel registry]({{ '/reference/api-endpoints/' | relative_url }}) as documented
elsewhere on this site — both are fully reachable today, unlike the topology-edge path above.
