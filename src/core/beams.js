// 빛줄기: 두 점을 잇는 가는 원기둥. InstancedMesh 하나를 장면들이 나눠 쓴다.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Beams {
  constructor(app, max = 96) {
    this.max = max;
    const g = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true);
    g.translate(0, 0.5, 0); // 밑동이 원점
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(g, m, max);
    this.mesh.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, ZERO);
      this.mesh.setColorAt(i, white);
    }
    app.scene.add(this.mesh);
  }
  // a → b 를 반지름 r, 색 color로 잇는다
  set(i, a, b, r, color) {
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 1e-4 || r <= 0) return this.hide(i);
    _q.setFromUnitVectors(UP, _d.multiplyScalar(1 / len));
    _m.compose(a, _q, _s.set(r, len, r));
    this.mesh.setMatrixAt(i, _m);
    if (color) this.mesh.setColorAt(i, color);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (color) this.mesh.instanceColor.needsUpdate = true;
  }
  hide(i) {
    this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
