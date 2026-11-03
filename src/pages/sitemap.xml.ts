import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { SITE, pages } from "../data/site";

export const GET: APIRoute = async () => {
  const posts = await getCollection("blog");
  const urls = [
    ...pages.map((page) => ({ loc: `${SITE}${page.path === "/" ? "/" : page.path}`, lastmod: page.lastmod })),
    ...posts.map((post) => ({
      loc: `${SITE}/blog/${post.id}.html`,
      lastmod: post.data.date.toISOString().slice(0, 10),
    })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
