---
title: Topology API
description: Every /me/topologies/* and /net/:net_uuid endpoint — request/response shapes, auth, and status codes.
order: 6
---

# Topology API

The REST surface behind the [Topology Editor](https://bunsenbrenner.org/portal/topologies) —
`authed_topology_router` and the public `topology_status_router`, both in
`crates/control-plane/src/service.rs`. Task-oriented walkthrough:
[Compose a topology]({{ '/how-to/compose-a-topology/' | relative_url }}). Concepts, overlay
modes, and the exclusive-membership model: [The Topology Editor]({{ '/explanation/topology-editor/' | relative_url }}).

Checked directly against source and the 33/33 passing `cargo test -p ct-control-plane --lib
topology` suite (re-run for this page). Two rows below (marked) were also confirmed live
against `https://bunsenbrenner.org`; the rest were not click-tested end to end this pass — no
portal login was available while writing this page. Flagged here rather than presented as
verified live, matching this site's own [honest-gap convention]({{ '/reference/api-endpoints/' | relative_url }}).

## Auth

Every `/me/topologies*` route accepts **either** an OIDC bearer token (an `Authorization: Bearer`
header — see [Getting a bearer token without a browser]({{ '/reference/api-endpoints/' | relative_url }}#getting-a-bearer-token-without-a-browser))
**or** a real portal session cookie (`subject_of_topology` in `service.rs`) — the second
exists specifically so the editor's own client-side `fetch()` calls can authenticate via the
ambient portal session it already has, with no bearer token to hold. Accepting either is not a
scope-widening: both resolve to the same verified subject. `GET /net/:net_uuid` is the one
public, unauthenticated route on this page.

Owner isolation is consistent throughout: a topology id that isn't yours (or isn't shared with
you, where sharing applies) comes back as a plain `404`, never a `403` — so probing an id you
don't have access to learns nothing about whether it exists.

## Create, list, view

**`POST /me/topologies`** — no body. Creates a topology owned by the caller's subject with a
server-generated `id` and a separate `net_uuid`.

```json
{"id": "3f9a1c...", "net_uuid": "8b02de..."}
```

`id` addresses the topology in every write below; `net_uuid` only ever keys the public status
page — kept separate so sharing a read-only status link never leaks the id needed to edit the
graph.

**`GET /me/topologies`** — the caller's own topologies: `[{"id", "net_uuid"}]`.

**`GET /me/topologies/shared`** — topologies shared with the caller's **verified session
e-mail** (`topology_shared_list`) — never a caller-supplied email, so there's no way to
enumerate another account's shares. Empty (not an error) when the session has no verified
e-mail, including a bearer-token caller — only a real portal login ever carries one.

**`GET /me/topologies/:id`** — a composite view. Owner or shared-with viewer only.

```json
{
  "id": "3f9a1c...",
  "net_uuid": "8b02de...",
  "agents": [["<holder-key-hex>", "peer"], ["<holder-key-hex>", "super-peer"]],
  "edges": [{"a": "<holder-key-hex>", "b": "<holder-key-hex>", "channel": "<64 hex, optional>"}],
  "overlay_mode": "baseline",
  "owner": "<subject>"
}
```

`overlay_mode` is one of `baseline`, `smart-route`, `shortcut`, `random-mesh` (defaults to
`baseline` for a topology that never set one). An edge's `channel` field is present only if one
was explicitly attached via `PUT .../edges/channel` below — omitted otherwise (`EdgeView` in
`service.rs`), not `null`.

**`GET /me/topologies/:id/editor`** — the same graph rendered as a self-contained, draggable
SVG node-graph page (`text/html`). Owner or shared-with viewer; a non-owner viewer never sees
the share-management or operator-binding panels even though the HTML is otherwise the same
document.

## Agents (exclusive membership)

**`POST /me/topologies/:id/agents`** `{"agent": "<holder-key-hex>", "kind": "peer"|"super-peer"}`
(`kind` optional, default `"peer"`) — assign an agent you own into a topology you own or are
shared into. An agent belongs to **at most one** topology at a time.

| Result | Status |
|---|---|
| assigned | `200` |
| agent already assigned to a topology | `409` |
| caller doesn't own the agent | `403` |
| topology not owned/shared with caller | `404` |

Revoking (returning the agent to its owner, unassigned) is a separate call the owner or the
current topology can make — see `crate::topology::AgentAssignment::revoke`
(`crates/control-plane/src/topology.rs:118`); not exposed as its own numbered REST verb on this
router in the current source, reached instead through the storage layer's `assign`/`revoke`
pair the assign handler above calls into.

## Edges

**`POST /me/topologies/:id/edges`** / **`DELETE /me/topologies/:id/edges`** `{"a", "b"}` — add
or remove an undirected edge. Owner or shared-with editor. `POST` failure (self-loop,
duplicate, or no edit access) is `409`; `DELETE` failure (no such edge, or no edit access —
deliberately indistinguishable) is `404`.

**`PUT /me/topologies/:id/edges/channel`** `{"a", "b", "channel": "<64 hex>"|null}` — attach (or
clear, with `null`/absent) an informational channel-id note on a specific edge. Validated as a
channel the caller owns or is allow-listed on (`channels_for_email`); `400` if `channel` is
present but not 64 hex. **Never consulted by `authorized_channels`/`topology_authorizes`** —
purely a note for anyone reading the graph.

## Overlay mode and suggestions

**`PUT /me/topologies/:id/mode`** `{"mode": "baseline"|"smart-route"|"shortcut"|"random-mesh"}`
— owner-only. `400` on an unrecognized mode token.

**`POST /me/topologies/:id/suggest`** `{"links": [{"a", "b", "cost"}], "shortcut_budget": <n>}`
— owner-only. Computes a minimum-latency spanning tree over the topology's agents from
caller-supplied candidate link costs; in `shortcut` mode, adds capped extra edges on top.

```json
{"mode": "smart-route", "links": [["<a>", "<b>"]], "total_cost": 42, "connected": true}
```

| Condition | Status |
|---|---|
| topology is in `baseline` mode (nothing to optimize) | `409` |
| `shortcut_budget` exceeds `MAX_SUGGEST_BUDGET` (16) | `400` |
| topology has more than `MAX_SUGGEST_AGENTS` (64) agents | `400` |

Both caps exist so the O(budget·n³) shortcut search can't wedge the control plane
(`service.rs`). The response is a **plan** to act on yourself (draw the suggested edges);
computing a suggestion never writes edges on its own.

## Operator binding

**`PUT /me/topologies/:id/operator`** `{"operator_pubkey": "<64 hex>", "proof": "<128 hex>"}` —
owner-only. `proof` is `operator_pubkey`'s ed25519 signature over
`topology_operator_binding_bytes(topology_id, operator_pubkey)`
(`crates/common/src/channel.rs:838`) — proof-of-possession that the caller controls the
operator key's private half, not just its public bytes. `404` (not `403`) on either a
non-owner topology or a bad proof — deliberately indistinguishable, matching every other
owner-isolation check on this page.

Once bound, every declared edge `(a, b)` additively authorizes channel admission for both `a`
and `b`, via `authorized_channels`/`topology_authorizes` (`crates/control-plane/src/storage.rs`)
— this is the fix for [#698](https://github.com/scimbe/CADS-Tunnel/issues/698)'s
finding 1 (PR#700 + ct-agent#113); before this route existed, a topology's edges were real and
tested but reachable only from inside the control plane, never actually bindable from the
outside. See [Compose a topology]({{ '/how-to/compose-a-topology/' | relative_url }}#4-bind-an-operator-key--the-step-that-makes-it-real)
for how to generate `proof` (`ct-agent channel bind-topology`).

## Sharing

**`POST /me/topologies/:id/share`** `{"email": "..."}` — owner-only, idempotent. Grants another
Keycloak account (matched by their own verified sign-in e-mail) the ability to view the
topology and wire in **their own** agents/edges — never owner-only governance (delete,
operator-bind, manage the share list).

**`POST /me/topologies/:id/share/:email/remove`** — owner-only, no body. `404` whether the
topology isn't the caller's or the e-mail was never on the share list.

## Public status page

**`GET /net/:net_uuid`** — no auth. Renders the topology's current agents and edges as HTML.

| Result | Status |
|---|---|
| topology exists | `200` |
| unknown `net_uuid` | `404` |

**Confirmed live** against `https://bunsenbrenner.org`, 2026-08-28:
`curl -s -o /dev/null -w '%{http_code}\n' https://bunsenbrenner.org/net/nonexistent-uuid-check`
→ `404`. `GET /portal/topologies` (the session-cookie-authed portal shell that links into this
API) also confirmed live: `303` redirect when logged out.

UUID-only access for now — an owner auth-gate on this page is a tracked follow-up, not
implemented in the current source. The eventual `<net_uuid>.<zone>` subdomain form reuses the
Browser-Plane routing pipeline (`service.rs`).
