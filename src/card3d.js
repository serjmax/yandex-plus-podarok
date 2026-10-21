// 3D-карточка из card-3d-playground (src/card.js): металлическая карта с сиреневым переливом.
// Поворачивается за курсором или пальцем, в покое слегка покачивается.
// Панель настройки (?tune) сейчас выключена — включается флагом TUNE_PANEL ниже.
// Если WebGL недоступен, остаётся CSS-карточка (.gift-card).
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { createCard } from './card.js?v=5';

const scene3d = document.getElementById('card-scene');
const mount = document.getElementById('card3d');

// Свет и материал: металл с перламутровым (сиреневым) переливом
const LOOK = {
  metalness: 1,
  keyPower: 1.4, keyColor: '#ffd9ee', key: [-3, 5, 4],     // тёплый розоватый
  fillPower: 0.9, fillColor: '#c3c2ff', fill: [4, 2, -3],   // холодный сиреневый
  ambient: 0.2, envPower: 1.6, exposure: 1.15,
  grain: 0.5, grainSize: 0.15, brush: 0.3,
  blacken: 0, // надписи красятся отдельным слоем ниже
  // Пастельные разводы по диагонали: сиренево-голубой → белый → розоватый → серо-сиреневый
  tint: ['#c9cbee', '#f6f2fa', '#efd6ea', '#c6c0dc'],
};
// Настраиваемое (панель ?tune и параметры ссылки). Значения подобраны в панели 22.10.
const TUNE_PANEL = false;
const TUNE_DEFAULTS = {
  lc: '#211730', // цвет надписей
  mt: '#d1d0d2', // оттенок металла
  ir: 0.04,      // сила перелива (iridescence)
  sh: 0,         // сиреневый отблеск по краям (sheen)
  ro: 0.35,      // шероховатость: меньше — зеркальнее
  pa: 0.49,      // заметность паттерна из плюсов
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
  renderer.toneMappingExposure = LOOK.exposure;
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = LOOK.envPower;
  room.dispose();

  const key = new THREE.DirectionalLight(LOOK.keyColor, LOOK.keyPower);
  key.position.set(...LOOK.key);
  const fill = new THREE.DirectionalLight(LOOK.fillColor, LOOK.fillPower);
  fill.position.set(...LOOK.fill);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c9185, LOOK.ambient), key, fill);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const pivot = new THREE.Group();
  scene.add(pivot);

  const card = await createCard(renderer, { ...LOOK, pattern: tune.pa });
  const metals = [];
  card.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const m of [mesh.material].flat()) {
      m.metalness = LOOK.metalness;
      // Тонкоплёночный перелив: цвет блика меняется с углом наклона — сиреневый, розовый, голубой
      m.iridescenceIOR = 1.3;
      m.iridescenceThicknessRange = [120, 480];
      m.sheenColor = new THREE.Color('#e3c4ff');
      m.sheenRoughness = 0.45;
      metals.push(m);
    }
  });

  // Надписи «12» и «месяцев» — отдельный слой поверх лицевой стороны, чтобы цвет менялся мгновенно
  const WIDTH = 0.0856, HEIGHT = WIDTH * 213 / 343, FRONT = 0.0004; // метры, как в card.js
  const svg = (await (await fetch('./assets/card3d/card.svg?v=3')).text()).replace(/<rect[^>]*\/>/, '');
  const art = new Image();
  art.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await art.decode();
  const letters = document.createElement('canvas');
  letters.width = innerWidth < 800 ? 1536 : 3072;
  letters.height = Math.round(letters.width * 213 / 343);
  letters.getContext('2d').drawImage(art, 0, 0, letters.width, letters.height);
  const lettersTex = new THREE.CanvasTexture(letters);
  lettersTex.colorSpace = THREE.SRGBColorSpace;
  lettersTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ink = new THREE.MeshPhysicalMaterial({
    map: lettersTex, transparent: true, depthWrite: false,
    metalness: 0.15, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.3,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const inkPlane = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), ink);
  inkPlane.position.z = FRONT + 0.00002;
  card.add(inkPlane);

  function applyTune() {
    for (const m of metals) {
      m.color.set(tune.mt);
      m.roughness = tune.ro;
      m.iridescence = tune.ir;
      m.sheen = tune.sh;
    }
    ink.color.set(tune.lc);
  }
  applyTune();
  // Паттерн запечён в текстуры — пересобираем их, когда ползунок остановился
  let patternTimer = 0, patternNow = tune.pa;
  const applyAll = () => {
    applyTune();
    if (tune.pa === patternNow) return;
    clearTimeout(patternTimer);
    patternTimer = setTimeout(() => { patternNow = tune.pa; card.userData.setSurface({ ...LOOK, pattern: tune.pa }); }, 300);
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

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!visible) return;
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

init().catch(error => {
  console.warn('3D-карточка недоступна, показываю обычную:', error);
  mount.remove();
});
