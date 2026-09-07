/**
 * Одна схема заявки на клиент и на сервер. Клиентская проверка нужна,
 * чтобы человек увидел ошибку сразу; серверная — потому что клиентскую
 * обходят за минуту через любой HTTP-клиент.
 */

export interface LeadInput {
  name?: unknown;
  tel?: unknown;
  loc?: unknown;
  area?: unknown;
  msg?: unknown;
  consent?: unknown;
  website?: unknown; // honeypot
}

export interface LeadClean {
  name: string;
  tel: string;
  loc: string;
  area: string;
  msg: string;
}

export type FieldErrors = Partial<Record<'name' | 'tel' | 'consent', string>>;

export const MESSAGES = {
  name: 'Вкажіть, як до вас звертатись',
  tel: 'Вкажіть телефон у форматі +380 XX XXX XX XX',
  consent: 'Потрібна згода на обробку даних',
} as const;

const LIMITS = { name: 80, tel: 32, loc: 120, area: 20, msg: 1000 } as const;

const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/**
 * Украинский номер: +380 и девять цифр. Принимаем и запись через 0
 * в начале (0XX...) — люди набирают и так, и так.
 */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (/^380\d{9}$/.test(d)) return `+${d}`;
  if (/^0\d{9}$/.test(d)) return `+38${d}`;
  return null;
}

export function validateLead(input: LeadInput): {
  ok: boolean;
  errors: FieldErrors;
  data: LeadClean;
  trap: boolean;
} {
  const errors: FieldErrors = {};

  const name = str(input.name, LIMITS.name);
  const telRaw = str(input.tel, LIMITS.tel);
  const tel = normalizePhone(telRaw);

  if (name.length < 2) errors.name = MESSAGES.name;
  if (!tel) errors.tel = MESSAGES.tel;
  if (input.consent !== true && input.consent !== 'on' && input.consent !== 'true') {
    errors.consent = MESSAGES.consent;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      name,
      tel: tel ?? telRaw,
      loc: str(input.loc, LIMITS.loc),
      area: str(input.area, LIMITS.area),
      msg: str(input.msg, LIMITS.msg),
    },
    // Скрытое поле заполнено — почти наверняка бот
    trap: str(input.website, 100).length > 0,
  };
}
