// 시민 1,000명. InstancedMesh 하나로 그린다.
// 평소에는 집 주변을 서성이고, 장면이 부르면(hold) 지정한 자리로 걸어간다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeWarmMaterial } from '../core/warmth.js';
import { C, PALETTE } from '../palette.js';
import { GRID, R_CITY, isWalkable } from '../config/layout.js';
import { rng, damp } from '../core/rng.js';

const HEAD_Y = 0.92; // 머리 위 표시가 뜨는 높이(시민 키 1 기준)
const _m = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Citizens {
  constructor(app, N = 1000) {
    this.app = app;
    this.N = N;
    const body = new THREE.CylinderGeometry(0.085, 0.15, 0.42, 6).toNonIndexed();
    body.translate(0, 0.21, 0);
    const head = new THREE.IcosahedronGeometry(0.115, 0);
    head.translate(0, 0.57, 0);
    const geo = mergeGeometries([body, head]);

    this.mesh = new THREE.InstancedMesh(geo, makeWarmMaterial({ instanced: true, color: PALETTE.citizen, bow: true, glow: 0.3 }), N);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const attr = (size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(N * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aTint = attr(3);
    this.aHeat = attr(1);
    this.aBow = attr(1);
    geo.setAttribute('aTint', this.aTint);
    geo.setAttribute('aHeat', this.aHeat);
    geo.setAttribute('aBow', this.aBow);
    app.scene.add(this.mesh);

    const f = () => new Float32Array(N);
    // 위치 · 목표 · 집
    this.px = f(); this.py = f(); this.pz = f();
    this.tx = f(); this.ty = f(); this.tz = f();
    this.hx = f(); this.hy = f(); this.hz = f();
    this.yaw = f(); this.tyaw = f().fill(NaN);
    this.scale = f(); this.speed = f().fill(1.6);
    this.bow = f(); this.tbow = f();
    this.heatT = f(); // 목표 열
    this.ovHeat = f().fill(-1); // 장면이 덮어쓴 열(-1이면 없음)
    this.held = new Uint8Array(N);
    this.phase = f(); this.wr = f();
    this.rank = f(); // 데워지는 순서
    this.progress = 0;
    this.suppressed = false;
    this.claimed = 0;

    const rand = rng(1004);
    for (let i = 0; i < N; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 200; tries++) {
        if (rand() < 0.08) {
          const a = rand() * Math.PI * 2;
          const r = 4.2 + rand() * 6.5;
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
        } else {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * (R_CITY - 2);
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
          // 건물 사이 길 위에 선다
          if (rand() < 0.5) x = (Math.round(x / GRID - 0.5) + 0.5) * GRID + (rand() - 0.5) * 0.8;
          else z = (Math.round(z / GRID - 0.5) + 0.5) * GRID + (rand() - 0.5) * 0.8;
        }
        if (isWalkable(x, z)) break;
      }
      this.hx[i] = this.px[i] = x;
      this.hz[i] = this.pz[i] = z;
      this.scale[i] = 0.92 + rand() * 0.22;
      this.yaw[i] = rand() * Math.PI * 2;
      this.phase[i] = rand() * 100;
      this.wr[i] = 0.25 + rand() * 0.7;
      this.rank[i] = rand();
      this.setTint(i, C.amber);
    }

    // 머리 위 표시: 레드 점(의혹) + 앰버 테두리(실제 양성)
    const dotG = new THREE.SphereGeometry(0.095, 10, 8);
    this.dots = new THREE.InstancedMesh(dotG, new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    const ringG = new THREE.TorusGeometry(0.19, 0.032, 6, 20);
    ringG.rotateX(Math.PI / 2);
    this.rings = new THREE.InstancedMesh(ringG, new THREE.MeshBasicMaterial({ color: PALETTE.amber }), N);
    for (const m of [this.dots, this.rings]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < N; i++) m.setMatrixAt(i, ZERO);
      app.scene.add(m);
    }
    for (let i = 0; i < N; i++) this.dots.setColorAt(i, C.red);
    this.dotS = f(); this.dotT = f();
    this.ringS = f(); this.ringT = f();
    this.marksActive = false;
    this.update(0, 0);
  }

  // 건물 배치가 끝난 뒤, 장면이 맡지 않은 시민을 빈 자리에 다시 세운다
  scatter(isOpen) {
    const rand = rng(2077);
    for (let i = this.claimed; i < this.N; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 300; tries++) {
        const a = rand() * Math.PI * 2;
        const r = rand() < 0.08 ? 4.2 + rand() * 6.5 : Math.sqrt(rand()) * (R_CITY - 2);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (isWalkable(x, z) && isOpen(x, z)) break;
      }
      this.hx[i] = this.px[i] = x;
      this.hz[i] = this.pz[i] = z;
      this.wr[i] = 0.15 + rand() * 0.35;
    }
  }

  // 장면용으로 시민 n명을 맡아 둔다 (번호 배열을 돌려준다)
  claim(n) {
    const out = [];
    for (let k = 0; k < n; k++) out.push(this.claimed++);
    return out;
  }
  setHome(i, x, z, y = 0, yaw = NaN) {
    this.hx[i] = this.px[i] = x;
    this.hy[i] = this.py[i] = y;
    this.hz[i] = this.pz[i] = z;
    this.wr[i] = 0;
    if (!Number.isNaN(yaw)) this.yaw[i] = this.homeYaw(i, yaw);
  }
  homeYaw(i, yaw) {
    (this._hyaw ??= new Float32Array(this.N).fill(NaN))[i] = yaw;
    return yaw;
  }
  // 지정한 자리로 걸어가 머문다
  hold(i, x, y, z, yaw = NaN, speed = 0) {
    this.held[i] = 1;
    this.tx[i] = x;
    this.ty[i] = y;
    this.tz[i] = z;
    this.tyaw[i] = yaw;
    if (speed) this.speed[i] = speed;
  }
  teleport(i, x, y, z, yaw) {
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    if (yaw !== undefined) this.yaw[i] = yaw;
  }
  release(i) {
    this.held[i] = 0;
    this.tyaw[i] = NaN;
    this.speed[i] = 1.6;
    this.tbow[i] = 0;
  }
  releaseAll() {
    for (let i = 0; i < this.N; i++) this.release(i);
  }
  // 걸어가는 대신 바로 제자리에 놓는다 (해시로 장면에 바로 들어올 때)
  snap() {
    for (let i = 0; i < this.N; i++) {
      if (this.held[i]) {
        this.px[i] = this.tx[i];
        this.py[i] = this.ty[i];
        this.pz[i] = this.tz[i];
      } else {
        this.px[i] = this.hx[i];
        this.py[i] = this.hy[i];
        this.pz[i] = this.hz[i];
      }
    }
  }
  at(i, out = new THREE.Vector3()) {
    return out.set(this.px[i], this.py[i], this.pz[i]);
  }
  arrived(i, eps = 0.08) {
    return Math.hypot(this.px[i] - this.tx[i], this.pz[i] - this.tz[i], this.py[i] - this.ty[i]) < eps;
  }

  setTint(i, c) {
    const t = this.aTint.array;
    t[i * 3] = c.r;
    t[i * 3 + 1] = c.g;
    t[i * 3 + 2] = c.b;
    this.aTint.needsUpdate = true;
  }
  // 장면이 시민 한 명의 색을 정한다
  override(i, tint, heat) {
    this.ovHeat[i] = heat;
    if (tint) this.setTint(i, tint);
  }
  clearOverride(i) {
    this.ovHeat[i] = -1;
    this.setTint(i, C.amber);
  }
  clearOverrides() {
    for (let i = 0; i < this.N; i++) if (this.ovHeat[i] >= 0) this.clearOverride(i);
  }
  // 투어가 진행될수록 데워진 시민의 비율이 늘어난다
  setProgress(frac) {
    this.progress = frac;
  }
  suppress(v) {
    this.suppressed = v;
  }

  // 머리 위 점: color가 null이면 지운다
  mark(i, color) {
    if (color) {
      this.dots.setColorAt(i, color);
      this.dots.instanceColor.needsUpdate = true;
      this.dotT[i] = 1;
    } else this.dotT[i] = 0;
    this.marksActive = true;
  }
  ring(i, on) {
    this.ringT[i] = on ? 1 : 0;
    this.marksActive = true;
  }
  clearMarks() {
    this.dotT.fill(0);
    this.ringT.fill(0);
    this.marksActive = true;
  }

  update(dt, t) {
    const N = this.N;
    const M = this.mesh.instanceMatrix.array;
    const heat = this.aHeat.array;
    const bow = this.aBow.array;
    const kHeat = 1 - Math.exp(-2.6 * dt);
    const kBow = 1 - Math.exp(-5 * dt);
    const hy = this._hyaw;
    for (let i = 0; i < N; i++) {
      let tx, ty, tz, sp;
      if (this.held[i]) {
        tx = this.tx[i]; ty = this.ty[i]; tz = this.tz[i]; sp = this.speed[i];
      } else {
        const ph = this.phase[i];
        const wr = this.wr[i];
        tx = this.hx[i] + Math.sin(t * 0.21 + ph) * wr;
        tz = this.hz[i] + Math.cos(t * 0.17 + ph * 1.7) * wr;
        ty = this.hy[i];
        sp = 1.6;
      }
      const dx = tx - this.px[i];
      const dy = ty - this.py[i];
      const dz = tz - this.pz[i];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let moving = false;
      if (dist > 1e-4) {
        const stepLen = Math.min(dist, Math.max(sp, dist * 2.4) * dt);
        const k = stepLen / dist;
        this.px[i] += dx * k;
        this.py[i] += dy * k;
        this.pz[i] += dz * k;
        moving = dt > 0 && stepLen / dt > 0.25 && dx * dx + dz * dz > 0.0009;
      }
      // 걷는 동안은 가는 쪽을, 멈추면 지정한 쪽을 본다
      let want = NaN;
      if (moving) want = Math.atan2(dx, dz);
      else if (this.held[i]) want = this.tyaw[i];
      else if (hy) want = hy[i];
      if (!Number.isNaN(want)) {
        let d = want - this.yaw[i];
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw[i] += d * (1 - Math.exp(-9 * dt));
      }
      bow[i] += (this.tbow[i] - bow[i]) * kBow;
      const target = this.ovHeat[i] >= 0 ? this.ovHeat[i] : this.suppressed ? 0 : this.rank[i] < this.progress ? 1 : 0;
      heat[i] += (target - heat[i]) * kHeat;

      const s = this.scale[i];
      const c = Math.cos(this.yaw[i]) * s;
      const sn = Math.sin(this.yaw[i]) * s;
      const y = this.py[i] + (moving ? Math.abs(Math.sin(t * 11 + this.phase[i])) * 0.035 : 0);
      const o = i * 16;
      M[o] = c; M[o + 1] = 0; M[o + 2] = -sn; M[o + 3] = 0;
      M[o + 4] = 0; M[o + 5] = s; M[o + 6] = 0; M[o + 7] = 0;
      M[o + 8] = sn; M[o + 9] = 0; M[o + 10] = c; M[o + 11] = 0;
      M[o + 12] = this.px[i]; M[o + 13] = y; M[o + 14] = this.pz[i]; M[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aHeat.needsUpdate = true;
    this.aBow.needsUpdate = true;

    if (this.marksActive) {
      const k = 1 - Math.exp(-9 * dt);
      const D = this.dots.instanceMatrix.array;
      const R = this.rings.instanceMatrix.array;
      let any = false;
      for (let i = 0; i < N; i++) {
        this.dotS[i] += (this.dotT[i] - this.dotS[i]) * k;
        this.ringS[i] += (this.ringT[i] - this.ringS[i]) * k;
        const ds = this.dotS[i] < 0.004 ? 0 : this.dotS[i];
        const rs = this.ringS[i] < 0.004 ? 0 : this.ringS[i];
        if (ds || rs || this.dotT[i] || this.ringT[i]) any = true;
        const y = this.py[i] + HEAD_Y * this.scale[i];
        const o = i * 16;
        D[o] = ds; D[o + 5] = ds; D[o + 10] = ds; D[o + 15] = 1;
        D[o + 12] = this.px[i]; D[o + 13] = y; D[o + 14] = this.pz[i];
        R[o] = rs; R[o + 5] = rs; R[o + 10] = rs; R[o + 15] = 1;
        R[o + 12] = this.px[i]; R[o + 13] = y; R[o + 14] = this.pz[i];
      }
      this.dots.instanceMatrix.needsUpdate = true;
      this.rings.instanceMatrix.needsUpdate = true;
      this.marksActive = any;
    }
  }
}

export { damp };
