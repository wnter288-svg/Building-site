// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

/**
 * Рендер серверный: страница статична, но эндпоинт /api/lead должен
 * выполняться на сервере — токен Telegram нельзя отдавать в браузер.
 * Astro сам отдаст статические маршруты как статику, а API — как функцию.
 */
export default defineConfig({
  site: 'https://dimora.vercel.app', // TODO: заменить на реальный домен
  output: 'server',
  adapter: vercel(),
  integrations: [sitemap()],
  prefetch: { prefetchAll: false },
  build: { inlineStylesheets: 'auto' },
});
