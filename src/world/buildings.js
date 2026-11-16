// 무채색 건물. 형태별 InstancedMesh에 윤곽선을 얹는다.
// 도심은 계단식 아르데코 고층, 줄무늬 판상형 타워, 첨탑이 빽빽하게 선다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeWarmMaterial } from '../core/warmth.js';
import { C, PALETTE } from '../config/palette.js';
import { R_CITY, isFree } from '../config/layout.js';
import { rng } from '../core/rng.js';
import { grayForHeight } from './props.js';

// 모든 형태는 밑면이 y=0, 크기 1×1×1 안에 들어온다.
// 조각 = [가로, 세로(깊이), 아래 y, 위 y, x 치우침, z 치우침]
function stack(parts) {
  return mergeGeometries(
    parts.map(([w, d, y0, y1, ox = 0, oz = 0]) => {
      const g = new THREE.BoxGeometry(w, y1 - y0, d);
      g.translate(ox, (y0 + y1) / 2, oz);
      return g;
    }),
  );
}
function unitBox() {
  return stack([[1, 1, 0, 1]]);
}
// 낮은 계단형
function unitStep() {
  return stack([
    [1, 1, 0, 0.68],
    [0.62, 0.62, 0.68, 0.92],
    [0.3, 0.3, 0.92, 1],
  ]);
}
function unitHex() {
  const g = new THREE.CylinderGeometry(0.56, 0.56, 1, 6);
  g.translate(0, 0.5, 0);
  return g.toNonIndexed();
}
// 아르데코 고층: 위로 갈수록 좁아지는 단, 네 면의 버팀 기둥, 꼭대기 첨탑
function unitDeco() {
  const p = [
    [1, 1, 0, 0.44],
    [0.84, 0.84, 0.44, 0.63],
    [0.66, 0.66, 0.63, 0.78],
    [0.48, 0.48, 0.78, 0.88],
    [0.28, 0.28, 0.88, 0.945],
    [0.07, 0.07, 0.945, 1],
  ];
  for (const s of [-1, 1]) {
    p.push([0.2, 0.08, 0, 0.5, 0, s * 0.52], [0.08, 0.2, 0, 0.5, s * 0.52, 0]);
    p.push([0.14, 0.06, 0.44, 0.68, 0, s * 0.44], [0.06, 0.14, 0.44, 0.68, s * 0.44, 0]);
  }
  return stack(p);
}
// 판상형 타워: 세로 줄무늬(핀)가 선 몸통과 왕관
function unitSlab() {
  const p = [
    [0.9, 0.9, 0, 0.92],
    [0.6, 0.6, 0.92, 0.975],
    [0.3, 0.3, 0.975, 1],
  ];
  for (const s of [-1, 1])
    for (const o of [-0.28, 0, 0.28]) {
      p.push([0.09, 0.07, 0, 0.955, o, s * 0.47], [0.07, 0.09, 0, 0.955, s * 0.47, o]);
    }
  return stack(p);
}
// 첨탑: 가늘게 솟아 바늘로 끝난다
function unitSpire() {
  return stack([
    [1, 1, 0, 0.22],
    [0.74, 0.74, 0.22, 0.46],
    [0.5, 0.5, 0.46, 0.64],
    [0.3, 0.3, 0.64, 0.76],
    [0.16, 0.16, 0.76, 0.84],
    [0.05, 0.05, 0.84, 1],
    [0.38, 0.06, 0.6, 0.66],
    [0.06, 0.38, 0.6, 0.66],
  ]);
}
// 어깨가 있는 덩어리: 가운데 탑 + 양 날개 + 낮은 기단
function unitWings() {
  return stack([
    [1, 1, 0, 0.2],
    [0.46, 0.8, 0.2, 0.9],
    [0.3, 0.5, 0.9, 0.97],
    [0.1, 0.1, 0.97, 1],
    [0.26, 0.7, 0.2, 0.62, -0.36, 0],
    [0.26, 0.7, 0.2, 0.62, 0.36, 0],
    [0.2, 0.5, 0.62, 0.72, -0.36, 0],
    [0.2, 0.5, 0.62, 0.72, 0.36, 0],
    [0.06, 0.84, 0.2, 0.93, -0.12, 0],
    [0.06, 0.84, 0.2, 0.93, 0.12, 0],
  ]);
}

