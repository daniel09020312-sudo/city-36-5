// 시민 시점으로 걷기.
// 컴퓨터: W A S D 또는 방향키로 걷고(Shift는 빨리), 마우스를 움직여 둘러본다(포인터 잠금).
//         Esc를 한 번 누르면 마우스가 풀리고, 한 번 더 누르면 나간다.
// 휴대폰: 왼쪽 아래를 밀어 걷고, 화면 오른쪽을 끌어 둘러본다.
import * as THREE from 'three';
import { SITE } from '../scenes.js';
import { R_CITY } from '../config/layout.js';

const EYE = 0.62; // 눈높이 (시민 키 기준)
const FOV = 62; // 걸을 때의 시야각
const WALK = 2.4; // 걷는 속도
const RUN = 5.2; // Shift를 누르고 걸을 때
const PAD = 0.2; // 건물과의 간격
const PAD_R = 58; // 조이스틱이 움직이는 반경(px)

export class Walk {
  constructor(app) {
    this.app = app;
    this.on = false;
    this.x = 0;
    this.z = 17; // 존엄 구역 쪽 대로에서 광장을 바라보며 시작한다
    this.yaw = Math.PI;
    this.pitch = 0.08;
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };
    this.bob = 0;
    this.look = null;
    this.pad = null;
    this.touch = matchMedia('(pointer: coarse)').matches;

    this.ui = document.getElementById('walk-ui');
    this.hint = this.ui.querySelector('#walk-hint');
    this.hint.textContent = this.touch ? SITE.walkHint.touch : SITE.walkHint.desktop;
    const exit = this.ui.querySelector('#walk-exit');
    exit.textContent = SITE.walkHint.exit;
    exit.addEventListener('click', () => app.tour.setMode('tour'));
    this.padEl = this.ui.querySelector('#walk-pad');
    this.knob = this.padEl.querySelector('i');
    this.padEl.hidden = !this.touch;

