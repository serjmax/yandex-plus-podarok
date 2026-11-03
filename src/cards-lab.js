// Страница сравнения вариантов карточки (cards.html): несколько 3D-карт рядом.
// Каждая берёт свою графику из assets/card3d/lab/<вариант>/ (card.svg и pattern.svg) и свою гравировку,
// свет и материал — те же, что на основной странице (LANDING_LOOK / LANDING_LIGHT из card.js).
// Карта поворачивается за курсором, когда он над её ячейкой, в покое слегка покачивается.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { createCard, LANDING_LOOK, LANDING_LIGHT } from './card.js';

const TILT = THREE.MathUtils.degToRad(18);
const PAD_X = 1.4; // холст шире карточки, чтобы при наклоне углы не обрезались
const k = 343 / 526; // координаты макета 526×326 → единицы card.svg 343×213

async function mountCard(cell) {
  const mount = cell.querySelector('.lab-card__canvas');
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

  // Знак плюса в подписи — шлифованный кружок; вся графика card.svg — тёмная гравировка полированным металлом
  const plusY = +cell.dataset.plusY;
  const engraving = { polish: [{ cx: 201.45 * k, cy: plusY * k, r: 9.35 * k }], iconsRegion: [0, 0, 343, 213] };
  const card = await createCard(renderer, { ...LANDING_LOOK, assets: `./assets/card3d/lab/${cell.dataset.variant}/`, assetsVersion: 1, engraving });
  const box = new THREE.Box3().setFromObject(card);
  const size = box.getSize(new THREE.Vector3());
  card.position.sub(box.getCenter(new THREE.Vector3()));
  pivot.add(card);
  pivot.scale.setScalar(2 / size.x);

  const resize = () => {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0, PAD_X / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  };
  new ResizeObserver(resize).observe(mount);
  resize();

  let targetX = 0, targetY = 0, active = false, idleSince = 0;
  cell.addEventListener('pointermove', e => {
    const r = mount.getBoundingClientRect();
    const px = THREE.MathUtils.clamp((e.clientX - r.left) / r.width, 0, 1);
    const py = THREE.MathUtils.clamp((e.clientY - r.top) / r.height, 0, 1);
    targetY = (px * 2 - 1) * TILT;
    targetX = (py * 2 - 1) * TILT;
    active = true;
  });
  cell.addEventListener('pointerleave', () => { active = false; targetX = targetY = 0; idleSince = performance.now(); });

  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(mount);
  const phase = Math.random() * 6; // карточки покачиваются вразнобой
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!visible) return;
    const t = clock.elapsedTime + phase;
    const idle = active ? 0 : Math.min(1, (performance.now() - idleSince) / 1500);
    const kk = 1 - Math.exp(-(active ? 9 : 4) * dt);
    pivot.rotation.x += (targetX + idle * (0.2 * Math.sin(t * 1.3) + 0.05) - pivot.rotation.x) * kk;
    pivot.rotation.y += (targetY + idle * 0.34 * Math.sin(t) - pivot.rotation.y) * kk;
    pivot.rotation.z += (idle * (-0.04 + 0.05 * Math.sin(t * 0.75 + 1)) - pivot.rotation.z) * kk;
    renderer.render(scene, camera);
  });
  cell.classList.add('is-ready');
}

/* ---------- Слайдер: стрелки, точки, свайп, клавиши ← → ---------- */
// Невидимые слайды не рисуются: IntersectionObserver в mountCard учитывает обрезку .lab__viewport
const track = document.querySelector('.lab__track');
const slides = [...document.querySelectorAll('.lab-card')];
const prev = document.querySelector('.lab__arrow--prev'), next = document.querySelector('.lab__arrow--next');
const dots = document.querySelector('.lab__dots');
let index = 0;
slides.forEach((slide, i) => {
  const dot = document.createElement('button');
  dot.type = 'button'; dot.className = 'lab__dot'; dot.setAttribute('aria-label', slide.querySelector('.lab-card__name').textContent);
  dot.addEventListener('click', () => go(i));
  dots.appendChild(dot);
});
const go = i => {
  index = Math.max(0, Math.min(slides.length - 1, i));
  track.style.transform = `translateX(${-index * 100}%)`;
  prev.disabled = index === 0; next.disabled = index === slides.length - 1;
  [...dots.children].forEach((d, j) => d.classList.toggle('is-active', j === index));
};
prev.addEventListener('click', () => go(index - 1));
next.addEventListener('click', () => go(index + 1));
addEventListener('keydown', e => { if (e.key === 'ArrowLeft') go(index - 1); if (e.key === 'ArrowRight') go(index + 1); });
// Свайп пальцем (мышью не тянем — мышь вращает карточку)
let startX = 0, dx = 0, dragging = false;
const viewport = document.querySelector('.lab__viewport');
viewport.addEventListener('touchstart', e => { startX = e.touches[0].clientX; dx = 0; dragging = true; track.classList.add('is-dragging'); }, { passive: true });
viewport.addEventListener('touchmove', e => {
  if (!dragging) return;
  dx = e.touches[0].clientX - startX;
  track.style.transform = `translateX(calc(${-index * 100}% + ${dx}px))`;
}, { passive: true });
const endSwipe = () => {
  if (!dragging) return;
  dragging = false; track.classList.remove('is-dragging');
  go(Math.abs(dx) > viewport.clientWidth * 0.15 ? index + (dx < 0 ? 1 : -1) : index);
};
viewport.addEventListener('touchend', endSwipe);
viewport.addEventListener('touchcancel', endSwipe);
go(0);

// Карты строим по очереди — так страница не подвисает на сборке текстур
(async () => {
  for (const cell of document.querySelectorAll('.lab-card')) {
    try { await mountCard(cell); }
    catch (error) { console.warn('Карточка не построилась:', cell.dataset.variant, error); }
  }
})();
