// Single source for facts used by both the page and the terminal (nav, section headings, about text, profile links).
export const sections = [
  { id: 'about', title: 'About' },
  { id: 'projects', title: 'Projects' },
  { id: 'path', title: 'Path' },
  { id: 'skills', title: 'Skills' },
  { id: 'contact', title: 'Contact' },
];
export const github = 'https://github.com/DanilaMaci';
export const linkedin = 'https://www.linkedin.com/in/macijaud/';
// The first sentence of the story on the home page; the terminal prints it for `about`.
// Keep it free of & < " and ' (it must appear verbatim in the HTML; tests/story.test.mjs checks).
export const about =
  'I am finishing a conversion MSc in Computer Science at University College Dublin, after a BA in Economics at Trinity College Dublin.';
// The contact form needs the /api/contact Function (a later stage). Until then no form is rendered.
export const contactFormEnabled = false;
// Drafts show only in `npm run dev`; builds get live projects only. Used by content.config.ts and projects.ts.
export const showDrafts = import.meta.env.DEV;
