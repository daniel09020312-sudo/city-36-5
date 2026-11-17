// 땅과 하늘, 빛, 그리고 도시를 둘러싼 산(분지). 한쪽만 골짜기로 열려 있다.
// 도시는 공중에 떠 있지 않고, 지평선까지 이어지는 땅 위에 놓인다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../palette.js';
import { R_PLATFORM, DISTRICTS } from '../config/layout.js';
import { lineMaterial } from './props.js';
import { rng } from '../core/rng.js';

const AVENUES = ['recovery', 'regulation', 'dignity'];
const SUN_DIR = new THREE.Vector3(0.55, 0.6, 0.42).normalize();

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra });

export function createPlatform(app) {
  const { scene } = app;
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.012);

  // 낮의 빛: 하늘에서 오는 부드러운 빛 + 해
  scene.add(new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.1));
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.3);
  sun.position.copy(SUN_DIR);
  scene.add(sun);

  // 하늘: 지평선은 밝고 위로 갈수록 파래진다. 해 둘레가 은은하게 밝다.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1450, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(PALETTE.skyTop) },
        hor: { value: new THREE.Color(PALETTE.skyHorizon) },
        sunC: { value: new THREE.Color(PALETTE.sun) },
        sunDir: { value: SUN_DIR },
      },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top, hor, sunC, sunDir; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(hor, top, pow(h, 0.5));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          c += sunC * (pow(s, 90.0) * 0.55 + pow(s, 8.0) * 0.1);
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // 땅: 지평선까지 이어지는 풀밭
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 96).rotateX(-Math.PI / 2), std(PALETTE.grass));
  ground.position.y = -0.3;
  scene.add(ground);

  const group = new THREE.Group(); // 도시 바닥(인트로에서 함께 솟지 않는다)
  scene.add(group);

  // 도시 바닥: 포장된 원
  const city = new THREE.Mesh(new THREE.CircleGeometry(R_PLATFORM, 128).rotateX(-Math.PI / 2), std(PALETTE.pavement));
  city.position.y = -0.01;
  group.add(city);
  app.ground = city;

  // 광장 둘레 선과 세 대로의 가장자리 선
  const ring = (r, y = 0.012) => {
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMaterial));
  };
  ring(R_PLATFORM - 0.05, 0.02);
  ring(11.5);
  ring(3.4);

  createLandscape(scene);
  return group;
}

