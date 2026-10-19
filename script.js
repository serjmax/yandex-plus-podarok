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

  const open = () => {
    if (body.classList.contains('is-opening')) return;
    window.scrollTo(0, 0);
    body.classList.add('is-opening');
    // Бант разлетается поверх уже открытой страницы; убираем слой, когда анимация закончилась
    setTimeout(() => {
      intro.remove();
      body.classList.add('is-opened');
      body.classList.remove('is-locked');
    }, 1200);
    setTimeout(() => card.classList.add('is-idle'), 2300);
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
})();
