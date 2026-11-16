// 조절 지구: 별아교 숲 · 흥분독성 경보탑, 고개 드는 거리, 워터마크 전광판.
import * as THREE from 'three';
import gsap from 'gsap';
import { C, PALETTE } from '../config/palette.js';
import { SITES, DISTRICTS } from '../config/layout.js';
import { SCENES } from '../content/scenes.js';
import { warmth } from '../core/warmth.js';
import { rng, clamp, damp } from '../core/rng.js';
import { box, prop, plate, glowMaterial, lineMaterial, edgeMaterial } from '../world/props.js';

// 별아교 숲의 수치 (기획서 '인터랙션·계산 명세')
const MU_OFF = 0.1; // 별아교 끔: 매 초 q의 10%만 줄어든다
const MU_ON = 1.2; // 별아교 켬
const Q_HOT = 1; // 이보다 쌓이면 달아오른다
const Q_COOL = 0.3; // 이보다 줄면 무채색으로 돌아온다
const Q_PER_HIT = 0.1;

export function createRegulation(app) {
  const { scene, buildings, citizens, ui } = app;
  const group = new THREE.Group();
  scene.add(group);
  (app.propGroups ??= []).push({ group, x: DISTRICTS.regulation.c.x });
  app.state ??= {};
  app.state.astro = false;
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ═══ 흥분독성 경보탑 ═══════════════════════════════
  const AL = SITES.alert;
  const alertPillar = box(0.8, 12.6, 0.8, { h: 10 });
  alertPillar.position.set(AL.x, 0, AL.z);
  group.add(alertPillar);
  const alertHead = box(1.7, 0.5, 1.7, { h: 11 });
  alertHead.position.set(AL.x, 12.6, AL.z);
  group.add(alertHead);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#3a3a40' });
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), lampMat);
  lamp.position.set(AL.x, 14.3, AL.z);
  group.add(lamp);
  const lampOff = new THREE.Color('#3a3a40');
  app.alertTower = {
    set(on, gt = 0) {
      if (!on) lampMat.color.copy(lampOff);
      else lampMat.color.copy(C.red).multiplyScalar(Math.sin(gt * 5.2) > -0.2 ? 1 : 0.28);
      lamp.rotation.y = gt * 0.6;
    },
  };

  // ═══ 별아교 숲 ═════════════════════════════════════
  const F = SITES.forest;
  plate(group, { x: F.x, z: F.z, r: 10.6 });
  const starSpots = [
    { x: F.x - 4.2, z: F.z + 2.8 },
    { x: F.x + 4.6, z: F.z + 0.6 },
    { x: F.x - 0.4, z: F.z - 5.6 },
  ];
  const STAR_Y = 7.6;
  const starShape = new THREE.Shape();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 ? 0.5 : 1.3;
    starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  starShape.closePath();
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.38, bevelEnabled: false });
  starGeo.rotateX(-Math.PI / 2);
  starGeo.translate(0, -0.19, 0);
  const stars = starSpots.map((s) => {
    const pole = box(0.22, STAR_Y, 0.22, { h: 9 });
    pole.position.set(s.x, 0, s.z);
    group.add(pole);
    const star = prop(starGeo, { h: 12, tint: C.amber, glow: 0.25 });
    star.position.set(s.x, STAR_Y, s.z);
    group.add(star);
    return { ...s, star, top: v3(s.x, STAR_Y, s.z), on: 0 };
  });

  const nrand = rng(606);
  const neurons = [];
  for (let tries = 0; tries < 4000 && neurons.length < 16; tries++) {
    const a = nrand() * Math.PI * 2;
    const r = 1.5 + Math.sqrt(nrand()) * 7.6;
    const x = F.x + Math.cos(a) * r;
    const z = F.z + Math.sin(a) * r;
    if (neurons.some((n) => Math.hypot(n.x - x, n.z - z) < 3.5)) continue;
    if (starSpots.some((s) => Math.hypot(s.x - x, s.z - z) < 2.4)) continue;
    const h = 2.6 + nrand() * 3.2;
    const b = buildings.add({ x, z, w: 1.7 + nrand() * 0.5, d: 1.7 + nrand() * 0.5, h, shape: nrand() > 0.55 ? 'hex' : 'box', tint: C.red });
    Object.assign(b, { q: 0, hot: false, amber: 0, ph: nrand() * 9, roof: v3(x, h, z) });
    neurons.push(b);
  }
  // 시냅스: 가까운 건물끼리 지붕을 잇는 선
  const synPts = [];
  const seen = new Set();
  neurons.forEach((a, i) => {
    neurons
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.z - b.z) }))
      .filter((o) => o.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) return;
        seen.add(key);
        synPts.push(a.roof.clone().setY(a.h + 0.05), neurons[j].roof.clone().setY(neurons[j].h + 0.05));
      });
  });
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(synPts), lineMaterial));

  let parts = [];
  let spawnAcc = 0;
  let intensity = 55;
  const dir = v3(0, 0, 0);
  const nearestStar = (p) => stars.reduce((best, s) => (best && best.top.distanceToSquared(p) < s.top.distanceToSquared(p) ? best : s), null);

  function resetForest() {
    parts = [];
    for (const b of neurons) {
      b.q = 0;
      b.hot = false;
      b.amber = 0;
      buildings.heat(b, 0, C.amber);
    }
    for (const s of stars) {
      s.on = 0;
      s.star.heat(0);
    }
  }
  function updateForest(dt, gt, spawnAt) {
    const astro = app.state.astro;
    // 자극(알림, 숏폼)이 쏟아진다
    spawnAcc += intensity * app.particleScale * dt;
    while (spawnAcc >= 1 && parts.length < 1500) {
      spawnAcc -= 1;
      const b = spawnAt[Math.floor(Math.random() * spawnAt.length)];
      const p = v3(b.roof.x + (Math.random() - 0.5) * 3, 15 + Math.random() * 6, b.roof.z + (Math.random() - 0.5) * 3);
      parts.push({ p, v: v3(0, -1, 0), b, s: 0, t: 0, star: null });
    }
    if (spawnAcc > 3) spawnAcc = 0;
    let n = 0;
    for (const q of parts) {
      if (q.s === 0 || q.s === 1) {
        // 레드: 건물로 떨어진다. 별아교가 켜져 있으면 가까운 별 모양 탑으로 휜다.
        if (astro && q.s === 0 && q.p.y < 13.5) {
          q.s = 1;
          q.star = nearestStar(q.p);
        } else if (!astro && q.s === 1) q.s = 0;
        const goal = q.s === 1 ? q.star.top : q.b.roof;
        dir.subVectors(goal, q.p);
        const dist = dir.length();
        dir.multiplyScalar(1 / Math.max(dist, 1e-4));
        q.v.lerp(dir, q.s === 1 ? 1 - Math.exp(-4.5 * dt) : 1 - Math.exp(-9 * dt)).normalize();
        q.p.addScaledVector(q.v, 8.5 * dt);
        if (dist < 0.5) {
          if (q.s === 1) {
            q.s = 2;
            q.t = 1; // 1초 뒤 글루타민으로 나온다
            q.star.on = 1;
          } else {
            q.b.q += Q_PER_HIT;
            q.s = 9;
          }
        }
        app.particles.set(n++, q.p.x, q.p.y, q.p.z, C.red, 0.2);
      } else if (q.s === 2) {
        q.t -= dt;
        if (q.t <= 0) {
          q.s = 3;
          q.p.copy(q.star.top);
          q.p.y += 0.3;
        }
      } else if (q.s === 3) {
        // 앰버: 건물로 천천히 돌아간다
        dir.subVectors(q.b.roof, q.p);
        const dist = dir.length();
        q.p.addScaledVector(dir, Math.min(1, (2.6 * dt) / Math.max(dist, 1e-4)));
        q.p.y += Math.sin(gt * 3 + q.b.ph) * 0.004;
        if (dist < 0.3) {
          q.b.amber = 1;
          q.s = 9;
        }
        app.particles.set(n++, q.p.x, q.p.y, q.p.z, C.amber, 0.19);
      }
      if (n >= app.particles.max) break;
    }
    if (parts.length > 300) parts = parts.filter((q) => q.s !== 9);
    app.particles.commit(n);

    // 충전량 q: 닿을 때마다 오르고, 매 초 q × μ만큼 줄어든다
    const mu = astro ? MU_ON : MU_OFF;
    let hot = 0;
    for (const b of neurons) {
      b.q = Math.max(0, b.q - b.q * mu * dt);
      if (b.q > Q_HOT) b.hot = true;
      else if (b.q < Q_COOL) b.hot = false;
      b.amber = Math.max(0, b.amber - dt * 0.7);
      if (b.hot) {
        hot++;
        buildings.heat(b, 0.95 + 0.3 * Math.sin(gt * 17 + b.ph), C.red);
      } else if (b.q > Q_COOL) buildings.heat(b, (b.q - Q_COOL) * 0.75, C.red);
      else buildings.heat(b, b.amber * 0.75, C.amber);
    }
    for (const s of stars) {
      s.on = damp(s.on, astro ? 1 : 0, 3, dt);
      s.star.heat(s.on);
      s.star.rotation.y += dt * (0.15 + s.on * 0.8);
    }
    return hot;
  }

  let fstats = null;
  let fLabels = [];
  const forest = {
    enter() {
      const t = SCENES[6].t;
      resetForest();
      ui.toggle({ label: t.toggle, value: app.state.astro, onChange: (v) => (app.state.astro = v) });
      ui.slider({ label: t.slider, min: 20, max: 160, step: 5, value: intensity, format: (v) => `${Math.round((v / 160) * 100)}<small>%</small>`, onInput: (v) => (intensity = v) });
      fstats = ui.stats([{ label: t.hot }, { label: t.alarm }], 2);
      warmth.focus(0, { x: F.x, y: 2, z: F.z }, 14.5, { dur: 1.5, delay: 0.8 });
      fLabels = [
        app.labels.add(t.incoming, { x: F.x + 6.5, y: 13.5, z: F.z + 3 }, { kind: 'tag', tone: 'red' }),
        app.labels.add(t.collect, { x: stars[0].x, y: STAR_Y + 1.6, z: stars[0].z }, { kind: 'tag', tone: 'amber' }).show(false),
        app.labels.add(t.back, { x: stars[1].x + 1.6, y: 5.2, z: stars[1].z + 2.2 }, { kind: 'tag', tone: 'amber' }).show(false),
      ];
    },
    exit() {
      resetForest();
      app.alertTower.set(false);
    },
    update(dt, t, gt) {
      const hot = updateForest(dt, gt, neurons);
      const tx = SCENES[6].t;
      const warn = hot >= 3;
      app.alertTower.set(warn, gt);
      fstats.set(0, `${hot}<small> / ${neurons.length}</small>`, hot ? 'red' : '');
      fstats.set(1, warn ? tx.warn : tx.calm, warn ? 'red' : '');
      fLabels[1].show(app.state.astro);
      fLabels[2].show(app.state.astro);
    },
  };

  // ═══ 고개 드는 거리 ════════════════════════════════
  const S = SITES.street;
  plate(group, { x: S.x, z: S.z, w: 18.4, d: 3.6 });
  const srand = rng(88);
  for (let x = S.x - 8; x <= S.x + 8.1; x += 3.2) {
    // 카메라 쪽(+z)은 비워 두고, 건너편에만 상가 건물을 세운다
    buildings.add({ x, z: S.z - 3.7, w: 2.5 + srand() * 0.4, d: 2.3 + srand() * 0.5, h: 3 + srand() * 4.5, shape: srand() > 0.6 ? 'step' : 'box' });
  }
  const PAIRS = 14;
  const walkers = citizens.claim(PAIRS * 2).map((id, k) => {
    const pair = Math.floor(k / 2);
    const front = k % 2 === 0;
    const x = S.x - 7.4 + pair * 1.14 + (srand() - 0.5) * 0.25;
    const z = S.z + (front ? -0.62 : 0.62);
    const yaw = front ? 0 : Math.PI;
    citizens.setHome(id, x, z, 0, yaw);
    return { id, pair, x, z, yaw, up: 0 };
  });
  // 손에 든 화면(블루)
  const phoneGeo = new THREE.PlaneGeometry(0.15, 0.22);
  phoneGeo.rotateX(-1.0);
  const phones = new THREE.InstancedMesh(phoneGeo, new THREE.MeshBasicMaterial({ color: PALETTE.blue, side: THREE.DoubleSide }), walkers.length);
  phones.frustumCulled = false;
  phones.visible = false;
  group.add(phones);
  const pm = new THREE.Matrix4();
  const pq = new THREE.Quaternion();
  const pe = new THREE.Euler();
  const ps = v3(1, 1, 1);
  const pp = v3(0, 0, 0);
  let liftAt = 0;
  let sstat = null;
  let lastAstro = false;

  const street = {
    enter() {
      const t = SCENES[7].t;
      ui.toggle({ label: t.toggle, value: app.state.astro, onChange: (v) => (app.state.astro = v) });
      sstat = ui.stats([{ label: t.looking }], 1);
      phones.visible = true;
      for (const w of walkers) {
        w.up = 0;
        citizens.hold(w.id, w.x, 0, w.z, w.yaw);
        citizens.tbow[w.id] = 1;
        citizens.aBow.array[w.id] = 1;
      }
      lastAstro = app.state.astro;
      liftAt = 2.2; // 앞 장면에서 이미 켜 두었다면 조금 뒤에 고개를 든다
      warmth.focus(0, { x: S.x, y: 0.5, z: S.z }, 13, { dur: 1.4, delay: 0.6 });
      app.labels.add(t.screen, { x: S.x - 8.6, y: 1.9, z: S.z }, { kind: 'plain', tone: 'blue' });
    },
    exit() {
      phones.visible = false;
    },
    update(dt, t) {
      if (app.state.astro !== lastAstro) {
        lastAstro = app.state.astro;
        liftAt = t;
      }
      let up = 0;
      let np = 0;
      walkers.forEach((w, k) => {
        // 한쪽 끝에서부터 차례로 고개를 든다
        const want = app.state.astro && t > liftAt + w.pair * 0.16 ? 1 : !app.state.astro && t > liftAt + (PAIRS - w.pair) * 0.08 ? 0 : w.up > 0.5 ? 1 : 0;
        w.up = damp(w.up, want, 3.2, dt);
        if (w.up > 0.6) up++;
        citizens.tbow[w.id] = 1 - w.up;
        if (w.up < 0.5) citizens.override(w.id, C.blue, 0.7 * (1 - w.up * 2));
        else citizens.override(w.id, C.amber, (w.up - 0.5) * 2);
        const s = Math.max(0.0001, 1 - w.up * 1.6);
        const f = w.yaw === 0 ? 1 : -1;
        pm.compose(pp.set(w.x, 0.4 + w.up * -0.12, w.z + f * 0.2), pq.setFromEuler(pe.set(0, w.yaw, 0)), ps.setScalar(s));
        phones.setMatrixAt(k, pm);
        // 화면에서 올라오는 자극
        if (w.up < 0.3 && np < 200 && (k + Math.floor(t * 3)) % 3 === 0) {
          const ph = (t * 0.9 + k * 0.37) % 1;
          app.particles.set(np++, w.x + Math.sin(k) * 0.1, 0.5 + ph * 0.45, w.z + f * 0.2, C.blue, 0.07 * (1 - ph));
        }
      });
      phones.instanceMatrix.needsUpdate = true;
      app.particles.commit(np);
      sstat.set(0, `${up}<small> / ${walkers.length}명</small>`, up ? 'amber' : 'blue');
    },
  };

  // ═══ 워터마크 전광판 ═══════════════════════════════
  const W = SITES.boards;
  plate(group, { x: W.x, z: W.z, r: 8.6 });
  const camAz = (SCENES[8].cam.az * Math.PI) / 180;
  const normal = v3(Math.sin(camAz), 0, Math.cos(camAz)); // 전광판이 바라보는 쪽(카메라 쪽)
  const right = v3(Math.cos(camAz), 0, -Math.sin(camAz));
  const BW = 7.2;
  const BH = 1.5;
  const LENS_R = 1.7;
  const lensU = { value: v3(0, -99, 0) };
  const fadeU = { value: 0 };
  const boardDefs = SCENES[8].t.boards;
  const slots = [
    { r: -4.4, y: 8.7, n: -1.2 },
    { r: 3.6, y: 7.2, n: 0.8 },
    { r: -3.2, y: 5.4, n: 1.6 },
    { r: 4.6, y: 3.9, n: -0.6 },
    { r: -1.6, y: 2.2, n: 0.2 },
  ];
  const planes = [];
  const boards = boardDefs.map((def, i) => {
    const slot = slots[i];
    const pos = v3(W.x, slot.y, W.z).addScaledVector(right, slot.r).addScaledVector(normal, slot.n);
    // 글자 텍스처: 문구가 끊김 없이 흐르도록 한 바퀴 폭에 맞춘다
    const cv = document.createElement('canvas');
    const cx = cv.getContext('2d');
    const font = '700 132px "Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif';
    cx.font = font;
    const unit = `${def.text}      ·      `;
    cv.width = Math.min(4096, Math.ceil(cx.measureText(unit).width));
    cv.height = 256;
    cx.fillStyle = '#000';
    cx.fillRect(0, 0, cv.width, cv.height);
    cx.font = font;
    cx.fillStyle = '#fff';
    cx.textBaseline = 'middle';
    cx.fillText(unit, 0, 134, cv.width);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const texAspect = cv.width / cv.height;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex },
        uOff: { value: i * 0.31 },
        uK: { value: BW / BH / texAspect },
        uTexAspect: { value: texAspect },
        uLens: lensU,
        uLensR: { value: LENS_R },
        uAI: { value: def.ai ? 1 : 0 },
        uFade: fadeU,
        uBlue: { value: C.blue },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vW;
        void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float uOff, uK, uTexAspect, uLensR, uAI, uFade; uniform vec3 uLens, uBlue;
        varying vec2 vUv; varying vec3 vW;
        float h1(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        void main(){
          float u = vUv.x * uK + uOff;
          float txt = texture2D(map, vec2(u, vUv.y)).r;
          vec3 col = mix(vec3(0.016), vec3(0.72), txt);
          float d = distance(vW, uLens);
          float lens = 1.0 - smoothstep(uLensR * 0.9, uLensR, d);
          // 숨은 무늬: 글자와 함께 흐르는 점 격자. 고쳐 쓰면 점이 빠지고 흐려진다.
          vec2 g = vec2(u * uTexAspect, vUv.y) * 9.0;
          vec2 cell = floor(g);
          vec2 f = fract(g) - 0.5;
          float on = step(0.42, h1(cell));
          float keep = step(uFade * 0.86, h1(cell + 17.0));
          float dotv = smoothstep(0.3, 0.16, length(f)) * on * keep * (1.0 - 0.45 * uFade);
          col = mix(col, col * 0.45 + vec3(0.03), lens * 0.6);
          col += uBlue * dotv * lens * uAI * 1.25;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), mat);
    plane.position.copy(pos);
    plane.lookAt(pos.clone().add(normal));
    plane.userData.i = i;
    group.add(plane);
    planes.push(plane);
    const frame = box(BW + 0.3, BH + 0.3, 0.22, { h: 6 });
    frame.position.copy(pos).addScaledVector(normal, -0.13);
    frame.position.y -= (BH + 0.3) / 2;
    frame.quaternion.copy(plane.quaternion);
    group.add(frame);
    for (const s of [-1, 1]) {
      const pole = box(0.16, slot.y - BH / 2, 0.16, { h: 5 });
      pole.position.copy(pos).addScaledVector(right, s * (BW / 2 - 0.5)).addScaledVector(normal, -0.3);
      pole.position.y = 0;
      group.add(pole);
    }
    return { def, pos, mat, speed: 0.022 + (i % 3) * 0.009, label: null, seen: false };
  });
  const lensRing = new THREE.Mesh(new THREE.RingGeometry(LENS_R * 0.965, LENS_R, 72), new THREE.MeshBasicMaterial({ color: PALETTE.text, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }));
  lensRing.renderOrder = 10;
  lensRing.visible = false;
  lensRing.lookAt(normal);
  group.add(lensRing);
  const boardPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, v3(W.x, 0, W.z).addScaledVector(normal, 1.8));
  const lensGoal = v3(W.x, 5.5, W.z);
  const hit = v3(0, 0, 0);
  const rel = v3(0, 0, 0);
  let idle = 99;
  let bstat = null;
  let limitNote = null;

  const boardsScene = {
    enter() {
      const t = SCENES[8].t;
      fadeU.value = 0;
      idle = 99;
      lensRing.visible = true;
      ui.note(t.hint);
      bstat = ui.stats([{ label: t.found }], 1);
      ui.toggle({
        label: t.toggle,
        value: false,
        tone: 'blue',
        onChange: (v) => {
          gsap.to(fadeU, { value: v ? 1 : 0, duration: app.reduced ? 0.01 : 1.2, ease: 'power2.inOut' });
          limitNote.style.display = v ? '' : 'none';
        },
      });
      limitNote = ui.note(t.limit, true, 'blue');
      limitNote.style.display = 'none';
      for (const b of boards) {
        b.seen = false;
        b.label = app.labels.add('', { x: b.pos.x, y: b.pos.y + BH / 2 + 0.25, z: b.pos.z }, { kind: 'tag' }).show(false);
      }
    },
    exit() {
      lensRing.visible = false;
      lensU.value.set(0, -99, 0);
      gsap.killTweensOf(fadeU);
      fadeU.value = 0;
    },
    pointerMove(ray) {
      const hits = ray.intersectObjects(planes, false);
      if (hits.length) lensGoal.copy(hits[0].point);
      else if (ray.ray.intersectPlane(boardPlane, hit)) lensGoal.copy(hit);
      idle = 0;
    },
    click(ray) {
      this.pointerMove(ray);
    },
    update(dt, t, gt) {
      const tx = SCENES[8].t;
      idle += dt;
      if (idle > 3.5) {
        // 손을 대지 않으면 렌즈가 저절로 전광판을 훑는다
        lensGoal.set(W.x, 5.5 + Math.sin(gt * 0.42) * 3.3, W.z).addScaledVector(right, Math.sin(gt * 0.27 + 1) * 6.5).addScaledVector(normal, 1.8);
      }
      lensU.value.lerp(lensGoal, 1 - Math.exp(-10 * dt));
      lensRing.position.copy(lensU.value).addScaledVector(normal, 0.5);
      let found = 0;
      for (const b of boards) {
        b.mat.uniforms.uOff.value += b.speed * dt * (app.reduced ? 0.3 : 1);
        rel.subVectors(lensU.value, b.pos);
        const inside = Math.abs(rel.dot(right)) < BW / 2 + LENS_R * 0.3 && Math.abs(rel.y) < BH / 2 + LENS_R * 0.7;
        if (inside) b.seen = true;
        if (b.seen && b.def.ai) found++;
        const weak = fadeU.value > 0.5;
        b.label.show(inside);
        if (inside) b.label.set(b.def.ai ? (weak ? tx.weak : tx.ai) : tx.human).tone(b.def.ai ? 'blue' : 'gray');
      }
      bstat.set(0, `${found}<small> / ${boards.filter((b) => b.def.ai).length}</small>`, found ? 'blue' : '');
    },
  };

  return { 6: forest, 7: street, 8: boardsScene };
}
