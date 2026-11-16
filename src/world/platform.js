// 원형 대지, 안개, 조명.
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { R_PLATFORM, DISTRICTS } from '../config/layout.js';
import { lineMaterial } from './props.js';

export function createPlatform(app) {
  const { scene } = app;
  scene.background = new THREE.Color(PALETTE.sky);
  // 안개를 하늘과 같은 색으로 깔아 먼 곳이 어둠에 녹게 한다
  scene.fog = new THREE.FogExp2(PALETTE.sky, 0.012);

  // 약한 반구광 + 방향광 1개. 그림자는 끈다(건물 밑 데칼로 접지감을 낸다).
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2e, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(0.55, 1, 0.42);
  scene.add(sun);

  const group = new THREE.Group();
  scene.add(group);

  // 대지: 윗면은 정확히 바닥색, 옆면은 조금 더 어둡게
  const slab = new THREE.Mesh(
    new THREE.CylinderGeometry(R_PLATFORM, R_PLATFORM - 1.2, 3, 128, 1, false),
    [
      new THREE.MeshBasicMaterial({ color: '#111113' }),
      new THREE.MeshBasicMaterial({ color: PALETTE.ground }),
      new THREE.MeshBasicMaterial({ color: '#0e0e10' }),
    ],
  );
  slab.position.y = -1.5;
  group.add(slab);
  app.ground = slab;

  // 건축 모형의 받침처럼: 가장자리 선, 동심원, 세 갈래 대로
  const ring = (r, y = 0.012) => {
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMaterial));
  };
  ring(R_PLATFORM - 0.05, 0.02);
  ring(R_PLATFORM - 3);
  ring(11.5);
  ring(3.4);

  for (const key of ['recovery', 'regulation', 'dignity']) {
    const c = DISTRICTS[key].c;
    const len = Math.hypot(c.x, c.z);
    const ux = c.x / len;
    const uz = c.z / len;
    const px = -uz;
    const pz = ux;
    for (const s of [-1.65, 1.65]) {
      const a = new THREE.Vector3(ux * 11.5 + px * s, 0.012, uz * 11.5 + pz * s);
      const b = new THREE.Vector3(ux * (len - 6) + px * s, 0.012, uz * (len - 6) + pz * s);
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMaterial));
    }
  }
  return group;
}
