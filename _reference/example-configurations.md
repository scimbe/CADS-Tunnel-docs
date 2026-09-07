---
title: Example configurations by use case
description: Complete, runnable configs for the main ways to run ct-agent, side by side — so the differences between them are explicit instead of something you find out by debugging a silent failure.
order: 0
---

# Example configurations by use case

`ct-agent` covers several genuinely different jobs — a public HTTPS tunnel, an opaque
machine-to-machine tunnel, an Agent-Fabric channel — through the same binary and largely
the same environment-variable namespace. That's convenient once you know which one you
want, and a real trap if you don't: a config for one use case is often a handful of
missing or extra lines away from another, and running the wrong one doesn't fail loudly —
it starts, logs something that sounds like success, and quietly does something else. This
page exists specifically to make the differences visible up front, one working example
per use case, instead of leaving it to be discovered live.

## At a glance

<div style="overflow-x:auto">

| | [Browser Plane](#1-browser-plane-tunnel--a-public-https-site) | [Mesh Plane](#2-mesh-plane-tunnel--opaque-token-routing-the-default) | [Channel only](#3-agent-fabric-channel-only--no-tunnel-at-all) |
|---|---|---|---|
| Public HTTPS hostname? | **Yes** | No | No |
| `CT_AGENT_MODE` | `browser` | *(unset)* | *(unrelated — no tunnel at all)* |
| `CT_AGENT_HOSTNAME` | set | *(unset)* | *(unrelated)* |
| `CT_AGENT_TOKEN` / join token | set | set | *(unrelated)* |
| `CT_CHANNEL_*` | *(unrelated)* | *(unrelated)* | set |
| Hostname leaked to the operator (SNI)? | Yes, by design | No | No — no hostname exists |
| Reachable via | any browser / `curl` | a Client holding your [Capability]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }}) | a channel member holding your grant |

</div>

A fourth shape — tunnel **and** channel together — is just the Browser Plane or Mesh
Plane config above running as one process, plus the channel config running as a
*second, independent* `ct-agent` process on the same machine. See
[§4](#4-tunnel--channel-together--two-processes-one-machine) below.

## 1. Browser Plane tunnel — a public HTTPS site

Pick this when you want an ordinary browser or `curl` to reach your service at a real
`https://` address. The edge terminates or passes through TLS by hostname (SNI) — see
[Certificate tiers]({{ '/explanation/certificate-tiers/' | relative_url }}) — which means
the operator's edge necessarily sees which hostname you're serving, even though it never
sees the traffic itself. Full walkthrough: [Your first tunnel]({{ '/tutorials/first-tunnel/' | relative_url }}).

```
CT_AGENT_CP_URL=https://bunsenbrenner.org
CT_AGENT_JOIN_TOKEN=...                        # first boot only, single-use
CT_AGENT_TOKEN=...
CT_AGENT_MODE=browser
CT_AGENT_HOSTNAME=hello-world-a1b2c3d4.bunsenbrenner.org
CT_AGENT_ORIGIN=127.0.0.1:8080                 # <- your actual service
CT_AGENT_ORIGIN_PROTO=tcp
```

`CT_AGENT_MODE=browser` and `CT_AGENT_HOSTNAME` always ride together — a tunnel with an
assigned hostname needs the Browser Plane explicitly turned on, or the edge has nothing
to route the hostname to (this is the exact failure this page exists to prevent — see
[How to tell which one you're actually running](#how-to-tell-which-one-youre-actually-running)
below). The portal's Install page always sets both at once; if you're hand-editing a
`.env` instead of copying it verbatim, don't drop one without the other.

## 2. Mesh Plane tunnel — opaque-token routing, the default

Pick this when a real HTTPS address isn't the point — you have your own Client(s) that
speak `ct-agent`'s protocol directly, and you'd rather the operator's edge never see even
a hostname. This is the default: leaving `CT_AGENT_MODE` unset is what selects it, not a
separate flag. Full explanation: [Mesh Plane and Capabilities]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }}).

