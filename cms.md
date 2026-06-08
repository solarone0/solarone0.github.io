---
layout: cms
title: CMS
permalink: /cms/
---

<section class="cms-shell" aria-label="Markdown CMS">
  <form class="editor-panel" id="post-form">
    <div class="meta-grid">
      <label>
        <span>Title</span>
        <input id="post-title" name="title" type="text" autocomplete="off" value="New Post">
      </label>
      <label>
        <span>Date</span>
        <input id="post-date" name="date" type="date">
      </label>
      <label>
        <span>Slug</span>
        <input id="post-slug" name="slug" type="text" autocomplete="off" value="new-post">
      </label>
    </div>

    <label class="body-field">
      <span>Markdown</span>
      <textarea id="post-body" name="body" spellcheck="true">Write in Markdown.

## Section

- One idea
- Another idea

```text
plain code block
```</textarea>
    </label>
  </form>

  <aside class="preview-panel">
    <div class="preview-toolbar">
      <output id="file-name" aria-live="polite"></output>
      <div class="button-row">
        <button id="copy-md" type="button">Copy MD</button>
        <button id="download-md" type="button">Download</button>
      </div>
    </div>
    <article class="post-preview" id="post-preview" aria-live="polite"></article>
  </aside>
</section>
