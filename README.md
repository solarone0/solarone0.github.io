# Minimal Blog

A minimal Markdown-based static blog for GitHub Pages.

## Write a post

Local CMS:

From `C:\Users\solar`:

```powershell
npm run blog:cms
```

From the `AGENTS` workspace root:

```powershell
npm run blog:cms
```

From this `blog` folder:

```powershell
npm run blog:cms
```

If PowerShell is somewhere else, move home first:

```powershell
cd ~
npm run blog:cms
```

Open the printed `http://127.0.0.1:8787/cms/?token=...` URL. The CMS server binds to localhost only and requires the startup token for save/publish actions, so GitHub Pages visitors cannot write posts. The `Write` nav link is only shown on local hosts.

CMS features:

- Open Blog opens the public GitHub Pages site.
- Published saves to `_posts`; Draft saves to `_drafts`.
- Delete removes the selected post or draft locally.
- Delete & Publish shows the target and pending file list, removes the selected post or draft, then runs the publish script.
- Image uploads save to `assets/images` and insert Markdown at the cursor.
- Search filters the CMS post/draft list by title, filename, or status.
- The top change panel shows local publish targets before you publish.
- Publish shows the pending file list first, then opens the public blog after success.

Manual file:

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

## Traffic analytics

This blog has a GA4 Google tag hook in `_layouts/default.html`.

1. In Google Analytics, create or open a GA4 property for `https://solarone0.github.io`.
2. Add a Web data stream for `https://solarone0.github.io`.
3. Copy the Measurement ID that starts with `G-`.
4. Put it in `_config.yml`:

```yaml
google_analytics: "G-XXXXXXXXXX"
```

The tag only renders in production builds, so local CMS/editor pages are not tracked.

Check the local analytics setup:

```powershell
npm run analytics:check
```

## SEO checks

Run the local SEO guard before publishing layout changes:

```powershell
npm run seo:check
```

The site includes canonical URLs, robots directives, Open Graph/Twitter previews, JSON-LD structured data, `robots.txt`, and `sitemap.xml`.
