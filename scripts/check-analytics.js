import { readFile } from "node:fs/promises";

const config = await readFile("_config.yml", "utf8");
const layout = await readFile("_layouts/default.html", "utf8");
const live = process.argv.includes("--live");
const idMatch = config.match(/^google_analytics:\s*["']?([^"'\r\n]*)["']?\s*$/m);
const urlMatch = config.match(/^url:\s*["']?([^"'\r\n]*)["']?\s*$/m);
const measurementId = idMatch ? idMatch[1].trim() : "";
const siteUrl = urlMatch ? urlMatch[1].trim() : "";
const hasValidId = /^G-[A-Z0-9]+$/i.test(measurementId);
const hasGtagScript = layout.includes("https://www.googletagmanager.com/gtag/js?id={{ site.google_analytics }}");
const hasConfigCall = layout.includes("gtag('config', '{{ site.google_analytics }}')");
const productionOnly = layout.includes('jekyll.environment == "production"') && layout.includes("site.google_analytics");
let liveHasScript = null;
let liveHasConfig = null;

console.log(`Measurement ID: ${measurementId || "(missing)"}`);
console.log(`Valid GA4 ID: ${hasValidId ? "yes" : "no"}`);
console.log(`gtag script hook: ${hasGtagScript ? "yes" : "no"}`);
console.log(`gtag config hook: ${hasConfigCall ? "yes" : "no"}`);
console.log(`production-only guard: ${productionOnly ? "yes" : "no"}`);

if (live) {
  if (!siteUrl) {
    console.log("Live site URL: (missing)");
  } else {
    const response = await fetch(siteUrl, { cache: "no-store" });
    const html = await response.text();
    liveHasScript = html.includes(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`);
    liveHasConfig = html.includes(`gtag('config', '${measurementId}')`);
    console.log(`Live site: ${siteUrl}`);
    console.log(`Live gtag script: ${liveHasScript ? "yes" : "no"}`);
    console.log(`Live gtag config: ${liveHasConfig ? "yes" : "no"}`);
  }
}

if (!hasValidId || !hasGtagScript || !hasConfigCall || !productionOnly || (live && (!liveHasScript || !liveHasConfig))) {
  process.exitCode = 1;
}
