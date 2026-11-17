// 36.5 — 렌더러, 루프, 리사이즈.
import './styles.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { applyCssPalette, PALETTE } from './palette.js';
import { createPlatform } from './world/platform.js';
import { Buildings } from './world/buildings.js';
import { Citizens } from './world/citizens.js';
import { Particles } from './core/particles.js';
import { Beams } from './core/beams.js';
import { Labels } from './core/labels.js';
import { warmth } from './core/warmth.js';
import { createPostFX } from './core/postfx.js';
import { Tour } from './core/tour.js';
import { Walk } from './core/walk.js';
import { UI } from './ui/overlay.js';
import { createPlaza } from './districts/plaza.js';
import { createRecovery } from './districts/recovery.js';
import { createRegulation } from './districts/regulation.js';
import { createDignity } from './districts/dignity.js';
import { createFinale } from './districts/finale.js';
import { planParks, createGreens } from './world/greens.js';
import { mountLoader } from './ui/loader.js';
import { SCENES } from './scenes.js';

applyCssPalette();
const loader = mountLoader();

// 장면 카메라가 장치를 보는 시선. 이 길목의 건물은 낮게 지어 장치를 가리지 않게 한다.
// 장면의 sight(반경)와 부분(parts)의 카메라를 모두 본다.
function sightlines() {
  const D2R = Math.PI / 180;
  const out = [];
  const add = (cam, base, r, lift = 0) => {
    const c = { ...base, ...cam };
    const el = c.el * D2R;
    const az = c.az * D2R;
    const cx = c.target[0] + c.dist * Math.cos(el) * Math.sin(az);
    const cy = c.target[1] + c.dist * Math.sin(el);
    const cz = c.target[2] + c.dist * Math.cos(el) * Math.cos(az);
    const tx = c.target[0];
    const tz = c.target[2];
    const D = Math.hypot(cx - tx, cz - tz);
    out.push({ tx, tz, ty: lift, dx: (cx - tx) / D, dz: (cz - tz) / D, D, cy, r });
  };
  for (const sc of SCENES) {
    const list = [[sc.cam, sc.sight, 0]];
    if (sc.cam2) list.push([sc.cam2, sc.sight, 0]);
    for (const p of sc.parts ?? []) list.push([p.cam, p.sight ?? sc.sight, p.lift ?? 0]);
    for (const [cam, r, lift] of list) if (r) add(cam, sc.cam, r, lift);
  }
  return out;
}

function boot() {
  const canvas = document.getElementById('gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch {
    loader.fail();
    document.getElementById('fallback').hidden = false;
    return;
  }
  const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(PALETTE.skyHorizon);
  renderer.toneMapping = THREE.NoToneMapping; // 팔레트 색이 그대로 화면에 나오게

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.5, 1600);

  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const app = {
    renderer,
    scene,
    camera,
    mobile,
    reduced: reducedQuery.matches,
    // 움직임 줄이기: 입자 수를 줄인다
    get particleScale() {
      return this.reduced ? 0.3 : this.mobile ? 0.6 : 1;
    },
  };
  warmth.setReducedMotion(app.reduced);
  reducedQuery.addEventListener?.('change', (e) => {
    app.reduced = e.matches;
    warmth.setReducedMotion(e.matches);
  });

  app.loader = loader;
  app.introGo = false;
  app.labels = new Labels(app);
  app.ui = new UI(app);
  createPlatform(app);
  app.buildings = new Buildings(app);
  app.citizens = new Citizens(app);
  app.particles = new Particles(app);
  app.beams = new Beams(app);

  // 지구마다 장치를 세우고, 장면 번호 → 동작을 받는다
  const behaviours = {
    ...createPlaza(app),
    ...createRecovery(app),
    ...createRegulation(app),
    ...createDignity(app),
    ...createFinale(app),
  };
  const parks = planParks();
  app.buildings.populate(sightlines(), parks);
  createGreens(app, parks);
  app.citizens.scatter((x, z) => app.buildings.isOpen(x, z) && !app.greens.onRoad(x, z));

  const fx = createPostFX(renderer, scene, camera);
  app.fx = fx;
  const tour = (app.tour = new Tour(app, behaviours));
  app.walk = new Walk(app);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h);
    fx.setSize(w, h, pixelRatio());
    app.particles.resize(h * pixelRatio(), camera.fov);
    tour.resize();
  }
  window.addEventListener('resize', resize);
  resize();
  tour.start();
  // 도시가 준비되면 눈금을 채우고 화면을 걷는다. 다른 장면 주소로 들어온 경우는 짧게 보여 준다.
  loader.run(app, { quick: tour.index !== 0 });

  const clock = new THREE.Clock();
  let t = 0;
  function tick(dt) {
    t += dt;
    warmth.update(t);
    tour.update(dt, t);
    app.citizens.update(dt, t);
    app.greens?.update(dt);
  }
  function frame() {
    tick(Math.min(0.05, clock.getDelta()));
    app.labels.update();
    fx.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    window.__app = app;
    // 개발용: 시간을 sec초만큼 빨리 감는다 (gsap 포함)
    app.advance = (sec) => {
      const n = Math.round(sec * 30);
      for (let i = 0; i < n; i++) {
        gsap.ticker.tick?.();
        gsap.globalTimeline.time(gsap.globalTimeline.time() + 1 / 30);
        tick(1 / 30);
      }
      app.labels.update();
      fx.render();
    };
    // 개발용: i번 장면을 처음부터 sec초 지난 모습으로
    app.jump = (i, sec = 3) => {
      if (tour.index === i) {
        tour.current?.exit?.();
        tour.index = -1;
      }
      tour.go(i, { instant: true });
      app.advance(sec);
      return { scene: i, t: tour.sceneTime };
    };
  }
}

// 전광판 글자를 캔버스에 그릴 때 Pretendard가 준비돼 있도록 기다린다 (오래 걸리면 그냥 시작)
const fontReady = document.fonts?.load ? document.fonts.load('700 40px "Pretendard Variable"', '가36.5').catch(() => {}) : Promise.resolve();
Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(boot);
