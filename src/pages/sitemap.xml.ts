// /sitemap.xml for search engines: the home page plus every published project (drafts are not in the build).
import type { APIRoute } from 'astro';
import { getVisibleProjects } from '../lib/projects';

export const GET: APIRoute = async ({ site }) => {
  const paths = ['/', ...(await getVisibleProjects()).map((p) => `/projects/${p.id}/`)];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
