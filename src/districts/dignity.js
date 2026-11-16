// 존엄 구역: 시립 병원(서명), 치료 결정 갈등.
import * as THREE from 'three';
import gsap from 'gsap';
import { C, PALETTE } from '../palette.js';
import { SITES, DISTRICTS } from '../config/layout.js';
import { SCENES } from '../scenes.js';
import { warmth } from '../core/warmth.js';
import { rng, clamp, damp } from '../core/rng.js';
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

  const hAz = (SCENES[5].cam.az * Math.PI) / 180;
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
      const t = SCENES[5].t;
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
      const tx = SCENES[5].t;
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

  // ═══ 치료 결정 갈등 ═══════════════════════════════
  // 병원 정원의 벤치에 환자가 앉아 있고, 가족 둘과 의료진 하나가 둘러선다.
  // 벤치 위의 파란 판이 AI의 예측이다. [다음 기준]으로 기준을 하나씩 적용한다.
  const G = SITES.garden;
  plate(group, { x: G.x, z: G.z, r: 8 });
  const gAz = (SCENES[6].cam.az * Math.PI) / 180;
  for (let k = 0; k < 13; k++) {
    const a = gAz + Math.PI * 0.42 + (k / 12) * Math.PI * 1.16; // 카메라 쪽은 틔워 둔다
    const hedge = box(2.5, 0.55 + (k % 3) * 0.12, 0.7, { h: 2.5 });
    hedge.position.set(G.x + Math.sin(a) * 7, 0, G.z + Math.cos(a) * 7);
    hedge.rotation.y = a + Math.PI / 2;
    group.add(hedge);
  }
  const fwd = v3(Math.sin(gAz), 0, Math.cos(gAz)); // 카메라 쪽
  const rgt = v3(Math.cos(gAz), 0, -Math.sin(gAz)); // 화면 오른쪽
  const at = (r, f) => v3(G.x + rgt.x * r + fwd.x * f, 0, G.z + rgt.z * r + fwd.z * f);

  // 벤치
  const benchAt = at(0, 0.2);
  const bench = new THREE.Group();
  bench.position.copy(benchAt);
  bench.rotation.y = gAz;
  group.add(bench);
  const seat = box(2.1, 0.12, 0.6, { h: 10 });
  seat.position.y = 0.4;
  bench.add(seat);
  const back = box(2.1, 0.5, 0.1, { h: 10 });
  back.position.set(0, 0.52, -0.3);
  bench.add(back);
  for (const sx of [-0.9, 0.9]) {
    const leg = box(0.12, 0.4, 0.5, { h: 7 });
    leg.position.x = sx;
    bench.add(leg);
  }

  // 사람들: 환자(벤치), 가족 둘(왼쪽), 의료진(오른쪽)
  const patientId = citizens.claim(1)[0];
  citizens.setHome(patientId, benchAt.x, benchAt.z, 0.3, gAz);
  const famIds = citizens.claim(2);
  const famAt = [at(-2.5, 1.0), at(-3.3, 0.1)];
  famIds.forEach((id, k) => citizens.setHome(id, famAt[k].x, famAt[k].z, 0, gAz + 0.75));
  const docId = citizens.claim(1)[0];
  const docAt = at(2.6, 0.9);
  citizens.setHome(docId, docAt.x, docAt.z, 0, gAz - 0.75);
  const others = [famIds[0], famIds[1], docId];

  // AI 예측 판(파랑)
  const aiMat = new THREE.MeshBasicMaterial({ color: PALETTE.blue, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const aiGeo = new THREE.PlaneGeometry(4.4, 2.3);
  const aiPanel = new THREE.Mesh(aiGeo, aiMat);
  aiPanel.position.set(benchAt.x, 4.8, benchAt.z);
  aiPanel.rotation.y = gAz;
  const aiEdgeMat = new THREE.LineBasicMaterial({ color: PALETTE.blue, transparent: true, opacity: 1 });
  aiPanel.add(new THREE.LineSegments(new THREE.EdgesGeometry(aiGeo), aiEdgeMat));
  // 판 안의 막대(예측 결과를 나타내는 그림)
  const barMat = new THREE.MeshBasicMaterial({ color: PALETTE.blue, transparent: true, opacity: 0.9, depthWrite: false });
  [0.9, 0.55, 0.3, 0.15].forEach((w, k) => {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(3.2 * w, 0.18), barMat);
    bar.position.set(-1.6 + (3.2 * w) / 2, 0.6 - k * 0.42, 0.01);
    aiPanel.add(bar);
  });
  aiPanel.visible = false;
  group.add(aiPanel);

  const tmpA = v3(0, 0, 0);
  const tmpB = v3(0, 0, 0);
  const head = (id, out, y = 0.9) => citizens.at(id, out).setY(citizens.py[id] + y);
  let cStep = 0;
  let cSigned = false;
  let cSignT = 0;
  let cUI = null;

  function cReset() {
    app.tour.clearStage();
    ui.clearControls();
    care.enter();
  }
  function cSign() {
    const t = SCENES[6].t;
    cSigned = true;
    cSignT = 0;
    cUI.btn.textContent = t.reset;
    ui.note(t.done, true, 'amber');
    setTimeout(() => app.ui.panel.scrollTo({ top: app.ui.panel.scrollHeight, behavior: app.reduced ? 'auto' : 'smooth' }), 80);
  }
  function advance() {
    const t = SCENES[6].t;
    if (cSigned) return cReset();
    if (cStep >= 3) return cSign();
    cUI.rules[cStep].classList.remove('wait');
    cStep++;
    if (cStep === 1) {
      // 기준 1: AI 예측은 참고일 뿐이다 → 파란 판이 흐려진다
      gsap.to(aiMat, { opacity: 0.08, duration: app.reduced ? 0.01 : 0.9 });
      gsap.to(barMat, { opacity: 0.25, duration: app.reduced ? 0.01 : 0.9 });
      gsap.to(aiEdgeMat, { opacity: 0.3, duration: app.reduced ? 0.01 : 0.9 });
      cUI.ai.set(`${t.ai}<br>${t.aiRef}`).tone('gray');
    } else if (cStep === 2) {
      // 기준 2: 의료진·가족·본인의 이야기를 함께 듣는다 → 주황 선이 이어진다
      for (const id of [...others, patientId]) citizens.override(id, C.amber, 1);
    } else if (cStep === 3) {
      // 기준 3: 본인의 뜻을 먼저 존중하고, 돌봄은 끝까지 이어 간다
      cUI.bubble.set(t.bubble).tone('amber').show(true);
      cUI.care.show(true);
      cUI.btn.textContent = t.sign;
    }
    setTimeout(() => app.ui.panel.scrollTo({ top: app.ui.panel.scrollHeight, behavior: app.reduced ? 'auto' : 'smooth' }), 80);
  }

  const care = {
    enter() {
      const t = SCENES[6].t;
      cStep = 0;
      cSigned = false;
      cSignT = 0;
      gsap.killTweensOf([aiMat, barMat, aiEdgeMat]);
      aiMat.opacity = 0.32;
      barMat.opacity = 0.9;
      aiEdgeMat.opacity = 1;
      aiPanel.visible = true;
      ui.cards(t.cards.map((c) => ({ title: c.title, text: c.text })));
      const btn = ui.button(t.next, advance, { primary: true });
      const rules = ui.cards(t.rules.map((r, i) => ({ html: `<i>${i + 1}</i><span>${r}</span>`, cls: 'rule wait' })));
      cUI = {
        btn,
        rules,
        ai: app.labels.add(t.ai, { x: benchAt.x, y: 6.4, z: benchAt.z }, { kind: 'tag', tone: 'blue' }),
        bubble: app.labels.add(t.bubble, { x: benchAt.x, y: 1.9, z: benchAt.z }, { kind: 'bubble' }).show(false),
        care: app.labels.add(t.care, { x: benchAt.x + fwd.x * 1.5, y: 0.3, z: benchAt.z + fwd.z * 1.5 }, { kind: 'tag', tone: 'amber' }).show(false),
      };
      app.labels.add(t.family, { x: (famAt[0].x + famAt[1].x) / 2, y: 1.6, z: (famAt[0].z + famAt[1].z) / 2 }, { kind: 'plain' });
      app.labels.add(t.staff, { x: docAt.x, y: 1.6, z: docAt.z }, { kind: 'plain' });
      for (const id of [...others, patientId]) {
        citizens.hold(id, citizens.hx[id], citizens.hy[id], citizens.hz[id], citizens._hyaw?.[id]);
      }
      warmth.focus(0, { x: G.x, y: 1, z: G.z }, 10.5, { dur: 1.4, delay: 0.8 });
    },
    exit() {
      aiPanel.visible = false;
      for (let k = 20; k < 24; k++) app.beams.hide(k);
    },
    update(dt, t, gt) {
      if (cStep >= 2) {
        head(patientId, tmpB, 0.62);
        others.forEach((id, k) => {
          head(id, tmpA, 0.9);
          app.beams.set(20 + k, tmpA, tmpB, 0.035 * (0.85 + 0.15 * Math.sin(gt * 5 + k)), C.amber);
        });
      } else for (let k = 20; k < 23; k++) app.beams.hide(k);
      if (cSigned) {
        cSignT += dt;
        const e = 1 - (1 - clamp((cSignT - 0.3) / 1.4)) ** 3;
        tmpA.set(benchAt.x, 0.8, benchAt.z);
        tmpB.set(benchAt.x, 0.8 + e * 85, benchAt.z);
        if (e > 0) app.beams.set(23, tmpA, tmpB, 0.22 * (0.9 + 0.1 * Math.sin(gt * 7)), C.amber);
      } else app.beams.hide(23);
    },
  };

  return { 5: hospital, 6: care };
}
