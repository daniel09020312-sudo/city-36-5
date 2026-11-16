// 공원과 가로수. 건축 모형처럼 나무도 무채색으로 둔다(색은 온도를 뜻할 때만 쓴다).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/rng.js';
import { DISTRICTS, R_CITY, isFree, isWalkable } from '../config/layout.js';
import { lineMaterial } from './props.js';

// 공원 자리를 먼저 잡는다. 건물은 이 자리를 피해 선다.
export function planParks(seed = 51) {
  const rand = rng(seed);
  const parks = [];
  for (let tries = 0; tries < 3000 && parks.length < 9; tries++) {
    const a = rand() * Math.PI * 2;
    const r = 15 + rand() * 44;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const rad = 4.5 + rand() * 4.5;
    if (!isFree(x, z, rad + 1)) continue;
    if (parks.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + rad + 12)) continue;
    parks.push({ x, z, r: rad, pond: rand() > 0.4, ph: rand() * 6 });
  }
  return parks;
}

export function createGreens(app, parks) {
  const { scene, buildings } = app;
  const group = new THREE.Group();
  scene.add(group);
  (app.propGroups ??= []).push({ group, x: 0 });
  const rand = rng(77);

  // 나무 두 종류: 둥근 활엽수, 뾰족한 침엽수
  const trunk = (h) => {
    const g = new THREE.CylinderGeometry(0.035, 0.05, h, 5);
    g.translate(0, h / 2, 0);
    return g;
  };
  const roundCrown = new THREE.IcosahedronGeometry(0.34, 0);
  roundCrown.translate(0, 0.62, 0);
  const coneCrown = new THREE.ConeGeometry(0.26, 0.82, 6);
  coneCrown.translate(0, 0.62, 0);
  const prep = (g) => (g.index ? g.toNonIndexed() : g);
  const geos = [mergeGeometries([prep(trunk(0.4)), prep(roundCrown)]), mergeGeometries([prep(trunk(0.3)), prep(coneCrown)])];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, flatShading: true });
  const spots = [[], []];
  const plant = (x, z, s = 1, kind = rand() > 0.72 ? 1 : 0) => spots[kind].push({ x, z, s: s * (0.8 + rand() * 0.55), g: 0.075 + rand() * 0.06, rot: rand() * 6 });

  // ── 공원: 바닥, 산책로, 연못, 빽빽한 나무 ───────────
  const lawn = new THREE.MeshBasicMaterial({ color: '#1d1e21' });
  const water = new THREE.MeshBasicMaterial({ color: '#0b0b0d' });
  for (const pk of parks) {
    const base = new THREE.Mesh(new THREE.CircleGeometry(pk.r, 40).rotateX(-Math.PI / 2), lawn);
    base.position.set(pk.x, 0.02, pk.z);
    group.add(base);
    // 구불구불한 산책로
    const path = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const rr = pk.r * (0.58 + 0.12 * Math.sin(a * 3 + pk.ph));
      path.push(new THREE.Vector3(pk.x + Math.cos(a) * rr, 0.03, pk.z + Math.sin(a) * rr));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), lineMaterial));
    let pond = null;
    if (pk.pond) {
      pond = { x: pk.x + Math.cos(pk.ph) * pk.r * 0.2, z: pk.z + Math.sin(pk.ph) * pk.r * 0.2, r: pk.r * 0.3 };
      const m = new THREE.Mesh(new THREE.CircleGeometry(pond.r, 28).rotateX(-Math.PI / 2), water);
      m.scale.set(1.25, 1, 0.8);
      m.rotation.y = pk.ph;
      m.position.set(pond.x, 0.028, pond.z);
      group.add(m);
    }
    const n = Math.round(pk.r * pk.r * 1.5);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * (pk.r - 0.4);
      const x = pk.x + Math.cos(a) * rr;
      const z = pk.z + Math.sin(a) * rr;
      if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r * 1.3) continue;
      plant(x, z, 1.15);
    }
  }

  // ── 가로수: 세 대로 양쪽, 광장 둘레 ─────────────────
  for (const key of ['recovery', 'regulation', 'dignity']) {
    const c = DISTRICTS[key].c;
    const len = Math.hypot(c.x, c.z);
    const ux = c.x / len;
    const uz = c.z / len;
    for (let s = 13; s < len - 7; s += 2.1) {
      for (const side of [-2.3, 2.3]) plant(ux * s - uz * side, uz * s + ux * side, 1, 0);
    }
  }
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    const x = Math.cos(a) * 12.9;
    const z = Math.sin(a) * 12.9;
    // 대로가 지나는 자리는 비운다
    if (['recovery', 'regulation', 'dignity'].some((k) => {
      const c = DISTRICTS[k].c;
      const len = Math.hypot(c.x, c.z);
      return Math.hypot(x - (c.x / len) * 12.9, z - (c.z / len) * 12.9) < 2.9;
    })) continue;
    plant(x, z, 1, 0);
  }

  // ── 길가와 건물 사이 빈 땅의 나무 ───────────────────
  let placed = 0;
  for (let tries = 0; tries < 9000 && placed < 520; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * (R_CITY - 1);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!isWalkable(x, z) || !isFree(x, z, 0.6) || !buildings.isOpen(x, z, 0.5)) continue;
    // 시선 때문에 건물을 낮춘 길목은 나무를 더 심어 작은 녹지로 만든다
    const low = buildings.ceilingAt ? buildings.ceilingAt(x, z) < 5 : false;
    if (!low && rand() > 0.3) continue;
    plant(x, z, low ? 1.05 : 0.9);
    if (low && rand() > 0.4) plant(x + (rand() - 0.5) * 1.4, z + (rand() - 0.5) * 1.4, 0.95);
    placed++;
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  spots.forEach((list, kind) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geos[kind], mat, list.length);
    mesh.frustumCulled = false;
    list.forEach((t, i) => {
      m4.compose(p.set(t.x, 0, t.z), q.setFromEuler(e.set(0, t.rot, 0)), s.set(t.s, t.s * (kind ? 1.2 : 1), t.s));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.setScalar(t.g));
    });
    group.add(mesh);
  });
  // ── 도로: 아스팔트, 중앙선, 횡단보도, 자동차 ─────────
  const roads = AVENUES.map((key) => {
    const c = DISTRICTS[key].c;
    const len = Math.hypot(c.x, c.z);
    return { ux: c.x / len, uz: c.z / len, s0: RING_R + 1.2, s1: len - 6.5, rot: Math.atan2(-c.z, c.x) };
  });
  const asphalt = new THREE.MeshBasicMaterial({ color: '#131315' });
  const paint = new THREE.MeshBasicMaterial({ color: '#8d8d95' });
  const flat = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  for (const rd of roads) {
    const L = rd.s1 - rd.s0;
    const strip = new THREE.Mesh(flat(L, ROAD_W), asphalt);
    strip.position.set(rd.ux * (rd.s0 + L / 2), 0.016, rd.uz * (rd.s0 + L / 2));
    strip.rotation.y = rd.rot;
    group.add(strip);
  }
  const ringRoad = new THREE.Mesh(new THREE.RingGeometry(RING_R - 1.5, RING_R + 0.6, 72).rotateX(-Math.PI / 2), asphalt);
  ringRoad.position.y = 0.016;
  group.add(ringRoad);

  // 흰 칠(중앙선 점선과 횡단보도 줄무늬)을 한 메시에 모은다
  const marks = [];
  for (const rd of roads) {
    for (let sPos = rd.s0 + 1; sPos < rd.s1 - 1; sPos += 1.7) marks.push({ x: rd.ux * sPos, z: rd.uz * sPos, rot: rd.rot, w: 0.8, d: 0.07 });
    // 횡단보도: 길을 가로지르는 줄무늬 7개
    for (const sPos of [rd.s0 + 2.2, (rd.s0 + rd.s1) / 2, rd.s1 - 2.2]) {
      for (let k = -3; k <= 3; k++) {
        const off = k * 0.5;
        marks.push({ x: rd.ux * sPos - rd.uz * off, z: rd.uz * sPos + rd.ux * off, rot: rd.rot, w: 1.5, d: 0.26 });
      }
    }
  }
  const markMesh = new THREE.InstancedMesh(flat(1, 1), paint, marks.length);
  markMesh.frustumCulled = false;
  marks.forEach((mk, i) => {
    m4.compose(p.set(mk.x, 0.022, mk.z), q.setFromEuler(e.set(0, mk.rot, 0)), s.set(mk.w, 1, mk.d));
    markMesh.setMatrixAt(i, m4);
  });
  group.add(markMesh);

  // 자동차: 차체 + 지붕
  const body = new THREE.BoxGeometry(1.45, 0.3, 0.62);
  body.translate(0, 0.25, 0);
  const cabin = new THREE.BoxGeometry(0.78, 0.24, 0.54);
  cabin.translate(-0.06, 0.52, 0);
  const carGeo = mergeGeometries([body, cabin]);
  const cars = [];
  roads.forEach((rd, ri) => {
    const n = Math.round((rd.s1 - rd.s0) / 4.2);
    for (let k = 0; k < n; k++) {
      for (const dir of [1, -1]) cars.push({ ri, dir, s: rd.s0 + rand() * (rd.s1 - rd.s0), sp: 2.6 + rand() * 1.8, g: 0.04 + rand() * 0.3 });
    }
  });
  for (let k = 0; k < 9; k++) cars.push({ ring: true, a: (k / 9) * Math.PI * 2 + rand() * 0.3, sp: 0.2 + rand() * 0.04, g: 0.04 + rand() * 0.3 });
  const carMesh = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0, flatShading: true }), cars.length);
  carMesh.frustumCulled = false;
  carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cars.forEach((c, i) => carMesh.setColorAt(i, col.setScalar(c.g)));
  group.add(carMesh);
  const LANE = 0.82;
  const updateCars = (dt) => {
    cars.forEach((c, i) => {
      let x;
      let z;
      let rot;
      let k = 1;
      if (c.ring) {
        c.a += c.sp * dt;
        x = Math.cos(c.a) * (RING_R - 0.45);
        z = Math.sin(c.a) * (RING_R - 0.45);
        rot = -c.a - Math.PI / 2;
      } else {
        const rd = roads[c.ri];
        c.s += c.dir * c.sp * dt;
        if (c.s > rd.s1) c.s = rd.s0;
        if (c.s < rd.s0) c.s = rd.s1;
        // 우측통행. 길 끝에서는 작아지며 사라졌다가 반대쪽에서 다시 나온다.
        const side = c.dir * LANE;
        x = rd.ux * c.s + rd.uz * side;
        z = rd.uz * c.s - rd.ux * side;
        rot = rd.rot + (c.dir < 0 ? Math.PI : 0);
        k = Math.min(1, (c.s - rd.s0) / 1.5, (rd.s1 - c.s) / 1.5);
      }
      m4.compose(p.set(x, 0.02, z), q.setFromEuler(e.set(0, rot, 0)), s.setScalar(Math.max(0.0001, k)));
      carMesh.setMatrixAt(i, m4);
    });
    carMesh.instanceMatrix.needsUpdate = true;
  };
  updateCars(0);

  app.greens = {
    group,
    trees: spots[0].length + spots[1].length,
    parks,
    cars: cars.length,
    // 차도 위인가 (시민을 차도에 세우지 않는다)
    onRoad(x, z) {
      const r = Math.hypot(x, z);
      if (r > RING_R - 1.7 && r < RING_R + 0.8) return true;
      for (const rd of roads) {
        const along = x * rd.ux + z * rd.uz;
        if (along < rd.s0 - 0.5 || along > rd.s1 + 0.5) continue;
        if (Math.abs(x * rd.uz - z * rd.ux) < ROAD_W / 2 + 0.2) return true;
      }
      return false;
    },
    update(dt) {
      updateCars(app.reduced ? dt * 0.3 : dt);
    },
  };
}

const AVENUES = ['recovery', 'regulation', 'dignity'];
const RING_R = 11.5; // 광장 둘레 도로
const ROAD_W = 3.3;
