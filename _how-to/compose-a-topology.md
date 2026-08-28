---
title: Compose a topology
description: Wire your agents into an overlay network and bind an operator key so its links actually authorize admission.
order: 17
---

# Compose a topology

This walks through the [Topology Editor](https://bunsenbrenner.org/portal/topologies)
(`/me/topologies/*`) end to end: create a topology, assign agents into it, draw an edge
between them, and — the step the editor's own guide added after
[CADS-Tunnel#698](https://github.com/scimbe/CADS-Tunnel/issues/698) flagged it as missing —
bind an operator key so that edge actually authorizes something. Grounds
[The Topology Editor]({{ '/explanation/topology-editor/' | relative_url }}), which covers the
concepts (overlay modes, exclusive membership, sharing) in more depth; this page is the
task-oriented walkthrough.

Every command and endpoint below is checked directly against the source
(`crates/control-plane/src/service.rs`, `topology.rs`, `storage.rs`) and the 28/28 passing
`cargo test -p ct-control-plane --lib topology` suite, re-run for this page. The two public,
unauthenticated checks (`GET /net/<uuid>` on an unknown id, `GET /portal/topologies` when
logged out) were confirmed live against `https://bunsenbrenner.org`; the authenticated
`/me/topologies/*` steps were not click-tested end to end this pass (no portal login was
available while writing this) — they're the same discipline as
[API endpoints]({{ '/reference/api-endpoints/' | relative_url }})'s "Honest gap" callouts:
source- and test-grounded, not yet re-confirmed live. If you hit a mismatch, the source file
and line above is the fastest way to check what actually changed.

You need agents of your own first — [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})
covers generating a `ct-agent` identity if you don't have one yet. A topology just wires
already-existing agent identities together; it doesn't mint new ones.

## 1. Create a topology

From the portal, [Your topologies](https://bunsenbrenner.org/portal/topologies) → **New
topology** — this calls `POST /me/topologies` with no body and redirects straight into the
new topology's editor. Doing it by hand (e.g. scripting against the API) needs an OIDC bearer
token first; see
[Getting a bearer token without a browser]({{ '/reference/api-endpoints/' | relative_url }}#getting-a-bearer-token-without-a-browser):

```bash
curl -X POST https://bunsenbrenner.org/me/topologies \
  -H "Authorization: Bearer $TOKEN"
```

```json
{"id": "3f9a1c...", "net_uuid": "8b02de..."}
```

`id` is what you address the topology by in every call below; `net_uuid` is a separate,
unguessable id that keys its public status page (step 5) — two different identifiers on
purpose, so sharing the read-only status link never exposes the id you'd need to edit the
graph.

## 2. Assign your agents into it

Each agent you want in the topology needs its identity first — the same
`ct-agent channel init` from [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}):

```bash
./ct-agent channel init
```

Paste the printed `holder_pubkey` into the editor's "agent id" field in the toolbar and click
**Add** — a topology node's id is literally that 32-byte holder key, the same identity
Agent-Fabric channels already use, so there's no separate node-registration step. Check
**super-peer** first if this agent should act as a LAN relay for others (see
[Run a super-peer]({{ '/how-to/run-a-super-peer/' | relative_url }})) — purely a rendering/
informational hint on the node, it doesn't change the graph's admission semantics.

Equivalently: `POST /me/topologies/:id/agents {"agent": "<holder-key-hex>", "kind": "peer"}`
(`kind` optional, defaults to `"peer"`; the other value is `"super-peer"`).

<div class="callout warn">
An agent belongs to <strong>at most one</strong> topology at a time — exclusive membership,
not shared. Assigning an already-assigned agent is a <code>409</code>; the only way back is a
revoke, which returns the agent to its <em>original owner</em>, not free-for-all claimable by
whichever topology reaches for it next.
</div>

## 3. Draw an edge

Click **Connect** in the toolbar, then click two agent cards on the canvas to wire an
undirected link between them —
`POST /me/topologies/:id/edges {"a": "<holder-key-a>", "b": "<holder-key-b>"}`. Removing one is
the same shape against `DELETE /me/topologies/:id/edges`, deliberately `404` whether the edge
doesn't exist or you can't edit this topology — a non-owner probing the graph's shape learns
nothing either way.

At this point you have a real, saved graph — but per the next step, it doesn't authorize
anything live yet.

## 4. Bind an operator key — the step that makes it real

<div class="callout">
This is the fix for <a href="https://github.com/scimbe/CADS-Tunnel/issues/698">#698</a>'s
finding 1: a topology's edges only ever authorized real channel admission once bound to an
operator key, but nothing in the guided flow used to surface that — you could finish wiring a
whole graph and it would still authorize nothing, with no indication anything was missing. The
editor's own guide (drawer step 4, and an "operator: not bound" chip in the header) now calls
this out explicitly, and <code>ct-agent channel bind-topology</code> shipped alongside the fix
as the actual command to produce the proof below (PR#700 + ct-agent#113).
</div>

If you don't already have an operator identity (one per channel/topology-owner, not per
agent — see [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})'s
step 2), generate one once:

```bash
./ct-agent channel operator-init
```

Then, for **this** topology, sign a proof that you hold that operator key's private half —
`CT_TOPOLOGY_ID` is the `id` from step 1:

```bash
CT_CHANNEL_OPERATOR_KEY=<from operator-init> \
CT_TOPOLOGY_ID=<this topology's id> \
./ct-agent channel bind-topology
```

This prints two hex lines: `operator_pubkey` (64 hex) and `proof` (128 hex). Paste them into
the editor's **Bind an operator key** panel (below the canvas, visible only to the topology's
owner, only while unbound) and click **Bind**. Equivalently:

