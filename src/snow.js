// Падающий снег поверх страницы (canvas #snow).
// Три «глубины»: дальние снежинки мелкие, тусклые и медленные, ближние — крупнее, ярче и быстрее.
// Каждая покачивается по-своему, всё вместе сносит лёгкий меняющийся ветер; часть ближних чуть вытянута по ходу движения.
// На светлом фоне белая снежинка теряется, поэтому у неё едва заметный сиреневый контур.
(() => {
  const canvas = document.getElementById('snow');
  if (!canvas) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { canvas.remove(); return; }
  const ctx = canvas.getContext('2d');

  // Спрайт снежинки: мягкий белый круг с тонким сиреневым ореолом (рисуем один раз, дальше только масштабируем)
  const SPRITE = 64;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = SPRITE;
  {
    const s = sprite.getContext('2d'), c = SPRITE / 2;
    const halo = s.createRadialGradient(c, c, 0, c, c, c);
    halo.addColorStop(0, 'rgba(105, 92, 150, .5)');
    halo.addColorStop(.62, 'rgba(105, 92, 150, .28)');
    halo.addColorStop(1, 'rgba(110, 98, 150, 0)');
    s.fillStyle = halo;
    s.fillRect(0, 0, SPRITE, SPRITE);
    const core = s.createRadialGradient(c, c, 0, c, c, c * .62);
    core.addColorStop(0, 'rgba(255, 255, 255, 1)');
    core.addColorStop(.55, 'rgba(255, 255, 255, .95)');
    core.addColorStop(1, 'rgba(255, 255, 255, 0)');
    s.fillStyle = core;
    s.beginPath();
    s.arc(c, c, c * .62, 0, Math.PI * 2);
    s.fill();
  }

  let w = 0, h = 0, dpr = 1, flakes = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  const makeFlake = (y) => {
    const z = Math.random() ** 1.6;                 // больше дальних, меньше ближних
    return {
      x: rand(0, w), y: y ?? rand(-h, h),
      z,
      r: 1.5 + z * z * 4.8,                         // радиус спрайта, px
      vy: 16 + z * 72,                              // скорость падения, px/с
      amp: rand(6, 22) * (0.4 + z),                 // размах покачивания
      freq: rand(0.25, 0.8),
      phase: rand(0, Math.PI * 2),
      alpha: 0.55 + z * 0.45,
      streak: z > 0.72 && Math.random() < 0.5,      // часть ближних — с лёгким смазом по движению
    };
  };
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = document.documentElement.clientWidth; h = innerHeight; // без полосы прокрутки — иначе холст растягивается
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(520, Math.max(140, (w * h) / 3300))); // ~390 снежинок на 1440×900
    while (flakes.length < count) flakes.push(makeFlake());
    flakes.length = count;
  };
  resize();
  addEventListener('resize', resize);

  let last = performance.now(), t = 0, raf = 0;
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt;
    // Ветер: медленно меняется по силе и направлению
    const wind = Math.sin(t * 0.13) * 14 + Math.sin(t * 0.41 + 1.3) * 6;
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      f.y += f.vy * dt;
      const sway = Math.sin(t * f.freq * Math.PI * 2 * 0.35 + f.phase) * f.amp;
      f.x += (wind * (0.3 + f.z)) * dt;
      if (f.y - f.r > h) Object.assign(f, makeFlake(-f.r * 2 - rand(0, 40)));
      if (f.x < -40) f.x += w + 80; else if (f.x > w + 40) f.x -= w + 80;
      const x = f.x + sway, y = f.y, d = f.r * 2;
      ctx.globalAlpha = f.alpha;
      if (f.streak) {
        // Смаз: растягиваем спрайт по вертикали, чуть наклоняя по ветру
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(-(wind * (0.3 + f.z)), f.vy) * 0.6);
        ctx.drawImage(sprite, -f.r, -f.r * 1.9, d, d * 1.9);
        ctx.restore();
      } else {
        ctx.drawImage(sprite, x - f.r, y - f.r, d, d);
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start())); // во фоновой вкладке не тратим ресурсы
  start();
})();
