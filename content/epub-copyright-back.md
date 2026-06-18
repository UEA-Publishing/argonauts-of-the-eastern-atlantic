---
layout: page
order: 200
epub_position: last
classes:
  - copyright-page
outputs:
  - epub
toc: false
---

{% copyright %}

{% if publication.identifier.isbn %}
ISBN: {{ publication.identifier.isbn }}
{% endif %}
