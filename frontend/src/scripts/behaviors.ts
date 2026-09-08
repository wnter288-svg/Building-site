/**
 * Поведение страницы. Перенос логики из макета Claude Design с правками:
 *  — у аккордеона и бургера появились корректные ARIA-состояния;
 *  — в мобильном меню есть ловушка фокуса и Escape;
 *  — видео не просто скрыто на мобильном, а не подключается вовсе.
 */

/* Проверяем в момент вызова, а не при загрузке модуля: скрипт может
   выполниться раньше, чем окно примет итоговый размер, и тогда
   зафиксированное значение навсегда отключит видео и параллакс. */
const isReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = () => matchMedia('(max-width: 820px)').matches;

/**
 * Ширина полосы прокрутки в переменную --sbw.
 *
 * Нужна для выравнивания по странице: секции центрируют контейнер 1280
 * внутри ширины контента, а она полосу НЕ включает. Считать то же самое
 * через 100vw нельзя — он полосу включает, и текст разъезжается с
 * остальными секциями на половину полосы (около 7px).
 */
function trackScrollbar() {
  const de = document.documentElement;
  const apply = () => {
    de.style.setProperty('--sbw', Math.max(0, innerWidth - de.clientWidth) + 'px');
  };
  apply();
  addEventListener('resize', apply, { passive: true });
  // Наблюдатель за размером ловит и те изменения ширины, при которых
  // событие resize не приходит: появление и пропажу полосы прокрутки
  // при смене длины страницы, зум, эмуляцию вьюпорта.
  new ResizeObserver(apply).observe(de);
}

/* ——— Первый экран: постер всегда, видео только на широком экране ——— */
function setupHero(videoSrc: string, posterSrc: string) {
  const poster = document.querySelector<HTMLElement>('[data-hero-poster]');
  const video = document.querySelector<HTMLVideoElement>('[data-hero-video]');
  if (poster && posterSrc) poster.style.backgroundImage = `url(${posterSrc})`;
  if (!video || !videoSrc) { video?.remove(); return; }

  let loaded = false;

  /**
   * Видео подключается только когда экран достаточно широкий. До этого
   * момента у элемента нет src, то есть 2.3 МБ не уходят в мобильный
   * трафик вообще — одного display:none для этого мало.
   *
   * Проверяем не только на старте, но и по ресайзу: страница могла
   * загрузиться в скрытой или узкой вкладке, и тогда разовая проверка
   * отключила бы видео навсегда.
   */
  const maybeLoad = () => {
    if (loaded) return;
    // innerWidth === 0 у скрытой вкладки — ждём, пока её покажут
    if (!innerWidth || isSmall() || isReduced()) return;
    loaded = true;
    if (posterSrc) video.poster = posterSrc;
    // muted обязателен именно свойством: без него браузер отклонит автозапуск
    video.muted = true;
    video.autoplay = true;
    video.src = videoSrc;

    // play() сразу после назначения src отклоняется — данных ещё нет,
    // а в фоновой вкладке автозапуск откладывается. Пробуем по готовности
    // и ещё раз, когда вкладку показали.
    const tryPlay = () => { if (video.paused) video.play().catch(() => {}); };
    video.addEventListener('canplay', tryPlay, { once: false });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tryPlay();
    });
    tryPlay();
  };

  maybeLoad();
  if (!loaded) {
    let queued = false;
    addEventListener('resize', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; maybeLoad(); });
    }, { passive: true });
  }
}

/* ——— Шапка: уплотняется после 60px прокрутки ——— */
function setupHeader() {
  const head = document.querySelector<HTMLElement>('[data-header]');
  if (!head) return;
  let queued = false;
  const apply = () => {
    queued = false;
    head.classList.toggle('is-cond', window.scrollY > 60);
  };
  addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(apply); }
  }, { passive: true });
  apply();
}

