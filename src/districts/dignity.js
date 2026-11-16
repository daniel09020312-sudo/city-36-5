// 존엄 지구: 숨결 병원, 진전 정원, 깨어남의 계단.
import * as THREE from 'three';
import gsap from 'gsap';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, PALETTE } from '../config/palette.js';
import { SITES, DISTRICTS } from '../config/layout.js';
import { SCENES } from '../content/scenes.js';
import { warmth } from '../core/warmth.js';
import { rng, clamp, damp } from '../core/rng.js';
import { FS, WINDOW, BINS, BIN_HZ, BAND, BAND_THRESHOLD, dftMagnitude, bandRatio, MODES, gaussian } from '../math/dft.js';
import { box, prop, boxGeo, plate, glowMaterial, lineMaterial } from '../world/props.js';

export function createDignity(app) {
  const { scene, citizens, ui } = app;
  const group = new THREE.Group();
  scene.add(group);
  (app.propGroups ??= []).push({ group, x: DISTRICTS.dignity.c.x });
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const put = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // ═══ 숨결 병원 ═════════════════════════════════════
  const H = SITES.hospital;
  plate(group, { x: H.x, z: H.z, r: 7.2 });
  const hospitalParts = [
    put(box(7, 5, 4.2, { h: 7 }), H.x, 0, H.z),
    put(box(2.7, 8.6, 2.7, { h: 10 }), H.x + 2.7, 0, H.z - 0.9),
    put(box(3.4, 3, 3.6, { h: 5 }), H.x - 4.7, 0, H.z + 0.5),
    put(box(2.6, 0.18, 1.5, { h: 9 }), H.x - 0.6, 1.7, H.z + 2.7),
  ];
  // 십자 표지(무채색)
  const crossMat = new THREE.MeshBasicMaterial({ color: '#b9b9c0' });
  put(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.06), crossMat), H.x + 2.7, 6.9, H.z + 0.48);
  put(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.06), crossMat), H.x + 2.7, 6.9, H.z + 0.48);
  // '수동 판독일' 표지판
  put(box(0.1, 1.5, 0.1, { h: 8 }), H.x + 3.6, 0, H.z + 3.9);
  put(box(1.5, 0.7, 0.08, { h: 11 }), H.x + 3.6, 1.5, H.z + 3.9);

  const hAz = (SCENES[9].cam.az * Math.PI) / 180;
  const holoMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSigned: { value: 0 }, uBlue: { value: C.blue }, uAmber: { value: C.amber }, uShow: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSigned, uShow; uniform vec3 uBlue, uAmber; varying vec2 vUv;
      float box2(vec2 p, vec2 c, vec2 h, float w){ vec2 d = abs(p - c) - h; float o = max(d.x, d.y); return smoothstep(w, 0.0, abs(o)); }
      void main(){
        vec2 p = vUv; p.x *= 1.6667;
        float a = 0.0;
        // 장기의 단면처럼 보이는 겹고리
        vec2 c = vec2(0.62, 0.5);
        float r = length((p - c) * vec2(1.0, 1.25));
        a += smoothstep(0.012, 0.0, abs(r - 0.3 - 0.02 * sin(atan(p.y - c.y, p.x - c.x) * 5.0 + uTime * 0.6))) * 0.9;
        a += smoothstep(0.01, 0.0, abs(r - 0.2 - 0.015 * sin(atan(p.y - c.y, p.x - c.x) * 7.0 - uTime * 0.4))) * 0.5;
        // AI가 짚은 자리
        float pulse = mix(0.55 + 0.45 * sin(uTime * 5.0), 1.0, uSigned);
        float mark = box2(p, vec2(0.78, 0.6), vec2(0.09, 0.09), 0.012) * pulse;
        a += mark * 1.2;
        // 오른쪽의 판독 막대
        for (int i = 0; i < 5; i++) {
          float y = 0.78 - float(i) * 0.13;
          float len = 0.12 + 0.2 * fract(sin(float(i) * 12.9) * 43.7);
          a += step(1.22, p.x) * step(p.x, 1.22 + len) * smoothstep(0.022, 0.012, abs(p.y - y)) * 0.6;
        }
        // 주사선과 테두리
        a += 0.05 + 0.05 * sin(vUv.y * 160.0 + uTime * 3.0);
        a += smoothstep(0.03, 0.0, abs(fract(vUv.y - uTime * 0.12) - 0.5) - 0.48) * 0.18;
        float edge = max(box2(vUv, vec2(0.5), vec2(0.492, 0.488), 0.012), 0.0);
        vec3 col = uBlue * a + mix(uBlue, uAmber, uSigned) * edge * (1.0 + uSigned);
        float fade = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
        gl_FragColor = vec4(col * uShow * fade, 1.0);
      }`,
  });
  const holo = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.6), holoMat);
  holo.position.set(H.x - 0.4, 11.6, H.z);
  holo.rotation.y = hAz;
  holo.visible = false;
  group.add(holo);
  const staffIds = citizens.claim(6);
  const hrand = rng(909);
  staffIds.forEach((id, k) => citizens.setHome(id, H.x - 2.6 + k * 0.95 + hrand() * 0.3, H.z + 3.4 + hrand() * 1.4, 0, hAz + (hrand() - 0.5)));

  const roof = v3(H.x - 0.4, 5, H.z);
  const beamTop = v3(H.x - 0.4, 5, H.z);
  let signed = false;
  let signT = -1;
  let typed = null;
  let holoLabel = null;
  let hParts = [];

  const hospital = {
    enter() {
      const t = SCENES[9].t;
      signed = false;
      signT = -1;
      hParts = [];
      holo.visible = true;
      holoMat.uniforms.uSigned.value = 0;
      holoMat.uniforms.uShow.value = 0;
      gsap.to(holoMat.uniforms.uShow, { value: 1, duration: app.reduced ? 0.01 : 1.4, delay: app.reduced ? 0 : 1.2 });
      hospitalParts.forEach((p) => p.heat(0, C.amber));
      const sbox = ui.html('signbox', `<div class="k">${t.reasonLabel}</div><div class="reason"></div><div class="k">${t.signLabel}</div><svg viewBox="0 0 150 46"><path d="M6 30 C 16 4, 28 6, 24 30 S 40 42, 46 18 S 58 6, 63 27 S 78 36, 86 19 S 102 8, 110 27 C 118 36, 132 24, 146 20"/></svg>`);
      const reason = sbox.querySelector('.reason');
      const btn = ui.button(t.sign, () => {
        if (signT >= 0 && !signed) return;
        if (signed) {
          // 처음으로
          signed = false;
          signT = -1;
          reason.textContent = '';
          sbox.classList.remove('done');
          btn.textContent = t.sign;
          gsap.to(holoMat.uniforms.uSigned, { value: 0, duration: 0.5 });
          hospitalParts.forEach((p) => p.heat(0));
          citizens.clearOverride(staffIds[2]);
          holoLabel.set(`${t.holoAI}<br>${t.pending}`).tone('blue');
          return;
        }
        signT = 0;
        btn.disabled = true;
      }, { primary: true });
      typed = { reason, sbox, btn, text: t.reason };
      holoLabel = app.labels.add(`${t.holoAI}<br>${t.pending}`, { x: holo.position.x, y: 14.1, z: holo.position.z }, { kind: 'tag', tone: 'blue' });
      app.labels.add(t.manual, { x: H.x + 3.6, y: 2.6, z: H.z + 3.9 }, { kind: 'plain' });
      warmth.focus(0, { x: H.x, y: 2, z: H.z + 1 }, 10.5, { dur: 1.5, delay: 0.8 });
    },
    exit() {
      holo.visible = false;
      gsap.killTweensOf(holoMat.uniforms.uShow);
      gsap.killTweensOf(holoMat.uniforms.uSigned);
      hospitalParts.forEach((p) => p.heat(0));
    },
    update(dt, t, gt) {
      const tx = SCENES[9].t;
      holoMat.uniforms.uTime.value = gt;
      holo.position.y = 11.6 + Math.sin(gt * 0.8) * 0.12;
      if (signT >= 0 && !signed) {
        // 근거를 한 글자씩 적는다
        signT += dt;
        const n = Math.floor(signT * (app.reduced ? 999 : 17));
        typed.reason.textContent = typed.text.slice(0, n);
        if (n >= typed.text.length) {
          signed = true;
          this.since = 0;
          typed.sbox.classList.add('done');
          typed.btn.disabled = false;
          typed.btn.textContent = tx.reset;
          gsap.to(holoMat.uniforms.uSigned, { value: 1, duration: app.reduced ? 0.01 : 1.2, delay: 0.6 });
          holoLabel.set(`${tx.holoAI}<br>${tx.signed}`).tone('amber');
          citizens.override(staffIds[2], C.amber, 1);
        }
      }
      // 서명 빛줄기가 하늘로 올라간다
      if (signed) {
        this.since += dt;
        const k = clamp((this.since - 0.7) / 1.4);
        const e = 1 - (1 - k) ** 3;
        beamTop.y = 5 + e * 85;
        if (k > 0) app.beams.set(1, roof, beamTop, 0.24 * (0.9 + 0.1 * Math.sin(gt * 7)), C.amber);
        hospitalParts.forEach((p) => p.heat(damp(p.heatU.value, 0.75, 2, dt)));
        if (k > 0 && hParts.length < 140 * app.particleScale && Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          hParts.push({ p: v3(roof.x + Math.cos(a) * 0.8, 5 + Math.random() * 2, roof.z + Math.sin(a) * 0.8), vy: 2 + Math.random() * 3, life: 2.6 });
        }
      } else app.beams.hide(1);
      let n = 0;
      for (const q of hParts) {
        q.life -= dt;
        if (q.life <= 0) {
          if (signed) {
            q.life = 2.6;
            q.p.y = 5 + Math.random();
          }
          continue;
        }
        q.p.y += q.vy * dt;
        app.particles.set(n++, q.p.x, q.p.y, q.p.z, C.amber, 0.13 * clamp(q.life));
      }
      if (!signed) hParts = [];
      app.particles.commit(n);
    },
  };

  // ═══ 진전 정원 ═════════════════════════════════════
  const G = SITES.garden;
  plate(group, { x: G.x, z: G.z, r: 8 });
  const gAz = (SCENES[10].cam.az * Math.PI) / 180;
  for (let k = 0; k < 13; k++) {
    const a = gAz + Math.PI * 0.42 + (k / 12) * Math.PI * 1.16; // 카메라 쪽은 틔워 둔다
    const hedge = box(2.5, 0.55 + (k % 3) * 0.12, 0.7, { h: 2.5 });
    hedge.position.set(G.x + Math.sin(a) * 7, 0, G.z + Math.cos(a) * 7);
    hedge.rotation.y = a + Math.PI / 2;
    group.add(hedge);
  }
  // 손목 조형물
  const PX = G.x - 1.9;
  const PZ = G.z - 1.2;
  put(box(2.3, 0.9, 2.3, { h: 6 }), PX, 0, PZ);
  const arm = new THREE.Group();
  arm.position.set(PX, 0.9, PZ);
  arm.rotation.y = gAz;
  group.add(arm);
  arm.add(box(0.7, 2.3, 0.56, { h: 10 }));
  const wrist = new THREE.Group();
  wrist.position.y = 2.3;
  arm.add(wrist);
  const palm = box(0.92, 1.0, 0.36, { h: 12 });
  palm.position.y = 0.12;
  wrist.add(palm);
  for (let f = 0; f < 4; f++) {
    const finger = box(0.18, 0.62 + (f === 1 || f === 2 ? 0.14 : 0), 0.26, { h: 12 });
    finger.position.set(-0.36 + f * 0.24, 1.12, 0);
    wrist.add(finger);
  }
  const thumb = box(0.2, 0.6, 0.26, { h: 12 });
  thumb.position.set(0.6, 0.35, 0);
  thumb.rotation.z = -0.6;
  wrist.add(thumb);
  const bandMat = new THREE.MeshBasicMaterial({ color: '#5a5a62' });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.11, 8, 28).rotateX(Math.PI / 2), bandMat);
  band.scale.set(1, 1, 0.82);
  band.position.y = 2.05;
  arm.add(band);
  const bandGray = new THREE.Color('#5a5a62');

  // 주파수 막대: 정원 바닥에서 솟는다
  const barGeo = boxGeo(0.15, 1, 0.15);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), BINS);
  bars.frustumCulled = false;
  group.add(bars);
  const barRight = v3(Math.cos(gAz), 0, -Math.sin(gAz));
  const barOrigin = v3(G.x, 0, G.z).addScaledVector(v3(Math.sin(gAz), 0, Math.cos(gAz)), 3.6).addScaledVector(barRight, -4.6);
  const barGray = new THREE.Color('#77777f');
  const bm = new THREE.Matrix4();
  const bq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, gAz, 0));
  const bs = v3(1, 1, 1);
  const bp = v3(0, 0, 0);
  for (let k = 0; k < BINS; k++) bars.setColorAt(k, barGray);
  // 파형 선
  const WAVE_N = 128;
  const wavePos = new Float32Array(WAVE_N * 3);
  const waveGeo = new THREE.BufferGeometry();
  waveGeo.setAttribute('position', new THREE.BufferAttribute(wavePos, 3));
  const wave = new THREE.Line(waveGeo, new THREE.LineBasicMaterial({ color: '#b9b9c0' }));
  wave.frustumCulled = false;
  group.add(wave);

  // 진술의 벤치
  const benchAt = v3(G.x + 3.3, 0, G.z + 0.6);
  const bench = new THREE.Group();
  bench.position.copy(benchAt);
  bench.rotation.y = gAz - 0.5;
  group.add(bench);
  const seat = box(2.1, 0.12, 0.6, { h: 10 });
  seat.position.y = 0.4;
  bench.add(seat);
  const back = box(2.1, 0.5, 0.1, { h: 10 });
  back.position.set(0, 0.52, -0.3);
  bench.add(back);
  for (const s of [-0.9, 0.9]) {
    const leg = box(0.12, 0.4, 0.5, { h: 7 });
    leg.position.x = s;
    bench.add(leg);
  }
  const benchId = citizens.claim(1)[0];
  citizens.setHome(benchId, benchAt.x, benchAt.z, 0.3, gAz - 0.5);
  const others = citizens.claim(2);
  others.forEach((id, k) => citizens.setHome(id, benchAt.x + 2.2 + k * 0.8, benchAt.z + 1.6 - k * 0.5, 0, gAz - 2));

  const samples = new Float32Array(WINDOW);
  const mag = new Float32Array(BINS);
  let mode = 'rest';
  let sampleClock = 0;
  let sigT = 0;
  let flagged = false;
  let applied = false;
  let gUI = null;

  const garden = {
    enter() {
      const t = SCENES[10].t;
      mode = 'rest';
      applied = false;
      flagged = false;
      samples.fill(0);
      const head = ui.headline('', 'blue');
      ui.cards(t.cards.map((c) => ({ title: c.title, text: c.text })));
      const rules = [];
      ui.button(t.apply, () => {
        applied = true;
        rules.forEach((r, i) => setTimeout(() => r.classList.remove('wait'), app.reduced ? 0 : i * 380));
        citizens.override(benchId, C.amber, 1);
        setTimeout(() => app.ui.panel.scrollTo({ top: app.ui.panel.scrollHeight, behavior: app.reduced ? 'auto' : 'smooth' }), 120);
      }, { primary: true });
      rules.push(...ui.cards(t.rules.map((r, i) => ({ html: `<i>${i + 1}</i><span>${r}</span>`, cls: 'rule wait' }))));
      gUI = {
        head,
        flag: app.labels.add(t.flag, { x: PX, y: 5.4, z: PZ }, { kind: 'tag', tone: 'blue' }).show(false),
        bubble: app.labels.add(t.bubble, { x: benchAt.x, y: 1.5, z: benchAt.z }, { kind: 'bubble' }).show(false),
      };
      app.labels.add(t.band, { x: barOrigin.x + barRight.x * 4.6, y: 5.5, z: barOrigin.z + barRight.z * 4.6 }, { kind: 'plain' });
      app.labels.add(t.bench, { x: benchAt.x + 1.6, y: 0.2, z: benchAt.z + 1.2 }, { kind: 'plain' });
      citizens.hold(benchId, benchAt.x, 0.3, benchAt.z, gAz - 0.5);
      warmth.focus(0, { x: G.x, y: 1, z: G.z }, 11, { dur: 1.4, delay: 0.8 });
    },
    exit() {
      bandMat.color.copy(bandGray);
      wrist.rotation.set(0, 0, 0);
    },
    update(dt) {
      const t = SCENES[10].t;
      // 100 Hz로 표본을 쌓는다
      sampleClock += dt;
      let last = samples[WINDOW - 1];
      let pushed = 0;
      while (sampleClock >= 1 / FS && pushed < 12) {
        sampleClock -= 1 / FS;
        sigT += 1 / FS;
        samples.copyWithin(0, 1);
        last = samples[WINDOW - 1] = MODES[mode](sigT, gaussian(Math.random));
        pushed++;
      }
      if (sampleClock > 0.2) sampleClock = 0;
      dftMagnitude(samples, mag);
      const ratio = bandRatio(mag);
      flagged = ratio > BAND_THRESHOLD;
      // 손이 신호대로 떨린다
      wrist.rotation.y = last * 0.3;
      wrist.rotation.z = last * 0.09;
      bandMat.color.copy(flagged ? C.blue : bandGray);
      for (let k = 0; k < BINS; k++) {
        const f = k * BIN_HZ;
        const hgt = Math.max(0.04, mag[k] * 6.5);
        bp.copy(barOrigin).addScaledVector(barRight, k * 0.235);
        bm.compose(bp, bq, bs.set(1, hgt, 1));
        bars.setMatrixAt(k, bm);
        bars.setColorAt(k, flagged && f >= BAND[0] && f <= BAND[1] ? C.blue : barGray);
      }
      bars.instanceMatrix.needsUpdate = true;
      bars.instanceColor.needsUpdate = true;
      for (let i = 0; i < WAVE_N; i++) {
        bp.copy(barOrigin).addScaledVector(barRight, (i / (WAVE_N - 1)) * 9.2);
        wavePos[i * 3] = bp.x;
        wavePos[i * 3 + 1] = 4.3 + samples[i * 2] * 0.55;
        wavePos[i * 3 + 2] = bp.z;
      }
      waveGeo.attributes.position.needsUpdate = true;

      gUI.head.set(flagged ? t.flagLine : '');
      gUI.flag.show(flagged);
      gUI.bubble.show(flagged || applied);
      gUI.bubble.set(applied ? t.bubble2 : t.bubble).tone(applied ? 'amber' : '');
    },
  };

  // ═══ 깨어남의 계단 ═════════════════════════════════
  const ST = SITES.stairs;
  const STEPS = 14;
  const SW = 0.8;
  const SH = 0.34;
  const X0 = ST.x - 6.4;
  const DEPTH = 4.4;
  plate(group, { x: ST.x, z: ST.z, w: 20, d: 7.6 });
  const stairGeo = mergeGeometries(
    Array.from({ length: STEPS }, (_, k) => {
      const g = new THREE.BoxGeometry(SW, (k + 1) * SH, DEPTH);
      g.translate(X0 + SW / 2 + k * SW, ((k + 1) * SH) / 2, ST.z);
      return g;
    }),
  );
  group.add(prop(stairGeo, { h: 6 }));
  const TOP_Y = STEPS * SH;
  const landX = X0 + STEPS * SW;
  put(box(3.4, TOP_Y, DEPTH, { h: 6 }), landX + 1.7, 0, ST.z);
  const stepPos = (k, z) => ({ x: X0 + SW / 2 + k * SW, y: (k + 1) * SH, z });

  const FROZEN_STEP = 6;
  const frozenId = citizens.claim(1)[0];
  const fz = stepPos(FROZEN_STEP, ST.z + 0.3);
  citizens.setHome(frozenId, fz.x, fz.z, fz.y, Math.PI / 2);
  const climberIds = citizens.claim(7);
  const crand = rng(404);
  const climbers = climberIds.map((id, k) => {
    const z = ST.z - 1.7 + (k % 4) * 0.95 + crand() * 0.2;
    const lane = Math.abs(z - fz.z) < 0.45 ? z + 0.8 : z;
    citizens.setHome(id, X0 - 1.6 - k * 0.9, lane, 0, Math.PI / 2);
    return { id, z: lane, step: -1, start: 1.5 + k * 2.3, sx: X0 - 1.6 - k * 0.9 };
  });

  // 약의 분자 모형 (벤젠 고리 + 수산기 둘 + 아미노산 곁사슬)
  const mol = new THREE.Group();
  const MOL_HOME = v3(ST.x - 3.6, 7.4, ST.z + 0.6);
  mol.position.copy(MOL_HOME);
  group.add(mol);
  const ringPts = [30, 90, 150, 210, 270, 330].map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)]);
  const atoms = [
    ...ringPts.map((p) => ({ p, r: 0.2 })),
    { p: [ringPts[3][0] * 2, ringPts[3][1] * 2], r: 0.26 }, // 6: OH
    { p: [ringPts[4][0] * 2, ringPts[4][1] * 2], r: 0.26 }, // 7: OH
    { p: [1.78, 0.9], r: 0.2 }, // 8: CH2
    { p: [2.62, 0.38], r: 0.2 }, // 9: Cα
    { p: [2.62, -0.62], r: 0.24 }, // 10: NH2
    { p: [3.5, 0.88], r: 0.2 }, // 11: C
    { p: [3.5, 1.86], r: 0.26 }, // 12: =O
    { p: [4.36, 0.38], r: 0.26 }, // 13: OH
  ];
  const bonds = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [3, 6], [4, 7], [0, 8], [8, 9], [9, 10], [9, 11], [11, 12], [11, 13]];
  const molProto = prop(new THREE.IcosahedronGeometry(1, 1), { h: 12, tint: C.amber, edges: false, glow: 0.35 });
  const molMat = molProto.material;
  const CX = 1.5;
  const CY = 0.3;
  const MS = 0.62;
  for (const a of atoms) {
    const m = new THREE.Mesh(molProto.geometry, molMat);
    m.scale.setScalar(a.r * MS * 1.25);
    m.position.set((a.p[0] - CX) * MS, (a.p[1] - CY) * MS, 0);
    mol.add(m);
  }
  const up = v3(0, 1, 0);
  for (const [i, j] of bonds) {
    const a = v3((atoms[i].p[0] - CX) * MS, (atoms[i].p[1] - CY) * MS, 0);
    const b = v3((atoms[j].p[0] - CX) * MS, (atoms[j].p[1] - CY) * MS, 0);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 6), molMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, b.sub(a).normalize());
    mol.add(m);
  }
  const hitSphere = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  mol.add(hitSphere);
  const molHeat = molProto.heatU;
  let given = false;
  let givenT = 0;
  let walkStep = FROZEN_STEP;
  let sUI = null;
  let burst = [];

  function resetStairs() {
    given = false;
    givenT = 0;
    walkStep = FROZEN_STEP;
    burst = [];
    gsap.killTweensOf(mol.position);
    gsap.killTweensOf(mol.scale);
    gsap.killTweensOf(molHeat);
    mol.position.copy(MOL_HOME);
    mol.scale.setScalar(1);
    mol.visible = true;
    molHeat.value = 0.18;
    citizens.clearOverride(frozenId);
    citizens.teleport(frozenId, fz.x, fz.y, fz.z, Math.PI / 2);
    citizens.hold(frozenId, fz.x, fz.y, fz.z, Math.PI / 2, 1.1);
    citizens.tbow[frozenId] = 0.5;
    climbers.forEach((c) => {
      c.step = -1;
      citizens.teleport(c.id, c.sx, 0, c.z, Math.PI / 2);
      citizens.hold(c.id, c.sx, 0, c.z, Math.PI / 2, 1.5);
    });
  }
  function give() {
    if (given) return;
    given = true;
    givenT = 0;
    const d = app.reduced ? 0.01 : 1.3;
    gsap.to(mol.position, { x: fz.x, y: fz.y + 1.5, z: fz.z, duration: d, ease: 'power2.inOut' });
    gsap.to(mol.scale, { x: 0.3, y: 0.3, z: 0.3, duration: d, ease: 'power2.in' });
    gsap.to(molHeat, { value: 1.2, duration: d * 0.5 });
    sUI.hint.show(false);
    sUI.btn.textContent = SCENES[11].t.again;
  }

  const stairs = {
    enter() {
      const t = SCENES[11].t;
      const btn = ui.button(t.give, () => (given ? (resetStairs(), (btn.textContent = t.give), sUI.hint.show(true), sUI.done.show(false)) : give()), { primary: true });
      sUI = {
        btn,
        hint: app.labels.add(t.hint, { x: MOL_HOME.x, y: MOL_HOME.y + 1.7, z: MOL_HOME.z }, { kind: 'tag', tone: 'amber' }),
        done: app.labels.add(t.mol, { x: fz.x, y: fz.y + 1.6, z: fz.z }, { kind: 'tag', tone: 'amber' }).show(false),
      };
      resetStairs();
      this.t0 = 0;
      warmth.focus(0, { x: ST.x, y: 3, z: ST.z }, 13.5, { dur: 1.5, delay: 0.8 });
    },
    exit() {
      resetStairs();
      mol.visible = true;
      document.body.style.cursor = '';
    },
    pointerMove(ray) {
      document.body.style.cursor = !given && ray.intersectObject(hitSphere, false).length ? 'pointer' : '';
    },
    click(ray) {
      if (!given && ray.intersectObject(hitSphere, false).length) give();
    },
    update(dt, t, gt) {
      if (!given) {
        mol.position.y = MOL_HOME.y + Math.sin(gt * 1.3) * 0.22;
        mol.rotation.y = Math.sin(gt * 0.6) * 0.45;
        mol.rotation.z = Math.sin(gt * 0.4) * 0.08;
        molHeat.value = 0.3 + 0.2 * Math.sin(gt * 2.4);
      } else {
        givenT += dt;
        if (givenT > 1.3 && mol.visible) {
          // 분자가 닿으면 시민이 색을 되찾고 다시 걷는다
          mol.visible = false;
          citizens.override(frozenId, C.amber, 1);
          citizens.tbow[frozenId] = 0;
          sUI.done.show(true);
          const n = Math.round(70 * app.particleScale);
          burst = Array.from({ length: n }, () => {
            const a = Math.random() * Math.PI * 2;
            const e = Math.random() * Math.PI - Math.PI / 2;
            const sp = 1 + Math.random() * 2.5;
            return { p: v3(fz.x, fz.y + 1.2, fz.z), v: v3(Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1, Math.sin(a) * Math.cos(e) * sp), life: 1 + Math.random() * 0.8 };
          });
        }
        if (givenT > 1.9 && citizens.arrived(frozenId, 0.06)) {
          if (walkStep < STEPS - 1) {
            walkStep++;
            const p = stepPos(walkStep, fz.z);
            citizens.hold(frozenId, p.x, p.y, p.z, Math.PI / 2, 1.15);
          } else if (walkStep === STEPS - 1) {
            walkStep++;
            citizens.hold(frozenId, landX + 1.4, TOP_Y, fz.z, -Math.PI / 2 + 0.6, 1.15);
          }
        }
        sUI.done.pos.set(citizens.px[frozenId], citizens.py[frozenId] + 1.5, citizens.pz[frozenId]);
      }
      // 다른 시민들은 계단을 지나 오른다
      for (const c of climbers) {
        if (t < c.start || !citizens.arrived(c.id, 0.06)) continue;
        if (c.step < STEPS - 1) {
          c.step++;
          const p = stepPos(c.step, c.z);
          citizens.hold(c.id, p.x, p.y, p.z, Math.PI / 2, 1.5);
        } else if (c.step === STEPS - 1) {
          c.step++;
          citizens.hold(c.id, landX + 0.7 + (c.id % 3) * 0.9, TOP_Y, c.z, Math.PI / 2, 1.5);
        }
      }
      let n = 0;
      for (const q of burst) {
        q.life -= dt;
        if (q.life <= 0) continue;
        q.v.y -= 1.5 * dt;
        q.p.addScaledVector(q.v, dt);
        app.particles.set(n++, q.p.x, q.p.y, q.p.z, C.amber, 0.13 * clamp(q.life));
      }
      app.particles.commit(n);
    },
  };

  return { 9: hospital, 10: garden, 11: stairs };
}
