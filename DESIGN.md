# Chad Keith site

Personal site for Chad Keith. The company site is Atlas and stays in its own repo.

## Purpose

This site is the personal brand: who Chad is, the work behind Atlas, and the side projects. Business inquiries go to Atlas. Traffic is measured on the Chad Keith Analytics property, measurement id `G-LF5HT5CLF7`.

## Structure

One layout owns the header, footer, analytics tag, and page metadata. Pages keep the existing `.html` addresses so Search Console and the sitemap stay valid. Blog posts live in `src/content/blog`. The build publishes `dist/` only. `synology-dashboard/` stays in the repo and is not part of the site.

## Voice and links

Write in the first person. Link the company as Atlas Technology Solutions at https://atlascarolina.com, and the AI practice at https://atlassolutions.tech. The nav and footer always include Atlas.

## Visual

Keep the current personal look: white paper, Apple-like type, blue accent `#0071e3`, 18px cards. Motion is about 200ms. Turn motion off when the visitor prefers reduced motion. Links show a visible focus outline.

## Before publish

`npm run build` then `npm run check`. The check confirms one H1, the canonical URL, the analytics tag, an Atlas link, the sitemap, and that the dashboard is not in `dist/`.