// ── 현대 도시의 형태 ────────────────────────────────
function boxAt(w, d, y0, y1, ox = 0, oz = 0) {
  const g = new THREE.BoxGeometry(w, y1 - y0, d);
  g.translate(ox, (y0 + y1) / 2, oz);
  return g;
}
// 판상형 아파트: 층마다 발코니 띠가 지나가고, 옥상에 계단실과 물탱크가 있다
function unitApt() {
  const parts = [boxAt(1, 0.86, 0, 0.94)];
  const FLOORS = 9;
  for (let k = 1; k <= FLOORS; k++) parts.push(boxAt(1.02, 1, (k / (FLOORS + 1)) * 0.94 - 0.008, (k / (FLOORS + 1)) * 0.94 + 0.008));
  // 세대를 나누는 세로 벽
  for (const x of [-0.25, 0.25]) parts.push(boxAt(0.02, 1.0, 0, 0.94, x, 0));
  parts.push(boxAt(0.14, 0.5, 0.94, 1, -0.25, 0), boxAt(0.14, 0.5, 0.94, 1, 0.25, 0), boxAt(0.1, 0.3, 0.94, 0.98, 0, 0.1));
  return mergeGeometries(parts);
}
// 타워형 아파트(주상복합): 정사각에 가까운 몸통, 모서리 발코니, 옥상 구조물
function unitAptTower() {
  const parts = [boxAt(0.86, 0.86, 0, 0.95)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(boxAt(0.3, 0.3, 0, 0.93, sx * 0.36, sz * 0.36));
  for (let k = 1; k <= 7; k++) parts.push(boxAt(0.9, 0.9, (k / 8) * 0.95 - 0.006, (k / 8) * 0.95 + 0.006));
  parts.push(boxAt(0.4, 0.4, 0.95, 1));
  return mergeGeometries(parts);
}
// 유리 커튼월 오피스 타워: 매끈한 몸통에 층 띠, 옥상 기계실과 안테나
function unitOffice() {
  const parts = [boxAt(1, 1, 0, 0.9), boxAt(0.8, 0.8, 0.9, 0.955), boxAt(0.36, 0.36, 0.955, 0.985), boxAt(0.035, 0.035, 0.985, 1)];
  for (let k = 1; k <= 5; k++) parts.push(boxAt(1.015, 1.015, (k / 6) * 0.9 - 0.005, (k / 6) * 0.9 + 0.005));
  return mergeGeometries(parts);
}
// 원형 타워: 층 띠 없이 매끈한 원통과 낮은 옥탑
function unitRound() {
  const body = new THREE.CylinderGeometry(0.5, 0.5, 0.93, 16);
  body.translate(0, 0.465, 0);
  const top = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 16);
  top.translate(0, 0.965, 0);
  return mergeGeometries([body, top]);
}

// 인스턴스 윤곽선: 건물의 instanceMatrix를 그대로 받아 같이 움직인다
const edgeShader = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uColor: { value: new THREE.Color(PALETTE.edge) }, uOpacity: { value: PALETTE.edgeOpacity } },
  ]),
  vertexShader: /* glsl */ `
    attribute mat4 instanceMatrix;
    #include <common>
    #include <fog_pars_vertex>
    void main(){
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uOpacity;
    #include <common>
    #include <fog_pars_fragment>
    void main(){
      gl_FragColor = vec4(uColor, uOpacity);
      #include <fog_fragment>
    }`,
  transparent: true,
  fog: true,
});

