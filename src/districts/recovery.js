// 회복 지구: 분할 조사탑, 선별 광장, 재검의 다리 · 부활 경기장.
import * as THREE from 'three';
import { C, PALETTE } from '../config/palette.js';
import { SITES, DISTRICTS } from '../config/layout.js';
import { SCENES } from '../content/scenes.js';
import { warmth } from '../core/warmth.js';
import { rng, clamp, damp, smooth } from '../core/rng.js';
import { TOTAL_DOSE, dosePerFraction, collateral } from '../math/bed.js';
import { counts, ppv, sliderToP, pToSlider, repeatPosterior } from '../math/ppv.js';
import { box, prop, plate, glowMaterial, lineMaterial } from '../world/props.js';

export function createRecovery(app) {
  const { scene, buildings, citizens, ui } = app;
  const group = new THREE.Group();
  scene.add(group);
  (app.propGroups ??= []).push({ group, x: DISTRICTS.recovery.c.x });
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ═══ 분할 조사탑 ═══════════════════════════════════
  const F = SITES.fraction;
  plate(group, { x: F.x, z: F.z, r: 7.2 });
  const EMIT_Y = 11.4;
  const pillar = box(1.1, 13.6, 1.1, { h: 10 });
  pillar.position.set(F.x - 4.7, 0, F.z - 3.3);
  group.add(pillar);
  const armLen = Math.hypot(4.7, 3.3) + 1.2;
  const arm = box(armLen, 0.55, 0.7, { h: 10 });
  arm.position.set(F.x - 4.7 / 2 + 0.2, 12.6, F.z - 3.3 / 2 + 0.14);
  arm.rotation.y = -Math.atan2(3.3, 4.7); // 기둥 → 가운데 방향
  group.add(arm);
  const headBox = prop(new THREE.CylinderGeometry(0.95, 0.6, 1.2, 6).toNonIndexed().translate(0, 0.6, 0), { h: 11 });
  headBox.position.set(F.x, EMIT_Y, F.z);
  group.add(headBox);

  const target = buildings.add({ x: F.x, z: F.z, w: 2.1, d: 2.1, h: 6.2, tint: C.red, heat: 0 });
  const wrongMark = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), glowMaterial(PALETTE.red));
  wrongMark.visible = false;
  group.add(wrongMark);
  const frand = rng(42);
  const neighbours = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2 + 0.39;
    const b = buildings.add({ x: F.x + Math.cos(a) * 4.5, z: F.z + Math.sin(a) * 4.5, w: 1.55 + frand() * 0.4, d: 1.55 + frand() * 0.4, h: 2.7 + frand() * 2.4, rot: -a, tint: new THREE.Color() });
    b.fall = { x: (frand() - 0.5) * 0.9, z: (frand() - 0.5) * 0.9 };
    b.dmg = 0;
    return b;
  });
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PALETTE.red, transparent: true, opacity: 0, depthWrite: false }));
  shock.position.set(F.x, 0.07, F.z);
  group.add(shock);

  const emitP = v3(F.x, EMIT_Y, F.z);
  const hitP = v3(F.x, 0, F.z);
  const mix = new THREE.Color();
  let sim = null;
  let simTimer = 0;
  let fracUI = null;
  let fracParts = [];

  function startSim(n) {
    sim = { n, d: dosePerFraction(n), coll: collateral(n), t: 0, hit: 0, last: -9, flash: 0, shock: 0 };
    target.sy = 1;
    buildings.commit(target);
    for (const b of neighbours) {
      b.dmg = 0;
      b.sy = 1;
      b.tiltX = b.tiltZ = 0;
      b.heat = 0;
      buildings.commit(b);
    }
    fracParts = [];
    app.beams.clear();
  }
  function updateSim(dt, gt) {
    const s = sim;
    s.t += dt;
    const T0 = 1.0;
    const interval = s.n > 1 ? 4.8 / (s.n - 1) : 0;
    const beamDur = s.n === 1 ? 1.5 : Math.min(0.45, interval * 0.7);
    while (s.hit < s.n && s.t >= T0 + s.hit * interval) {
      s.hit++;
      s.last = s.t;
      s.flash = Math.min(1, s.flash + (s.n === 1 ? 1 : 0.06 + 0.3 * s.coll));
      if (s.n <= 3) s.shock = 1;
      const np = Math.round((s.n === 1 ? 70 : 5) * app.particleScale);
      for (let i = 0; i < np; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (s.n === 1 ? 2 + Math.random() * 7 : 0.6 + Math.random() * 1.6);
        fracParts.push({ p: v3(F.x, target.h * target.sy, F.z), v: v3(Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp), life: 0.5 + Math.random() * 0.7, c: C.red });
      }
    }
    const since = s.t - s.last;
    const firing = since < beamDur;
    // 잘못 표시된 건물은 맞을 때마다 깎인다 (총량은 같다)
    const prog = clamp((s.hit - (firing ? 1 - since / beamDur : 0)) / s.n);
    target.sy = damp(target.sy, 1 - 0.8 * prog, 10, dt);
    buildings.commit(target);
    const topY = target.h * target.sy;
    wrongMark.position.set(F.x, topY + 1.0 + Math.sin(gt * 2) * 0.08, F.z);
    wrongMark.rotation.y = gt * 0.8;
    if (firing) {
      const r = (0.07 + 0.62 * Math.sqrt(s.d / TOTAL_DOSE)) * (0.85 + 0.15 * Math.sin(gt * 40)) * Math.sin(Math.PI * clamp(since / beamDur)) ** 0.35;
      hitP.y = topY;
      app.beams.set(0, emitP, hitP, r, C.red);
    } else app.beams.hide(0);

    // 주변 건물: 한 번에 맞으면 무너지고, 나눠 맞으면 사이사이 회복한다
    if (s.n > 1) s.flash *= Math.exp(-(1.2 + 2.2 * (1 - s.coll)) * dt);
    const perm = s.coll * (s.hit / s.n) * (s.n === 1 ? 1 : 0.8);
    const phase = s.n > 1 ? clamp(since / Math.max(0.16, interval)) : 0;
    const recov = s.n > 1 ? smooth(0.18, 0.62, since / Math.max(0.2, interval)) : 0;
    const ended = s.hit >= s.n && since > 1.1;
    for (const b of neighbours) {
      const want = clamp(perm + s.flash * 0.55);
      b.dmg = damp(b.dmg, want, s.n === 1 ? 5 : 14, dt);
      b.sy = 1 - 0.9 * b.dmg;
      if (s.n === 1) {
        b.tiltX = b.fall.x * b.dmg;
        b.tiltZ = b.fall.z * b.dmg;
      }
      if (s.hit === 0) b.heat = 0;
      else if (s.n === 1) {
        b.tint.copy(C.red);
        b.heat = damp(b.heat, ended ? 0.3 : 1.1, ended ? 0.7 : 9, dt);
      } else {
        mix.lerpColors(C.red, C.amber, ended ? 1 : Math.max(recov, 1 - s.coll * 1.4));
        b.tint.copy(mix);
        b.heat = damp(b.heat, ended ? 0.9 : 0.65 + 0.35 * (1 - phase), 8, dt);
      }
      buildings.commit(b);
    }
    // 충격파(한 번에 쏠 때만)
    if (s.shock > 0) {
      s.shock = Math.max(0, s.shock - dt * 0.9);
      const k = 1 - s.shock;
      shock.scale.setScalar(0.5 + k * 7.5);
      shock.material.opacity = s.shock * 0.8;
    } else shock.material.opacity = 0;
    // 불티와 회복의 앰버
    if (s.n > 1 && !ended && s.hit > 0 && Math.random() < 0.5 * app.particleScale) {
      const b = neighbours[Math.floor(Math.random() * 8)];
      fracParts.push({ p: v3(b.x + (Math.random() - 0.5), b.h * b.sy, b.z + (Math.random() - 0.5)), v: v3(0, 0.9 + Math.random(), 0), life: 1.1, c: C.amber });
    }
    let np = 0;
    for (const q of fracParts) {
      q.life -= dt;
      if (q.life <= 0) continue;
      if (q.c === C.red) q.v.y -= 7 * dt;
      q.p.addScaledVector(q.v, dt);
      if (np < 400) app.particles.set(np++, q.p.x, Math.max(0.05, q.p.y), q.p.z, q.c, 0.14 * clamp(q.life * 1.6));
    }
    if (fracParts.length > 600) fracParts = fracParts.filter((q) => q.life > 0);
    app.particles.commit(np);
  }

  // 나눌수록 둘레의 피해가 줄어드는 곡선
  function drawChart(cv, n, t) {
    const { ctx, w, h } = cv;
    const L = 40;
    const R = 12;
    const T = 14;
    const B = 24;
    ctx.clearRect(0, 0, w, h);
    const X = (k) => L + ((k - 1) / 29) * (w - L - R);
    const Y = (c) => T + (1 - c) * (h - T - B);
    ctx.font = '11px "Pretendard Variable", sans-serif';
    ctx.fillStyle = '#7c7c84';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const c of [0, 0.5, 1]) {
      ctx.beginPath();
      ctx.moveTo(L, Y(c));
      ctx.lineTo(w - R, Y(c));
      ctx.stroke();
      ctx.fillText(`${c * 100}%`, L - 7, Y(c));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const k of [1, 10, 20, 30]) ctx.fillText(`${k}${t.unit}`, X(k), h - B + 7);
    ctx.beginPath();
    for (let k = 1; k <= 30; k++) ctx[k === 1 ? 'moveTo' : 'lineTo'](X(k), Y(collateral(k)));
    ctx.strokeStyle = '#9a9aa2';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const col = n <= 3 ? PALETTE.red : PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(X(n), Y(collateral(n)));
    ctx.lineTo(X(n), h - B);
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(X(n), Y(collateral(n)), 5.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  const fraction = {
    enter() {
      const t = SCENES[3].t;
      let n = 1;
      const show = () => {
        st.set(0, `${Math.round(100 / n)}<small>%</small>`, n <= 3 ? 'red' : '');
        st.set(1, `${Math.round(collateral(n) * 100)}<small>%</small>`, n <= 3 ? 'red' : 'amber');
        drawChart(cv, n, t);
      };
      const sl = ui.slider({
        label: t.slider,
        min: 1,
        max: 30,
        value: 1,
        format: (v) => `${v}<small>${t.unit}</small> · ${v === 1 ? t.once : t.split}`,
        ends: [t.once, `30${t.unit}`],
        onInput: (v) => {
          n = v;
          show();
          clearTimeout(simTimer);
          simTimer = setTimeout(() => startSim(n), 220);
        },
      });
      const st = ui.stats([{ label: t.dose }, { label: t.harm }], 2);
      const cv = ui.canvas(132, t.chart);
      ui.button(t.fire, () => startSim(n));
      fracUI = { sl };
      show();
      target.heat = 0.95;
      wrongMark.visible = true;
      startSim(1);
      sim.t = -1.4; // 카메라가 도착한 뒤에 쏜다
      warmth.focus(0, { x: F.x, y: 2, z: F.z }, 9.5, { dur: 1.4, delay: 1 });
      app.labels.add(t.wrong, { x: F.x, y: 8.6, z: F.z }, { kind: 'plain', tone: 'red' });
    },
    exit() {
      clearTimeout(simTimer);
      target.heat = 0;
      wrongMark.visible = false;
      startSim(30);
      sim = null;
      shock.material.opacity = 0;
      wrongMark.position.set(F.x, target.h + 1, F.z);
    },
    update(dt, t, gt) {
      if (sim) updateSim(dt, gt);
    },
  };
  wrongMark.position.set(F.x, target.h + 1, F.z);

  // ═══ 선별 광장 ═════════════════════════════════════
  const G = SITES.screening;
  const COLS = 40;
  const GAP = 0.52;
  plate(group, { x: G.x, z: G.z, w: COLS * GAP + 1.6, d: 25 * GAP + 1.6 });
  const N = citizens.N;
  const perm = Array.from({ length: N }, (_, i) => i);
  const prand = rng(2024);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(prand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const pctText = (p) => {
    const v = p * 100;
    return v < 1 ? v.toFixed(1) : v < 10 ? v.toFixed(1) : v.toFixed(1);
  };
  const PRESETS = [0.001, 0.01, 0.121, 0.242];

  const screening = {
    enter() {
      const t = SCENES[4].t;
      citizens.suppress(true);
      for (let i = 0; i < N; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        citizens.hold(i, G.x + (col - (COLS - 1) / 2) * GAP, 0, G.z + (row - 12) * GAP, 0, 9);
      }
      const want = new Uint8Array(N);
      const apply = (p) => {
        const { flagged, truePos } = counts(p, N);
        want.fill(0);
        for (let k = 0; k < truePos; k++) want[perm[k]] = 2;
        for (let k = 0; k < flagged - truePos; k++) want[perm[N - 1 - k]] = 1;
        for (let i = 0; i < N; i++) {
          const dot = want[i] > 0 ? 1 : 0;
          const ring = want[i] === 2 ? 1 : 0;
          if (citizens.dotT[i] !== dot) citizens.mark(i, dot ? C.red : null);
          if (citizens.ringT[i] !== ring) citizens.ring(i, ring);
        }
        head.set(t.line(`<b>${flagged}</b>`, `<em>${truePos}</em>`, (truePos && flagged ? (ppv(p) * 100).toFixed(1) : '0.0')));
        st.set(0, `${flagged}<small>${t.people}</small>`);
        st.set(1, `${truePos}<small>${t.people}</small>`);
        st.set(2, `${(ppv(p) * 100).toFixed(1)}<small>%</small>`);
        chips.mark(PRESETS.findIndex((q) => Math.abs(q - p) < 1e-9));
      };
      let exact = 0.242;
      const sl = ui.slider({
        label: t.slider,
        min: 0,
        max: 1000,
        value: Math.round(pToSlider(exact) * 1000),
        format: () => `${pctText(exact)}<small>%</small>`,
        ends: ['0.1%', '30%'],
        onInput: (v) => {
          exact = sliderToP(v / 1000);
          sl.set(v);
          apply(exact);
        },
      });
      const chips = ui.chips(t.presets, (i) => {
        exact = PRESETS[i];
        sl.set(Math.round(pToSlider(exact) * 1000));
        apply(exact);
      });
      const head = ui.headline('', 'red');
      const st = ui.stats([{ label: t.flagged, tone: 'red' }, { label: t.real, tone: 'amber' }, { label: t.ppv }], 3);
      ui.note(t.note);
      sl.set(Math.round(pToSlider(exact) * 1000));
      apply(exact);
    },
    exit() {},
    update() {},
  };

  // ═══ 재검의 다리 · 부활 경기장 ═════════════════════
  const BA = SITES.bridgeA;
  const BB = SITES.bridgeB;
  const BZ = BA.z;
  const XC = (BA.x + BB.x) / 2;
  const arch = (x) => 0.62 * Math.max(0, 1 - ((x - XC) / 5.25) ** 2);
  // 물길(어두운 띠)
  plate(group, { x: XC, z: BZ, w: 4.6, d: 12.6, color: '#0A0A0C', y: 0.025 });
  plate(group, { x: BA.x - 3.4, z: BZ, w: 4.6, d: 4, y: 0.02 });
  for (let k = 0; k < 10; k++) {
    const x0 = XC - 5.2 + k * 1.04;
    const xm = x0 + 0.52;
    const seg = box(1.1, 0.14, 1.75, { h: 9 });
    seg.position.set(xm, arch(xm) - 0.07, BZ);
    seg.rotation.z = Math.atan2(arch(x0 + 1.04) - arch(x0), 1.04);
    group.add(seg);
  }
  const GATE_X = [XC - 2, XC + 2];
  const lamps = GATE_X.map((gx) => {
    const y0 = arch(gx);
    for (const s of [-1, 1]) {
      const post = box(0.16, 2.3, 0.16, { h: 11 });
      post.position.set(gx, y0, BZ + s * 0.95);
      group.add(post);
    }
    const lintel = box(0.22, 0.22, 2.2, { h: 11 });
    lintel.position.set(gx, y0 + 2.3, BZ);
    group.add(lintel);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.9), new THREE.MeshBasicMaterial({ color: '#4a4a50' }));
    lamp.position.set(gx, y0 + 2.2, BZ);
    group.add(lamp);
    lamp.userData.on = 0;
    return lamp;
  });

  const queueIds = citizens.claim(12);
  const queueSpot = (k) => ({ x: BA.x - 1.6 - Math.floor(k / 2) * 0.75, z: BZ + (k % 2 ? 0.42 : -0.42) });
  queueIds.forEach((id, k) => {
    const q = queueSpot(k);
    citizens.setHome(id, q.x, q.z, 0, Math.PI / 2);
  });
  const OUTCOMES = [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]; // 1 = 확정

  // 피구 코트
  const CT = SITES.court;
  const CW = 11;
  const CD = 6.4;
  const courtPlate = plate(group, { x: CT.x, z: CT.z, w: CW, d: CD, color: '#232327' });
  courtPlate.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(0, 0.006, -CD / 2), v3(0, 0.006, CD / 2)]), lineMaterial));
  const playerIds = citizens.claim(10);
  const prnd = rng(9);
  const players = playerIds.map((id, k) => {
    const team = k < 5 ? 0 : 1;
    const bx = CT.x + (team ? 1 : -1) * (1.2 + prnd() * 3.6);
    const bz = CT.z + (prnd() - 0.5) * (CD - 1.2);
    citizens.setHome(id, bx, bz, 0, team ? -Math.PI / 2 : Math.PI / 2);
    return { id, team, bx, bz, out: false, since: 0, ph: prnd() * 9, slot: k % 5 };
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshBasicMaterial({ color: '#d4d4da' }));
  ball.visible = false;
  group.add(ball);

  let walkers = [];
  let sent = 0;
  let cleared = 0;
  let confirmed = 0;
  let revived = 0;
  let bstats = null;
  let game = null;
  const from = v3(0, 0, 0);
  const to = v3(0, 0, 0);

  function resetQueue() {
    walkers = [];
    sent = cleared = confirmed = 0;
    queueIds.forEach((id, k) => {
      const q = queueSpot(k);
      citizens.clearOverride(id);
      citizens.teleport(id, q.x, 0, q.z, Math.PI / 2);
      citizens.hold(id, q.x, 0, q.z, Math.PI / 2, 2.1);
      citizens.mark(id, C.red);
    });
  }
  function sendNext() {
    if (sent >= queueIds.length) resetQueue();
    const k = sent++;
    const id = queueIds[k];
    const path = [{ x: BA.x - 0.9, y: 0, z: BZ }];
    for (let x = XC - 5; x <= XC + 5.01; x += 1) {
      const p = { x, y: arch(x) + 0.02, z: BZ };
      if (Math.abs(x - GATE_X[0]) < 0.01) p.gate = 0;
      if (Math.abs(x - GATE_X[1]) < 0.01) p.gate = 1;
      path.push(p);
    }
    path.push({ x: BB.x + 0.9, y: 0, z: BZ, end: true });
    walkers.push({ id, k, path, i: 0, wait: 0, bad: OUTCOMES[k % OUTCOMES.length] });
    citizens.hold(id, path[0].x, path[0].y, path[0].z, Math.PI / 2, 2.3);
    // 뒤에 선 사람들이 한 칸씩 당겨 선다
    for (let j = sent; j < queueIds.length; j++) {
      const q = queueSpot(j - sent);
      citizens.hold(queueIds[j], q.x, 0, q.z, Math.PI / 2, 1.6);
    }
  }
  function updateWalkers(dt) {
    for (const w of walkers) {
      if (w.done) continue;
      if (w.wait > 0) {
        w.wait -= dt;
        continue;
      }
      if (!citizens.arrived(w.id, 0.07)) continue;
      const p = w.path[w.i];
      if (p.gate !== undefined && !p.passed) {
        // 게이트에서 멈춰 검증을 받는다. 그동안 표시는 회색(보류)
        p.passed = true;
        w.wait = 0.75;
        lamps[p.gate].userData.on = 1;
        citizens.mark(w.id, C.citizen);
        continue;
      }
      if (p.end) {
        w.done = true;
        if (w.bad) {
          confirmed++;
          citizens.mark(w.id, C.red);
          citizens.hold(w.id, BB.x + 1.3 + (confirmed - 1) * 0.8, 0, BZ - 3.6, Math.PI, 2);
        } else {
          cleared++;
          citizens.mark(w.id, null);
          citizens.override(w.id, C.amber, 1);
          const n = cleared - 1;
          citizens.hold(w.id, CT.x - CW / 2 + 0.8 + (n % 10) * 1.0, 0, CT.z + CD / 2 + 1.0 + Math.floor(n / 10) * 0.7, Math.PI, 2.4);
        }
        continue;
      }
      w.i++;
      const q = w.path[w.i];
      citizens.hold(w.id, q.x, q.y, q.z, Math.PI / 2, 2.3);
    }
    for (const l of lamps) {
      l.userData.on = Math.max(0, l.userData.on - dt * 1.3);
      l.material.color.setScalar(0.07 + 0.8 * l.userData.on);
    }
  }

  // 피구: 맞으면 아웃, 우리 편이 상대를 맞히면 한 명이 부활한다
  function resetGame() {
    revived = 0;
    for (const p of players) {
      p.out = false;
      citizens.clearOverride(p.id);
    }
    game = { holder: players[0], flight: null, wait: 1.6, rand: rng(17) };
  }
  function updateGame(dt, gt) {
    const g = game;
    const active = (team) => players.filter((p) => p.team === team && !p.out);
    for (const p of players) {
      if (p.out) {
        const side = p.team ? 1 : -1;
        citizens.hold(p.id, CT.x + side * (1.2 + p.slot * 0.85), 0, CT.z - CD / 2 - 1.1, 0, 2.6);
      } else {
        const dodge = g.flight && g.flight.target === p ? Math.sin(gt * 9) * 0.25 : 0;
        citizens.hold(p.id, p.bx + Math.sin(gt * 0.9 + p.ph) * 0.35, 0, p.bz + Math.cos(gt * 1.1 + p.ph * 2) * 0.4 + dodge, p.team ? -Math.PI / 2 : Math.PI / 2, 2.8);
      }
    }
    if (g.flight) {
      const f = g.flight;
      f.t += dt / f.dur;
      citizens.at(f.target.id, to);
      const k = clamp(f.t);
      ball.position.set(f.from.x + (to.x - f.from.x) * k, 0.55 + Math.sin(Math.PI * k) * 1.5, f.from.z + (to.z - f.from.z) * k);
      if (f.t >= 1) {
        const foes = active(f.target.team);
        const hit = foes.length > 1 && g.rand() < 0.62;
        if (hit) {
          f.target.out = true;
          // 부활 규칙: 맞힌 팀의 아웃된 선수 한 명이 돌아온다
          const back = players.find((p) => p.team === f.thrower.team && p.out);
          if (back) {
            back.out = false;
            revived++;
            citizens.override(back.id, C.amber, 1);
            const lab = app.labels.add(SCENES[5].t.revived, { x: back.bx, y: 1.5, z: back.bz }, { kind: 'plain', tone: 'amber' });
            setTimeout(() => lab.remove(), 1600);
          }
        }
        const team = active(f.target.team);
        g.holder = hit ? team[Math.floor(g.rand() * team.length)] : f.target;
        g.flight = null;
        g.wait = 0.7 + g.rand() * 0.5;
      }
    } else {
      citizens.at(g.holder.id, from);
      ball.position.set(from.x, 0.62, from.z);
      g.wait -= dt;
      if (g.wait <= 0) {
        const foes = active(1 - g.holder.team);
        const tg = foes[Math.floor(g.rand() * foes.length)];
        g.flight = { from: from.clone(), target: tg, thrower: g.holder, t: 0, dur: 0.85 };
      }
    }
  }

  const bridge = {
    enter() {
      const t = SCENES[5].t;
      const q = [1, 2, 3].map((k) => Math.round(repeatPosterior(0.01, k) * 100));
      ui.button(t.send, () => sendNext(), { primary: true });
      bstats = ui.stats([{ label: t.sent }, { label: t.cleared, tone: 'amber' }, { label: t.confirmed, tone: 'red' }, { label: t.court, tone: 'amber' }], 4);
      ui.html('chain', `<div><b>${q[0]}%</b><span>${t.chain[0]}</span></div><i>→</i><div><b>${q[1]}%</b><span>${t.chain[1]}</span></div><i>→</i><div><b>${q[2]}%</b><span>${t.chain[2]}</span></div>`);
      ui.note(t.chainNote);
      resetQueue();
      resetGame();
      ball.visible = true;
      GATE_X.forEach((gx, i) => app.labels.add(i ? t.gate2 : t.gate1, { x: gx, y: arch(gx) + 3.1, z: BZ }, { kind: 'plain' }));
      warmth.focus(0, { x: CT.x - 3, y: 0, z: BZ }, 16, { dur: 1.5, delay: 0.9 });
      this.auto = 2.2;
    },
    exit() {
      ball.visible = false;
      walkers = [];
      for (const l of lamps) l.material.color.set('#4a4a50');
    },
    update(dt, t, gt) {
      // 처음 한 명은 저절로 보낸다
      if (this.auto > 0 && (this.auto -= dt) <= 0 && sent === 0) sendNext();
      updateWalkers(dt);
      updateGame(dt, gt);
      bstats.set(0, `${sent}<small>명</small>`);
      bstats.set(1, `${cleared}<small>명</small>`);
      bstats.set(2, `${confirmed}<small>명</small>`);
      bstats.set(3, `${revived}<small>회</small>`);
    },
  };

  return { 3: fraction, 4: screening, 5: bridge };
}
