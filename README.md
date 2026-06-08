# Minimal Blog

A minimal Markdown-based static blog for GitHub Pages.

## Write a post

Create a file in `_posts`:

```text
YYYY-MM-DD-title.md
```

Example:

```text
_posts/2026-06-08-my-post.md
```

Post format:

```markdown
---
layout: post
title: My Post
---

Write content in Markdown.
```

## Deploy

Push to the `main` branch.

GitHub Pages settings:

```text
Settings -> Pages -> Source: Deploy from a branch -> main -> /root
```

## CMS

Open `/cms/` to write a post in Markdown with a side-by-side preview.

Use `Copy MD` or `Download`, then place the file in `_posts`.
