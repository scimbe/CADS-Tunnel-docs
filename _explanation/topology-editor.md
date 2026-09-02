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
topology.rs`, `service.rs`'s `authed_topology_router`), and re-run hermetically for this page — 33/33
topology tests passing right now (`cargo test -p ct-control-plane --lib topology`).

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

<div class="callout">
<strong>Updated — the binding route now exists.</strong> <code>PUT /me/topologies/:id/operator
{"operator_pubkey", "proof"}</code> is a real, owner-scoped route (checked directly in
<code>service.rs</code>'s <code>authed_topology_router</code>, handler <code>topology_set_operator</code>):
<code>proof</code> is a signature over <code>topology_operator_binding_bytes</code>, proving you actually
control the operator key's private half, not just its public bytes — a bad proof or a non-owner
topology both come back as the same <code>404</code>, so probing a topology id learns nothing either
way. Once bound, drawn edges genuinely do authorize real channel admission through
<code>authorized_channels</code>/<code>topology_authorizes</code> as described above — this used to be
the honest caveat on this page ("no route to bind an operator"); it no longer applies.
</div>

## Composing with others: super-peers, sharing, and channel link-info

Three additive capabilities on top of the base graph above — none of them change the exclusive-membership
or edge-authorization rules already described, they extend what a node or an edge can *carry*.

**Super-peer nodes.** `POST /me/topologies/:id/agents {"agent": "...", "kind": "super-peer"}` (or
`"peer"`, the default) marks a node's role — rendered in the editor with a distinct border and an "SP"
badge. This is purely a rendering/informational hint: the graph's actual admission semantics are
unchanged by it, a super-peer node is still just an agent id in the edge graph. The real, running process
that hint describes is [`ct-agent channel super-peer`]({{ '/how-to/run-a-super-peer/' | relative_url }})
— mark the node here, then bring up the real relay separately.

**Sharing a topology by e-mail.** A topology is, by default, visible and editable only by its owning
subject. `POST /me/topologies/:id/share {"email": "..."}` (owner-only) additively grants another Keycloak
account — matched by their own verified sign-in e-mail, same convention as
[channel allow-listing]({{ '/how-to/self-service-channel-grant/' | relative_url }}) — the ability to
**view** the topology and wire in **their own** agents/edges via `GET /me/topologies/shared` and the
editor itself, but never owner-only governance (delete, operator-bind, or manage the share list). Remove
with `POST /me/topologies/:id/share/:email/remove`. The editor's own share panel (visible only to the
owner) lists current collaborators and offers add/remove inline.

**Explicit edge -> channel association.** `PUT /me/topologies/:id/edges/channel {"a", "b", "channel": "<hex, or omit to clear>"}`
lets you attach a real, already-registered channel id to a specific edge as link info the editor
displays — validated as a channel you own or are allow-listed on (`channels_for_email`, the same account
relationship [Set up an Agent-Fabric channel's self-service claim]({{ '/how-to/self-service-channel-grant/' | relative_url }})
uses), not channel membership itself. This is purely informational/documentation on the edge — it is
never consulted by `authorized_channels`/`topology_authorizes`, which still only ever derive the
authorized channel from the edge's two node ids as described above. Use it to record "this edge is
carrying that pre-existing channel" for anyone reading the graph, including the
[tunnel-plus-channel]({{ '/how-to/tunnel-plus-channel/' | relative_url }}) case where the channel behind
an edge is also serving something over a Browser-Plane tunnel.

## Should you use this today?

For visualizing and planning which of your agents should talk to whom, composing with a collaborator, and
(once operator-bound) actually authorizing the channels behind your declared edges — yes, all of the
above is real and working. Task-oriented walkthrough of the whole flow above, end to end:
[Compose a topology]({{ '/how-to/compose-a-topology/' | relative_url }}); every endpoint's exact
request/response shape: [Topology API]({{ '/reference/topology/' | relative_url }}). For the mechanics
of bringing up the channels/tunnels/super-peers a topology describes, see
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}),
[Run a super-peer]({{ '/how-to/run-a-super-peer/' | relative_url }}), and
[Serve a tunnel and a channel together]({{ '/how-to/tunnel-plus-channel/' | relative_url }}).

A sibling feature, [Declarative network policy]({{ '/explanation/declarative-network-policy/' | relative_url }})
(`/me/networks/*`), is in a similar position for a different reason: it's a role/sensitivity-based
access-control *language* rather than a graph you draw, and (unlike the topology-edge path above) still
has no live enforcement wired to it as of this writing.
