// 투어: 장면 전환, 카메라 이동, URL 해시(#s0~#s13), 키보드, 자유 탐험 모드.
import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SCENES, DISTRICT_NAMES } from '../scenes.js';
import { DISTRICTS, districtAt } from '../config/layout.js';
import { warmth } from './warmth.js';

const D2R = Math.PI / 180;
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hit = new THREE.Vector3();
const _off = new THREE.Vector3();

export class Tour {
  constructor(app, behaviours) {
    this.app = app;
    this.behaviours = behaviours;
    this.index = -1;
    this.mode = 'tour';
    const c0 = SCENES[0].cam;
    // 카메라 상태: 바라보는 점 + 거리 + 두 각. (ox, oy)는 패널을 비켜 가는 화면 이동(px).
    this.rig = { tx: c0.target[0], ty: c0.target[1], tz: c0.target[2], dist: c0.dist, el: c0.el, az: c0.az, fog: SCENES[0].fog, ox: 0, oy: 0 };
    this.pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    this.frame = 1;

    const { camera, renderer, ui } = app;
    this.controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(this.controls, { enabled: false, enableDamping: true, dampingFactor: 0.07, minDistance: 10, maxDistance: 330, maxPolarAngle: 86 * D2R, zoomSpeed: 0.8, rotateSpeed: 0.55 });
    this.controls.target.set(0, 2, 0);

    ui.onNext = () => this.next();
    ui.onPrev = () => this.prev();
    ui.onGo = (i) => {
      if (this.mode === 'free') this.setMode('tour', false);
      this.go(i, { force: this.mode !== 'tour' });
    };
    ui.onMode = (m) => this.setMode(m);

    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('hashchange', () => {
      const i = this.readHash();
      if (i !== null && i !== this.index) this.go(i);
    });

    // 포인터: 장면에 넘겨 주거나(렌즈, 분자 클릭), 자유 탐험에서 지구를 고른다
    const dom = renderer.domElement;
    let down = null;
    dom.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    dom.addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
      if (this.mode === 'tour') this.current?.pointerMove?.(this.ray(e), e);
    });
    dom.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (moved > 7 || !quick) return;
      if (this.mode === 'tour') this.current?.click?.(this.ray(e), e);
      else if (this.mode === 'free') this.freeClick(this.ray(e));
    });
    dom.addEventListener('pointerleave', () => this.current?.pointerLeave?.());

    // 자유 탐험에서 보이는 지구 이름표
    this.districtLabels = Object.values(DISTRICTS).map((d) =>
      app.labels
        .add(`${DISTRICT_NAMES[d.key]}<small>${SCENES[d.first].title}</small>`, { x: d.c.x, y: d.key === 'plaza' ? 29 : 14, z: d.c.z }, {
          kind: 'district',
          persist: true,
          onClick: () => {
            this.setMode('tour', false);
            this.go(d.first, { force: true });
          },
        })
        .show(false),
    );
  }

  get current() {
    return this.behaviours[this.index];
  }

  ray(e) {
    _ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, this.app.camera);
    return _ray;
  }

  // 주소 끝의 #1~#8 로 장면을 연다. 예전 주소(#s0~#s13)는 가까운 장면으로 이어 준다.
  readHash() {
    let m = /^#(\d+)$/.exec(location.hash);
    if (m) {
      const n = Number(m[1]);
      return n >= 1 && n <= SCENES.length ? n - 1 : null;
    }
    m = /^#s(\d+)$/.exec(location.hash);
    if (m) return Math.min(SCENES.length - 1, Number(m[1]));
    return null;
  }

  // 앞 장면이 남긴 것을 한꺼번에 치운다 (장면이 바뀔 때, 부분이 바뀔 때)
  clearStage() {
    const { app } = this;
    app.labels.clear();
    app.particles.clear();
    app.beams.clear();
    warmth.clearAll();
    app.citizens.releaseAll();
    app.citizens.clearOverrides();
    app.citizens.clearMarks();
    app.citizens.suppress(false);
  }

  // 같은 장면 안에서 카메라만 옮긴다 (부분 탭)
  flyTo(cam, dur = 2) {
    const { app } = this;
    this.tl?.kill();
    const inset = app.ui.inset();
    const to = { ...this.camTarget(null, cam), ox: inset.x, oy: inset.y };
    this.tl = gsap.timeline().to(this.rig, { ...to, duration: app.reduced ? 0.001 : dur, ease: 'power2.inOut' });
  }

  start() {
    this.go(this.readHash() ?? 0, { instant: true });
  }
  next() {
    if (this.index < SCENES.length - 1) this.go(this.index + 1);
  }
  prev() {
    if (this.index > 0) this.go(this.index - 1);
  }

  onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return; // 슬라이더를 화살표로 움직일 때는 넘기지 않는다
    if (this.mode === 'walk') {
      if (e.key === 'Escape') this.setMode('tour');
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') this.modeTour(() => this.next());
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.modeTour(() => this.prev());
    else if (e.key === 'Home') this.modeTour(() => this.go(0));
    else if (e.key === 'End') this.modeTour(() => this.go(SCENES.length - 1));
    else if (e.key === 'f' || e.key === 'F') this.setMode(this.mode === 'tour' ? 'free' : 'tour');
    else if (e.key === 'Enter' && this.index === 0 && tag !== 'BUTTON') this.next();
    else return;
    e.preventDefault();
  }
  modeTour(fn) {
    if (this.mode !== 'tour') this.setMode('tour', false);
    fn();
  }

  // 좁은 화면일수록 멀리서 잡아 장면이 잘리지 않게 한다
  frameFactor() {
    const a = window.innerWidth / window.innerHeight;
    return a < 1.55 ? Math.pow(1.55 / a, 0.82) : 1;
  }

  camTarget(sc, c = sc.cam) {
    let az = c.az ?? this.rig.az;
    // 가까운 쪽으로 돈다
    while (az - this.rig.az > 180) az -= 360;
    while (az - this.rig.az < -180) az += 360;
    const out = { dist: c.dist ?? undefined, el: c.el ?? undefined, az };
    if (c.target) Object.assign(out, { tx: c.target[0], ty: c.target[1], tz: c.target[2] });
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  }

  go(i, { instant = false, force = false } = {}) {
    i = Math.max(0, Math.min(SCENES.length - 1, i));
    if (i === this.index && !force) return;
    const { app } = this;
    const sc = SCENES[i];
    const same = i === this.index;

    if (!same) {
      this.current?.exit?.();
      this.clearStage();
      app.ui.setPanelHidden(false);
      this.index = i;
      app.citizens.setProgress(sc.warm ?? 0);
      app.ui.setScene(i, sc);
      if (location.hash !== `#${i + 1}`) history.replaceState(null, '', `#${i + 1}`);
    }

    const cut = instant || app.reduced;
    this.tl?.kill();
    const inset = app.ui.inset();
    const to = { ...this.camTarget(sc), fog: sc.fog, ox: inset.x, oy: inset.y };
    const tl = (this.tl = gsap.timeline());
    tl.to(this.rig, { ...to, duration: cut ? 0.001 : same ? 1.6 : 2.5, ease: 'power2.inOut' });
    if (sc.cam2 && !app.reduced) {
      const { dur, ...c2 } = sc.cam2;
      tl.to(this.rig, { ...this.camTarget(sc, c2), duration: dur, ease: 'sine.inOut' });
    }

    if (!same) {
      this.sceneTime = 0;
      this.current?.enter?.({ instant: cut });
      if (cut) app.citizens.snap();
    }
  }

  setMode(mode, retarget = true) {
    if (mode === this.mode) return;
    const { app } = this;
    const prev = this.mode;
    if (prev === 'walk') {
      // 걷던 자리 앞쪽을 바라보는 점으로 카메라 상태를 옮겨, 그 자리에서 부드럽게 빠져나온다
      app.walk.stop();
      const f = app.walk.forward(_off);
      const p = app.camera.position;
      const tx = p.x + f.x * 10;
      const ty = p.y + f.y * 10;
      const tz = p.z + f.z * 10;
      this.controls.target.set(tx, ty, tz);
      Object.assign(this.rig, { tx, ty, tz, dist: 10 / this.frameFactor(), el: Math.asin(-f.y) / D2R, az: Math.atan2(-f.x, -f.z) / D2R, ox: 0, oy: 0 });
    }
    this.mode = mode;
    app.ui.setMode(mode);
    this.districtLabels.forEach((l) => l.show(mode === 'free' || mode === 'walk'));
    if (mode === 'walk') {
      this.tl?.kill();
      this.controls.enabled = false;
      app.ui.showEnding(false);
      app.ui.showIntro(false);
      app.hudWasOn = true;
      app.walk.start();
      return;
    }
    if (mode === 'free') {
      this.tl?.kill();
      app.ui.showEnding(false);
      this.controls.target.set(this.rig.tx, this.rig.ty, this.rig.tz);
      this.controls.enabled = true;
      gsap.to(this.rig, { ox: 0, oy: 0, fog: Math.min(this.rig.fog, 0.0042), duration: 0.9, ease: 'power2.out' });
    } else {
      this.controls.enabled = false;
      if (prev === 'walk') {
        if (retarget) this.go(this.index, { force: true });
        if (this.index === 0 && app.introGo) app.ui.showIntro(true);
        return;
      }
      // 지금 카메라 위치에서 장면의 자리로 돌아간다
      const { camera } = app;
      const k = this.frameFactor();
      _off.subVectors(camera.position, this.controls.target);
      const len = _off.length();
      Object.assign(this.rig, {
        tx: this.controls.target.x,
        ty: this.controls.target.y,
        tz: this.controls.target.z,
        dist: len / k,
        el: Math.asin(Math.max(-1, Math.min(1, _off.y / len))) / D2R,
        az: Math.atan2(_off.x, _off.z) / D2R,
      });
      if (retarget) this.go(this.index, { force: true });
    }
  }

  freeClick(ray) {
    if (!ray.ray.intersectPlane(_ground, _hit)) return;
    if (Math.hypot(_hit.x, _hit.z) > 74) return;
    // 누른 자리에서 앰버가 번진다 (도시는 무채색, 온기는 누른 곳에서)
    warmth.focus(3, { x: _hit.x, y: 0, z: _hit.z }, 13, { dur: 1.1, slotHeat: 1 });
    clearTimeout(this._warmT);
    this._warmT = setTimeout(() => warmth.fade(3, 1.4), 2600);
    const d = districtAt(_hit.x, _hit.z);
    if (d && d.key !== 'plaza') {
      clearTimeout(this._goT);
      this._goT = setTimeout(() => {
        if (this.mode !== 'free') return;
        this.setMode('tour', false);
        this.go(d.first, { force: true });
      }, 650);
    }
  }

  resize() {
    if (this.mode !== 'tour' || this.index < 0) return;
    const inset = this.app.ui.inset();
    gsap.to(this.rig, { ox: inset.x, oy: inset.y, duration: 0.4, overwrite: 'auto' });
  }

  update(dt, t) {
    if (this.mode === 'walk') {
      this.app.scene.fog.density = 0.02;
      this.app.walk.update(dt, t);
      this.sceneTime = (this.sceneTime ?? 0) + dt;
      this.current?.update?.(dt, this.sceneTime, t);
      return;
    }
    const { app, rig } = this;
    const { camera, scene } = app;
    const k = this.frameFactor();
    const w = window.innerWidth;
    const h = window.innerHeight;
    scene.fog.density = rig.fog / (this.mode === 'free' ? 1 : k);

    if (this.mode === 'free') {
      camera.clearViewOffset();
      this.controls.update();
    } else {
      // 가만히 있어도 숨 쉬듯 아주 조금 움직인다
      const p = this.pointer;
      p.sx += (p.x - p.sx) * Math.min(1, dt * 2.5);
      p.sy += (p.y - p.sy) * Math.min(1, dt * 2.5);
      const live = app.reduced ? 0 : 1;
      const az = (rig.az + live * (Math.sin(t * 0.13) * 1.1 - p.sx * 1.6)) * D2R;
      const el = Math.max(-12, Math.min(88, rig.el + live * (Math.sin(t * 0.1 + 1) * 0.35 + p.sy * 0.7))) * D2R;
      const dist = rig.dist * k;
      camera.position.set(rig.tx + dist * Math.cos(el) * Math.sin(az), rig.ty + dist * Math.sin(el), rig.tz + dist * Math.cos(el) * Math.cos(az));
      camera.lookAt(rig.tx, rig.ty, rig.tz);
      if (Math.abs(rig.ox) > 0.5 || Math.abs(rig.oy) > 0.5) camera.setViewOffset(w, h, -rig.ox, rig.oy, w, h);
      else camera.clearViewOffset();
    }
    this.sceneTime = (this.sceneTime ?? 0) + dt;
    this.current?.update?.(dt, this.sceneTime, t);
  }
}