/* ——— Появление блоков ——— */
function setupReveals() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
  if (!els.length) return;

  // Класс .rv (прозрачность 0) навешивается только скриптом. Если JS не
  // выполнится вовсе, контент останется видимым — это важнее анимации.
  if (isReduced()) { els.forEach((e) => e.classList.add('is-in')); return; }

  const timers = new WeakMap<HTMLElement, number>();

  const show = (e: HTMLElement) => {
    clearTimeout(timers.get(e));
    if (e.classList.contains('is-in')) return;
    const d = Number(e.dataset.delay ?? 0);
    timers.set(e, window.setTimeout(() => e.classList.add('is-in'), d));
  };

  const hide = (e: HTMLElement) => {
    clearTimeout(timers.get(e));
    e.classList.remove('is-in');
  };

  els.forEach((e) => {
    e.classList.add('rv');
    // То, что уже в кадре при загрузке, показываем сразу — без мигания
    if (e.getBoundingClientRect().top < innerHeight * 0.92) e.classList.add('is-in');
  });

  /**
   * Появление повторяется при каждом заходе элемента в кадр, а не один
   * раз за визит. Поэтому наблюдение не снимается.
   *
   * Показываем и прячем на разных границах: показ — когда элемент вошёл
   * в окно, урезанное снизу на 6%; сброс — только когда он целиком ушёл
   * за край окна. Без этого зазора элемент на самой границе мигал бы
   * туда-сюда при малейшем движении колеса.
   */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const el = en.target as HTMLElement;
      if (en.isIntersecting) { show(el); return; }
      const r = en.boundingClientRect;
      if (r.bottom < 0 || r.top > innerHeight) hide(el);
    });
  }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));

  /**
   * Подстраховка по геометрии. IntersectionObserver может не сработать —
   * например, во встроенной панели или скрытой вкладке. Без этого куска
   * страница ниже первого экрана осталась бы прозрачной навсегда,
   * а это хуже, чем отсутствие анимации. Только показывает, никогда
   * не прячет: задача этого кода — чтобы контент не пропал.
   */
  let queued = false;
  const sweep = () => {
    queued = false;
    els.forEach((e) => {
      if (e.classList.contains('is-in')) return;
      const r = e.getBoundingClientRect();
      if (r.top < innerHeight * 0.94 && r.bottom > 0) show(e);
    });
  };
  const onMove = () => { if (!queued) { queued = true; requestAnimationFrame(sweep); } };
  addEventListener('scroll', onMove, { passive: true });
  addEventListener('resize', onMove, { passive: true });
}

/* ——— Построчное появление заголовка «Процес» ——— */
function setupHeadingLines() {
  const h = document.querySelector<HTMLElement>('.lines-r');
  if (!h) return;
  if (isReduced() || h.getBoundingClientRect().top < innerHeight * 0.9) {
    h.classList.add('is-in');
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.disconnect(); }
    });
  }, { threshold: 0.4 });
  io.observe(h);
}

/* ——— Крупный номер этапа следует за прокруткой ——— */
function setupProcess() {
  const num = document.querySelector<HTMLElement>('[data-pr-num]');
  const lab = document.querySelector<HTMLElement>('[data-pr-lab]');
  const steps = [...document.querySelectorAll<HTMLElement>('.pr-step')];
  if (!num || !steps.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target as HTMLElement;
      num.textContent = el.dataset.n ?? '';
      if (lab) lab.textContent = el.dataset.t ?? '';
    });
  }, { rootMargin: '-46% 0px -46% 0px' });
  steps.forEach((s) => io.observe(s));
}

/* ——— Счётчики в фактах ——— */
function setupCounters() {
  if (isReduced()) return;
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const raw = (el.textContent ?? '').trim();
    const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
    // Заглушки вида [N] числом не являются — их не анимируем
    if (!isFinite(n)) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        runCount(el, n, raw);
      });
    }, { threshold: 0.5 });
    io.observe(el);
  });
}

function runCount(el: HTMLElement, n: number, raw: string) {
  const suffix = raw.replace(/^[\d\s.,]+/, '');
  const dec = ((raw.split(/[.,]/)[1] ?? '').match(/^\d+/) ?? [''])[0].length;
  const dur = 1400;
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = (n * e).toFixed(dec) + suffix;
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = raw;
  };
  el.textContent = (0).toFixed(dec) + suffix;
  requestAnimationFrame(step);
}

