// 한계 시뮬레이션과 엔딩.
import * as THREE from 'three';
import gsap from 'gsap';
import { C, PALETTE } from '../palette.js';
import { SCENES } from '../scenes.js';
import { warmth } from '../core/warmth.js';
import { clamp, smooth, damp } from '../core/rng.js';

export function createFinale(app) {
  const { scene, ui } = app;
  const group = new THREE.Group();
  scene.add(group);
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ═══ 한계: 묻히는 피해자의 신호 ════════════════════
  // 도시 곳곳에서 올라오는 작은 신호(피해자의 고발). limit = 판정이 얼마나 늦어지면 묻히는가.
  const signals = [
    { x: -19, z: 15, limit: 0.42 },
    { x: 23, z: 9, limit: 0.58 },
    { x: -7, z: -19, limit: 0.34 },
    { x: 15, z: 27, limit: 0.7 },
    { x: -47, z: 4, limit: 0.5 },
    { x: 47, z: 12, limit: 0.82 },
  ];
  const SIG_H = 46;
  const shieldGeo = new THREE.CylinderGeometry(2.6, 2.6, 1, 28, 1, true);
  shieldGeo.translate(0, 0.5, 0);
  const capGeo = new THREE.SphereGeometry(0.75, 14, 10);
  for (const s of signals) {
    s.base = v3(s.x, 0, s.z);
    s.top = v3(s.x, SIG_H, s.z);
    s.cool = 0;
    s.capMat = new THREE.MeshBasicMaterial({ color: PALETTE.red });
    s.cap = new THREE.Mesh(capGeo, s.capMat);
    s.cap.visible = false;
    group.add(s.cap);
    s.shield = new THREE.Mesh(shieldGeo, new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.17, side: THREE.DoubleSide, depthWrite: false }));
    s.shield.position.set(s.x, 0, s.z);
    s.shield.scale.set(1, 0.001, 1);
    s.shield.visible = false;
    group.add(s.shield);
    s.color = new THREE.Color();
  }
  let strength = 0.15;
  let protect = false;
  let progress = 0;
  let lUI = null;

  const limits = {
    enter() {
      const t = SCENES[7].t.limits;
      strength = 0.15;
      protect = false;
      progress = 0;
      for (const s of signals) {
        s.cool = 0;
        s.cap.visible = true;
        s.shield.visible = true;
        s.shield.scale.set(1, 0.001, 1);
      }
      ui.slider({ label: t.slider, min: 0, max: 100, value: 15, format: (v) => (v < 34 ? t.low : v < 67 ? t.mid : t.high), ends: [t.low, t.high], onInput: (v) => (strength = v / 100) });
      ui.toggle({
        label: t.toggle,
        value: false,
        onChange: (v) => {
          protect = v;
          signals.forEach((s, i) => gsap.to(s.shield.scale, { y: v ? SIG_H + 3 : 0.001, duration: app.reduced ? 0.01 : 0.7, delay: v ? i * 0.05 : 0, ease: 'power2.out' }));
        },
      });
      const st = ui.stats([{ label: t.heard, tone: 'red' }, { label: t.buried, tone: 'blue' }], 2);
      const bar = ui.html('', `<div class="bar-cap"><span>${t.progress}</span><span>${t.cap}</span></div><div class="bar"><i></i><em style="right:0"></em></div>`);
      const head = ui.headline('', 'amber');
      ui.button(t.finish, () => combo.go(1), { primary: true });
      lUI = { st, fill: bar.querySelector('.bar i'), head };
    },
    exit() {
      for (const s of signals) {
        s.cap.visible = false;
        s.shield.visible = false;
        gsap.killTweensOf(s.shield.scale);
      }
    },
    update(dt, t, gt) {
      const tx = SCENES[7].t.limits;
      let heard = 0;
      signals.forEach((s, i) => {
        // 판정이 늦어질수록 보호받지 못한 신호는 식어 묻힌다
        const want = protect ? 0 : smooth(s.limit - 0.12, s.limit + 0.1, strength);
        s.cool = damp(s.cool, want, 2.2, dt);
        if (s.cool < 0.5) heard++;
        s.color.lerpColors(C.red, C.blue, s.cool);
        const hgt = SIG_H * (1 - 0.78 * s.cool);
        s.top.y = hgt;
        const pulse = 0.75 + 0.25 * Math.sin(gt * 3.4 + i * 1.3);
        app.beams.set(10 + i, s.base, s.top, (0.3 - 0.16 * s.cool) * pulse, s.color);
        s.cap.position.set(s.x, hgt, s.z);
        s.cap.scale.setScalar((1 - 0.5 * s.cool) * (0.85 + 0.25 * pulse));
        s.capMat.color.copy(s.color);
      });
      // 판정은 천천히, 그러나 상한 안에서 끝난다
      progress += dt * (0.3 / (1 + 5 * strength));
      if (progress > 1.25) progress = 0;
      lUI.fill.style.width = `${clamp(progress) * 100}%`;
      lUI.st.set(0, `${heard}<small> / ${signals.length}</small>`);
      lUI.st.set(1, `${signals.length - heard}<small> / ${signals.length}</small>`, signals.length - heard ? 'blue' : '');
      lUI.head.set(protect ? tx.protected : signals.length - heard ? tx.warning : tx.fine);
      lUI.head.el.className = `headline tone-${protect ? 'amber' : signals.length - heard ? 'blue' : 'gray'}`;
    },
  };

  // ═══ 마무리: 건물은 회색 그대로, 시민만 주황으로 ═══
  const endingPart = {
    timer: 0,
    enter() {
      app.ui.setPanelHidden(true);
      app.citizens.setProgress(1);
      warmth.focus(0, { x: 0, y: 0, z: 0 }, 130, { dur: 6, delay: 0.6, ease: 'power1.inOut' });
      this.timer = setTimeout(() => {
        if (app.tour.mode === 'tour') app.ui.showEnding(true);
      }, app.reduced ? 0 : 1800);
    },
    exit() {
      clearTimeout(this.timer);
      app.ui.showEnding(false);
      app.ui.setPanelHidden(false);
      app.citizens.setProgress(SCENES[7].warm);
    },
    update() {},
  };

  // ═══ 마지막 장면: 두 부분(한계 → 마무리) ═══
  const subs = [limits, endingPart];
  const combo = {
    cur: null,
    enter() {
      this.go(0, true);
    },
    go(i, first = false) {
      this.cur?.exit?.();
      if (!first) app.tour.clearStage();
      ui.clearControls();
      ui.partTabs(SCENES[7].parts, i, (k) => this.go(k));
      this.cur = subs[i];
      this.cur.enter();
      if (!first) app.tour.flyTo(SCENES[7].parts[i].cam, 3);
    },
    exit() {
      this.cur?.exit?.();
      this.cur = null;
    },
    update(dt, t, gt) {
      this.cur?.update?.(dt, t, gt);
    },
  };
  ui.onPartBack = () => combo.go(0);

  return { 7: combo };
}
