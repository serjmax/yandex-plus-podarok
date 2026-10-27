// 3D-карточка из card-3d-playground (src/card.js): металлическая карта с сиреневым переливом.
// Поворачивается за курсором или пальцем, в покое слегка покачивается.
// Панель настройки (?tune) сейчас выключена — включается флагом TUNE_PANEL ниже.
// Если WebGL недоступен, остаётся CSS-карточка (.gift-card).
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { createCard, LANDING_LOOK, LANDING_LIGHT } from './card.js';

const scene3d = document.getElementById('card-scene');
const mount = document.getElementById('card3d');

// Вид карточки и свет — из card-3d-playground (LANDING_LOOK / LANDING_LIGHT в card.js), там их и настраивать.
// Панель ?tune сейчас выключена — включается флагом TUNE_PANEL ниже; её значения по умолчанию = LANDING_LOOK.
const TUNE_PANEL = false;
const TUNE_DEFAULTS = {
  lc: LANDING_LOOK.ink,         // цвет надписей
  mt: LANDING_LOOK.metal,       // оттенок металла
  ir: LANDING_LOOK.iridescence, // сила перелива (iridescence)
  sh: LANDING_LOOK.sheen,       // сиреневый отблеск по краям (sheen)
  ro: LANDING_LOOK.roughness,   // шероховатость: меньше — зеркальнее
  pa: LANDING_LOOK.pattern,     // заметность паттерна из плюсов
};
const tune = { ...TUNE_DEFAULTS };
const query = new URLSearchParams(location.search);
for (const k of Object.keys(tune)) {
  const v = query.get(k);
  if (v == null) continue;
  if (typeof tune[k] === 'number') { if (Number.isFinite(+v)) tune[k] = +v; }
  else if (/^[0-9a-f]{6}$/i.test(v)) tune[k] = '#' + v;
}
const TILT = THREE.MathUtils.degToRad(18);
// Холст больше самой карточки, чтобы при наклоне углы не обрезались
const PAD_X = 1.4;

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LANDING_LIGHT.exposure;
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = LANDING_LIGHT.envPower;
  room.dispose();

  const L = LANDING_LIGHT;
  const key = new THREE.DirectionalLight(L.keyColor, L.keyPower);
  key.position.set(...L.key);
  const fill = new THREE.DirectionalLight(L.fillColor, L.fillPower);
  fill.position.set(...L.fill);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c9185, L.ambient), key, fill);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const pivot = new THREE.Group();
  scene.add(pivot);

  // Карточка целиком (металл, перелив, слой надписей) строится в card.js
  const look = () => ({ ...LANDING_LOOK, ink: tune.lc, metal: tune.mt, iridescence: tune.ir, sheen: tune.sh, roughness: tune.ro, pattern: tune.pa });
  // Промокод выгравирован прямо в металле внизу карточки: буквы углублены и отполированы, без плашки и краски
  // (место — как у плашки в макете 906-14774, карта 526×326 → 343×213).
  // Код — из ссылки (script.js кладёт его в window.__promoCode), иначе тот же, что в блоке «Промокод»
  const promo = window.__promoCode || document.querySelector('#promo-code span')?.textContent.trim() || '';
  const k = 343 / 526;
  const engraving = {
    text: promo, size: 22 * k,
    font: px => `500 ${px}px "YS Text", "Helvetica Neue", Arial, sans-serif`,
    cx: 343 / 2, cy: 287 * k,
    // Круги иконок сервисов (в макете: ряд с x = 180.65, y = 26, круги ⌀48 с шагом 58): внутри без паттерна,
    // шлифованный металл — глифы переливаются, как плашка промокода
    polish: [24, 82, 140].map(x => ({ cx: (180.65 + x) * k, cy: (26 + 24) * k, r: 24 * k })),
    // Иконки (верхняя полоса, в макете y 26–74) — глубокой тёмной гравировкой полированным металлом, без краски;
    // надпись «12 месяцев Яндекс Плюса» — обычной тёмной краской
    iconsRegion: [170 * k, 18 * k, 186 * k, 64 * k],
  };
  await document.fonts.load(engraving.font(32)).catch(() => {}); // гравировка рисуется этим шрифтом
  // ?plain — карточка без сгенерированной текстуры металла (для сравнения); время сборки — в консоли
  const t0 = performance.now();
  const card = await createCard(renderer, { ...look(), assets: './assets/card3d/', assetsVersion: 5, engraving, plain: query.has('plain') });
  console.info(`card3d: карточка собрана за ${Math.round(performance.now() - t0)} мс${query.has('plain') ? ' (без текстуры)' : ''}`);

  // Панель ?tune: цвет надписей и перелив меняются мгновенно, остальное — пересборкой поверхности
  let surfaceTimer = 0;
  const applyAll = () => {
    card.userData.setLook({ ink: tune.lc, iridescence: tune.ir });
    card.traverse(m => {
      if (!m.isMesh || m.name !== 'Card') return;
      [m.material].flat().forEach((mat, i) => {
        mat.color.set(tune.mt);
        mat.sheen = tune.sh;
        if (i !== 1) mat.roughness = tune.ro; // у ребра (1) своя гладкость
      });
    });
    clearTimeout(surfaceTimer);
    surfaceTimer = setTimeout(() => card.userData.setSurface({ ...look(), engraving }), 300);
  };
  if (TUNE_PANEL && query.has('tune')) tunePanel(tune, applyAll);
  const box = new THREE.Box3().setFromObject(card);
  const size = box.getSize(new THREE.Vector3());
  card.position.sub(box.getCenter(new THREE.Vector3()));
  pivot.add(card);
  pivot.scale.setScalar(2 / size.x); // ширина карточки = 2 единицы

  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Камера так, чтобы карточка занимала 1 / PAD_X ширины холста
    camera.position.set(0, 0, PAD_X / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  }
  new ResizeObserver(resize).observe(mount);
  resize();

  // Управление: курсор в зоне вокруг карточки или палец на ней
  let targetX = 0, targetY = 0, active = false, idleSince = 0;
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const aim = (x, y, r) => {
    const px = THREE.MathUtils.clamp((x - r.left) / r.width, 0, 1);
    const py = THREE.MathUtils.clamp((y - r.top) / r.height, 0, 1);
    targetY = (px * 2 - 1) * TILT;
    targetX = (py * 2 - 1) * TILT;
  };
  const release = () => { active = false; targetX = targetY = 0; idleSince = performance.now(); };

  window.addEventListener('mousemove', e => {
    if (!fine.matches) return;
    // Курсор на промокоде или кнопке под карточкой — карточка встаёт ровно, лицом к зрителю, без покачивания
    if (e.target.closest && e.target.closest('.promo')) { active = true; targetX = targetY = 0; return; }
    const r = mount.getBoundingClientRect();
    const zone = { left: r.left - r.width * 0.3, top: r.top - r.height * 0.3, width: r.width * 1.6, height: r.height * 1.6 };
    const inside = e.clientX > zone.left && e.clientX < zone.left + zone.width && e.clientY > zone.top && e.clientY < zone.top + zone.height;
    if (inside) { active = true; aim(e.clientX, e.clientY, zone); }
    else if (active) release();
  });
  // Палец на самой карточке (не на холсте с полями вокруг неё) только вращает карточку,
  // страница при этом не прокручивается: у .card-scene стоит touch-action: none
  const touchAim = e => aim(e.touches[0].clientX, e.touches[0].clientY, scene3d.getBoundingClientRect());
  scene3d.addEventListener('touchstart', e => { active = true; touchAim(e); }, { passive: true });
  scene3d.addEventListener('touchmove', touchAim, { passive: true });
  scene3d.addEventListener('touchend', release);
  scene3d.addEventListener('touchcancel', release);

  // Рисуем только когда карточка видна на экране
  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(mount);

  // Тень под карточкой (CSS-слой .card-scene::after) следует за поворотом:
  // край, который приподнимается к зрителю, отбрасывает тень дальше и мягче,
  // край, уходящий вглубь, — ближе и плотнее
  let shadowKey = '';
  function updateShadow() {
    const { x: rx, y: ry, z: rz } = pivot.rotation;
    const w = scene3d.clientWidth;
    const lift = -Math.sin(rx);                       // >0 — низ карточки приподнят к зрителю
    const vars = {
      '--sh-x': (Math.sin(ry) * 0.22 * w).toFixed(1) + 'px',
      '--sh-y': (lift * 0.16 * w).toFixed(1) + 'px',
      '--sh-sx': (Math.cos(ry) * (1 + 0.15 * lift)).toFixed(3),
      '--sh-sy': (1 + 0.9 * lift).toFixed(3),
      '--sh-o': Math.max(0.35, 1 - 0.9 * Math.abs(lift) - 0.6 * Math.abs(Math.sin(ry))).toFixed(3),
      '--sh-blur': (24 + 16 * Math.max(0, lift)).toFixed(1) + 'px',
      '--sh-r': THREE.MathUtils.radToDeg(rz).toFixed(2) + 'deg',
    };
    const key = Object.values(vars).join();
    if (key === shadowKey) return;
    shadowKey = key;
    for (const [name, value] of Object.entries(vars)) scene3d.style.setProperty(name, value);
  }

  // Пока карточка спрятана под стартовым экраном, не рисуем её каждый кадр:
  // это нагружало страницу, кнопка «Забрать подарок» отвечала с задержкой, анимация банта подтормаживала
  const hidden = () => document.body.classList.contains('is-locked') && !document.body.classList.contains('is-revealed');
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!visible || hidden()) return;
    const t = clock.elapsedTime;
    // Покачивание в покое плавно нарастает после того, как карточку отпустили
    const idle = active ? 0 : Math.min(1, (performance.now() - idleSince) / 1500);
    // Амплитуда примерно вдвое больше прежней, темп чуть быстрее; Z сдвинут по фазе — движение живее
    const floatX = idle * (0.2 * Math.sin(t * 1.3) + 0.05);
    const floatY = idle * 0.34 * Math.sin(t * 1.0);
    const floatZ = idle * (-0.04 + 0.05 * Math.sin(t * 0.75 + 1));
    const k = 1 - Math.exp(-(active ? 9 : 4) * dt);
    pivot.rotation.x += (targetX + floatX - pivot.rotation.x) * k;
    pivot.rotation.y += (targetY + floatY - pivot.rotation.y) * k;
    pivot.rotation.z += (floatZ - pivot.rotation.z) * k;
    updateShadow();
    renderer.render(scene, camera);
  });

  scene3d.classList.add('has-3d');
  // Тяжёлое (шейдеры, первый кадр) — сразу, пока виден прелоудер
  resize();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
}

