# CADS-Tunnel-docs

Documentation for [CADS-Tunnel](https://github.com/scimbe/CADS-Tunnel), published at
[docs.bunsenbrenner.org](https://docs.bunsenbrenner.org) via GitHub Pages (native Jekyll build, no
custom Actions workflow needed).

## Structure

Organized around the [Diátaxis](https://diataxis.fr) framework — tutorials, how-to guides, reference,
explanation — as four Jekyll collections (`_config.yml`). Add a page by creating a Markdown file in the
matching directory (`tutorials/`, `how-to/`, `reference/`, `explanation/`) with front matter:

```yaml
---
title: Page title
description: One sentence, shown on the section index card.
order: 1
---
```

## Validation standard

Every procedure documented here should be actually run against the live deployment (or the real test
suite) before being written up as fact, not described from the source alone. Where that wasn't possible,
say so explicitly in the page rather than presenting it as confirmed.

This includes actual browser flows, not just API calls — no host-level browser install (and no sudo)
needed for that:

```bash
docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.48.0-noble \
  sh -c "npm init -y >/dev/null 2>&1; npm install playwright@1.48.0 >/dev/null 2>&1; node check.js"
```

A `check.js` using `require('playwright')` runs headless Chromium inside the container — no
`playwright install` needed, the image already bundles it. Used to confirm the landing page's
email-first CTA genuinely lands on Keycloak's real registration form with the email pre-filled (not
just that the redirect *header* says so) — screenshot proof, not just an HTTP status code.

## Screenshots

`assets/img/` holds real screenshots — browser UI captured with the same Docker-Playwright pattern above
(`page.screenshot({ path: '/work/name.png' })`, or `locator.screenshot()` for just one section of the
page), and terminal output rendered by pointing Playwright at a small local HTML file styled like a
terminal and screenshotting that (`terminal.html` isn't committed — recreate as needed; keep the
`--terminal` colors matching `style.css`'s tokens for visual consistency).

Rules for adding one:
- **Real, not staged.** Capture the actual live site/output, not a mockup — if the product changes, the
  screenshot goes stale and needs retaking, same as any other documented fact.
- **Sanitize before committing.** Redact real tokens/secrets from terminal captures even from disposable
  test tunnels — don't publish something you'd tell a user never to publish themselves.
- **Wrap in `<figure>`/`<figcaption>`** (styling already in `style.css`) with real, descriptive alt text —
  not decorative filler.
- Keep them reasonably sized; this repo doesn't have image-compression tooling wired up yet (flagged as a
  gap, not solved) — don't let raw screenshots balloon repo size unchecked over many firings.

## Local preview

```bash
bundle install
bundle exec jekyll serve
```
