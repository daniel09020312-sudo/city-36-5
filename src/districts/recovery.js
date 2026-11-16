// 회복 지구: 분할 조사탑, 선별 광장, 재검의 다리 · 부활 경기장.
import * as THREE from 'three';
import { C, PALETTE } from '../palette.js';
import { SITES, DISTRICTS } from '../config/layout.js';
import { SCENES } from '../scenes.js';
import { warmth } from '../core/warmth.js';
import { rng, clamp, damp, smooth } from '../core/rng.js';
import { counts, ppv, sliderToP, pToSlider } from '../math/ppv.js';
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
    sim = { n, d: 0, coll: n === 1 ? 1 : 0.06, t: 0, hit: 0, last: -9, flash: 0, shock: 0 };
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
      const r = (s.n === 1 ? 0.7 : 0.09) * (0.85 + 0.15 * Math.sin(gt * 40)) * Math.sin(Math.PI * clamp(since / beamDur)) ** 0.35;
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

  const fraction = {
    enter() {
      const t = SCENES[3].t.split;
      let mode = 'once';
      const start = () => {
        clearTimeout(simTimer);
        startSim(mode === 'once' ? 1 : 30);
        sim.t = -0.6;
      };
      ui.segmented(
        [{ key: 'once', label: t.once }, { key: 'split', label: t.split }],
        mode,
        (m) => {
          mode = m;
          note.textContent = m === 'once' ? t.onceNote : t.splitNote;
          start();
        },
      );
      const note = ui.note(t.onceNote);
      ui.button(t.fire, start);
      target.heat = 0.95;
      wrongMark.visible = true;
      startSim(1);
      sim.t = -1.4; // 카메라가 도착한 뒤에 내린다
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
      const t = SCENES[3].t.screen;
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

  // ═══ 회복 구역: 두 부분(① 시민 1,000명 ② 한 번에 vs 나눠서) ═══
  const subs = [screening, fraction];
  const recovery = {
    cur: null,
    enter() {
      this.go(0, true);
    },
    go(i, first = false) {
      this.cur?.exit?.();
      if (!first) app.tour.clearStage();
      ui.clearControls();
      ui.partTabs(SCENES[3].parts, i, (k) => this.go(k));
      this.cur = subs[i];
      this.cur.enter();
      if (!first) app.tour.flyTo(SCENES[3].parts[i].cam);
    },
    exit() {
      this.cur?.exit?.();
      this.cur = null;
    },
    update(dt, t, gt) {
      this.cur?.update?.(dt, t, gt);
    },
  };

  return { 3: recovery };
}
