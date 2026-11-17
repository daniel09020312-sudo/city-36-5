// 땅과 하늘, 빛, 그리고 도시 둘레의 풍경(교외 주택, 숲, 들판, 강과 다리, 바깥으로 이어지는 길, 언덕과 산).
// 도시는 공중에 떠 있지 않고, 지평선까지 이어지는 땅 위에 놓인다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../palette.js';
import { R_PLATFORM, DISTRICTS } from '../config/layout.js';
import { lineMaterial } from './props.js';
import { rng } from '../core/rng.js';

const AVENUES = ['recovery', 'regulation', 'dignity'];
const SUN_DIR = new THREE.Vector3(0.55, 0.6, 0.42).normalize();
const RING_IN = 104; // 바깥 순환도로
const RING_OUT = 110;
const riverZ = (x) => -165 + 38 * Math.sin(x / 130) + 14 * Math.sin(x / 47 + 1.3); // 도시 남쪽을 흐르는 강

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

  // 바깥으로 이어지는 큰길 세 개
  const avenues = AVENUES.map((key) => {
    const c = DISTRICTS[key].c;
    const len = Math.hypot(c.x, c.z);
    return { ux: c.x / len, uz: c.z / len, rot: Math.atan2(-c.z, c.x) };
  });
  const S0 = R_PLATFORM - 1;
  const S1 = 1000;
  for (const a of avenues) {
    const m = new THREE.Mesh(flat(S1 - S0, 5), roadMat);
    m.position.set(a.ux * (S0 + S1) / 2, -0.12, a.uz * (S0 + S1) / 2);
    m.rotation.y = a.rot;
    land.add(m);
  }
  // 순환도로
  const ringRoad = new THREE.Mesh(new THREE.RingGeometry(RING_IN, RING_OUT, 160).rotateX(-Math.PI / 2), roadMat);
  ringRoad.position.y = -0.12;
  land.add(ringRoad);

  const nearAvenue = (x, z, pad) =>
    avenues.some((a) => {
      const along = x * a.ux + z * a.uz;
      return along > S0 - 4 && Math.abs(x * a.uz - z * a.ux) < pad;
    });
  const nearRing = (x, z, pad) => {
    const r = Math.hypot(x, z);
    return r > RING_IN - pad && r < RING_OUT + pad;
  };
  const nearRiver = (x, z, pad) => Math.abs(z - riverZ(x)) < 9 + pad;
  const free = (x, z, pad) => !nearAvenue(x, z, pad + 2.5) && !nearRing(x, z, pad) && !nearRiver(x, z, pad);

  // 강: 도시 남쪽을 동서로 흐른다
  const N = 260;
  const pos = new Float32Array(N * 2 * 3);
  const idx = [];
  for (let i = 0; i < N; i++) {
    const x = -1100 + (2200 * i) / (N - 1);
    const z = riverZ(x);
    const w = 9 + 2.5 * Math.sin(x / 70);
    pos.set([x, -0.14, z - w, x, -0.14, z + w], i * 6);
    if (i < N - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rg.setIndex(idx);
  rg.computeVertexNormals();
  land.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 })));
  // 강을 건너는 다리 (큰길과 순환도로가 강을 지나는 자리)
  const bridgeMat = std(PALETTE.bridge);
  for (const a of avenues) {
    for (let s = S0; s < S1; s += 1) {
      const x = a.ux * s;
      const z = a.uz * s;
      if (Math.abs(z - riverZ(x)) < 1) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 0.8, 7), bridgeMat);
        deck.position.set(x, 0.25, z);
        deck.rotation.y = a.rot;
        land.add(deck);
        break;
      }
    }
  }

  // 들판: 도시에서 먼 곳의 밭
  const fieldCols = [PALETTE.field1, PALETTE.field2, PALETTE.field3, PALETTE.grassDark];
  const fieldMats = fieldCols.map((c) => std(c, { polygonOffset: true, polygonOffsetFactor: -1 }));
  for (let i = 0, tries = 0; i < 90 && tries < 3000; tries++) {
    const a = rand() * Math.PI * 2;
    const r = 190 + rand() * 330;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 30 + rand() * 50;
    const d = 22 + rand() * 40;
    if (!free(x, z, Math.max(w, d) * 0.6)) continue;
    const m = new THREE.Mesh(flat(w, d), fieldMats[Math.floor(rand() * fieldMats.length)]);
    m.position.set(x, -0.2, z);
    m.rotation.y = rand() * Math.PI;
    land.add(m);
    i++;
  }

  // 교외 주택: 박공지붕이 있는 낮은 집들
  const houses = [];
  for (let tries = 0; tries < 9000 && houses.length < 560; tries++) {
    const a = rand() * Math.PI * 2;
    const r = R_PLATFORM + 7 + Math.pow(rand(), 1.4) * 130;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 2 + rand() * 1.8;
    const d = 1.8 + rand() * 1.4;
    if (!free(x, z, 3)) continue;
    if (houses.some((h) => Math.abs(h.x - x) < 4.2 && Math.abs(h.z - z) < 4.2)) continue;
    // 길을 바라보도록 대체로 반지름 방향으로 놓는다
    houses.push({ x, z, w, d, h: 1.4 + rand() * 1.6, rot: Math.atan2(x, z) + (rand() > 0.5 ? Math.PI / 2 : 0) + (rand() - 0.5) * 0.3, c: rand(), rc: rand() });
  }
  const bodyG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofG = new THREE.CylinderGeometry(0.62, 0.62, 1, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
  roofG.scale(1, 0.62, 1.05);
  roofG.translate(0, 0.19, 0);
  const bodies = new THREE.InstancedMesh(bodyG, std(0xffffff), houses.length);
  const roofs = new THREE.InstancedMesh(roofG, std(0xffffff), houses.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const wallCols = [...PALETTE.facades.apt, ...PALETTE.facades.warm];
  houses.forEach((h, i) => {
    q.setFromEuler(e.set(0, h.rot, 0));
    m4.compose(p.set(h.x, -0.05, h.z), q, s.set(h.w, h.h, h.d));
    bodies.setMatrixAt(i, m4);
    bodies.setColorAt(i, col.set(wallCols[Math.floor(h.c * wallCols.length)]));
    m4.compose(p.set(h.x, h.h - 0.05, h.z), q, s.set(h.w * 1.08, h.w * 0.9, h.d * 1.1));
    roofs.setMatrixAt(i, m4);
    roofs.setColorAt(i, col.set(PALETTE.roof[Math.floor(h.rc * PALETTE.roof.length)]));
  });
  land.add(bodies, roofs);

  // 숲: 무리 지어 선 나무들
  const trunk = new THREE.CylinderGeometry(0.06, 0.09, 0.7, 5).translate(0, 0.35, 0);
  const crownR = new THREE.IcosahedronGeometry(0.6, 0).translate(0, 1.1, 0);
  const crownC = new THREE.ConeGeometry(0.5, 1.5, 6).translate(0, 1.2, 0);
  const prep = (g) => (g.index ? g.toNonIndexed() : g);
  const treeGeos = [mergeGeometries([prep(trunk.clone()), prep(crownR)]), mergeGeometries([prep(trunk.clone()), prep(crownC)])];
  const trees = [[], []];
  for (let c = 0; c < 70; c++) {
    const a = rand() * Math.PI * 2;
    const r = R_PLATFORM + 10 + rand() * 360;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const rad = 6 + rand() * 18;
    const n = 15 + Math.floor(rand() * 45);
    const conifer = rand() > 0.6;
    for (let k = 0; k < n; k++) {
      const t = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * rad;
      const x = cx + Math.cos(t) * rr;
      const z = cz + Math.sin(t) * rr;
      if (Math.hypot(x, z) < R_PLATFORM + 3 || !free(x, z, 1.5)) continue;
      if (houses.some((h) => Math.abs(h.x - x) < 2.4 && Math.abs(h.z - z) < 2.4)) continue;
      trees[conifer && rand() > 0.2 ? 1 : 0].push({ x, z, s: (1.1 + rand() * 1.1) * (1 + Math.max(0, Math.hypot(x, z) - 150) / 220), g: rand() });
    }
  }
  // 도시 가장자리를 두른 가로수 띠
  for (let i = 0; i < 260; i++) {
    const a = (i / 260) * Math.PI * 2;
    const r = R_PLATFORM + 2.2 + (i % 2) * 1.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!free(x, z, 0.5)) continue;
    trees[0].push({ x, z, s: 1 + rand() * 0.3, g: rand() });
  }
  trees.forEach((list, kind) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(treeGeos[kind], std(0xffffff), list.length);
    list.forEach((t, i) => {
      m4.compose(p.set(t.x, -0.2, t.z), q.setFromEuler(e.set(0, t.g * 6, 0)), s.set(t.s, t.s, t.s));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(PALETTE.trees[Math.floor(t.g * PALETTE.trees.length)]));
    });
    land.add(mesh);
  });

  // 언덕과 산: 멀리서 도시를 둘러싼다
  const hillMats = [std(PALETTE.hill), std(PALETTE.grassDark)];
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rand() * 0.15;
    const r = 360 + rand() * 220;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (nearAvenue(x, z, 40) || nearRiver(x, z, 30)) continue;
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hillMats[i % 2]);
    hill.scale.set(60 + rand() * 70, 14 + rand() * 30, 60 + rand() * 70);
    hill.position.set(x, -4, z);
    hill.rotation.y = rand() * 3;
    land.add(hill);
  }
  const mtMat = std(PALETTE.mountain);
  const snowMat = std(PALETTE.snow);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.25;
    const r = 700 + rand() * 300;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 110 + rand() * 120;
    const rad = 130 + rand() * 120;
    const mt = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7, 1), mtMat);
    mt.position.set(x, h / 2 - 2, z);
    mt.rotation.y = rand() * 3;
    land.add(mt);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.24, h * 0.24, 7, 1), snowMat);
    cap.position.set(x, h - (h * 0.24) / 2 - 2 + 0.5, z);
    cap.rotation.y = mt.rotation.y;
    land.add(cap);
  }
  return land;
}