// ── 도시 바깥 풍경 ───────────────────────────────────
function createLandscape(scene) {
  const rand = rng(909);
  const land = new THREE.Group();
  scene.add(land);
  const roadMat = std(PALETTE.road, { polygonOffset: true, polygonOffsetFactor: -2 });
  const flat = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);

  // 도시는 산으로 둘러싸인 분지에 있다. 카메라가 도시를 바라보는 쪽(+z, 존엄 구역 대로 방향)만
  // 골짜기로 열어 두어, 첫 화면과 마지막 장면에서 산을 배경으로 도시가 보이게 한다.
  const OPEN_FROM = -32; // 열어 둘 방향(도, +z 기준 시계 반대쪽이 +)
  const OPEN_TO = 26;
  const bearing = (x, z) => (Math.atan2(x, z) * 180) / Math.PI;
  const inValley = (x, z, r) => {
    const b = bearing(x, z);
    return r < 340 && b > OPEN_FROM && b < OPEN_TO;
  };

  // 큰길: 골짜기로 나가는 길은 멀리까지, 나머지 둘은 산자락에서 끝난다
  const avenues = AVENUES.map((key) => {
    const c = DISTRICTS[key].c;
    const len = Math.hypot(c.x, c.z);
    return { key, ux: c.x / len, uz: c.z / len, rot: Math.atan2(-c.z, c.x) };
  });
  const S0 = R_PLATFORM - 1;
  for (const a of avenues) {
    const S1 = a.key === 'dignity' ? 900 : 118;
    const m = new THREE.Mesh(flat(S1 - S0, 5), roadMat);
    m.position.set((a.ux * (S0 + S1)) / 2, -0.12, (a.uz * (S0 + S1)) / 2);
    m.rotation.y = a.rot;
    land.add(m);
  }
  const nearAvenue = (x, z, pad) =>
    avenues.some((a) => {
      const along = x * a.ux + z * a.uz;
      return along > S0 - 4 && Math.abs(x * a.uz - z * a.ux) < pad;
    });

  // ── 산 한 채: 울퉁불퉁한 원뿔. 아래는 숲, 위는 바위, 높은 산은 꼭대기에 눈
  const hash = (a, b, c) => {
    const t = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return t - Math.floor(t);
  };
  const forest = PALETTE.trees.map((c) => new THREE.Color(c));
  const rock = new THREE.Color(PALETTE.mountain);
  const snow = new THREE.Color(PALETTE.snow);
  const tmp = new THREE.Color();
  function mountainGeo(rad, h, seed, snowLine) {
    let g = new THREE.ConeGeometry(rad, h, 11, 5);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = y / h;
      if (t > 0.995 || t < 0.005) continue; // 꼭대기와 밑동은 그대로
      // 같은 자리의 점은 같은 값을 받도록 좌표로 잡음을 만든다 (이음매가 벌어지지 않게)
      const n1 = hash(Math.round(x * 4), Math.round(z * 4), seed) - 0.5;
      const n2 = hash(Math.round(z * 4), Math.round(y * 4), seed + 7) - 0.5;
      const k = 1 + n1 * 0.55 * (1 - t * 0.6);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
      pos.setY(i, y + n2 * h * 0.12);
    }
    g = g.toNonIndexed();
    g.computeVertexNormals();
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i += 3) {
      const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 / h;
      const v = hash(i, seed, 3);
      if (cy > snowLine) tmp.copy(snow);
      else if (cy > 0.58 + v * 0.12) tmp.copy(rock).offsetHSL(0, 0, (v - 0.5) * 0.06);
      else tmp.copy(forest[Math.floor(v * forest.length)]).offsetHSL(0, 0, (cy - 0.3) * 0.06);
      for (let j = 0; j < 3; j++) cols.set([tmp.r, tmp.g, tmp.b], (i + j) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  }
  const mtMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });

  // 세 겹으로 둘러싼다: 가까운 숲 언덕 → 중간 산줄기 → 멀리 높은 눈 덮인 산
  const rings = [
    { n: 34, r0: 112, r1: 170, rad: [34, 62], h: [26, 58], snow: 2, valley: true },
    { n: 30, r0: 185, r1: 320, rad: [70, 120], h: [60, 125], snow: 2, valley: true },
    { n: 22, r0: 420, r1: 720, rad: [150, 260], h: [150, 280], snow: 0.8, valley: false },
  ];
  let seed = 1;
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + (rand() - 0.5) * (Math.PI / ring.n);
      const r = ring.r0 + rand() * (ring.r1 - ring.r0);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const rad = ring.rad[0] + rand() * (ring.rad[1] - ring.rad[0]);
      const h = ring.h[0] + rand() * (ring.h[1] - ring.h[0]);
      if (ring.valley && inValley(x, z, r)) continue; // 골짜기는 비운다
      if (ring.valley && nearAvenue(x, z, rad * 0.55)) continue; // 다른 두 길이 닿는 산자락도 조금 비운다
      const m = new THREE.Mesh(mountainGeo(rad, h, seed++, ring.snow), mtMat);
      m.position.set(x, -1.5, z);
      m.rotation.y = rand() * Math.PI * 2;
      land.add(m);
    }
  }

  // 골짜기 바닥과 산자락의 숲
  const trunk = new THREE.CylinderGeometry(0.06, 0.09, 0.7, 5).translate(0, 0.35, 0);
  const crownR = new THREE.IcosahedronGeometry(0.6, 0).translate(0, 1.1, 0);
  const crownC = new THREE.ConeGeometry(0.5, 1.5, 6).translate(0, 1.2, 0);
  const prep = (g) => (g.index ? g.toNonIndexed() : g);
  const crownGeos = [prep(crownR), prep(crownC)];
  const trunkMat = std(PALETTE.trunk);
  const trees = [[], []];
  for (let c = 0; c < 80; c++) {
    const a = rand() * Math.PI * 2;
    const r = R_PLATFORM + 6 + rand() * 60;
    const cx = Math.sin(a) * r;
    const cz = Math.cos(a) * r;
    const rad = 5 + rand() * 14;
    const n = 15 + Math.floor(rand() * 40);
    const conifer = rand() > 0.5;
    for (let k = 0; k < n; k++) {
      const t = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * rad;
      const x = cx + Math.cos(t) * rr;
      const z = cz + Math.sin(t) * rr;
      if (Math.hypot(x, z) < R_PLATFORM + 3 || nearAvenue(x, z, 4)) continue;
      trees[conifer && rand() > 0.2 ? 1 : 0].push({ x, z, s: 1.1 + rand() * 1.2, g: rand() });
    }
  }
  // 도시 가장자리를 두른 가로수 띠
  for (let i = 0; i < 260; i++) {
    const a = (i / 260) * Math.PI * 2;
    const r = R_PLATFORM + 2.2 + (i % 2) * 1.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (nearAvenue(x, z, 3.5)) continue;
    trees[0].push({ x, z, s: 1 + rand() * 0.3, g: rand() });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  trees.forEach((list, kind) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(crownGeos[kind], std(0xffffff), list.length);
    const trunks = new THREE.InstancedMesh(trunk, trunkMat, list.length);
    land.add(trunks);
    list.forEach((t, i) => {
      m4.compose(p.set(t.x, -0.2, t.z), q.setFromEuler(e.set(0, t.g * 6, 0)), s.set(t.s, t.s, t.s));
      mesh.setMatrixAt(i, m4);
      trunks.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(PALETTE.trees[Math.floor(t.g * PALETTE.trees.length)]));
    });
    land.add(mesh);
  });
  return land;
}
