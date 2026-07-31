---
title: Your first tunnel
description: From no account to a real, publicly reachable HTTPS address.
order: 1
---

# Your first tunnel

By the end of this tutorial you'll have a real service — even just a "hello world" — reachable at a
public HTTPS address, running on hardware you already own. No credit card, no open port, no public IP.

<figure>
<img src="{{ '/assets/img/landing-hero.png' | relative_url }}" alt="The bunsenbrenner.org landing page, showing the headline, an animated device-to-browser encryption diagram, and the email-first 'Get your tunnel' form.">
<figcaption>bunsenbrenner.org — where this tutorial starts.</figcaption>
</figure>

## What you'll need

- Any machine you can run a program on: a laptop, a Raspberry Pi, a spare VM, a container. Linux or
  macOS for this tutorial (Windows has its own [`setup.ps1`](https://github.com/scimbe/ct-agent/blob/main/scripts/setup.ps1)).
- 10 minutes, most of which is waiting on a download.

## 1. Create an account

Go to [bunsenbrenner.org](https://bunsenbrenner.org/) and enter your email in the "Get your tunnel"
box on the landing page, or go straight to [bunsenbrenner.org/portal](https://bunsenbrenner.org/portal).
You can sign up with Google, GitHub, or a plain email address — there's no password to invent if you use
a provider.

<figure>
<img src="{{ '/assets/img/portal-shell.png' | relative_url }}" alt="The bunsenbrenner.org portal sign-in shell, with Continue with Google, Continue with GitHub, and Continue with email options.">
<figcaption>Going straight to /portal instead shows all three options up front.</figcaption>
</figure>

<figure>
<img src="{{ '/assets/img/registration-form.png' | relative_url }}" alt="Keycloak's registration form, with the email address already filled in from the landing page.">
<figcaption>Typing your email on the landing page carries it straight into this form — you don't retype it.</figcaption>
</figure>

The moment your account exists, a tunnel is auto-provisioned for you — one **Standard**-tier tunnel per
account, with an automatically assigned hostname like `hello-world-a1b2c3d4.bunsenbrenner.org`. You don't
pick the name yourself in this tier; it's derived from your account so it can never collide with anyone
else's.

## 2. Get your `.env`

On your tunnel's page, click **Install**. This mints a single-use join token and shows you a ready-to-use
`.env` block — copy it into an empty directory on the machine you're going to run the tunnel from.

```
CT_AGENT_CP_URL=https://bunsenbrenner.org
CT_AGENT_JOIN_TOKEN=...
CT_AGENT_TOKEN=...
CT_AGENT_HOSTNAME=hello-world-a1b2c3d4.bunsenbrenner.org
CT_AGENT_ORIGIN=127.0.0.1:8080
CT_AGENT_ORIGIN_PROTO=tcp
```

<div class="callout warn">
<strong>The join token is single-use.</strong> If a run fails partway through, don't reuse the same
<code>.env</code> — go back to Install for a fresh one. This is by design: it's what stops a leaked
token from being replayed later.
</div>

## 3. Run the guided setup script

`ct-agent` is a separate, small program that speaks the tunnel protocol — it lives in its own repo
([`scimbe/ct-agent`](https://github.com/scimbe/ct-agent)) so it can be released and updated on its own
schedule, independent of the platform. In the same directory as your `.env`:

```bash
curl -fsSL https://raw.githubusercontent.com/scimbe/ct-agent/main/scripts/setup.sh -o setup.sh
bash setup.sh --yes
```

`--yes` skips the interactive confirmation for running a network-facing process directly on this host —
read that warning once; prefer `--docker` instead if you'd rather isolate it in a container (see
[Install ct-agent]({{ '/how-to/install-ct-agent/' | relative_url }}) for both paths).

The script checks your environment, downloads the right binary for your OS/architecture, onboards using
your `.env`, and starts the agent in the background. In practice this completes in a few seconds — the
platform promotes a fresh tunnel to its first certificate tier as part of the same request that
authorizes it at the edge, not on a delay.

```
==> checking certificate tier (Rot -> Gelb -> Grün)
  ✓ 🟡 Gelb — live now via the shared certificate

==> done — current tier: gelb
```

<figure>
<img src="{{ '/assets/img/terminal-setup-sh.png' | relative_url }}" alt="Terminal output of setup.sh running to completion, from environment check through reaching the Gelb certificate tier.">
<figcaption>A real run, start to finish (routing token redacted).</figcaption>
</figure>

## 4. Check it's really live

```bash
curl -I https://hello-world-a1b2c3d4.bunsenbrenner.org/
```

(substitute your own hostname). You should get a real `200`, with a valid TLS certificate — try it in a
browser too. Nobody, including the operator, can see what's actually flowing through that connection;
see [Zero-knowledge architecture]({{ '/explanation/zero-knowledge/' | relative_url }}) for what that
guarantee does and doesn't cover.

## What you have now

A tunnel at the **Gelb** tier: live, trusted by browsers, terminating TLS with a certificate the platform
shares across Gelb-tier tunnels. That's normal and sufficient for most uses. If you want your service to
hold its *own* certificate instead (the **Grün** tier), see
[Go from Gelb to Grün]({{ '/how-to/gelb-to-gruen/' | relative_url }}) — it's one more command, not a
redo of anything above.

## Next

- [Install ct-agent]({{ '/how-to/install-ct-agent/' | relative_url }}) — the direct-host vs. Docker
  tradeoff in more detail, and what each guided-setup flag does.
- [Certificate tiers explained]({{ '/explanation/certificate-tiers/' | relative_url }}) — why Rot/Gelb/
  Grün exist and what's actually different between them.
- [Environment variables]({{ '/reference/environment-variables/' | relative_url }}) — every
  `CT_AGENT_*` variable, not just the ones this tutorial used.
- [Manage your tunnel from the portal]({{ '/how-to/manage-your-tunnel/' | relative_url }}) — view,
  revoke, or reconnect the tunnel you just created, straight from the dashboard.
