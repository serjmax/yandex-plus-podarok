// 3D-карточка из card-3d-playground: серебряная карта (src/card.js) со светом пресета «Металл».
// Поворачивается за курсором или пальцем, в покое слегка покачивается.
// Если WebGL недоступен, остаётся CSS-карточка (.gift-card).
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { createCard } from './card.js?v=2';

const scene3d = document.getElementById('card-scene');
const mount = document.getElementById('card3d');

// Пресет «Металл» из плейграунда
const LOOK = {
  color: '#bec6d3', metalness: 1, roughness: 0.22,
  keyPower: 1, keyColor: '#fff4e5', key: [-3, 5, 4],
  fillPower: 0.4, fillColor: '#dbe8ff', fill: [4, 2, -3],
  ambient: 0.15, envPower: 1.8, exposure: 1,
  grain: 0.5, grainSize: 0.15, brush: 0.3,
};
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

  const card = await createCard(renderer, LOOK);
  card.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const m of [mesh.material].flat()) {
      m.color.set(LOOK.color);
      m.metalness = LOOK.metalness;
      m.roughness = LOOK.roughness;
    }
  });
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

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!visible) return;
    const t = clock.elapsedTime;
    // Покачивание в покое плавно нарастает после того, как карточку отпустили
    const idle = active ? 0 : Math.min(1, (performance.now() - idleSince) / 1500);
    const floatX = idle * (0.1 * Math.sin(t * 1.05) + 0.05);
    const floatY = idle * 0.16 * Math.sin(t * 0.8);
    const floatZ = idle * (-0.04 + 0.02 * Math.sin(t * 0.6));
    const k = 1 - Math.exp(-(active ? 9 : 4) * dt);
    pivot.rotation.x += (targetX + floatX - pivot.rotation.x) * k;
    pivot.rotation.y += (targetY + floatY - pivot.rotation.y) * k;
    pivot.rotation.z += (floatZ - pivot.rotation.z) * k;
    renderer.render(scene, camera);
  });

  scene3d.classList.add('has-3d');
}

init().catch(error => {
  console.warn('3D-карточка недоступна, показываю обычную:', error);
  mount.remove();
});
