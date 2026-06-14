import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const blogRoot = path.resolve(__dirname, "..");
const postsDir = path.join(blogRoot, "_posts");
const draftsDir = path.join(blogRoot, "_drafts");
const imagesDir = path.join(blogRoot, "assets", "images");
const siteUrl = process.env.BLOG_SITE_URL || "https://solarone0.github.io";
const preferredPort = Number(process.env.BLOG_CMS_PORT || 8787);
const host = "127.0.0.1";
const token = process.env.BLOG_CMS_TOKEN || randomBytes(18).toString("hex");

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

function auth(req, url) {
  return req.headers["x-cms-token"] === token || url.searchParams.get("token") === token;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "post";
}

function postFilename(date, slug) {
  return `${date}-${slugify(slug)}.md`;
}

function draftFilename(slug) {
  return `${slugify(slug)}.md`;
}

function safePath(collection, filename) {
  const dir = collection === "draft" ? draftsDir : postsDir;
  const pattern = collection === "draft"
    ? /^[\p{Letter}\p{Number}-]+\.md$/u
    : /^\d{4}-\d{2}-\d{2}-[\p{Letter}\p{Number}-]+\.md$/u;
  if (!pattern.test(filename)) throw new Error("Invalid content filename.");
  const resolved = path.resolve(dir, filename);
  if (!resolved.startsWith(dir + path.sep)) throw new Error("Invalid content path.");
  return resolved;
}

function tagList(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function markdownDocument({ title, date, description, tags, body, draft }) {
  const safeTitle = String(title || "Untitled").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const lines = ["---", "layout: post", `title: "${safeTitle}"`];
  if (date) lines.push(`date: ${date}`);
  if (description) lines.push(`description: "${String(description).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  const cleanTags = tagList(tags);
  if (cleanTags.length) lines.push(`tags: [${cleanTags.map((tag) => `"${tag.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(", ")}]`);
  if (draft) lines.push("published: false");
  lines.push("---", "", String(body || "").trim(), "");
  return lines.join("\n");
}

function readFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontMatter = match ? match[1] : "";
  const body = match ? markdown.slice(match[0].length).trim() : markdown.trim();
  const data = {};
  let currentKey = "";
  frontMatter.split(/\r?\n/).forEach((line) => {
    if (currentKey && /^\s+-\s+/.test(line)) {
      data[currentKey] = `${data[currentKey] || ""}, ${line.replace(/^\s+-\s+/, "").trim()}`.replace(/^,\s*/, "");
      return;
    }
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!item) return;
    currentKey = item[1];
    data[item[1]] = item[2].trim().replace(/^["']|["']$/g, "").replace(/^\[|\]$/g, "").replace(/"/g, "");
  });
  return { data, body };
}

function parseTitle(markdown, filename) {
  return readFrontMatter(markdown).data.title ||
    filename.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
}

function parseDate(markdown, filename) {
  return readFrontMatter(markdown).data.date || (/^\d{4}-\d{2}-\d{2}/.test(filename) ? filename.slice(0, 10) : new Date().toISOString().slice(0, 10));
}

function parseSlug(filename) {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function listCollection(collection) {
  const dir = collection === "draft" ? draftsDir : postsDir;
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir)).filter((file) => file.endsWith(".md")).sort().reverse();
  return Promise.all(files.map(async (file) => {
    const markdown = await readFile(path.join(dir, file), "utf8");
    const parsed = readFrontMatter(markdown);
    return {
      collection,
      file,
      title: parseTitle(markdown, file),
      date: parseDate(markdown, file),
      slug: parseSlug(file),
      description: parsed.data.description || "",
      tags: parsed.data.tags || ""
    };
  }));
}

async function listContent() {
  const posts = await listCollection("post");
  const drafts = await listCollection("draft");
  return [...posts, ...drafts].sort((a, b) => `${b.date}-${b.file}`.localeCompare(`${a.date}-${a.file}`));
}

async function publish() {
  return new Promise((resolve, reject) => {
    execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(blogRoot, "scripts", "publish-posts.ps1")], {
      cwd: blogRoot,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${stdout}\n${stderr}`.trim() || error.message));
        return;
      }
      resolve(`${stdout}\n${stderr}`.trim());
    });
  });
}

async function gitStatus() {
  return new Promise((resolve, reject) => {
    execFile("git", ["status", "--porcelain", "--", "_posts", "_drafts", "assets/images"], {
      cwd: blogRoot,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${stdout}\n${stderr}`.trim() || error.message));
        return;
      }
      const changes = stdout.split(/\r?\n/)
        .filter(Boolean)
        .map((line) => ({
          code: line.slice(0, 2).trim() || "??",
          path: line.slice(3).replace(/^"|"$/g, "")
        }));
      resolve({ clean: changes.length === 0, count: changes.length, changes });
    });
  });
}

