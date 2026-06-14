import { readFile } from "node:fs/promises";

const config = await readFile("_config.yml", "utf8");
const layout = await readFile("_layouts/default.html", "utf8");
const robots = await readFile("robots.txt", "utf8");
const sitemap = await readFile("sitemap.xml", "utf8");

const siteUrl = config.match(/^url:\s*["']?([^"'\r\n]+)/m)?.[1] || "";
const verification = config.match(/^google_site_verification:\s*["']?([^"'\r\n]*)/m)?.[1]?.trim() || "";
const hasHook = layout.includes('name="google-site-verification"') && /^google_site_verification:/m.test(config);
const hasSitemap = sitemap.includes("<urlset") && sitemap.includes("site.posts");
const robotsPointsToSitemap = robots.includes("Sitemap: {{ '/sitemap.xml' | absolute_url }}");

const checks = [
  ["site url", /^https:\/\/[^/]+/.test(siteUrl)],
  ["verification meta hook", hasHook],
  ["sitemap template", hasSitemap],
  ["robots sitemap pointer", robotsPointsToSitemap]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}

if (verification) {
  console.log("PASS verification token configured");
} else {
  console.log("TODO verification token missing");
  console.log("Add the Search Console HTML tag content value to google_site_verification in _config.yml.");
}

if (siteUrl) {
  console.log(`Sitemap: ${siteUrl.replace(/\/$/, "")}/sitemap.xml`);
}

if (failed) {
  process.exitCode = 1;
}
