import { readFile, readdir } from "node:fs/promises";

const requiredInLayout = [
  "rel=\"canonical\"",
  "name=\"description\"",
  "name=\"robots\"",
  "property=\"og:title\"",
  "property=\"og:description\"",
  "property=\"og:url\"",
  "name=\"twitter:card\"",
  "application/ld+json"
];

const layout = await readFile("_layouts/default.html", "utf8");
const config = await readFile("_config.yml", "utf8");
const robots = await readFile("robots.txt", "utf8");
const sitemap = await readFile("sitemap.xml", "utf8");
const posts = (await readdir("_posts")).filter((file) => file.endsWith(".md"));

const checks = [
  ["site url", /^url:\s*["']?https:\/\/[^"'\r\n]+/m.test(config)],
  ["site description", /^description:\s*["']?.{10,}/m.test(config)],
  ["site author", /^author:\s*["']?.+/m.test(config)],
  ["site lang", /^lang:\s*["']?ko/m.test(config)],
  ["search console verification hook", /^google_site_verification:/m.test(config) && layout.includes('name="google-site-verification"')],
  ["robots sitemap", robots.includes("Sitemap: {{ '/sitemap.xml' | absolute_url }}")],
  ["sitemap urlset", sitemap.includes("<urlset") && sitemap.includes("site.posts")],
  ...requiredInLayout.map((needle) => [`layout ${needle}`, layout.includes(needle)])
];

for (const post of posts) {
  const markdown = await readFile(`_posts/${post}`, "utf8");
  checks.push([`${post} title`, /^title:\s*["']?.+["']?\s*$/m.test(markdown)]);
}

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}

if (failed) {
  process.exitCode = 1;
}
