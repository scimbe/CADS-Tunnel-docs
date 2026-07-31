---
title: How-to guides
layout: default
permalink: /how-to/
---

# How-to guides

You know roughly what you want to accomplish — these get you there directly.

<div class="callout">
<strong>Want to skip straight to a working pipeline?</strong>
<a href="https://bunsenbrenner.org/downloads/hello-world-pipeline.zip">hello-world-pipeline.zip</a> is a
real, minimal starter — a <code>pipeline-spec.json</code> and a one-file handler
(<code>read -r request; echo "Hello, world! You said: ${request}"</code>) that already exercises
identity, admission, channels, and publishing end to end. Unzip it, follow its own
<code>README.md</code>, then swap the handler for your own logic — the same stdin-in/stdout-out
contract [Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }})
covers in more depth. Structure explained, file by file, at
<a href="https://bunsenbrenner.org/template-guide">bunsenbrenner.org/template-guide</a>.
</div>

<div class="card-grid">
{% assign pages = site.how-to | sort: 'order' %}
{% for p in pages %}
 <a class="card" href="{{ p.url | relative_url }}">
  <h3>{{ p.title }}</h3>
  <p>{{ p.description }}</p>
 </a>
{% endfor %}
</div>