```
CT_AGENT_CP_URL=https://bunsenbrenner.org
CT_AGENT_JOIN_TOKEN=...                        # first boot only, single-use
CT_AGENT_TOKEN=...
CT_AGENT_ORIGIN=127.0.0.1:8080                 # <- your actual service
CT_AGENT_CAPABILITY_OUT=./capability.bin       # what you hand your own Clients
```

Notice what's **absent**, on purpose: no `CT_AGENT_MODE`, no `CT_AGENT_HOSTNAME`. Adding
either turns this into the Browser Plane config above. `CT_AGENT_ORIGIN_PROTO=udp` is
also valid here if your service speaks UDP — Mesh Plane isn't HTTP-shaped at all, unlike
Browser Plane.

## 3. Agent-Fabric channel only — no tunnel at all

Pick this when the job is a direct, encrypted, machine-to-machine call between two
agents — a tool call, not a page load — and you don't need a tunnel in either sense
above. This is a completely separate config surface: none of `CT_AGENT_TOKEN`,
`CT_AGENT_HOSTNAME`, or `CT_AGENT_ORIGIN` are involved. Full walkthrough:
[Set up a broker-mediated channel]({{ '/how-to/broker-mediated-channel/' | relative_url }}).

```bash
# One-time: mint this side's identity and the channel-scoped material — see the
# linked walkthrough for the full derive-and-grant sequence this abbreviates.
./ct-agent channel operator-init

# Serve, persistently, over the platform's broker:
CT_CHANNEL_ROLE=accept \
CT_CHANNEL_BROKER=<edge host>:4435 CT_CHANNEL_RELAY=<edge host>:4436 \
CT_CHANNEL_HOLDER_KEY=<this side's holder private key> \
CT_CHANNEL_NOISE_KEY=<this side's noise private key> \
CT_CHANNEL_GRANT=<this side's grant hex> \
CT_CHANNEL_SERVE=1 \
CT_AGENT_SERVICE_HANDLER_CMD=./handler.sh CT_AGENT_SERVICES=text_generation \
./ct-agent channel
```

See [Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }})
for the full `CT_CHANNEL_*` reference, and
[Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }})
for what `CT_AGENT_SERVICE_HANDLER_CMD`/`CT_AGENT_SERVICES` actually do.

## 4. Tunnel + channel together — two processes, one machine

Neither tunnel mode above is combined with a channel by adding variables to the same
`.env` — a channel is always a **second, independent `ct-agent` process**, using its own
separate holder/Noise identity from `ct-agent channel init`, unrelated to the tunnel's
origin key. Run whichever tunnel config from §1 or §2 fits, and the §3 channel config,
as two processes on the same machine. Full walkthrough, including why the two are kept
separate rather than merged into one mode:
[Serve a tunnel and a channel together]({{ '/how-to/tunnel-plus-channel/' | relative_url }}).

## How to tell which one you're actually running

<div class="callout warn">
The most reliable check is your own config, not the log: does this <code>.env</code>
have <code>CT_AGENT_MODE=browser</code> **and** <code>CT_AGENT_HOSTNAME</code> both set?
If either is missing, you're on Mesh Plane, whatever the startup log happens to say.
<br><br>
The log line difference is real but easy to misread, and has actually caused a live
outage this way: on the **TLS-TCP fallback path** (UDP blocked), a Mesh Plane agent
logs <code>registered over the TLS-TCP fallback (UDP blocked), ping-capable, serving
one tunnel to &lt;origin&gt;</code> — no hostname anywhere in that line — while a
Browser Plane agent on the same fallback path logs <code>browser-registered
'&lt;host&gt;' over the TLS-TCP fallback (UDP blocked) ... raw-forwarding to
&lt;origin&gt;</code>, naming the hostname explicitly. The first one sounds exactly
like "it's working" if you're not looking for the hostname specifically — and on the
**normal (non-fallback) path**, both modes print the identical <code>registered with
edge &lt;addr&gt; (serving)</code> line, with no difference at all beyond the presence
or absence of a separate hostname-bind confirmation. Don't rely on log-reading alone
to confirm which mode you're in — check the two variables above first.
</div>