```bash
curl -X PUT https://bunsenbrenner.org/me/topologies/<id>/operator \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"operator_pubkey": "<64 hex>", "proof": "<128 hex>"}'
```

`proof` is `operator_pubkey`'s ed25519 signature over
`topology_operator_binding_bytes(topology_id, operator_pubkey)`
(`crates/common/src/channel.rs:838`) — proof-of-possession, not just knowledge of a public key,
so binding someone *else's* operator key to your own topology (and thereby minting yourself
admission into their real channels) isn't possible without their private key. A bad proof and
"you don't own this topology" both come back as the same `404` — deliberately
indistinguishable, so probing a topology id this way learns nothing either way. The private key
itself never leaves the machine that ran `bind-topology`; only the signature crosses the wire.

Once bound, each declared edge `(a, b)` additively authorizes the corresponding channel's
admission for both `a` and `b` — the channel id is derived the same way
[`channel_id_for_link`]({{ '/how-to/join-a-channel/' | relative_url }}) already computes it
elsewhere on this site (`authorized_channels`/`topology_authorizes` in
`crates/control-plane/src/storage.rs:5069`, `:5091`). Remove the edge later and the
authorization goes with it — no separate revocation bookkeeping.

## 5. Confirm it's live via the public status page

`GET /net/<net_uuid>` (the `net_uuid` from step 1, not the topology `id`) is a public,
unauthenticated page showing the topology's current agents and edges — a link you can hand to
anyone without granting them any editing access:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://bunsenbrenner.org/net/<net_uuid>
```

Confirmed live against `https://bunsenbrenner.org`: an unknown `net_uuid` returns a real `404`
(`curl -s -o /dev/null -w '%{http_code}\n' https://bunsenbrenner.org/net/nonexistent-uuid-check`
→ `404`), not a silent empty page — so a `200` here is a genuine confirmation the topology
exists and is reachable, not just that the route exists.

## Optional: overlay mode, sharing, edge-channel notes

None of these change the exclusive-membership or edge-authorization rules above — they extend
what the graph or an edge can additionally carry:

- **Overlay mode.** The toolbar's `overlay` dropdown (Flexible mode only —
  `PUT /me/topologies/:id/mode {"mode": "baseline"|"smart-route"|"shortcut"|"random-mesh"}`)
  switches between *direct* and three complex-adaptive planning modes, and unlocks
  **Suggest overlay** (`POST /me/topologies/:id/suggest`), a real minimum-latency-spanning-tree
  planner over caller-supplied link costs. See
  [The Topology Editor]({{ '/explanation/topology-editor/' | relative_url }}#overlay-modes-and-suggest--a-planner-not-a-live-router)
  for the important caveat: this plans, it doesn't currently steer live traffic.
- **Sharing.** The editor's **Shared with** panel (owner-only) — `POST /me/topologies/:id/share
  {"email": "..."}` — lets another Keycloak account view and wire in their *own* agents/edges,
  never yours, without owner-only governance (delete, operator-bind, share management).
- **Attaching a channel id to an edge as a note.** `PUT /me/topologies/:id/edges/channel
  {"a", "b", "channel"}` (click an edge's line, "Attached channel id") is purely informational —
  it records which real channel an edge represents for anyone reading the graph, but is never
  consulted by `authorized_channels`/`topology_authorizes`, which always derive the authorized
  channel from the edge's two agent ids alone.

Full reference for every endpoint on this page: [Topology API]({{ '/reference/topology/' | relative_url }}).
