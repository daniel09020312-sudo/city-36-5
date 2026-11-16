// 장치(탑, 다리, 병원 같은 한 채짜리 모형)를 만드는 도우미.
import * as THREE from 'three';
import { makeWarmMaterial } from '../core/warmth.js';
import { C, PALETTE } from '../palette.js';

export const edgeMaterial = new THREE.LineBasicMaterial({
  color: PALETTE.edge,
  transparent: true,
  opacity: PALETTE.edgeOpacity,
});
export const lineMaterial = new THREE.LineBasicMaterial({ color: PALETTE.edge, transparent: true, opacity: 0.85 });

// 높이에 따른 건물 회색: 낮을수록 어둡게
const _c = new THREE.Color();
export function grayForHeight(h, out = _c) {
  const t = Math.min(1, Math.max(0, (h - 1.2) / 11));
  return out.lerpColors(C.buildingLow, C.buildingHigh, Math.pow(t, 0.8));
}

// 밑면이 y=0에 놓이는 상자
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return g;
}

// 온기 재질을 입힌 모형 한 개 (윤곽선 포함)
export function prop(geo, { gray = null, h = 4, tint = C.amber, heat = 0, edges = true, glow = 0 } = {}) {
  const mat = makeWarmMaterial({ instanced: false, color: gray ?? grayForHeight(h).clone(), glow });
  mat.userData.uTint.value.copy(tint);
  mat.userData.uHeat.value = heat;
  const mesh = new THREE.Mesh(geo, mat);
  if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMaterial));
  mesh.heat = (v, t) => {
    mat.userData.uHeat.value = v;
    if (t) mat.userData.uTint.value.copy(t);
  };
  mesh.heatU = mat.userData.uHeat;
  mesh.tintU = mat.userData.uTint;
  return mesh;
}

export function box(w, h, d, opts = {}) {
  return prop(boxGeo(w, h, d), { h, ...opts });
}

// 색이 곧 빛인 물체(빔, 램프, 표지)용 재질
export function glowMaterial(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

// 바닥 판: 장치가 놓이는 자리를 한 톤 밝게 깔아 건축 모형의 받침처럼 보이게 한다
export function plate(parent, { x, z, w, d, r = 0, y = 0.02, color = PALETTE.plate, outline = true }) {
  const g = r ? new THREE.CircleGeometry(r, 48) : new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  parent.add(m);
  if (outline) {
    const pts = [];
    if (r) for (let i = 0; i <= 64; i++) pts.push(new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2) * r, 0.005, Math.sin((i / 64) * Math.PI * 2) * r));
    else
      pts.push(
        new THREE.Vector3(-w / 2, 0.005, -d / 2),
        new THREE.Vector3(w / 2, 0.005, -d / 2),
        new THREE.Vector3(w / 2, 0.005, d / 2),
        new THREE.Vector3(-w / 2, 0.005, d / 2),
        new THREE.Vector3(-w / 2, 0.005, -d / 2),
      );
    m.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMaterial));
  }
  return m;
}

// 점들을 잇는 리본(두께가 있는 선). facing은 리본이 바라보는 쪽.
export function makeRibbon(points, width, facing = new THREE.Vector3(0, 0, 1), material) {
  const n = points.length;
  const pos = new Float32Array(n * 2 * 3);
  const idx = [];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  const t = new THREE.Vector3();
  const s = new THREE.Vector3();
  mesh.setPoints = (pts) => {
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      t.subVectors(b, a).normalize();
      s.crossVectors(t, facing).normalize().multiplyScalar(width / 2);
      pos.set([p.x + s.x, p.y + s.y, p.z + s.z, p.x - s.x, p.y - s.y, p.z - s.z], i * 6);
    }
    g.attributes.position.needsUpdate = true;
  };
  mesh.setPoints(points);
  // 앞에서부터 f(0~1)만큼만 그린다
  mesh.setProgress = (f) => g.setDrawRange(0, Math.max(0, Math.floor(f * (n - 1))) * 6);
  return mesh;
}
