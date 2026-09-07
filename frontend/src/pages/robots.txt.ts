import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site ?? 'https://example.com').toString();
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${sitemap}\n`,
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
};
