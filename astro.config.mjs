import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://danilamacijauskas.dev', // canonical + og:url are built from this (domain not bought yet)
  trailingSlash: 'always',
  // assetsInlineLimit 0: Vite never inlines files as data: URIs; stylesheets stay external too (inlineStylesheets).
  // Together with the base-layout rules this keeps every script and style an external file (no inline scripts).
  vite: { build: { assetsInlineLimit: 0 } },
  build: { format: 'directory', inlineStylesheets: 'never' },
});
