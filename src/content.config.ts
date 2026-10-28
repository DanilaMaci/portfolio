import { defineCollection } from 'astro:content';
import { glob, type Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import { showDrafts } from './lib/site';

// The standard glob loader, plus one step: in a build (not `npm run dev`) draft entries are removed from the
// content store. Filtering in the pages alone is not enough: Astro bundles every image that any stored entry
// references, so draft images would still be copied into dist/_astro/.
const markdown = glob({ pattern: '**/*.md', base: './src/content/projects' });
const projectsLoader: Loader = {
  name: 'projects-without-drafts-in-build',
  load: async (context) => {
    await markdown.load(context);
    if (showDrafts) return;
    for (const entry of context.store.values()) if (entry.data.draft) context.store.delete(entry.id);
  },
};

const projects = defineCollection({
  loader: projectsLoader,
  // `image` comes from Astro: it resolves a path relative to the .md file (e.g. ../../assets/projects/x.jpg)
  // and lets the build resize/convert it.
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        summary: z.string(),
        problem: z.string(),
        role: z.string(),
        tracks: z.array(z.enum(['software', 'embedded', 'data'])).min(1),
        stack: z.array(z.string()),
        result: z.string().optional(),
        // https only: the schema is the only check on these hrefs (z.url() alone accepts javascript: and data:)
        repo: z.url({ protocol: /^https$/ }).optional(),
        live: z.url({ protocol: /^https$/ }).optional(),
        // Cover image: the project card and the top of the project page.
        image: image().optional(),
        imageAlt: z.string().optional(),
        // More screenshots or figures, shown on the project page.
        gallery: z.array(z.object({ image: image(), alt: z.string(), caption: z.string().optional() })).optional(),
        // A short demo clip. Files go in public/media/<slug>/ (public files are copied to the build as they are, so
        // add one only when the project is published; tests/build.test.mjs fails if a draft has a media folder).
        // The caption says what the clip shows, for visitors who cannot play it.
        video: z
          .object({
            src: z.string().regex(/^\/media\/[a-z0-9-]+\/[\w.-]+\.(mp4|webm)$/),
            poster: image().optional(),
            caption: z.string(),
            // WebVTT captions for clips with speech (same folder), e.g. /media/<slug>/demo.en.vtt; silent clips need none
            captions: z.string().regex(/^\/media\/[a-z0-9-]+\/[\w.-]+\.vtt$/).optional(),
          })
          .optional(),
        // Extra links (a write-up, a PDF, a video hosted elsewhere).
        links: z.array(z.object({ label: z.string(), url: z.url({ protocol: /^https$/ }) })).optional(),
        order: z.number(),
        draft: z.boolean().default(false),
      })
      .refine((d) => d.draft || d.live || d.repo, { message: 'projects go on the site only once live or with a public repo', path: ['live'] })
      .refine((d) => !d.image || d.imageAlt, { message: 'imageAlt is required when image is set', path: ['imageAlt'] }),
});

export const collections = { projects };
