---
layout: default
title: Home
---

{% assign posts_by_year = site.posts | group_by_exp: "post", "post.date | date: '%Y'" %}
{% for year in posts_by_year %}
<section class="year-section" id="year-{{ year.name }}">
  <h2>{{ year.name }}</h2>
  <ul class="post-list">
  {% for post in year.items %}
    <li>
      <span class="post-date">{{ post.date | date: "%Y-%m-%d" }}</span>
      <a class="post-title" href="{{ post.url | relative_url }}">{{ post.title }}</a>
    </li>
  {% endfor %}
  </ul>
</section>
{% endfor %}
