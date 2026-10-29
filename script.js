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

  /* ---------- Промокод из ссылки (прототип): ?code=ABC123 ---------- */
  // Потом здесь будет запрос к бэкенду по персональному токену. Берём только буквы, цифры и дефис.
  const linkCode = (new URLSearchParams(location.search).get('code') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
  if (linkCode.length >= 4) {
    document.querySelector('#promo-code span').textContent = linkCode;
    document.getElementById('card3d').setAttribute('aria-label', `Подарочная карта Яндекс Плюс на 12 месяцев, промокод ${linkCode}`);
  }

  /* ---------- Бант заполняет место между текстом и кнопкой ---------- */
  // Картинка 782×442 (2×), бант занимает её по высоте почти целиком; на низких экранах уменьшается, на узких — по ширине
  const bowArea = document.querySelector('.intro__bow');
  const fitBow = () => {
    const k = Math.min(1.5, (bowArea.clientHeight - 16) / 430, window.innerWidth / 520);
    bowArea.style.setProperty('--bs', Math.max(0.3, k).toFixed(3));
  };
  fitBow();
  window.addEventListener('resize', fitBow);
  document.fonts?.ready.then(fitBow); // после загрузки шрифтов текст меняет высоту — пересчитываем

  /* ---------- Открытие подарка ---------- */
  // Прелоудер прячет встроенный скрипт в index.html — как только готовы бант и шрифты.
  // По клику бант растворяется с лёгким увеличением, текст сменяется, появляется карточка
  const cardReady = new Promise(resolve => {
    if (window.__card3dReady) resolve();
    else window.addEventListener('card3d-ready', resolve, { once: true });
  });
  let opening = false;
  const open = async () => {
    if (opening) return;
    opening = true;
    window.scrollTo(0, 0);
    body.classList.add('is-opening'); // бант и кнопка уходят
    // Карточка обычно давно готова; если нет — ждём её (не дольше 3 с), иначе появилась бы плоской
    await Promise.race([cardReady, new Promise(r => setTimeout(r, 3000))]);
    setTimeout(() => {
      body.classList.add('is-revealed'); // текст сменяется, появляется страница с карточкой
      setTimeout(() => {
        intro.remove();
        body.classList.add('is-opened');
        body.classList.remove('is-locked');
      }, 900);
      setTimeout(() => card.classList.add('is-idle'), 2000);
    }, 450); // бант успевает раствориться
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
    const TRAVEL = 2400; // на сколько пикселей уезжают блики справа налево за весь проход блока
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
      // блики едут справа налево по скроллу и заметно следуют за курсором (по обеим осям, до ±375 px)
      tgt.rx = -prog * TRAVEL - (hover ? (px - 0.5) * 500 + (py - 0.5) * 250 : 0);
      if (!raf) raf = requestAnimationFrame(step);
    };
    const step = () => {
      let moving = 0;
      // 0.08 — плавнее: блик «догоняет» курсор
      for (const k in cur) { cur[k] += (tgt[k] - cur[k]) * 0.08; moving += Math.abs(tgt[k] - cur[k]) / (k === 'rx' ? 1000 : 1); }
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
  /* ---------- Перелив гирлянд и сердечка за курсором ---------- */
  // Блик по гирляндам (.bells-shine) стоит там, где курсор, и плавно догоняет его;
  // по сердечку в поздравлении (.heart-shine) — пробег в 1,5 ширины сердечка на ширину экрана: у краёв экрана блик уходит с сердечка.
  // На телефонах и без мыши — прежний перелив сам по себе (CSS-анимация)
  const shines = [...document.querySelectorAll('.bells-shine, .heart-shine')];
  if (shines.length && matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('shine-follow');
    const state = shines.map(el => ({ el, heart: el.classList.contains('heart-shine'), target: 0.5, current: 0.5 }));
    let shineRaf = 0;
    const draw = () => {
      let moving = false;
      for (const s of state) {
        s.current += (s.target - s.current) * 0.08;
        s.el.style.setProperty('--sx', s.current.toFixed(4));
        if (Math.abs(s.target - s.current) > 0.0005) moving = true;
      }
      shineRaf = moving ? requestAnimationFrame(draw) : 0;
    };
    addEventListener('pointermove', e => {
      const bells = state.filter(s => !s.heart && s.el.isConnected);
      const r = bells.length ? bells[bells.length - 1].el.getBoundingClientRect() : null; // гирлянды на обоих экранах одного размера
      for (const s of state) s.target = s.heart ? 0.5 + (e.clientX / innerWidth - 0.5) * 1.5 : r ? (e.clientX - r.left) / r.width : s.target;
      if (!shineRaf) shineRaf = requestAnimationFrame(draw);
    }, { passive: true });
    shines.forEach(el => el.style.setProperty('--sx', 0.5));
  }
})();
