---
layout: base.11ty.js
classes:
  - title-page
order: 3
outputs:
  - pdf
  - epub
toc: false
---

<section class="title-block">

{%- if publication.title -%}
  <h1 class="title">{{ publication.title | markdownify }}{% if publication.subtitle %}: {{ publication.subtitle | markdownify }}{% endif %}
  {% if publication.reading_line %}<br /><br />{{ publication.reading_line | markdownify }}{% endif %}</h1>
{%- endif -%}

{%- if publication.contributor_as_it_appears -%}
  <p class="contributor">{{ publication.contributor_as_it_appears | markdownify }}</p>
{%- else -%}
  <p class="contributor">{% contributors context=publicationContributors type="primary" format="string" %}</p>
{%- endif -%}

</section>

<section class="publisher-block">

{%- for publisher in publication.publisher -%}
  {%- if publisher.name -%}
    <p class="publisher">{{ publisher.name }}{% if publisher.location %}, {{ publisher.location }}{% endif %}</p>
  {%- endif %}
{%- endfor -%}

</section>

<section class="author-note" data-outputs-include="epub">

<p>Encouraged by academic colleagues to generate a scholarly monograph on the museum and collection of the London Missionary Society, on which I have been working since 2006, whenever I sat down to do this, I struggled with the constraints and process of paper-based publication.</p>

<p>This is my attempt to give my research a form that makes sense.</p>

<p>Chris Wingfield<br />12 January 2022</p>

</section>