// Панель настройки (только при ?tune): значения пишутся в ссылку, её можно переслать
function tunePanel(tune, apply) {
  const rows = [
    ['lc', 'Цвет надписей', 'color'],
    ['mt', 'Оттенок металла', 'color'],
    ['ir', 'Перелив', 'range', 0, 1, 0.01],
    ['sh', 'Сиреневый отблеск', 'range', 0, 1, 0.01],
    ['ro', 'Матовость', 'range', 0.05, 0.6, 0.01],
    ['pa', 'Паттерн', 'range', 0, 1, 0.01],
  ];
  const panel = document.createElement('div');
  panel.className = 'tune';
  panel.innerHTML = '<p class="tune__title">Карточка</p>' + rows.map(([k, label, type, min, max, step]) =>
    `<label class="tune__row"><span>${label}</span><input data-k="${k}" type="${type}"` +
    (type === 'range' ? ` min="${min}" max="${max}" step="${step}"` : '') + ` value="${tune[k]}"><output></output></label>`
  ).join('') + '<div class="tune__actions"><button type="button" data-act="reset">Сбросить</button><button type="button" data-act="copy">Скопировать ссылку</button></div>';
  document.body.appendChild(panel);
  const sync = () => {
    const q = new URLSearchParams(location.search);
    for (const [k] of rows) q.set(k, String(tune[k]).replace('#', ''));
    history.replaceState(null, '', '?' + q.toString());
    panel.querySelectorAll('input').forEach(i => { i.nextElementSibling.textContent = i.type === 'color' ? i.value : (+i.value).toFixed(2); });
  };
  panel.addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (!k) return;
    tune[k] = e.target.type === 'range' ? +e.target.value : e.target.value;
    apply(); sync();
  });
  panel.addEventListener('click', async e => {
    const act = e.target.dataset.act;
    if (act === 'reset') {
      Object.assign(tune, TUNE_DEFAULTS);
      panel.querySelectorAll('input').forEach(i => { i.value = tune[i.dataset.k]; });
      apply(); sync();
    }
    if (act === 'copy') {
      try { await navigator.clipboard.writeText(location.href); e.target.textContent = 'Скопировано'; }
      catch { e.target.textContent = 'Не удалось'; }
      setTimeout(() => { e.target.textContent = 'Скопировать ссылку'; }, 1500);
    }
  });
  sync();
}

// Прелоудер (script.js) ждёт этого сигнала — и при успехе, и при ошибке
const ready = () => { window.__card3dReady = true; window.dispatchEvent(new Event('card3d-ready')); };
// Карточку строим, когда браузер освободился после показа стартового экрана: так она не мешает первой отрисовке,
// а к появлению (через 3 с после клика) всё равно успевает
const whenIdle = fn => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 300));
new Promise(resolve => whenIdle(resolve)).then(init).then(ready, error => { ready(); throw error; }).catch(error => {
  console.warn('3D-карточка недоступна, показываю обычную:', error);
  mount.remove();
});
