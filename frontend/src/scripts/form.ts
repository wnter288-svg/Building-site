/**
 * Отправка заявки. Проверяем на клиенте той же схемой, что и на сервере,
 * показываем состояния и человеческие сообщения об ошибках.
 * Никаких alert() — всё через живую область под кнопкой.
 */
import { validateLead, type FieldErrors } from '../lib/validation';

const TEXT = {
  submit: 'Надіслати заявку',
  submitting: 'Надсилаємо…',
  note: 'Відповідаємо в робочі години',
  success: 'Дякуємо — заявку надіслано. Зателефонуємо впродовж робочого дня.',
  network: 'Не вдалося надіслати. Перевірте зʼєднання і спробуйте ще раз.',
  rate: 'Забагато спроб. Спробуйте за кілька хвилин.',
  server: 'Щось пішло не так на нашому боці. Зателефонуйте нам, будь ласка.',
};

export function initForm() {
  const form = document.querySelector<HTMLFormElement>('[data-lead-form]');
  const note = document.querySelector<HTMLElement>('[data-form-note]');
  if (!form || !note) return;

  const submit = form.querySelector<HTMLButtonElement>('#rf-submit');

  const showErrors = (errors: FieldErrors) => {
    (['name', 'tel', 'consent'] as const).forEach((key) => {
      const box = document.getElementById(`err-${key}`);
      const input = form.querySelector<HTMLElement>(`[name="${key}"]`);
      const msg = errors[key];
      if (box) {
        box.textContent = msg ?? '';
        box.hidden = !msg;
      }
      if (input) {
        if (msg) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
    });
    // Фокус на первое поле с ошибкой — иначе на длинной форме её не найти
    const firstKey = (['name', 'tel', 'consent'] as const).find((k) => errors[k]);
    if (firstKey) form.querySelector<HTMLElement>(`[name="${firstKey}"]`)?.focus();
  };

  const setNote = (text: string, state?: 'ok' | 'err') => {
    note.textContent = text;
    if (state) note.dataset.state = state;
    else delete note.dataset.state;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      name: fd.get('name'),
      tel: fd.get('tel'),
      loc: fd.get('loc'),
      area: fd.get('area'),
      msg: fd.get('msg'),
      consent: fd.get('consent') === 'on',
      website: fd.get('website'),
    };

    const { ok, errors } = validateLead(payload);
    showErrors(errors);
    if (!ok) { setNote('', undefined); return; }

    submit?.setAttribute('disabled', '');
    if (submit) submit.textContent = TEXT.submitting;
    setNote(TEXT.submitting);

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        form.reset();
        showErrors({});
        setNote(TEXT.success, 'ok');
        // Кнопку не возвращаем в исходное — повторная отправка той же
        // заявки владельцу не нужна, а человеку виден результат.
        if (submit) submit.textContent = TEXT.submit;
        return;
      }

      if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        showErrors(body.fields ?? {});
        setNote('', undefined);
      } else if (res.status === 429) {
        setNote(TEXT.rate, 'err');
      } else {
        setNote(TEXT.server, 'err');
      }
    } catch {
      setNote(TEXT.network, 'err');
    } finally {
      submit?.removeAttribute('disabled');
      if (submit && submit.textContent === TEXT.submitting) submit.textContent = TEXT.submit;
    }
  });

  // Убираем ошибку, как только человек начал править поле
  form.addEventListener('input', (e) => {
    const el = e.target as HTMLElement;
    const name = el.getAttribute('name');
    if (!name || !['name', 'tel', 'consent'].includes(name)) return;
    el.removeAttribute('aria-invalid');
    const box = document.getElementById(`err-${name}`);
    if (box) { box.hidden = true; box.textContent = ''; }
  });
}
