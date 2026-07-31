---
title: Go from Gelb to Grün
description: Get your tunnel its own certificate instead of the shared one.
order: 2
---

# Go from Gelb to Grün

A freshly-onboarded tunnel is **Gelb**: live, trusted by browsers, but terminating TLS with a certificate
shared across every Gelb-tier tunnel on the platform. **Grün** means your service holds its own,
individually-issued certificate instead. See
[Certificate tiers explained]({{ '/explanation/certificate-tiers/' | relative_url }}) for why this
distinction exists at all.

## Before you start

Your origin must serve **plain HTTP**, not TLS, while you do this — the ACME validation happens over the
same connection your tunnel already forwards, and the platform (not your origin) is the one that will
hold the TLS termination once Grün is issued. If your origin already speaks TLS, switch it to plain HTTP
first and switch it back afterward.

## Run it

```bash
CT_AGENT_CP_URL=https://bunsenbrenner.org \
CT_AGENT_TOKEN=<your tunnel's routing token> \
CT_AGENT_HOSTNAME=<your hostname> \
CT_ACME_CERT_OUT_DIR=./ct-agent-cert \
./ct-agent certificate
```

Real values from a run against production, for scale: this completed with a real, browser-trusted
ZeroSSL certificate, and wrote:

```
./ct-agent-cert/
  acme-account-key.der
  fullchain.pem
  privkey.pem
```

`ct-agent certificate` does **not** exit after obtaining the certificate — it's a persistent renewal
daemon (`run_renewal_loop`, checking every 6 hours whether renewal is due) that keeps running until you
stop it. If you only want the certificate and don't want a long-lived process hanging around, `Ctrl+C`
(or send it `SIGTERM`) once you've confirmed Grün below — the files it already wrote are yours to keep;
you'd just be responsible for renewing manually before they expire. It does not replace your running
tunnel process either way; run it alongside, not instead of, the agent that's already serving.

<div class="callout warn">
<code>ct-agent</code> has no working <code>--help</code>/<code>-h</code> flag today — running it with an
unrecognized first argument falls through to the default serve path instead of printing usage. Don't
rely on <code>--help</code> for any <code>ct-agent</code> command; this documentation is the reference.
</div>

## Confirm it worked

```bash
curl -s https://<your-cp-url>/agent/acme-admission/<your-routing-token>/<your-hostname>
```

should now report `"status":"gruen"`. Once it does, point your origin's own TLS termination at the
`fullchain.pem`/`privkey.pem` pair `ct-agent` just wrote, and switch it back from plain HTTP.

## If it hangs or fails

The most common cause is DNS-01 propagation timing: the platform's own DNS backend accepted your
hostname's validation record, but the certificate authority checked for it before that record had
actually propagated to the public nameservers it queries. This is a timing issue, not a configuration
error — retry the command; it doesn't cost you anything to redo (unlike onboarding, this isn't a
single-use token).

If it's not that — the command runs but never seems to get a CA to actually issue against — you may be
waiting on the platform's [admission queue]({{ '/explanation/certificate-tiers/' | relative_url }}#the-gelbgrün-admission-queue)
rather than anything on your end; check your tunnel's row in the portal to see whether you're queued,
offered (with a 48h clock running), or lapsed.

## Bringing your own certificate instead

`ct-agent certificate` isn't the only path to Grün — strict or air-gapped setups can supply their own
certificate and key directly instead of running this platform's ACME flow at all. Install your own cert
(from any CA) on your origin yourself, then tell the platform you're ready:

```bash
curl -X POST https://<your-cp-url>/agent/acme-issuance-complete/<your-routing-token>/<your-hostname>
```

See [API endpoints]({{ '/reference/api-endpoints/' | relative_url }}) for what this actually does —
the control plane doesn't verify a certificate exists, it trusts the routing token and reverts the edge
to passthrough, genuinely Grün either way.

<div class="callout warn">
This call checks that your routing token is the <b>recorded owner</b> of the hostname — a real,
separate registry from the edge's own host authorization. If your hostname was ever authorized
directly against the edge's admin API rather than the control plane's, this fails with a clean
<code>403</code> no matter how correct your routing token is. See
[Authorize a new pipeline hostname]({{ '/how-to/authorize-a-pipeline-hostname/' | relative_url }})
for the exact gotcha and the fix — found live, the hard way, this session.
</div>