class ShapeSet {
  constructor(scene, geo, cap) {
    this.cap = cap;
    this.count = 0;
    this.mesh = new THREE.InstancedMesh(geo, makeWarmMaterial({ instanced: true }), cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.aTint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.aHeat = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.aTint.setUsage(THREE.DynamicDrawUsage);
    this.aHeat.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aTint', this.aTint);
    geo.setAttribute('aHeat', this.aHeat);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    scene.add(this.mesh);

    const eg = new THREE.InstancedBufferGeometry();
    eg.setAttribute('position', new THREE.EdgesGeometry(geo, 25).attributes.position);
    eg.setAttribute('instanceMatrix', this.mesh.instanceMatrix);
    eg.instanceCount = 0;
    this.edges = new THREE.LineSegments(eg, edgeShader);
    this.edges.frustumCulled = false;
    scene.add(this.edges);
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _col = new THREE.Color();

// 일반 건물의 회색: 낮을수록 어둡고, 고층일수록 밝다 (#2B2B30 → #7C7C84)
function grayTall(h, out) {
  const t = Math.min(1, Math.max(0, (h - 1.5) / 34));
  return out.lerpColors(C.buildingLow, C.buildingHigh, Math.pow(t, 0.6));
}

export class Buildings {
  constructor(app) {
    const { scene } = app;
    this.sets = {
      box: new ShapeSet(scene, unitBox(), 1700),
      step: new ShapeSet(scene, unitStep(), 320),
      hex: new ShapeSet(scene, unitHex(), 80),
      slab: new ShapeSet(scene, unitSlab(), 280),
      wings: new ShapeSet(scene, unitWings(), 200),
      office: new ShapeSet(scene, unitOffice(), 320),
      round: new ShapeSet(scene, unitRound(), 120),
      apt: new ShapeSet(scene, unitApt(), 320),
      aptTower: new ShapeSet(scene, unitAptTower(), 200),
    };
    this.list = [];
    this.riseFn = null; // 인트로: 건물이 솟는 정도 (b) => 0~1

    // 건물 밑 원형 그림자 데칼
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.34)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 128, 128);
    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.shadowCap = 1600;
    this.shadows = new THREE.InstancedMesh(
      pg,
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }),
      this.shadowCap,
    );
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    scene.add(this.shadows);
  }

  // 건물 한 채를 세운다. 돌려주는 b의 값을 바꾸고 commit(b)하면 화면에 반영된다.
  add(o) {
    const b = {
      x: 0, z: 0, y: 0, w: 2, d: 2, h: 3, rot: 0, shape: 'box',
      sy: 1, tiltX: 0, tiltZ: 0, heat: 0, tint: C.amber, gray: null, shadow: true,
      ...o,
    };
    const set = this.sets[b.shape];
    if (set.count >= set.cap) throw new Error(`건물이 너무 많다: ${b.shape}`);
    b.set = set;
    b.i = set.count++;
    set.mesh.count = set.count;
    set.edges.geometry.instanceCount = set.count;
    if (b.gray !== null) _col.set(b.gray);
    else grayForHeight(b.h, _col);
    set.mesh.setColorAt(b.i, _col);
    set.mesh.instanceColor.needsUpdate = true;
    this.list.push(b);
    this.commit(b);
    if (b.shadow && this.shadows.count < this.shadowCap) {
      const k = this.shadows.count++;
      _m.compose(_p.set(b.x, 0.035, b.z), _q.setFromEuler(_e.set(0, b.rot, 0)), _s.set(b.w * 2.1, 1, b.d * 2.1));
      this.shadows.setMatrixAt(k, _m);
      this.shadows.instanceMatrix.needsUpdate = true;
    }
    return b;
  }

  commit(b) {
    const rise = this.riseFn ? this.riseFn(b) : 1;
    const sy = Math.max(0.0001, b.h * b.sy * rise);
    _q.setFromEuler(_e.set(b.tiltX, b.rot, b.tiltZ));
    _m.compose(_p.set(b.x, b.y * rise, b.z), _q, _s.set(b.w, sy, b.d));
    b.set.mesh.setMatrixAt(b.i, _m);
    b.set.mesh.instanceMatrix.needsUpdate = true;
    const t = b.set.aTint.array;
    t[b.i * 3] = b.tint.r;
    t[b.i * 3 + 1] = b.tint.g;
    t[b.i * 3 + 2] = b.tint.b;
    b.set.aHeat.array[b.i] = b.heat;
    b.set.aTint.needsUpdate = true;
    b.set.aHeat.needsUpdate = true;
  }

  // 색만 바꿀 때 (행렬은 그대로)
  heat(b, heat, tint) {
    b.heat = heat;
    b.set.aHeat.array[b.i] = heat;
    b.set.aHeat.needsUpdate = true;
    if (tint && tint !== b.tint) {
      b.tint = tint;
      const t = b.set.aTint.array;
      t[b.i * 3] = tint.r;
      t[b.i * 3 + 1] = tint.g;
      t[b.i * 3 + 2] = tint.b;
      b.set.aTint.needsUpdate = true;
    }
  }

  setRise(fn) {
    this.riseFn = fn;
    for (const b of this.list) this.commit(b);
  }

  // 일반 건물로 도시를 채운다: 도심의 고층 오피스, 그 둘레의 아파트 단지와 저층 건물.
  // 줄 맞춘 격자가 아니라, 자리를 던져 겹치지 않는 곳에 세운다.
  // views: 장면 카메라의 시선. 그 길목의 건물은 시선보다 낮게 눌러 장치가 가려지지 않게 한다.
  // parks: 공원 자리 [{x, z, r}]. 건물을 세우지 않는다.
  populate(views = [], parks = [], seed = 365) {
    const rand = rng(seed);
    const ceiling = (this.ceilingAt = (x, z) => {
      let max = Infinity;
      for (const v of views) {
        const s = (x - v.tx) * v.dx + (z - v.tz) * v.dz; // 장치에서 카메라 쪽으로 잰 거리
        if (s <= 0 || s > v.D + 6) continue;
        const lat = Math.abs((x - v.tx) * v.dz - (z - v.tz) * v.dx);
        if (lat > v.r + 2.6 + s * 0.06) continue;
        const y = v.ty + (v.cy - v.ty) * Math.max(0, (s - v.r) / Math.max(1, v.D - v.r));
        max = Math.min(max, y - 0.9);
      }
      return max;
    });
    const hash = (i, j) => {
      const t = Math.sin(i * 127.1 + j * 311.7 + seed) * 43758.5453;
      return t - Math.floor(t);
    };
    const noise = (x, z) => {
      const i = Math.floor(x);
      const j = Math.floor(z);
      const fx = x - i;
      const fz = z - j;
      const u = fx * fx * (3 - 2 * fx);
      const w = fz * fz * (3 - 2 * fz);
      return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - w) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * w;
    };
    // 겹침 검사용 칸
    const CELL = 5;
    const grid = (this.grid = new Map());
    const collides = (x, z, rad) => {
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let i = cx - 2; i <= cx + 2; i++)
        for (let j = cz - 2; j <= cz + 2; j++) {
          const list = grid.get(i + ',' + j);
          if (!list) continue;
          for (const o of list) if (Math.hypot(o.x - x, o.z - z) < o.rad + rad) return true;
        }
      return false;
    };
    const mark = (x, z, rad) => {
      const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push({ x, z, rad });
    };
    for (const pk of parks) mark(pk.x, pk.z, pk.r);
    const towers = (this.towers = []);
    // 도시의 큰 방향: 광장을 감싸 도는 흐름에 잡음을 조금 섞는다
    const flow = (x, z) => Math.atan2(x, z) + (noise(x * 0.05 - 7, z * 0.05 + 2) - 0.5) * 1.2;

    // ① 아파트 단지: 같은 방향으로 나란히 선 판상형 동(棟) 여러 채
    for (let c = 0; c < 4000 && this.sets.apt.count < 150; c++) {
      const a = rand() * Math.PI * 2;
      const r = 22 + rand() * 42;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const rot = flow(cx, cz) + (rand() > 0.5 ? Math.PI / 2 : 0);
      const rows = 2 + Math.floor(rand() * 3);
      const cols = 1 + Math.floor(rand() * 2.4);
      const len = 5 + rand() * 2.6;
      const baseH = 8 + rand() * 9;
      const pitch = 4 + rand() * 1.2;
      const ux = Math.cos(rot); // 동의 긴 방향
      const uz = -Math.sin(rot);
      const vx = Math.sin(rot); // 동과 동 사이 방향
      const vz = Math.cos(rot);
      const spots = [];
      let ok = true;
      for (let i = 0; i < rows && ok; i++)
        for (let j = 0; j < cols && ok; j++) {
          const x = cx + ux * (j - (cols - 1) / 2) * (len + 1.4) + vx * (i - (rows - 1) / 2) * pitch;
          const z = cz + uz * (j - (cols - 1) / 2) * (len + 1.4) + vz * (i - (rows - 1) / 2) * pitch;
          // 긴 건물이라 원 세 개로 겹침을 본다
          for (const o of [-0.33, 0, 0.33]) {
            const px = x + ux * len * o;
            const pz = z + uz * len * o;
            if (!isFree(px, pz, 1.3) || collides(px, pz, 1.4) || ceiling(px, pz) < 6) ok = false;
          }
          spots.push({ x, z });
        }
      if (!ok || spots.length < 2) continue;
      for (const sp of spots) {
        const h = Math.min(baseH + (rand() - 0.5) * 1.5, ceiling(sp.x, sp.z));
        this.add({ x: sp.x, z: sp.z, w: len, d: 1.55, h, rot, shape: 'apt', filler: true, gray: grayTall(h + 6, _col).getHex() });
        for (const o of [-0.33, 0, 0.33]) mark(sp.x + ux * len * o, sp.z + uz * len * o, 1.45);
      }
    }

    // ② 도심 고층과 그 사이의 건물
    const TALL = ['office', 'office', 'slab', 'office', 'wings', 'round', 'aptTower', 'step'];
    const MID = ['office', 'slab', 'aptTower', 'aptTower', 'step', 'box', 'wings', 'box'];
    const tryPlace = (small) => {
      const a = rand() * Math.PI * 2;
      const r = Math.pow(rand(), small ? 0.5 : 0.68) * (R_CITY - 2); // 큰 건물은 도심 쪽에 더 몰린다
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const u = rand();
      const v = rand();
      const sh = rand();
      const fw = rand();
      const fd = rand();
      const gap = rand();
      const turn = rand();
      const pod = rand();
      const ring = Math.exp(-(((r - 24) / 15) ** 2));
      const clump = noise(x * 0.085 + 3.1, z * 0.085 - 1.7);
      const rim = r > 54 ? Math.max(0.25, 1 - (r - 54) / 16) : 1;
      let h = small ? 1.4 + u * u * 6 : 2.5 + u * u * 7 + (0.4 + ring * 0.6) * clump * (22 + v * 38) * rim;
      if (!small && u > 0.94) h += 10 * rim; // 드문드문 홀로 솟은 고층
      const cap = ceiling(x, z);
      if (cap < 0.9) return;
      const capped = h > cap;
      h = Math.max(1.1, Math.min(h, cap));
      const tall = Math.min(1, h / 26);
      let w = small ? 1.2 + fw * 1.2 : 1.7 + fw * 1.8 + tall * 0.9;
      let d = small ? 1.2 + fd * 1.2 : 1.7 + fd * 1.8 + tall * 0.9;
      let shape;
      if (h > 20) shape = TALL[Math.floor(sh * TALL.length)];
      else if (h > 9) shape = MID[Math.floor(sh * MID.length)];
      else if (h > 4.5) shape = sh < 0.3 ? 'step' : 'box';
      else shape = 'box';
      if (capped && h < 6) shape = 'box';
      if (shape === 'round' || shape === 'aptTower') d = w = Math.min(w, d);
      const rad = Math.hypot(w, d) * 0.5 * 0.76 + 0.1 + gap * gap * 0.9;
      if (!isFree(x, z, rad * 0.8)) return;
      if (collides(x, z, rad)) return;
      if (this.sets[shape].count >= this.sets[shape].cap) shape = 'box';
      // 길을 따라 대체로 나란히, 그러나 건물마다 조금씩 다르게
      const rot = flow(x, z) + (turn - 0.5) * 0.3 + (turn > 0.5 ? Math.PI / 2 : 0);
      const b = this.add({ x, z, w, d, h, rot, shape, filler: true, gray: grayTall(h, _col).getHex() });
      mark(x, z, rad);
      if (h > 15) towers.push(b);
      // 고층 발치의 저층부(상가·로비)
      if (h > 15 && pod < 0.6 && shape !== 'aptTower') {
        this.add({ x, z, w: w * 1.25, d: d * 1.25, h: 0.9 + pod * 2.2, rot, filler: true, shadow: false, gray: grayTall(3, _col).getHex() });
      }
    };
    for (let i = 0; i < 40000; i++) tryPlace(false);
    for (let i = 0; i < 26000; i++) tryPlace(true); // 틈을 메우는 낮은 건물
  }

  // 건물이 서 있지 않은 자리인가 (시민을 세울 때 쓴다)
  isOpen(x, z, pad = 0.35) {
    if (!this.grid) return true;
    const cx = Math.floor(x / 5);
    const cz = Math.floor(z / 5);
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cz - 1; j <= cz + 1; j++) {
        const list = this.grid.get(i + ',' + j);
        if (!list) continue;
        for (const o of list) if (Math.hypot(o.x - x, o.z - z) < o.rad + pad) return false;
      }
    return true;
  }
}