/* ——— Аккордеон вопросов ——— */
function setupAccordion() {
  const wrap = document.querySelector<HTMLElement>('[data-faq]');
  if (!wrap) return;

  const setOpen = (item: HTMLElement, open: boolean) => {
    item.classList.toggle('is-open', open);
    item.querySelector('.faq-q')?.setAttribute('aria-expanded', String(open));
  };

  wrap.addEventListener('click', (e) => {
    const q = (e.target as HTMLElement).closest<HTMLButtonElement>('.faq-q');
    if (!q) return;
    const item = q.closest<HTMLElement>('.faq-i');
    if (!item) return;
    const wasOpen = item.classList.contains('is-open');
    wrap.querySelectorAll<HTMLElement>('.faq-i').forEach((o) => setOpen(o, false));
    if (!wasOpen) setOpen(item, true);
  });

  // Стрелками между вопросами — как в обычном списке табов
  wrap.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const qs = [...wrap.querySelectorAll<HTMLButtonElement>('.faq-q')];
    const i = qs.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1) return;
    e.preventDefault();
    qs[(i + (e.key === 'ArrowDown' ? 1 : qs.length - 1)) % qs.length]?.focus();
  });
}

/* ——— Мобильное меню ——— */
function setupMenu() {
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  const burger = document.querySelector<HTMLButtonElement>('[data-burger]');
  if (!menu || !burger) return;

  let lastFocused: HTMLElement | null = null;

  const open = () => {
    lastFocused = document.activeElement as HTMLElement;
    menu.hidden = false;
    // Кадр на снятие hidden, иначе переход по opacity не проиграется
    requestAnimationFrame(() => menu.classList.add('is-open'));
    burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    menu.querySelector<HTMLElement>('a, button')?.focus();
  };

  const close = () => {
    menu.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    const done = () => { menu.hidden = true; menu.removeEventListener('transitionend', done); };
    if (isReduced()) menu.hidden = true; else menu.addEventListener('transitionend', done);
    lastFocused?.focus();
  };

  burger.addEventListener('click', open);
  menu.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('a') || t.closest('[data-menu-close]')) close();
  });

  addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;

    // Ловушка фокуса: пока меню открыто, Tab не уходит на страницу под ним
    const items = [...menu.querySelectorAll<HTMLElement>('a[href], button')]
      .filter((el) => !el.hasAttribute('disabled'));
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* ——— Кнопка слегка тянется к курсору ——— */
function setupMagnet() {
  const m = document.querySelector<HTMLElement>('[data-magnet]');
  if (!m || isReduced() || isSmall()) return;
  m.addEventListener('pointermove', (e) => {
    const r = m.getBoundingClientRect();
    const dx = ((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 5;
    const dy = ((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * 5;
    m.style.transform = `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px)`;
  });
  m.addEventListener('pointerleave', () => { m.style.transform = 'translate(0,0)'; });
}

/* ——— Параллакс первого экрана и карточек ——— */
function startParallax() {
  const media = document.querySelector<HTMLElement>('[data-hero-media]');
  const veil = document.querySelector<HTMLElement>('[data-hero-veil]');
  const cards = [...document.querySelectorAll<HTMLElement>('.pc-in')];
  let frame = 0;

  const update = () => {
    const y = scrollY;
    const vh = innerHeight;
    if (media) {
      const p = Math.min(1, y / vh);
      media.style.transform = `translate3d(0,${(y * 0.18).toFixed(1)}px,0) scale(${(1 - p * 0.05).toFixed(4)})`;
      if (veil) veil.style.opacity = (p * 0.5).toFixed(3);
    }
    cards.forEach((c) => {
      const parent = c.parentElement;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const prog = (r.top + r.height / 2 - vh / 2) / vh;
      c.style.transform = `translate3d(0,${(prog * -7).toFixed(2)}%,0)`;
    });
  };

  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  update();
}

export function initBehaviors(opts: { videoSrc: string; posterSrc: string }) {
  trackScrollbar();
  setupHero(opts.videoSrc, opts.posterSrc);
  setupHeader();
  setupReveals();
  setupHeadingLines();
  setupProcess();
  setupCounters();
  setupAccordion();
  setupMenu();
  setupMagnet();
  if (!isReduced() && !isSmall()) startParallax();
}
