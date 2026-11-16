// 3D 위치에 붙는 HTML 라벨. 글자는 3D 공간이 아니라 HTML 오버레이에 둔다.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Labels {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('labels');
    this.items = new Set();
  }
  // tone: 'amber' | 'red' | 'blue' | '' ,  kind: 'tag' | 'bubble' | 'plain' | 'district'
  add(text, pos, { tone = '', kind = 'tag', onClick = null, persist = false } = {}) {
    const el = document.createElement(onClick ? 'button' : 'div');
    el.className = `label label-${kind}${tone ? ' tone-' + tone : ''}`;
    el.innerHTML = text;
    if (onClick) el.addEventListener('click', onClick);
    this.root.appendChild(el);
    const item = {
      el,
      pos: new THREE.Vector3(pos.x, pos.y ?? 0, pos.z),
      persist,
      visible: true,
      set: (html) => {
        if (el.innerHTML !== html) el.innerHTML = html;
        return item;
      },
      tone: (t) => {
        const next = `label label-${kind}${t ? ' tone-' + t : ''} in`;
        if (el.className !== next) el.className = next;
        return item;
      },
      show: (v) => {
        item.visible = v;
        return item;
      },
      remove: () => {
        el.remove();
        this.items.delete(item);
      },
    };
    this.items.add(item);
    requestAnimationFrame(() => el.classList.add('in'));
    return item;
  }
  // 장면이 바뀔 때: persist가 아닌 라벨을 모두 지운다
  clear() {
    for (const it of [...this.items]) if (!it.persist) it.remove();
  }
  update() {
    const { camera } = this.app;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    for (const it of this.items) {
      _v.copy(it.pos).project(camera);
      const behind = _v.z > 1 || _v.z < -1;
      const on = it.visible && !behind && Math.abs(_v.x) < 1.15 && Math.abs(_v.y) < 1.15;
      it.el.style.display = on ? '' : 'none';
      if (!on) continue;
      const x = (_v.x * 0.5 + 0.5) * w;
      const y = (-_v.y * 0.5 + 0.5) * h;
      it.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
