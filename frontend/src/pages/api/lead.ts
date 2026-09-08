import type { APIRoute } from 'astro';
import { validateLead } from '../../lib/validation';
import { rateLimit } from '../../lib/rate-limit';

export const prerender = false;

/** Телеграм ломается на этих символах в HTML-разметке сообщения */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const json = (body: unknown, status: number, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // 1. Частота
  const ip = clientAddress || request.headers.get('x-forwarded-for') || 'unknown';
  const limit = rateLimit(ip);
  if (!limit.allowed) {
    return json({ error: 'rate' }, 429, { 'retry-after': String(limit.retryAfterSec) });
  }

  // 2. Разбор тела
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  // 3. Проверка полей — та же схема, что и на клиенте
  const { ok, errors, data, trap } = validateLead(payload);

  // 4. Honeypot: боту отвечаем успехом, чтобы он не искал обход,
  //    но никуда ничего не отправляем.
  if (trap) return json({ ok: true }, 200);

  if (!ok) return json({ error: 'validation', fields: errors }, 422);

  // 5. Отправка в Telegram
  const token = import.meta.env.TELEGRAM_BOT_TOKEN;
  const chatId = import.meta.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    // Переменные не заданы — заявку принять не можем. Врать «успешно»
    // нельзя: человек будет ждать звонка, которого никто не сделает.
    console.error('[lead] TELEGRAM_BOT_TOKEN або TELEGRAM_CHAT_ID не задані');
    return json({ error: 'not_configured' }, 503);
  }

  const lines = [
    '<b>Нова заявка з сайту</b>',
    '',
    `<b>Імʼя:</b> ${esc(data.name)}`,
    `<b>Телефон:</b> ${esc(data.tel)}`,
    data.loc && `<b>Ділянка:</b> ${esc(data.loc)}`,
    data.area && `<b>Площа:</b> ${esc(data.area)} м²`,
    data.msg && `<b>Коментар:</b> ${esc(data.msg)}`,
  ].filter(Boolean);

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!tg.ok) {
      // Тело ответа Telegram пишем в лог, но наружу не отдаём —
      // в нём может быть кусок токена.
      console.error('[lead] Telegram відповів', tg.status, await tg.text().catch(() => ''));
      return json({ error: 'delivery' }, 502);
    }
  } catch (e) {
    console.error('[lead] не вдалося достукатись до Telegram:', e);
    return json({ error: 'delivery' }, 502);
  }

  return json({ ok: true }, 200);
};

/** На всё, кроме POST, отвечаем честным 405 вместо 404 */
export const ALL: APIRoute = () =>
  json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
