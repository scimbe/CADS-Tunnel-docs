---
title: How-to guides
layout: default
permalink: /how-to/
---

# How-to guides

You know roughly what you want to accomplish — these get you there directly.

<div class="card-grid">
{% assign pages = site.how-to | sort: 'order' %}
{% for p in pages %}
 <a class="card" href="{{ p.url | relative_url }}">
  <h3>{{ p.title }}</h3>
  <p>{{ p.description }}</p>
 </a>
{% endfor %}
</div>
