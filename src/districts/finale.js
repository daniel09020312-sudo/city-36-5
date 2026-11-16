// 한계 시뮬레이션과 엔딩.
import * as THREE from 'three';
import gsap from 'gsap';
import { C, PALETTE } from '../config/palette.js';
import { SCENES } from '../content/scenes.js';
import { warmth } from '../core/warmth.js';
import { clamp, smooth, damp } from '../core/rng.js';
import { ecg, R_PHASE } from '../math/ecg.js';
import { makeRibbon } from '../world/props.js';

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
      const t = SCENES[12].t;
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
      ui.cards(t.others.map((o) => ({ html: `<span>${o}</span>` })));
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
      const tx = SCENES[12].t;
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

  // ═══ 엔딩 ══════════════════════════════════════════
  const N = 520;
  const X0 = -112;
  const X1 = 112;
  const pts = Array.from({ length: N }, (_, i) => v3(X0 + ((X1 - X0) * i) / (N - 1), 2, 80));
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber, fog: false, transparent: true, side: THREE.DoubleSide });
  const ribbon = makeRibbon(pts, 0.38, v3(0, 0.35, 1).normalize(), lineMat);
  ribbon.visible = false;
  scene.add(ribbon);
  let shown = false;

  const ending = {
    enter() {
      shown = false;
      gsap.killTweensOf(lineMat);
      lineMat.opacity = 1;
      ribbon.visible = true;
      ribbon.setProgress(0);
      // 건물은 무채색 그대로, 시민 전원만 따뜻해진다 (마스크를 도시 전체로)
      warmth.focus(0, { x: 0, y: 0, z: 0 }, 130, { dur: 6, delay: 0.6, ease: 'power1.inOut' });
    },
    exit() {
      ui.showEnding(false);
      gsap.to(lineMat, { opacity: 0, duration: app.reduced ? 0.01 : 0.8, onComplete: () => (ribbon.visible = false) });
    },
    update(dt, t, gt) {
      // 안정된 리듬의 심전도가 도시 앞을 가로지른다
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        p.y = 2.5 + 11 * ecg((p.x - gt * 9) / 38 + R_PHASE);
      }
      ribbon.setPoints(pts);
      ribbon.setProgress(app.reduced ? 1 : clamp((t - 0.8) / 3.2));
      if (!shown && (t > 4.2 || app.reduced) && app.tour.mode === 'tour') {
        shown = true;
        ui.showEnding(true);
      }
    },
  };

  return { 12: limits, 13: ending };
}
