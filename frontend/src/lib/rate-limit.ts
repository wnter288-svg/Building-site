/**
 * Простое ограничение частоты по IP: не больше N заявок за окно.
 *
 * Память процесса, без внешнего хранилища. На бессерверном Vercel это
 * значит, что счётчик живёт, пока жив инстанс, и у каждого инстанса он
 * свой. От массового залива формы ботами этого достаточно; от
 * распределённой атаки — нет, но её здесь и не ждём. Понадобится
 * жёстче — ставим Upstash Redis, интерфейс не изменится.
 */
const WINDOW_MS = 10 * 60 * 1000; // 10 минут
const MAX_HITS = 5;

const hits = new Map<string, number[]>();

export function rateLimit(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_HITS) {
    const oldest = recent[0] ?? now;
    return { allowed: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - oldest)) / 1000) };
  }

  recent.push(now);
  hits.set(ip, recent);

  // Подчищаем чужие протухшие записи, чтобы карта не росла бесконечно
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }

  return { allowed: true, retryAfterSec: 0 };
}
