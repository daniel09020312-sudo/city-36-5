// 입자: Points 하나, 최대 2,000개. 장면이 배열을 직접 채우고 commit()한다.
import * as THREE from 'three';

export const MAX_PARTICLES = 2000;

export class Particles {
  constructor(app) {
    this.max = MAX_PARTICLES;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    this.count = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uScale = { value: 600 };
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute float size; uniform float uScale; varying vec3 vC;
        void main(){
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.5, size * uScale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.18, d);
          if (a < 0.02) discard;
          gl_FragColor = vec4(vC, a);
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    app.scene.add(this.points);
  }
  // 화면 높이(px)와 시야각으로 '월드 단위 크기 → 픽셀' 배율을 맞춘다
  resize(heightPx, fovDeg) {
    this.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
  set(i, x, y, z, c, size) {
    const j = i * 3;
    this.pos[j] = x;
    this.pos[j + 1] = y;
    this.pos[j + 2] = z;
    this.col[j] = c.r;
    this.col[j + 1] = c.g;
    this.col[j + 2] = c.b;
    this.size[i] = size;
  }
  commit(count) {
    this.count = Math.min(count, this.max);
    const g = this.points.geometry;
    g.setDrawRange(0, this.count);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
  clear() {
    this.commit(0);
  }
}
