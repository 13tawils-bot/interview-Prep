// Builds the static site for GitHub Pages into _site/:
//   /gym/      Fuel Log as an installable app (PWA)
//   /outfits/  Full Look outfit builder
// The page sources are written as Claude artifacts (no <html>/<head>), so this
// wraps each one in a full document.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "_site");
rmSync(out, { recursive: true, force: true });

const RESET = `<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>`;

// Head-only tags (title, meta, link, style) lead each source; the rest is body.
function wrap(src, extraHead = "", extraBody = "") {
  const i = src.search(/\n<(div|main|header|nav)[\s>]/);
  const head = src.slice(0, i), body = src.slice(i);
  return `<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n${RESET}\n${head}\n${extraHead}\n</head>\n<body>${body}\n${extraBody}\n</body>\n</html>\n`;
}

// Fuel Log
const gym = join(out, "gym");
mkdirSync(gym, { recursive: true });
const gymSrc = readFileSync(join(root, "gym-tracker/index.html"), "utf8");
const nutrition = readFileSync(join(root, "gym-tracker/nutrition.js"), "utf8");
writeFileSync(join(gym, "index.html"), wrap(gymSrc, `<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#F3F4F2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121315" media="(prefers-color-scheme: dark)">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Fuel Log">
<meta name="apple-mobile-web-app-status-bar-style" content="default">`,
`<script>
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
// Ask the browser not to clear the log when space is short.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
</script>`));
writeFileSync(join(gym, "nutrition.js"), nutrition);
// Supporting scripts, copied as-is; their contents feed the offline cache version.
const extras = ["commonfoods.js", "exercises.js", "workouts.js", "train.js"].map((f) => {
  const text = readFileSync(join(root, "gym-tracker", f), "utf8");
  writeFileSync(join(gym, f), text);
  return text;
});
const common = extras.join("");
cpSync(join(root, "gym-tracker/pwa/icons"), join(gym, "icons"), { recursive: true });
cpSync(join(root, "gym-tracker/pwa/manifest.webmanifest"), join(gym, "manifest.webmanifest"));
const version = createHash("sha256").update(gymSrc + nutrition + common + readFileSync(join(root, "gym-tracker/pwa/sw.js"))).digest("hex").slice(0, 10);
writeFileSync(join(gym, "sw.js"), readFileSync(join(root, "gym-tracker/pwa/sw.js"), "utf8").replace("__VERSION__", version));

// Full Look
const fit = join(out, "outfits");
mkdirSync(fit, { recursive: true });
writeFileSync(join(fit, "index.html"), wrap(readFileSync(join(root, "outfit-builder/index.html"), "utf8")));
for (const f of ["catalogue.js", "engine.js"]) cpSync(join(root, "outfit-builder", f), join(fit, f));

// Landing page
writeFileSync(join(out, "index.html"), `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Apps</title>
<style>body{font:16px system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 16px;line-height:1.5}a{display:block;margin:.5rem 0}</style></head>
<body><h1>Apps</h1><a href="gym/">Fuel Log: weight and nutrition tracker</a><a href="outfits/">Full Look: outfit builder</a></body></html>\n`);
writeFileSync(join(out, ".nojekyll"), "");
console.log(`Built _site (Fuel Log cache ${version})`);
