---
title: Declarative network policy
description: An RBAC+MAC access-control language for who may connect to whom — real, and real about what it isn't wired into yet.
order: 7
---

# Declarative network policy

Found the same way as [The Topology Editor]({{ '/explanation/topology-editor/' | relative_url }}) —
by auditing every route this control plane actually registers and checking it against what's
documented here. `/me/networks/*` (`crates/common/src/policy.rs`, #102) had zero coverage on this
site. It's a different idea from Topology's graph editor: not "draw connections," but "declare who's
*allowed* to connect to whom, by role and sensitivity level" — a small RBAC+MAC policy language,
independently pure-tested (12/12 `ct-common` policy tests, re-run hermetically for this page) and
exposed through three `/me/*` routes.

## The policy language

A **`Network`** is `{agents: [Agent], policy: Policy}`. Each `Agent` is `{id, group, label}` — a
group for role-based rules (`"dev"`, `"ops"`, whatever you choose) and a security label. A `Policy` is:

```json
{
  "levels": {"order": ["public", "internal", "secret"]},
  "rules": [
    {"from": {"group": "dev"}, "to": {"group": "ops"}}
  ],
  "mac_flow_control": true
}
```

- **RBAC (discretionary)**: default-deny. A flow from `a` to `b` is permitted only if at least one
  `rules` entry's `from`/`to` selectors both match — a selector with `group`/`label` unset matches
  anything in that field, so `{"from": {}, "to": {}}` would allow everyone.
- **MAC (mandatory)**, opt-in via `mac_flow_control: true`: a Bell–LaPadula **no-write-down** rule
  layered on top — an agent at a higher `levels` rank may never initiate a flow to a lower-ranked
  agent, even if an RBAC rule would otherwise allow it. An unknown label fails closed (deny), not
  open. This overrides RBAC; it never grants what RBAC alone would deny.

## `explain` and `desired_channels` — real, pure, and tested

Two things a stored `Network` computes, both real functions with passing tests, not stubs:

- **`GET /me/networks/:id/plan`** returns
  `{"desired": [["agent-a","agent-b"], ...]}` — every pair the policy would allow to connect,
  canonicalized (order-independent, no self-pairs). This is `Network::desired_channels()`: for every
  distinct pair of member agents, ask the policy, keep the ones it allows.
- **`Network::explain(a_id, b_id)`** — the single-pair version, with a **reason** (`Decision {allowed,
  reason}`) — a member id that doesn't exist in the network is a fail-closed deny with a clear reason,
  not an error. Confirmed by its own test, `network_explain_answers_allowed_and_why_for_two_agent_ids`.

## The honest caveat: this doesn't gate anything live, yet

<div class="callout warn">
Checked directly against the source rather than assumed — grepped every source file in
<code>crates/edge</code> for any reference to this module, this <code>Policy</code> type, or
<code>desired_channels</code>: <strong>zero matches</strong>. Grepped every registered MCP tool
(<code>ct_common::mcp</code>'s <code>register_*</code> functions and what actually gets wired up in
<code>ct-agent</code>) for an <code>explain</code> tool: also zero. Neither the edge-broker enforcement
nor the <code>net.explain</code> MCP tool exist in the shipped system today —
<code>crates/common/src/policy.rs</code>'s own module doc comment says exactly this now too (fixed as
part of #235, after an earlier version of that comment described the intended end state in the present
tense and read as a claim this was already live): "the intended end state (#102) is… <strong>none of
that wiring exists yet</strong> (#235): the edge broker's admission path never references this module,
and there is no <code>explain</code> MCP tool." Same gap as
<a href="{{ '/explanation/topology-editor/' | relative_url }}">the Topology Editor's</a> overlay-mode
and unreachable operator-binding route, and worth exactly the same caveat: the decision engine itself
is real, correct, and tested — declaring a network and computing what it would allow works exactly as
documented above — but nothing currently reads that computed plan to actually admit or refuse a real
Agent-Fabric channel.
</div>

## Should you use this today?

For reasoning about what a role/sensitivity-based access policy *would* permit — yes, `PUT`/`GET
/me/networks/:id` and its `/plan` are fully live and correct. For actually restricting which of your
agents can talk to which, the real, currently-enforced mechanism is channel admission itself — see
[Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) and
[Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) for what's actually
wired in: only agents holding a signed grant for a specific channel can join it, independent of this
policy language.
