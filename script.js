(() => {
  const body = document.body;

  /* ---------- Развязывание банта ---------- */
  const openBtn = document.getElementById('open-gift');
  const intro = document.getElementById('intro');
  const card = document.getElementById('gift-card');

  // Стартовый экран центрируем так же, как страницу под ним (с учётом места под полосу прокрутки),
  // чтобы логотип при открытии не сдвигался
  const alignIntro = () => { intro.style.right = (window.innerWidth - document.documentElement.clientWidth) + 'px'; };
  alignIntro();
  window.addEventListener('resize', alignIntro);

  /* ---------- Подарок всегда в центре свободного места между текстом и кнопкой ---------- */
  // Картинки и видео 1440×902; центр подарка на них — (723, 551). Подбираем масштаб и сдвиг так,
  // чтобы подарок встал в центр места под бант, а картинка при этом закрывала весь экран.
  // Те же значения — у видео и у снега на первом экране, поэтому переход не прыгает.
  const SCENE = { w: 1440, h: 902, cx: 723, cy: 551 };
  const GIFT_W = 480; // ширина подарка с концами ленты на картинке
  const giftSpot = document.querySelector('.intro__bow');
  let spotY = 0.55; // доля высоты экрана, запоминаем — после открытия стартового экрана уже нет
  const layoutScene = () => {
    // ширина — как у стартового экрана и страницы (без места под полосу прокрутки)
    const onIntro = document.body.contains(intro);
    const vw = onIntro ? intro.clientWidth : document.getElementById('page').clientWidth;
    const vh = window.innerHeight;
    if (onIntro) {
      const r = giftSpot.getBoundingClientRect();
      if (r.height) spotY = (r.top + r.height / 2) / vh;
    }
    const tx = vw / 2, ty = spotY * vh;
    const cover = Math.max(vw / SCENE.w, vh / SCENE.h);
    const centered = Math.max(cover,
      tx / SCENE.cx, (vw - tx) / (SCENE.w - SCENE.cx),
      ty / SCENE.cy, (vh - ty) / (SCENE.h - SCENE.cy));
    // Ради точного центра картинку приходится увеличивать; но не так, чтобы подарок стал шире экрана
    // (узкие вертикальные экраны) — тогда подарок встаёт максимально близко к центру
    const k = Math.max(cover, Math.min(centered, vw * 0.92 / GIFT_W));
    const w = SCENE.w * k, h = SCENE.h * k;
    const x = Math.min(0, Math.max(vw - w, tx - SCENE.cx * k));
    const y = Math.min(0, Math.max(vh - h, ty - SCENE.cy * k));
    const st = document.documentElement.style;
    st.setProperty('--scene-w', w.toFixed(1) + 'px');
    st.setProperty('--scene-h', h.toFixed(1) + 'px');
    st.setProperty('--scene-x', x.toFixed(1) + 'px');
    st.setProperty('--scene-y', y.toFixed(1) + 'px');
  };
  layoutScene();
  window.addEventListener('resize', () => requestAnimationFrame(layoutScene)); // после alignIntro
  document.fonts?.ready.then(layoutScene); // после загрузки шрифтов текст меняет высоту — пересчитываем

  /* ---------- Видео развязывания + прелоудер ---------- */
  const REVEAL_AT = 3.0;      // секунда видео, на которой оно растворяется в картинку со снегом
  const video = document.getElementById('intro-video');
  const preloader = document.getElementById('preloader');
  const fill = document.getElementById('preloader-fill');
  const hidePreloader = () => preloader.classList.add('is-done');

  // Прогресс: видео — основная часть, картинки и 3D-карточка — по чуть-чуть
  const parts = { video: 0, start: 0, end: 0, card: 0 };
  const WEIGHT = { video: 0.7, start: 0.1, end: 0.1, card: 0.1 };
  const progress = () => {
    const p = Object.keys(parts).reduce((sum, k) => sum + parts[k] * WEIGHT[k], 0);
    fill.style.transform = `scaleX(${p})`;
    preloader.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  };
  const loadImage = (key, src) => {
    const img = new Image();
    img.src = src;
    return img.decode().catch(() => {}).then(() => { parts[key] = 1; progress(); });
  };
  // Видео скачиваем целиком заранее (с прогрессом), чтобы по клику оно играло без подгрузки
  const VIDEO_SRC = 'assets/snow/unbox.mp4?v=1';
  const loadVideo = async () => {
    try {
      const res = await fetch(VIDEO_SRC);
      const total = +res.headers.get('content-length') || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) { parts.video = got / total; progress(); }
      }
      video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    } catch {
      video.src = VIDEO_SRC; // не вышло — пусть браузер грузит сам
    }
    video.load();
    parts.video = 1; progress();
  };
  const cardReady = new Promise(resolve => {
    if (window.__card3dReady) resolve();
    else window.addEventListener('card3d-ready', resolve, { once: true });
  }).then(() => { parts.card = 1; progress(); });

  Promise.all([loadVideo(), loadImage('start', 'assets/snow/start.webp'), loadImage('end', 'assets/snow/end.webp'), cardReady])
    .then(() => setTimeout(hidePreloader, 150)); // дать полосе дойти до конца
  setTimeout(hidePreloader, 10000); // на очень медленной сети не держим пользователя дольше

  const open = () => {
    if (body.classList.contains('is-opening')) return;
    window.scrollTo(0, 0);
    body.classList.add('is-opening');
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      // Видео растворяется в снег без подарка, поверх появляется карточка — как раньше
      body.classList.add('is-revealed');
      setTimeout(() => {
        intro.remove();
        body.classList.add('is-opened');
        body.classList.remove('is-locked');
      }, 1200);
      setTimeout(() => card.classList.add('is-idle'), 2300);
    };
    // Видео показываем, когда пошёл первый кадр; на нужной секунде — растворение
    const watch = () => {
      if (revealed) return;
      if (video.currentTime >= REVEAL_AT || video.ended) { reveal(); return; }
      requestAnimationFrame(watch);
    };
    video.addEventListener('playing', () => body.classList.add('is-playing'), { once: true });
    video.addEventListener('ended', reveal, { once: true });
    video.currentTime = 0;
    const playing = video.play();
    if (playing) playing.then(() => requestAnimationFrame(watch), reveal); // не дали проиграть — открываем сразу
    else requestAnimationFrame(watch);
  };
  openBtn.addEventListener('click', open);

  /* ---------- Интерактивная карточка: поворот за курсором / пальцем ---------- */
  const scene = document.getElementById('card-scene');
  const MAX = 16; // градусов
  let idleTimer;

  const tilt = (clientX, clientY, rect) => {
    const px = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const py = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
    card.style.setProperty('--ry', ((px - 0.5) * 2 * MAX).toFixed(2) + 'deg');
    card.style.setProperty('--rx', ((0.5 - py) * 2 * MAX).toFixed(2) + 'deg');
    card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
    card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  };

  const start = () => {
    clearTimeout(idleTimer);
    card.classList.remove('is-idle');
    card.classList.add('is-tracking');
  };
  const reset = () => {
    card.classList.remove('is-tracking');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
    idleTimer = setTimeout(() => card.classList.add('is-idle'), 1500);
  };

  // Мышь: карточка следит за курсором в пределах первого экрана
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const has3d = () => scene.classList.contains('has-3d');
  window.addEventListener('mousemove', (e) => {
    if (has3d() || !fine.matches || !body.classList.contains('is-opened')) return;
    const r = card.getBoundingClientRect();
    // зона реакции — чуть шире самой карточки
    const zone = { left: r.left - r.width * 0.6, top: r.top - r.height * 0.6, width: r.width * 2.2, height: r.height * 2.2 };
    const inside = e.clientX > zone.left && e.clientX < zone.left + zone.width && e.clientY > zone.top && e.clientY < zone.top + zone.height;
    if (inside) { start(); tilt(e.clientX, e.clientY, zone); }
    else if (card.classList.contains('is-tracking')) reset();
  });

  // Палец: тянем по карточке
  scene.addEventListener('touchstart', (e) => {
    if (has3d()) return;
    start();
    const t = e.touches[0];
    tilt(t.clientX, t.clientY, card.getBoundingClientRect());
  }, { passive: true });
  scene.addEventListener('touchmove', (e) => {
    if (has3d()) return;
    const t = e.touches[0];
    tilt(t.clientX, t.clientY, card.getBoundingClientRect());
  }, { passive: true });
  scene.addEventListener('touchend', reset);
  scene.addEventListener('touchcancel', reset);

  /* ---------- Перелив фона в блоке «Распаковка»: по скроллу и по курсору ---------- */
  // Скролл: пока блок проезжает через экран, светлая полоса несколько раз проходит по диагонали
  // туда и обратно. Курсор: светлое пятно идёт за мышью и слегка сдвигает полосу в её сторону.
  // --mx/--my — полоса, --cx/--cy — пятно (0…1 от размеров блока)
  const block = document.querySelector('.block');
  if (block) {
    const SWEEPS = 3;
    const cur = { mx: 0, my: 0, cx: 0.5, cy: 0.5, rx: 0 }, tgt = { ...cur };
    let sx = 0, sy = 0, prog = 0, px = 0.5, py = 0.5, hover = false, raf = 0;
    const TRAVEL = 1800; // на сколько пикселей уезжают блики справа налево за весь проход блока
    const fromScroll = () => {
      const r = block.getBoundingClientRect(), vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      prog = p;
      const t = (p * SWEEPS) % 1, tri = 1 - Math.abs(2 * t - 1); // 0 → 1 → 0 на каждый проход
      sx = tri;
      sy = 0.1 + 0.8 * tri;
    };
    const clamp = v => Math.min(1, Math.max(0, v));
    const retarget = () => {
      const pull = hover ? 0.35 : 0;          // насколько курсор тянет полосу к себе
      tgt.mx = clamp(sx + pull * (px - sx));
      tgt.my = clamp(sy + pull * (py - sy));
      tgt.cx = hover ? px : sx;               // без курсора пятно идёт вместе с полосой
      tgt.cy = hover ? py : sy;
      tgt.rx = -prog * TRAVEL - (hover ? (px - 0.5) * 80 : 0); // блики всегда едут справа налево
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = () => {
      let moving = 0;
      for (const k in cur) { cur[k] += (tgt[k] - cur[k]) * 0.12; moving += Math.abs(tgt[k] - cur[k]) / (k === 'rx' ? 1000 : 1); }
      for (const k in cur) block.style.setProperty('--' + k, k === 'rx' ? cur[k].toFixed(1) + 'px' : cur[k].toFixed(4));
      raf = moving > 0.001 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener('scroll', () => { fromScroll(); retarget(); }, { passive: true });
    window.addEventListener('resize', () => { fromScroll(); retarget(); });
    if (window.matchMedia('(hover: hover)').matches) {
      block.addEventListener('pointermove', e => {
        const r = block.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width;
        py = (e.clientY - r.top) / r.height;
        hover = true;
        retarget();
      });
      block.addEventListener('pointerleave', () => { hover = false; retarget(); });
    }
    fromScroll();
    retarget();
  }

  /* ---------- Рефлекс кнопок: при наведении быстро пробегает туда-обратно ---------- */
  // Ускоряем ту же CSS-анимацию btn-reflex: один проход туда и обратно, затем плавно
  // возвращаем обычную скорость — рефлекс продолжает движение с того места, где оказался
  const FAST = 8;          // во сколько раз быстрее при наведении
  const PASS_MS = 4500;    // длительность одного прохода (как в styles.css)
  document.querySelectorAll('.btn--dark, .btn--light').forEach(btn => {
    let timer = 0, raf = 0;
    const reflex = () => btn.getAnimations().find(a => a.animationName === 'btn-reflex');
    btn.addEventListener('pointerenter', () => {
      const anim = reflex();
      if (!anim) return;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      anim.updatePlaybackRate(FAST);
      // два прохода (туда и обратно) на ускоренной скорости, потом плавное торможение
      timer = setTimeout(() => {
        const start = performance.now();
        const ease = now => {
          const k = Math.min(1, (now - start) / 400);
          anim.updatePlaybackRate(FAST + (1 - FAST) * (1 - (1 - k) ** 3));
          if (k < 1) raf = requestAnimationFrame(ease);
        };
        raf = requestAnimationFrame(ease);
      }, (2 * PASS_MS) / FAST - 200);
    });
  });

  /* ---------- Копирование промокода ---------- */
  const code = document.getElementById('promo-code');
  const toast = document.getElementById('toast');
  let toastTimer;
  code.addEventListener('click', async () => {
    const text = code.textContent.trim();
    try { await navigator.clipboard.writeText(text); }
    catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
    }
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
  });

  /* ---------- Выбор темы: светлая / тёмная / фиолетовая ---------- */
  const root = document.documentElement;
  const themeOpts = document.querySelectorAll('[data-set-theme]');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const THEME_COLORS = { light: '#edecf2', dark: '#2f2d36', purple: '#3c2163' };
  const syncTheme = () => {
    const cur = root.dataset.theme || 'light';
    themeOpts.forEach(b => b.setAttribute('aria-checked', String(b.dataset.setTheme === cur)));
    themeColor.content = THEME_COLORS[cur];
  };
  syncTheme();
  themeOpts.forEach(btn => btn.addEventListener('click', () => {
    const next = btn.dataset.setTheme;
    if (next === (root.dataset.theme || 'light')) return;
    const apply = () => {
      if (next === 'light') delete root.dataset.theme;
      else root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch {}
      syncTheme();
    };
    // Мягкая смена темы, где браузер умеет view transitions
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(apply);
    else apply();
  }));
})();
