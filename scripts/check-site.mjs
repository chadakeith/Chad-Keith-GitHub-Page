import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const pages = [
  ["index.html", "https://chadwickkeith.com/"],
  ["about.html", "https://chadwickkeith.com/about.html"],
  ["experience.html", "https://chadwickkeith.com/experience.html"],
  ["services.html", "https://chadwickkeith.com/services.html"],
  ["credentials.html", "https://chadwickkeith.com/credentials.html"],
  ["tools.html", "https://chadwickkeith.com/tools.html"],
  ["blog/index.html", "https://chadwickkeith.com/blog/"],
  ["blog/the-begining.html", "https://chadwickkeith.com/blog/the-begining.html"],
  ["blog/false-start.html", "https://chadwickkeith.com/blog/false-start.html"],
  ["blog/bottom-of-the-list.html", "https://chadwickkeith.com/blog/bottom-of-the-list.html"],
  ["blog/know-your-audience-nascar-christians.html", "https://chadwickkeith.com/blog/know-your-audience-nascar-christians.html"],
  ["blog/my-murphy.html", "https://chadwickkeith.com/blog/my-murphy.html"],
  ["blog/why-do-millennials-quit-everything.html", "https://chadwickkeith.com/blog/why-do-millennials-quit-everything.html"],
];

const failures = [];

function fail(message) {
  failures.push(message);
}

if (existsSync(join(root, "synology-dashboard"))) {
  fail("synology-dashboard was published");
}

let css = "";
for (const page of pages) {
  const [file, canonical] = page;
  if (!existsSync(join(root, file))) {
    fail(`missing ${file}`);
    continue;
  }
  const html = read(file);
  const h1 = html.match(/<h1[\s>]/g) || [];
  if (h1.length !== 1) fail(`${file} has ${h1.length} h1 elements`);
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) {
    fail(`${file} canonical is not ${canonical}`);
  }
  if (!html.includes("G-LF5HT5CLF7")) fail(`${file} is missing the Chad Keith analytics tag`);
  if (!html.includes("https://atlascarolina.com")) fail(`${file} does not link to Atlas`);
  if (/name="keywords"/.test(html)) fail(`${file} still has a keywords meta tag`);
  const style = html.match(/href="(\/_astro\/[^"]+\.css)"/);
  if (!style) fail(`${file} is missing the built stylesheet`);
  else if (!css) css = read(style[1].slice(1));
}

if (!css.includes("prefers-reduced-motion")) fail("built CSS has no reduced-motion rule");

const sitemap = read("sitemap.xml");
for (const [, canonical] of pages) {
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) fail(`sitemap missing ${canonical}`);
}
if (!sitemap.includes("https://chadwickkeith.com/robots.txt") && !existsSync(join(root, "robots.txt"))) {
  fail("robots.txt missing");
}
const robots = read("robots.txt");
if (!robots.includes("Sitemap: https://chadwickkeith.com/sitemap.xml")) {
  fail("robots.txt does not point at the sitemap");
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".html") && full.includes("synology")) fail(full);
  }
}
walk(root);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Checked ${pages.length} pages, sitemap, robots, analytics, and Atlas links.`);
