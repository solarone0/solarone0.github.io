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

## VS Code tasks

Use `Ctrl+Shift+P` -> `Tasks: Run Task`.

- `Blog: new post today`: create `_posts/YYYY-MM-DD-slug.md`.
- `Blog: normalize post filenames`: rename new untracked posts from title/content.
- `Blog: publish changed posts`: normalize new post filenames, commit changed `_posts`, and push.

Add `slug: your-english-slug` to front matter when you want an exact URL slug.
