// 중앙 광장: 인트로(도시가 솟는 연출), 도시 밖 거리, 체온탑.
import * as THREE from 'three';
import gsap from 'gsap';
import { C, PALETTE } from '../config/palette.js';
import { SITES, DISTRICTS } from '../config/layout.js';
import { SCENES } from '../content/scenes.js';
import { warmth } from '../core/warmth.js';
import { rng, clamp, smooth } from '../core/rng.js';
import { step, tone, SET_POINT, KICK_INTERVAL, KICK_TARGETS } from '../math/thermo.js';
import { box, prop, boxGeo, plate, glowMaterial, edgeMaterial } from '../world/props.js';

export function createPlaza(app) {
  const { scene, buildings, citizens, ui } = app;
  const group = new THREE.Group();
  scene.add(group);
  (app.propGroups ??= []).push({ group, x: 0 });

  // ═══ 체온탑 ════════════════════════════════════════
  const TOP = 23;
  const tower = new THREE.Group();
  group.add(tower);
  const base = prop(new THREE.CylinderGeometry(2.3, 2.7, 0.7, 6).toNonIndexed().translate(0, 0.35, 0), { h: 2 });
  tower.add(base);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const p = box(0.2, TOP, 0.2, { h: 9 });
    p.position.set(sx * 0.78, 0.7, sz * 0.78);
    tower.add(p);
  }
  for (let y = 3.6; y < TOP; y += 3.6) {
    const r = box(1.9, 0.12, 1.9, { h: 8 });
    r.position.y = y + 0.7;
    tower.add(r);
  }
  const cap = prop(new THREE.CylinderGeometry(0.5, 1.35, 1.1, 6).toNonIndexed().translate(0, 0.55, 0), { h: 12 });
  cap.position.y = TOP + 0.7;
  tower.add(cap);
  const spire = box(0.1, 2.6, 0.1, { h: 13 });
  spire.position.y = TOP + 1.8;
  tower.add(spire);

  // 수은주: 체온에 따라 높이와 색이 바뀐다
  const mercuryMat = glowMaterial(PALETTE.amber);
  const colG = new THREE.CylinderGeometry(0.34, 0.34, 1, 12);
  colG.translate(0, 0.5, 0);
  const column = new THREE.Mesh(colG, mercuryMat);
  column.position.y = 1.2;
  tower.add(column);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 14), mercuryMat);
  bulb.position.y = 1.35;
  tower.add(bulb);
  const levelFor = (T) => 2 + clamp((T - 33.6) / 5.8) * (TOP - 2.6);
  const setTemp = (T) => {
    column.scale.y = levelFor(T);
    mercuryMat.color.copy(C[tone(T)]);
  };
  setTemp(SET_POINT);

  // 세 지구로 뻗는 빛
  const rays = ['recovery', 'regulation', 'dignity'].map((key) => {
    const c = DISTRICTS[key].c;
    const len = Math.hypot(c.x, c.z);
    const g = new THREE.BoxGeometry(1, 0.06, 0.34);
    g.translate(0.5, 0.05, 0);
    const m = new THREE.Mesh(g, glowMaterial(PALETTE.amber));
    m.rotation.y = Math.atan2(-c.z, c.x);
    m.position.set((c.x / len) * 3.4, 0, (c.z / len) * 3.4);
    m.userData.len = len - 3.4 - 5;
    m.scale.x = 0.0001;
    m.visible = false;
    group.add(m);
    return m;
  });

  // ═══ 과열의 입구 ═══════════════════════════════════
  const E = SITES.entrance;
  const TG = SITES.entranceTarget;
  plate(group, { x: -2.5, z: E.z, w: 27, d: 5.6 });
  const rand = rng(77);
  for (let x = -14.5; x < 6.5; x += 3.15) {
    for (const side of [-1, 1]) {
      const h = 2.1 + rand() * 3.3;
      buildings.add({ x: x + (rand() - 0.5) * 0.3, z: E.z + side * (4.3 + rand() * 0.25), w: 2.3 + rand() * 0.5, d: 2.5 + rand() * 0.6, h, shape: rand() > 0.82 && h > 5 ? 'step' : 'box' });
    }
  }
  for (const side of [-1, 1]) buildings.add({ x: TG.x + 0.4, z: TG.z + side * 5.2, w: 2.6, d: 2.8, h: 2.6 + rand() * 2 });

  // 비난이 몰리는 건물: 조각 20개로 쌓아 두고 무너뜨린다
  const CH = 1.5;
  const NX = 2;
  const NY = 5;
  const TW = CH * NX;
  const TH = CH * NY;
  const targetGroup = new THREE.Group();
  targetGroup.position.set(TG.x, 0, TG.z);
  group.add(targetGroup);
  const chunkGeo = new THREE.BoxGeometry(CH, CH, CH);
  const chunkProto = prop(chunkGeo, { h: 8, tint: C.red, edges: false });
  const chunks = [];
  for (let ix = 0; ix < NX; ix++)
    for (let iy = 0; iy < NY; iy++)
      for (let iz = 0; iz < NX; iz++) {
        const m = new THREE.Mesh(chunkGeo, chunkProto.material);
        const home = new THREE.Vector3((ix - 0.5) * CH, (iy + 0.5) * CH, (iz - 0.5) * CH);
        m.position.copy(home);
        targetGroup.add(m);
        chunks.push({ m, home, v: new THREE.Vector3(), w: new THREE.Vector3(), level: iy, rest: 0, done: false, delay: 0 });
      }
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo(TW, TH, TW)), edgeMaterial);
  targetGroup.add(outline);
  const targetHeat = chunkProto.heatU;

  // 금: 카메라 쪽 면(-x)과 양 옆면에 번지는 레드 선
  const crackPts = [];
  const crand = rng(5);
  const half = TW / 2 + 0.03;
  for (let k = 0; k < 20; k++) {
    const face = k % 4; // 0,1: -x면  2: +z면  3: -z면
    let u = (crand() - 0.5) * TW * 0.9;
    let y = 0.3 + crand() * (TH - 1.5);
    const dir = crand() > 0.5 ? 1 : -1;
    const n = 4 + Math.floor(crand() * 5);
    for (let s = 0; s < n; s++) {
      const nu = clamp(u + (crand() - 0.5) * 1.1, -TW / 2 + 0.05, TW / 2 - 0.05);
      const ny = clamp(y + dir * (0.35 + crand() * 0.75), 0.05, TH - 0.05);
      const a = face < 2 ? [-half, y, u] : face === 2 ? [u, y, half] : [u, y, -half];
      const b = face < 2 ? [-half, ny, nu] : face === 2 ? [nu, ny, half] : [nu, ny, -half];
      crackPts.push(...a, ...b);
      u = nu;
      y = ny;
    }
  }
  const crackG = new THREE.BufferGeometry();
  crackG.setAttribute('position', new THREE.Float32BufferAttribute(crackPts, 3));
  const cracks = new THREE.LineSegments(crackG, new THREE.LineBasicMaterial({ color: PALETTE.red, fog: false }));
  crackG.setDrawRange(0, 0);
  targetGroup.add(cracks);
  const crackTotal = crackPts.length / 3;

  // 거리의 시민
  const streetIds = citizens.claim(34);
  const srand = rng(31);
  streetIds.forEach((id, k) => {
    const x = -15 + (k / streetIds.length) * 21 + srand() * 0.5;
    citizens.setHome(id, x, E.z + (srand() - 0.5) * 3.6, 0, Math.PI / 2 + (srand() - 0.5) * 0.6);
    citizens.wr[id] = 0.25;
  });
  const order = [...streetIds].sort((a, b) => Math.abs(citizens.hx[b] - TG.x) - Math.abs(citizens.hx[a] - TG.x)).reverse();

  // 빔: 사방 하늘에서 한 건물로
  const NBEAM = 44;
  const brand = rng(11);
  const beamDefs = Array.from({ length: NBEAM }, (_, i) => {
    const az = brand() * Math.PI * 2;
    const el = (16 + brand() * 52) * (Math.PI / 180);
    const dist = 34 + brand() * 30;
    const from = new THREE.Vector3(TG.x + Math.cos(az) * Math.cos(el) * dist, Math.sin(el) * dist, TG.z + Math.sin(az) * Math.cos(el) * dist);
    const to = new THREE.Vector3(TG.x + (brand() - 0.5) * TW * 0.9, 0.6 + brand() * (TH - 0.8), TG.z + (brand() - 0.5) * TW * 0.9);
    return { from, to, at: 1.7 + i * 0.058 + brand() * 0.05, r: 0.045 + brand() * 0.055, ph: brand() * 10 };
  });
  const T_CRACK = 4.5;
  const T_FALL = 6.1;
  const tip = new THREE.Vector3();
  let fallen = false;
  let sparks = [];

  function resetTarget() {
    fallen = false;
    sparks = [];
    outline.visible = true;
    cracks.visible = true;
    crackG.setDrawRange(0, 0);
    targetHeat.value = 0;
    for (const c of chunks) {
      c.m.position.copy(c.home);
      c.m.rotation.set(0, 0, 0);
      c.done = false;
    }
  }
  function startFall() {
    fallen = true;
    outline.visible = false;
    cracks.visible = false;
    const fr = rng(3);
    chunks.forEach((c, k) => {
      const a = Math.atan2(c.home.z, c.home.x) + (fr() - 0.5) * 1.6;
      const sp = 0.7 + fr() * 2.6;
      c.v.set(Math.cos(a) * sp, fr() * 1.2, Math.sin(a) * sp);
      c.w.set((fr() - 0.5) * 5, (fr() - 0.5) * 3, (fr() - 0.5) * 5);
      c.delay = c.level * 0.085;
      c.rest = CH * 0.42 + (k % 3) * 0.42 * (fr() > 0.4 ? 1 : 0);
      c.done = false;
    });
    const n = Math.round(160 * app.particleScale);
    sparks = Array.from({ length: n }, () => {
      const a = fr() * Math.PI * 2;
      const sp = 2 + fr() * 7;
      return { p: new THREE.Vector3(TG.x + (fr() - 0.5) * TW, 0.5 + fr() * TH, TG.z + (fr() - 0.5) * TW), v: new THREE.Vector3(Math.cos(a) * sp, 1 + fr() * 6, Math.sin(a) * sp), life: 0.8 + fr() * 1.4 };
    });
  }

  let stats = null;
  const entrance = {
    enter() {
      resetTarget();
      const sc = SCENES[1];
      stats = ui.stats([
        { label: sc.t.beams, value: '0', tone: 'red' },
        { label: sc.t.marked, value: '0', tone: 'red' },
      ]);
      ui.button(sc.t.replay, () => {
        resetTarget();
        citizens.clearMarks();
        app.beams.clear();
        app.particles.clear();
        app.tour.sceneTime = 1.2;
        warmth.focus(0, { x: TG.x, y: 3.5, z: TG.z }, 7.5, { dur: 1.5, delay: 0.5 });
      });
      warmth.focus(0, { x: TG.x, y: 3.5, z: TG.z }, 7.5, { dur: 1.5, delay: 1.7 });
      app.labels.add(sc.t.alarm, { x: SITES.alert.x, y: 17.2, z: SITES.alert.z }, { kind: 'plain', tone: 'red' });
      for (const id of streetIds) citizens.hold(id, citizens.hx[id], 0, citizens.hz[id], Math.PI / 2);
    },
    exit() {
      resetTarget();
      app.alertTower?.set(false);
    },
    update(dt, t, gt) {
      app.alertTower?.set(true, gt);
      // 빔이 하나씩 꽂힌다
      let landed = 0;
      for (let i = 0; i < NBEAM; i++) {
        const b = beamDefs[i];
        const k = clamp((t - b.at) / 0.24);
        const out = fallen ? clamp(1 - (t - T_FALL) / 0.7) : 1;
        if (k <= 0 || out <= 0) {
          app.beams.hide(i);
          continue;
        }
        if (k >= 1) landed++;
        tip.lerpVectors(b.from, b.to, k);
        app.beams.set(i, b.from, tip, b.r * out * (0.8 + 0.3 * Math.sin(gt * 9 + b.ph)), C.red);
      }
      if (!fallen) targetHeat.value = Math.min(1.25, (landed / NBEAM) * 1.05 + (t > T_CRACK ? 0.25 * Math.sin(gt * 14) ** 2 : 0));
      // 의혹 표시가 가까운 시민부터 번진다
      let marked = 0;
      order.forEach((id, k) => {
        if (t > 2.4 + k * 0.13) {
          marked++;
          if (!citizens.dotT[id]) citizens.mark(id, C.red);
        }
      });
      this.maxLanded = fallen ? this.maxLanded : landed;
      stats.set(0, String(this.maxLanded ?? landed));
      stats.set(1, `${marked}<small>명</small>`);
      // 금이 간다 → 무너진다
      if (!fallen) {
        const k = smooth(T_CRACK, T_FALL - 0.1, t);
        crackG.setDrawRange(0, Math.floor((k * crackTotal) / 2) * 2);
        if (t >= T_FALL) startFall();
      } else {
        const ft = t - T_FALL;
        targetHeat.value = Math.max(0.12, 1.1 - ft * 0.32);
        for (const c of chunks) {
          if (c.done || ft < c.delay) continue;
          c.v.y -= 15 * dt;
          c.m.position.addScaledVector(c.v, dt);
          c.m.rotation.x += c.w.x * dt;
          c.m.rotation.y += c.w.y * dt;
          c.m.rotation.z += c.w.z * dt;
          if (c.m.position.y < c.rest) {
            c.m.position.y = c.rest;
            if (Math.abs(c.v.y) > 2.2) {
              c.v.y *= -0.22;
              c.v.x *= 0.55;
              c.v.z *= 0.55;
              c.w.multiplyScalar(0.45);
            } else c.done = true;
          }
        }
        // 부서지며 튀는 불티
        let n = 0;
        for (const s of sparks) {
          s.life -= dt;
          if (s.life <= 0) continue;
          s.v.y -= 9 * dt;
          s.p.addScaledVector(s.v, dt);
          if (s.p.y < 0.05) {
            s.p.y = 0.05;
            s.v.set(0, 0, 0);
          }
          app.particles.set(n++, s.p.x, s.p.y, s.p.z, C.red, 0.13 * clamp(s.life));
        }
        app.particles.commit(n);
      }
    },
  };

  // ═══ 인트로: 로딩 화면이 걷히면 도시가 가운데에서 바깥으로 솟는다 ═══
  let it = 0;
  let introShown = false;
  let riseDone = false;
  const setRise = (radius) => {
    if (radius === null) {
      buildings.setRise(null);
      for (const g of app.propGroups) g.group.scale.y = 1;
      return;
    }
    // 반경 radius 안쪽 건물부터 차례로 솟는다
    buildings.setRise((b) => smooth(-6, 16, radius - Math.hypot(b.x, b.z)));
    for (const g of app.propGroups) g.group.scale.y = Math.max(0.0001, smooth(-6, 16, radius - Math.abs(g.x)));
  };

  const intro = {
    enter() {
      it = 0;
      introShown = riseDone = false;
      setRise(app.introGo ? -20 : -40);
    },
    exit() {
      setRise(null);
      ui.showIntro(false);
    },
    update(dt) {
      if (!app.introGo) return; // 로딩 화면이 걷힐 때까지 기다린다
      it += dt;
      if (!riseDone) {
        const k = app.reduced ? 1 : clamp(it / 3.8);
        const e = 1 - (1 - k) ** 2.4;
        if (k >= 1) {
          setRise(null);
          riseDone = true;
        } else setRise(-20 + 190 * e);
      }
      if (!introShown && (it > 3.6 || app.reduced)) {
        introShown = true;
        ui.showIntro(true);
      }
    },
  };

  // ═══ 체온탑 ════════════════════════════════════════
  let T = SET_POINT;
  let shakeAt = 0;
  let settled = false;
  let cards = [];
  const T_START = 1.4;
  const kicksEnd = () => T_START + KICK_TARGETS.length * KICK_INTERVAL;

  function settle() {
    settled = true;
    rays.forEach((r, i) => {
      r.visible = true;
      gsap.to(r.scale, { x: r.userData.len, duration: app.reduced ? 0.01 : 1.5, delay: i * 0.12, ease: 'power2.out' });
    });
    ['recovery', 'regulation', 'dignity'].forEach((key, i) => {
      const c = DISTRICTS[key].c;
      warmth.focus(i + 1, { x: c.x, y: 0, z: c.z }, 13, { dur: 1.8, delay: 1.3 + i * 0.12, slotHeat: 0.9 });
    });
    cards.forEach((c, i) => setTimeout(() => c.classList.remove('wait'), app.reduced ? 0 : 900 + i * 220));
    skyRay.k = 0;
    gsap.to(skyRay, { k: 1, duration: app.reduced ? 0.01 : 1.7, ease: 'power2.out' });
  }
  // 건물 위로 지나 세 지구에 닿는 빛 (고층 사이에서도 보이도록)
  const skyRay = { k: 0 };
  const skyFrom = new THREE.Vector3(0, TOP - 1, 0);
  const skyTo = ['recovery', 'regulation', 'dignity'].map((key) => new THREE.Vector3(DISTRICTS[key].c.x, 3, DISTRICTS[key].c.z));
  const skyTip = new THREE.Vector3();
  function drawSky() {
    skyTo.forEach((to, i) => {
      if (skyRay.k <= 0.001) return app.beams.hide(90 + i);
      skyTip.lerpVectors(skyFrom, to, skyRay.k);
      app.beams.set(90 + i, skyFrom, skyTip, 0.16, C.amber);
    });
  }
  function shake(now) {
    shakeAt = now - T_START + 0.2;
    settled = false;
    gsap.killTweensOf(rays.map((r) => r.scale));
    rays.forEach((r) => {
      r.scale.x = 0.0001;
      r.visible = false;
    });
    for (let i = 1; i <= 3; i++) warmth.fade(i, 0.5);
    gsap.killTweensOf(skyRay);
    skyRay.k = 0;
    cards.forEach((c) => c.classList.add('wait'));
  }

  const towerScene = {
    enter() {
      const sc = SCENES[2];
      T = SET_POINT;
      shakeAt = 0;
      settled = false;
      skyRay.k = 0;
      rays.forEach((r) => {
        r.scale.x = 0.0001;
        r.visible = false;
      });
      cards = ui.cards(
        sc.t.cards.map((c) => ({ title: c.title, text: c.text, tone: 'amber', cls: 'wait', onClick: () => app.tour.go(c.to) })),
      );
      ui.button(sc.t.shake, () => shake(app.tour.sceneTime));
      warmth.focus(0, { x: 0, y: 0, z: 0 }, 13, { dur: 1.6, delay: 0.8 });
    },
    exit() {
      gsap.killTweensOf(rays.map((r) => r.scale));
      gsap.killTweensOf(skyRay);
      skyRay.k = 0;
      rays.forEach((r) => (r.visible = false));
      setTemp(SET_POINT);
    },
    update(dt, t) {
      const sc = SCENES[2];
      const lt = t - shakeAt;
      const j = Math.floor((lt - T_START) / KICK_INTERVAL);
      const into = lt - T_START - j * KICK_INTERVAL;
      if (lt >= T_START && j < KICK_TARGETS.length && into < 0.3) {
        // 교란: 0.6초마다 위아래로 민다
        T += (KICK_TARGETS[j] - T) * (1 - Math.exp(-15 * dt));
      } else T = step(T, dt);
      if (app.reduced && !settled) T = SET_POINT;
      setTemp(T);
      const tn = tone(T);
      const word = tn === 'red' ? sc.t.hot : tn === 'blue' ? sc.t.cold : sc.t.ok;
      ui.hud(`<div class="temp">${T.toFixed(1)}<small>℃</small></div><div class="state">${word}</div>`, tn);
      drawSky();
      if (!settled && (app.reduced || (lt > kicksEnd() + 0.6 && Math.abs(T - SET_POINT) < 0.06))) settle();
    },
  };

  return { 0: intro, 1: entrance, 2: towerScene };
}