async function saveContent(data) {
  await mkdir(postsDir, { recursive: true });
  await mkdir(draftsDir, { recursive: true });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(data.date || "") ? data.date : new Date().toISOString().slice(0, 10);
  const slug = slugify(data.slug || data.title);
  const collection = data.collection === "draft" ? "draft" : "post";
  const filename = collection === "draft" ? draftFilename(slug) : postFilename(date, slug);
  await writeFile(safePath(collection, filename), markdownDocument({
    title: data.title,
    date,
    description: data.description,
    tags: data.tags,
    body: data.body,
    draft: collection === "draft"
  }), "utf8");

  if (data.previousCollection && data.previousFile && (data.previousCollection !== collection || data.previousFile !== filename)) {
    try {
      await unlink(safePath(data.previousCollection, data.previousFile));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return { ok: true, collection, file: filename };
}

async function saveImage(data) {
  await mkdir(imagesDir, { recursive: true });
  const match = String(data.dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Only png, jpg, gif, and webp images are supported.");
  const ext = match[1].replace("image/", "").replace("jpeg", "jpg");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const base = slugify(String(data.name || `image.${ext}`).replace(/\.[^.]+$/, ""));
  const filename = `${stamp}-${base}.${ext}`;
  await writeFile(path.join(imagesDir, filename), Buffer.from(match[2], "base64"));
  return { ok: true, file: filename, url: `/assets/images/${filename}` };
}

function cmsHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Local Markdown CMS</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #111; background: #fff; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 16px; max-width: 1520px; margin: 22px auto 14px; padding: 0 20px; }
    h1 { margin: 0; font-size: 26px; font-weight: normal; }
    .status { min-height: 22px; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #444; text-align: right; }
    .change-panel { max-width: 1520px; margin: 0 auto 14px; padding: 0 20px; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #333; }
    .change-panel button { min-height: 28px; margin-left: 8px; padding: 0 8px; font-size: 13px; }
    .change-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .change-item { border: 1px solid #ddd; padding: 2px 6px; background: #fafafa; }
    main { display: grid; grid-template-columns: 260px minmax(320px, 1fr) minmax(320px, 1fr); gap: 18px; max-width: 1520px; min-height: calc(100vh - 84px); margin: 0 auto; padding: 0 20px 24px; }
    aside { border-right: 1px solid #ddd; padding-right: 14px; }
    .side-actions, .mode, .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .side-actions { margin-bottom: 10px; }
    .mode { margin-bottom: 10px; }
    .mode label { display: inline-flex; align-items: center; gap: 5px; font-size: 14px; }
    .search { margin: 10px 0; }
    .post-list { display: grid; gap: 6px; margin-top: 10px; }
    .post-list button { height: auto; min-height: 40px; text-align: left; white-space: normal; background: #fff; }
    .post-list button.active { border-color: #111; background: #f1f1f1; }
    .badge { display: inline-block; margin-right: 6px; font: 11px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #555; }
    .meta { display: grid; grid-template-columns: minmax(160px, 1.5fr) 150px minmax(140px, 1fr); gap: 10px; margin-bottom: 10px; }
    .seo-meta { display: grid; grid-template-columns: minmax(200px, 1fr) minmax(160px, 0.8fr); gap: 10px; margin-bottom: 10px; }
    label, label span { display: block; }
    label span { margin-bottom: 4px; font-size: 13px; color: #444; }
    input, textarea, button { font: inherit; }
    input, textarea { width: 100%; border: 1px solid #bbb; border-radius: 0; color: #111; background: #fff; }
    input { height: 38px; padding: 7px 9px; }
    textarea { display: block; height: calc(100vh - 178px); min-height: 500px; padding: 12px; resize: none; font: 15px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .viewer { display: flex; min-width: 0; flex-direction: column; border-left: 1px solid #ddd; padding-left: 18px; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; border-bottom: 1px solid #ddd; }
    .filename { overflow-wrap: anywhere; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #333; }
    button { min-height: 34px; border: 1px solid #999; padding: 0 10px; color: #111; background: #f7f7f7; cursor: pointer; }
    button:hover { background: #eee; }
    button.danger { border-color: #b44; color: #8b1111; background: #fff7f7; }
    button.danger:hover { background: #ffecec; }
    input[type=file] { display: none; }
    .preview { flex: 1; overflow: auto; padding: 16px 2px 0; font-size: 17px; line-height: 1.55; }
    .preview h1, .preview h2, .preview h3 { line-height: 1.25; }
    .preview h1 { margin-top: 0; }
    .preview img { max-width: 100%; height: auto; }
    .preview pre, .preview code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .preview pre { overflow-x: auto; padding: 12px; border: 1px solid #ccc; }
    .preview blockquote { margin-left: 0; padding-left: 16px; border-left: 3px solid #ccc; color: #333; }
    @media (max-width: 1040px) {
      header { display: block; }
      .status { margin-top: 8px; text-align: left; }
      main { grid-template-columns: 1fr; }
      aside, .viewer { border: 0; padding: 0; }
      aside { border-bottom: 1px solid #ddd; padding-bottom: 12px; }
      .meta { grid-template-columns: 1fr; }
      .seo-meta { grid-template-columns: 1fr; }
      textarea { height: 45vh; min-height: 340px; }
      .viewer { min-height: 50vh; border-top: 1px solid #ddd; padding-top: 12px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Local Markdown CMS</h1>
    <div class="status" id="status">localhost only</div>
  </header>
  <section class="change-panel" aria-label="Local changes">
    <span id="changeSummary">checking changes...</span>
    <button id="refreshStatus" type="button">Refresh</button>
    <div class="change-list" id="changeList"></div>
  </section>
  <main>
    <aside>
      <div class="side-actions">
        <button id="newPost" type="button">New</button>
        <button id="openBlog" type="button">Open Blog</button>
      </div>
      <label class="search"><span>Search</span><input id="search" type="search" autocomplete="off"></label>
      <div class="post-list" id="postList"></div>
    </aside>
    <form id="form">
      <div class="mode">
        <label><input type="radio" name="collection" value="post" checked> Published</label>
        <label><input type="radio" name="collection" value="draft"> Draft</label>
      </div>
      <div class="meta">
        <label><span>Title</span><input id="title" type="text" autocomplete="off" value="New Post"></label>
        <label><span>Date</span><input id="date" type="date"></label>
        <label><span>Slug</span><input id="slug" type="text" autocomplete="off" value="new-post"></label>
      </div>
      <div class="seo-meta">
        <label><span>Description</span><input id="description" type="text" autocomplete="off" maxlength="180"></label>
        <label><span>Tags</span><input id="tags" type="text" autocomplete="off" placeholder="essay, life"></label>
      </div>
      <label><span>Markdown</span><textarea id="body" spellcheck="true">Write in Markdown.</textarea></label>
      <input id="imageFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp">
    </form>
    <section class="viewer" aria-label="Preview">
      <div class="toolbar">
        <div class="filename" id="filename"></div>
        <div class="buttons">
          <button id="copy" type="button">Copy</button>
          <button id="save" type="button">Save</button>
          <button id="uploadImage" type="button">Image</button>
          <button id="previewPost" type="button">Preview</button>
          <button class="danger" id="deletePost" type="button">Delete</button>
          <button class="danger" id="deletePublish" type="button">Delete & Publish</button>
          <button id="publish" type="button">Publish</button>
        </div>
      </div>
      <article class="preview" id="preview" aria-live="polite"></article>
    </section>
  </main>
  <script>
    var token = new URLSearchParams(location.search).get("token") || "";
    var siteUrl = ${JSON.stringify(siteUrl)};
    var currentFile = "";
    var currentCollection = "post";
    var items = [];
    var els = {
      form: document.getElementById("form"),
      title: document.getElementById("title"),
      date: document.getElementById("date"),
      slug: document.getElementById("slug"),
      description: document.getElementById("description"),
      tags: document.getElementById("tags"),
      body: document.getElementById("body"),
      preview: document.getElementById("preview"),
      filename: document.getElementById("filename"),
      status: document.getElementById("status"),
      list: document.getElementById("postList"),
      search: document.getElementById("search"),
      imageFile: document.getElementById("imageFile")
      ,
      changeSummary: document.getElementById("changeSummary"),
      changeList: document.getElementById("changeList")
    };
    function today() { return new Date().toISOString().slice(0, 10); }
    function slugify(value) {
      return (value || "").normalize("NFKC").toLowerCase().trim().replace(/[^\\p{Letter}\\p{Number}]+/gu, "-").replace(/^-+|-+$/g, "") || "post";
    }
    function escapeHtml(value) {
      return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function inlineMarkdown(value) {
      return escapeHtml(value)
        .replace(/!\\[([^\\]]*)\\]\\(([^)]+)\\)/g, '<img alt="$1" src="$2">')
        .replace(/\`([^\`]+)\`/g, "<code>$1</code>")
        .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
        .replace(/\\*([^*]+)\\*/g, "<em>$1</em>")
        .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>');
    }
    function renderMarkdown(markdown) {
      var html = [], list = [], paragraph = [], code = [], inCode = false;
      function flushList() { if (!list.length) return; html.push("<ul>" + list.map(function (line) { return "<li>" + inlineMarkdown(line) + "</li>"; }).join("") + "</ul>"); list = []; }
      function flushParagraph() { if (!paragraph.length) return; html.push("<p>" + inlineMarkdown(paragraph.join(" ")) + "</p>"); paragraph = []; }
      markdown.split(/\\r?\\n/).forEach(function (line) {
        if (line.indexOf("\`\`\`") === 0) { if (inCode) { html.push("<pre><code>" + escapeHtml(code.join("\\n")) + "</code></pre>"); code = []; inCode = false; } else { flushList(); flushParagraph(); inCode = true; } return; }
        if (inCode) { code.push(line); return; }
        if (!line.trim()) { flushList(); flushParagraph(); return; }
        var heading = line.match(/^(#{1,3})\\s+(.+)$/);
        if (heading) { flushList(); flushParagraph(); html.push("<h" + heading[1].length + ">" + inlineMarkdown(heading[2]) + "</h" + heading[1].length + ">"); return; }
        var item = line.match(/^\\s*[-*]\\s+(.+)$/);
        if (item) { flushParagraph(); list.push(item[1]); return; }
        var quote = line.match(/^>\\s+(.+)$/);
        if (quote) { flushList(); flushParagraph(); html.push("<blockquote><p>" + inlineMarkdown(quote[1]) + "</p></blockquote>"); return; }
        paragraph.push(line.trim());
      });
      if (inCode) html.push("<pre><code>" + escapeHtml(code.join("\\n")) + "</code></pre>");
      flushList(); flushParagraph();
      return html.join("\\n");
    }
    function getCollection() {
      return document.querySelector('input[name="collection"]:checked').value;
    }
    function setCollection(value) {
      document.querySelectorAll('input[name="collection"]').forEach(function (radio) {
        radio.checked = radio.value === value;
      });
      currentCollection = value;
    }
    function getFilename() {
      var slug = slugify(els.slug.value || els.title.value);
      return getCollection() === "draft" ? slug + ".md" : els.date.value + "-" + slug + ".md";
    }
    function markdownFile() {
      var lines = ["---", "layout: post", 'title: "' + els.title.value.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"') + '"', "date: " + els.date.value];
      if (els.description.value.trim()) lines.push('description: "' + els.description.value.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"') + '"');
      var tags = els.tags.value.split(",").map(function (tag) { return tag.trim(); }).filter(Boolean);
      if (tags.length) lines.push("tags: [" + tags.map(function (tag) { return '"' + tag.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"') + '"'; }).join(", ") + "]");
      if (getCollection() === "draft") lines.push("published: false");
      lines.push("---", "", els.body.value.trim(), "");
      return lines.join("\\n");
    }
    function setStatus(text) { els.status.textContent = text; }
    function update() {
      els.filename.textContent = (getCollection() === "draft" ? "_drafts/" : "_posts/") + getFilename();
      var meta = "<p><time>" + escapeHtml(els.date.value) + "</time></p>";
      if (els.description.value.trim()) meta += "<p>" + inlineMarkdown(els.description.value) + "</p>";
      if (els.tags.value.trim()) meta += "<p>" + escapeHtml(els.tags.value) + "</p>";
      els.preview.innerHTML = "<h1>" + inlineMarkdown(els.title.value || "Untitled") + "</h1>" + meta + renderMarkdown(els.body.value);
      localStorage.setItem("blog-cms-draft", JSON.stringify({ title: els.title.value, date: els.date.value, slug: els.slug.value, description: els.description.value, tags: els.tags.value, body: els.body.value, collection: getCollection() }));
    }
    async function api(path, options) {
      var res = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "X-CMS-Token": token, ...(options && options.headers || {}) } });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    }
    async function refreshStatus() {
      var data = await api("/api/status");
      els.changeSummary.textContent = data.clean ? "No local blog changes" : data.count + " local blog change(s)";
      els.changeList.innerHTML = "";
      data.changes.forEach(function (change) {
        var item = document.createElement("span");
        item.className = "change-item";
        item.textContent = change.code + " " + change.path;
        els.changeList.appendChild(item);
      });
      return data;
    }
    function formatChanges(data) {
      if (!data || data.clean) return "No local blog changes.";
      return data.changes.map(function (change) { return change.code + " " + change.path; }).join("\\n");
    }
    function renderList() {
      var query = els.search.value.trim().toLowerCase();
      els.list.innerHTML = "";
      items.filter(function (item) {
        return !query || (item.title + " " + item.file + " " + item.collection).toLowerCase().indexOf(query) !== -1;
      }).forEach(function (post) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = post.file === currentFile && post.collection === currentCollection ? "active" : "";
        button.innerHTML = '<span class="badge">' + (post.collection === "draft" ? "DRAFT" : "POST") + "</span>" + escapeHtml(post.date + " " + post.title);
        button.onclick = async function () {
          var item = await api("/api/content?collection=" + encodeURIComponent(post.collection) + "&file=" + encodeURIComponent(post.file));
          els.title.value = item.title;
          els.date.value = item.date;
          els.slug.value = item.slug;
          els.description.value = item.description || "";
          els.tags.value = item.tags || "";
          els.body.value = item.body;
          currentFile = item.file;
          currentCollection = item.collection;
          setCollection(item.collection);
          update();
          renderList();
        };
        els.list.appendChild(button);
      });
    }
    async function loadList() {
      var data = await api("/api/content");
      items = data.items;
      renderList();
    }
    function newPost() {
      els.title.value = "New Post";
      els.date.value = today();
      els.slug.value = "new-post";
      els.description.value = "";
      els.tags.value = "";
      els.body.value = "Write in Markdown.";
      currentFile = "";
      currentCollection = getCollection();
      update();
      renderList();
    }
    function insertAtCursor(text) {
      var start = els.body.selectionStart || 0;
      var end = els.body.selectionEnd || 0;
      els.body.value = els.body.value.slice(0, start) + text + els.body.value.slice(end);
      els.body.focus();
      els.body.selectionStart = els.body.selectionEnd = start + text.length;
      update();
    }
    async function saveCurrent() {
      var data = await api("/api/content", { method: "POST", body: JSON.stringify({
        title: els.title.value,
        date: els.date.value,
        slug: els.slug.value,
        description: els.description.value,
        tags: els.tags.value,
        body: els.body.value,
        collection: getCollection(),
        previousCollection: currentFile ? currentCollection : "",
        previousFile: currentFile
      }) });
      currentFile = data.file;
      currentCollection = data.collection;
      setStatus("saved " + data.collection + " " + data.file);
      await loadList();
      await refreshStatus();
      return data;
    }
    async function deleteCurrent(shouldPublish) {
      var file = currentFile || getFilename();
      var collection = currentFile ? currentCollection : getCollection();
      if (!file || !confirm("Delete target:\\n" + collection + " " + file + "\\n\\nThis removes the local file.")) return;
      var data = await api("/api/content?collection=" + encodeURIComponent(collection) + "&file=" + encodeURIComponent(file), { method: "DELETE" });
      setStatus("deleted " + data.collection + " " + data.file);
      currentFile = "";
      newPost();
      await loadList();
      await refreshStatus();
      if (shouldPublish) {
        var pending = await refreshStatus();
        if (!confirm("Delete & Publish will push these changes:\\n\\n" + formatChanges(pending))) return;
        setStatus("publishing delete...");
        var published = await api("/api/publish", { method: "POST", body: "{}" });
        setStatus(published.output || "deleted and published");
        await refreshStatus();
        window.open(siteUrl, "_blank", "noopener");
      }
    }
    document.getElementById("newPost").onclick = newPost;
    document.getElementById("openBlog").onclick = function () { window.open(siteUrl, "_blank", "noopener"); };
    document.getElementById("copy").onclick = function () { navigator.clipboard.writeText(markdownFile()).then(function () { setStatus("copied"); }); };
    document.getElementById("save").onclick = function () { saveCurrent().catch(function (error) { setStatus(error.message); }); };
    document.getElementById("deletePost").onclick = function () { deleteCurrent(false).catch(function (error) { setStatus(error.message); }); };
    document.getElementById("deletePublish").onclick = function () { deleteCurrent(true).catch(function (error) { setStatus(error.message); }); };
    document.getElementById("publish").onclick = async function () {
      try {
        var pending = await refreshStatus();
        if (pending.clean) {
          setStatus("nothing to publish");
          return;
        }
        if (!confirm("Publish these changes:\\n\\n" + formatChanges(pending))) return;
        setStatus("publishing...");
        var data = await api("/api/publish", { method: "POST", body: "{}" });
        setStatus(data.output || "published");
        await refreshStatus();
        window.open(siteUrl, "_blank", "noopener");
      } catch (error) { setStatus(error.message); }
    };
    document.getElementById("uploadImage").onclick = function () { els.imageFile.click(); };
    document.getElementById("previewPost").onclick = function () {
      window.open(siteUrl + "/" + els.date.value.slice(0, 4) + "/" + els.date.value.slice(5, 7) + "/" + els.date.value.slice(8, 10) + "/" + slugify(els.slug.value || els.title.value) + "/", "_blank", "noopener");
    };
    els.imageFile.onchange = function () {
      var file = els.imageFile.files && els.imageFile.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = async function () {
        try {
          var data = await api("/api/image", { method: "POST", body: JSON.stringify({ name: file.name, dataUrl: reader.result }) });
          insertAtCursor("\\n![" + file.name.replace(/\\.[^.]+$/, "") + "](" + data.url + ")\\n");
          setStatus("image " + data.file);
          await refreshStatus();
        } catch (error) { setStatus(error.message); }
      };
      reader.readAsDataURL(file);
      els.imageFile.value = "";
    };
    els.form.addEventListener("input", update);
    els.search.addEventListener("input", renderList);
    document.getElementById("refreshStatus").onclick = function () {
      refreshStatus().catch(function (error) { setStatus(error.message); });
    };
    document.querySelectorAll('input[name="collection"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        update();
      });
    });
    (function init() {
      els.date.value = today();
      try {
        var draft = JSON.parse(localStorage.getItem("blog-cms-draft") || "null");
        if (draft) {
          els.title.value = draft.title || els.title.value;
          els.date.value = draft.date || els.date.value;
          els.slug.value = draft.slug || els.slug.value;
          els.description.value = draft.description || els.description.value;
          els.tags.value = draft.tags || els.tags.value;
          els.body.value = draft.body || els.body.value;
          setCollection(draft.collection || "post");
        }
      } catch (error) {}
      update();
      loadList().catch(function (error) { setStatus(error.message); });
      refreshStatus().catch(function (error) { setStatus(error.message); });
    }());
  </script>
</body>
</html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  try {
    if (url.pathname === "/" || url.pathname === "/cms") {
      res.writeHead(302, { Location: `/cms/?token=${token}` });
      res.end();
      return;
    }
    if (url.pathname === "/cms/") {
      send(res, 200, cmsHtml());
      return;
    }
    if (!auth(req, url)) {
      send(res, 401, { error: "Unauthorized CMS token." });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/content") {
      const file = url.searchParams.get("file");
      if (!file) {
        send(res, 200, { items: await listContent() });
        return;
      }
      const collection = url.searchParams.get("collection") === "draft" ? "draft" : "post";
      const markdown = await readFile(safePath(collection, file), "utf8");
      const parsed = readFrontMatter(markdown);
      send(res, 200, {
        collection,
        file,
        title: parsed.data.title || parseTitle(markdown, file),
        date: parsed.data.date || parseDate(markdown, file),
        slug: parseSlug(file),
        description: parsed.data.description || "",
        tags: parsed.data.tags || "",
        body: parsed.body
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      send(res, 200, await gitStatus());
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/content") {
      send(res, 200, await saveContent(await readJson(req)));
      return;
    }
    if (req.method === "DELETE" && url.pathname === "/api/content") {
      const collection = url.searchParams.get("collection") === "draft" ? "draft" : "post";
      const file = url.searchParams.get("file") || "";
      await unlink(safePath(collection, file));
      send(res, 200, { ok: true, collection, file });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/posts") {
      send(res, 200, { posts: (await listCollection("post")) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/post") {
      const file = url.searchParams.get("file") || "";
      const markdown = await readFile(safePath("post", file), "utf8");
      const parsed = readFrontMatter(markdown);
      send(res, 200, {
        file,
        title: parsed.data.title || parseTitle(markdown, file),
        date: parsed.data.date || parseDate(markdown, file),
        slug: parseSlug(file),
        description: parsed.data.description || "",
        tags: parsed.data.tags || "",
        body: parsed.body
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/posts") {
      const saved = await saveContent({ ...(await readJson(req)), collection: "post" });
      send(res, 200, { ok: true, file: saved.file });
      return;
    }
    if (req.method === "DELETE" && url.pathname === "/api/post") {
      const file = url.searchParams.get("file") || "";
      await unlink(safePath("post", file));
      send(res, 200, { ok: true, file });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/image") {
      send(res, 200, await saveImage(await readJson(req)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/publish") {
      send(res, 200, { ok: true, output: await publish() });
      return;
    }
    send(res, 404, { error: "Not found." });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

function listen(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.BLOG_CMS_PORT && port < 8799) {
      listen(port + 1);
      return;
    }
    console.error(error.message);
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`Local Markdown CMS: http://${host}:${port}/cms/?token=${token}`);
    console.log("Bound to 127.0.0.1 only. Keep this terminal open while writing.");
  });
}

await mkdir(postsDir, { recursive: true });
await mkdir(draftsDir, { recursive: true });
await mkdir(imagesDir, { recursive: true });
listen(preferredPort);
