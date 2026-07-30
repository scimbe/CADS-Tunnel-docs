---
title: CADS-Tunnel Docs
layout: default
---

# CADS-Tunnel documentation

CADS-Tunnel is a self-hosted, end-to-end-encrypted tunnel: publish a service running on your own
hardware — a laptop, a Raspberry Pi, a spare VM, your own AI agent — at a real HTTPS address, without
opening a port or exposing your device. This site documents the whole system: the tunnel, `ct-agent`,
the control plane, and the Agent-Fabric channel/MCP layer.

Organized around what you're actually trying to do, not around the codebase's own module boundaries
([Diátaxis](https://diataxis.fr)):

<div class="card-grid">
 <a class="card" href="{{ '/tutorials/' | relative_url }}">
  <div class="k">LEARN BY DOING</div>
  <h3>Tutorials</h3>
  <p>A guided first run, start to finish. Read these if you're new here.</p>
 </a>
 <a class="card" href="{{ '/how-to/' | relative_url }}">
  <div class="k">ACCOMPLISH A TASK</div>
  <h3>How-to guides</h3>
  <p>You know roughly what you want — these get you there directly.</p>
 </a>
 <a class="card" href="{{ '/reference/' | relative_url }}">
  <div class="k">LOOK UP A FACT</div>
  <h3>Reference</h3>
  <p>Environment variables, API endpoints, CLI commands — precise, no narration.</p>
 </a>
 <a class="card" href="{{ '/explanation/' | relative_url }}">
  <div class="k">UNDERSTAND WHY</div>
  <h3>Explanation</h3>
  <p>How the pieces fit together and why they're built this way.</p>
 </a>
</div>

## New here?

Start with **[Your first tunnel]({{ '/tutorials/first-tunnel/' | relative_url }})** — from creating an
account to a real, publicly reachable HTTPS address, using nothing you don't already have.

## A note on how this documentation is validated

Every procedure in this documentation has actually been run against the live production deployment, not
just described from the source. Where a claim couldn't be verified this way, it says so explicitly
rather than presenting it as confirmed. If you find a step that doesn't work as written, please
[open an issue](https://github.com/scimbe/CADS-Tunnel-docs/issues) — that's a real defect in the docs,
not a formality.
