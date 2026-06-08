(function () {
  var storageKey = "solarone0.cms.draft";
  var form = document.getElementById("post-form");
  var title = document.getElementById("post-title");
  var date = document.getElementById("post-date");
  var slug = document.getElementById("post-slug");
  var body = document.getElementById("post-body");
  var preview = document.getElementById("post-preview");
  var fileName = document.getElementById("file-name");
  var copyButton = document.getElementById("copy-md");
  var downloadButton = document.getElementById("download-md");

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function slugify(value) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "") || "post";
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inlineMarkdown(value) {
    var escaped = escapeHtml(value);
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return escaped;
  }

  function flushList(lines, html) {
    if (!lines.length) {
      return;
    }

    html.push("<ul>");
    lines.forEach(function (line) {
      html.push("<li>" + inlineMarkdown(line) + "</li>");
    });
    html.push("</ul>");
    lines.length = 0;
  }

  function renderMarkdown(markdown) {
    var html = [];
    var list = [];
    var paragraph = [];
    var code = [];
    var inCode = false;

    function flushParagraph() {
      if (!paragraph.length) {
        return;
      }

      html.push("<p>" + inlineMarkdown(paragraph.join(" ")) + "</p>");
      paragraph.length = 0;
    }

    markdown.split(/\r?\n/).forEach(function (line) {
      if (line.indexOf("```") === 0) {
        if (inCode) {
          html.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
          code.length = 0;
          inCode = false;
        } else {
          flushList(list, html);
          flushParagraph();
          inCode = true;
        }
        return;
      }

      if (inCode) {
        code.push(line);
        return;
      }

      if (!line.trim()) {
        flushList(list, html);
        flushParagraph();
        return;
      }

      var heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushList(list, html);
        flushParagraph();
        html.push("<h" + heading[1].length + ">" + inlineMarkdown(heading[2]) + "</h" + heading[1].length + ">");
        return;
      }

      var item = line.match(/^\s*[-*]\s+(.+)$/);
      if (item) {
        flushParagraph();
        list.push(item[1]);
        return;
      }

      var quote = line.match(/^>\s+(.+)$/);
      if (quote) {
        flushList(list, html);
        flushParagraph();
        html.push("<blockquote><p>" + inlineMarkdown(quote[1]) + "</p></blockquote>");
        return;
      }

      paragraph.push(line.trim());
    });

    if (inCode) {
      html.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
    }
    flushList(list, html);
    flushParagraph();
    return html.join("\n");
  }

  function filename() {
    return date.value + "-" + slugify(slug.value || title.value) + ".md";
  }

  function markdownFile() {
    return [
      "---",
      "layout: post",
      'title: "' + title.value.replace(/"/g, '\\"') + '"',
      "---",
      "",
      body.value.trim(),
      ""
    ].join("\n");
  }

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify({
      title: title.value,
      date: date.value,
      slug: slug.value,
      body: body.value
    }));
  }

  function update() {
    if (!slug.value.trim()) {
      slug.value = slugify(title.value);
    }

    var renderedTitle = title.value.trim() || "Untitled";
    fileName.value = "_posts/" + filename();
    preview.innerHTML = "<h1>" + inlineMarkdown(renderedTitle) + "</h1>\n<p><time>" + escapeHtml(date.value) + "</time></p>\n" + renderMarkdown(body.value);
    persist();
  }

  function loadDraft() {
    var saved = localStorage.getItem(storageKey);
    if (!date.value) {
      date.value = today();
    }

    if (!saved) {
      return;
    }

    try {
      saved = JSON.parse(saved);
      title.value = saved.title || title.value;
      date.value = saved.date || date.value;
      slug.value = saved.slug || slug.value;
      body.value = saved.body || body.value;
    } catch (error) {
      localStorage.removeItem(storageKey);
    }
  }

  function copyMarkdown() {
    navigator.clipboard.writeText(markdownFile()).then(function () {
      copyButton.textContent = "Copied";
      window.setTimeout(function () {
        copyButton.textContent = "Copy MD";
      }, 1200);
    });
  }

  function downloadMarkdown() {
    var blob = new Blob([markdownFile()], { type: "text/markdown;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  loadDraft();
  update();

  form.addEventListener("input", update);
  copyButton.addEventListener("click", copyMarkdown);
  downloadButton.addEventListener("click", downloadMarkdown);
}());
