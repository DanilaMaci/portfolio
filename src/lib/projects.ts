import { getCollection } from 'astro:content';
import { showDrafts } from './site';

// Drafts are visible only in `npm run dev`; the build gets live (non-draft) projects only.
export async function getVisibleProjects() {
  const all = await getCollection('projects', ({ data }) => showDrafts || !data.draft);
  return all.sort((a, b) => a.data.order - b.data.order);
}