    const keyName = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase());
    window.addEventListener('keydown', (e) => {
      if (!this.on || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keyName(e);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(keyName(e)));
    window.addEventListener('blur', () => this.keys.clear());

    const dom = app.renderer.domElement;
    this.dom = dom;
    // 마우스: 화면을 누르면 포인터가 잠기고, 마우스를 움직이는 대로 시선이 돈다
    this.canLock = 'requestPointerLock' in dom;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === dom;
      this.ui.classList.toggle('locked', locked);
      if (!this.on || this.touch) return;
      this.hint.textContent = locked ? SITE.walkHint.desktop : SITE.walkHint.paused;
      if (!locked) this.keys.clear();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.on || this.touch) return;
      if (this.canLock && document.pointerLockElement !== dom) return;
      // 오른쪽으로 움직이면 오른쪽으로, 위로 움직이면 위로 본다
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-0.75, Math.min(0.85, this.pitch - e.movementY * 0.0022));
    });
    dom.addEventListener('pointerdown', (e) => {
      if (!this.on) return;
      if (e.pointerType === 'mouse') {
        this.lock();
        return;
      }
      // 휴대폰에서 화면 왼쪽 40%는 조이스틱, 나머지는 둘러보기
      if (e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.4 && !this.pad) {
        this.pad = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.padEl.style.left = `${e.clientX}px`;
        this.padEl.style.top = `${e.clientY}px`;
        this.padEl.classList.add('active');
      } else if (!this.look) {
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.on) return;
      if (this.pad && e.pointerId === this.pad.id) {
        let dx = (e.clientX - this.pad.x) / PAD_R;
        let dy = (e.clientY - this.pad.y) / PAD_R;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          dx /= len;
          dy /= len;
        }
        this.stick.x = dx;
        this.stick.y = dy;
        this.knob.style.transform = `translate(${dx * PAD_R}px, ${dy * PAD_R}px)`;
      } else if (this.look && e.pointerId === this.look.id) {
        // 장면을 잡아 끄는 방식: 오른쪽으로 끌면 시선이 왼쪽으로 돈다
        this.yaw += (e.clientX - this.look.x) * 0.0042;
        this.pitch = Math.max(-0.55, Math.min(0.75, this.pitch + (e.clientY - this.look.y) * 0.0034));
        this.look.x = e.clientX;
        this.look.y = e.clientY;
      }
    });
    const end = (e) => {
      if (this.pad && e.pointerId === this.pad.id) {
        this.pad = null;
        this.stick.x = this.stick.y = 0;
        this.knob.style.transform = '';
        this.padEl.classList.remove('active');
      }
      if (this.look && e.pointerId === this.look.id) this.look = null;
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
  }

  setFov(fov) {
    const { camera, renderer } = this.app;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    this.app.particles.resize(window.innerHeight * renderer.getPixelRatio(), fov);
  }

  lock() {
    if (!this.canLock || document.pointerLockElement === this.dom) return;
    try {
      const p = this.dom.requestPointerLock();
      p?.catch?.(() => {});
    } catch {
      /* 잠금을 못 하는 환경이면 잠그지 않고 걷기만 한다 */
    }
  }

  start() {
    this.on = true;
    this.keys.clear();
    this.setFov(FOV);
    this.app.camera.clearViewOffset();
    this.ui.classList.add('on');
    if (!this.touch) this.lock(); // 걷기 버튼을 누른 그 순간에 바로 잠근다
    // 처음 자리가 건물 안이면 가까운 빈 곳으로 옮긴다
    for (let r = 0; this.blocked(this.x, this.z) && r < 40; r += 0.5) this.z += 0.5;
  }

  stop() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
    this.on = false;
    this.keys.clear();
    this.look = this.pad = null;
    this.stick.x = this.stick.y = 0;
    this.setFov(30);
    this.ui.classList.remove('on');
  }

  // 지금 보는 방향 (단위 벡터)
  forward(out = new THREE.Vector3()) {
    const c = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * c, Math.sin(this.pitch), Math.cos(this.yaw) * c);
  }

  // 건물(회전한 상자)과 도시 가장자리에 막히는가
  blocked(x, z) {
    if (Math.hypot(x, z) > R_CITY + 3) return true;
    for (const b of this.app.buildings.list) {
      if (b.y > 1.2) continue; // 공중 다리 밑으로는 지나간다
      const dx = x - b.x;
      const dz = z - b.z;
      const hw = b.w / 2 + PAD;
      const hd = b.d / 2 + PAD;
      if (dx * dx + dz * dz > (hw + hd) * (hw + hd)) continue;
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) < hw && Math.abs(lz) < hd) return true;
    }
    return false;
  }

  update(dt) {
    if (!this.on) return;
    const k = this.keys;
    let f = this.stick.y * -1;
    let s = this.stick.x;
    if (k.has('w') || k.has('arrowup')) f += 1;
    if (k.has('s') || k.has('arrowdown')) f -= 1;
    if (k.has('d') || k.has('arrowright')) s += 1;
    if (k.has('a') || k.has('arrowleft')) s -= 1;
    const len = Math.hypot(f, s);
    if (len > 1) {
      f /= len;
      s /= len;
    }
    const speed = k.has('shift') ? RUN : WALK;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // 앞 = (sin yaw, cos yaw), 화면 오른쪽 = (-cos yaw, sin yaw)
    const dx = (sy * f - cy * s) * speed * dt;
    const dz = (cy * f + sy * s) * speed * dt;
    // 벽에 막히면 벽을 따라 미끄러진다
    if (dx && !this.blocked(this.x + dx, this.z)) this.x += dx;
    if (dz && !this.blocked(this.x, this.z + dz)) this.z += dz;
    const moving = len > 0.05;
    if (moving) this.bob += dt * (k.has('shift') ? 13 : 9);
    const { camera } = this.app;
    camera.position.set(this.x, EYE + (moving ? Math.sin(this.bob) * 0.022 : 0), this.z);
    const fw = this.forward(_f);
    camera.lookAt(camera.position.x + fw.x, camera.position.y + fw.y, camera.position.z + fw.z);
  }
}

const _f = new THREE.Vector3();
