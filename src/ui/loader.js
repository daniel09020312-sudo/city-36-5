// 첫 로딩 화면: 도시를 준비하는 동안 체온계 눈금이 20℃에서 36.5℃까지 차오른다.
// 글은 src/content/scenes.js 의 SITE.loading 에 있다.
import { SITE } from '../content/scenes.js';

const START = 20; // ℃
const END = 36.5; // ℃ (눈금의 끝은 40℃)
const SCALE_MAX = 40;

export function mountLoader() {
  const root = document.getElementById('loader');
  if (!root) return { run: async () => {}, skip() {}, fail() {} };
  const L = SITE.loading;
  const num = root.querySelector('.loader-num');
  const cap = root.querySelector('.loader-cap');
  const fill = root.querySelector('.loader-fill');
  const mark = root.querySelector('.loader-mark');
  root.querySelector('.loader-project').textContent = SITE.project;
  root.querySelector('.loader-unit').textContent = L.unit;
  mark.querySelector('span').textContent = END.toFixed(1);
  mark.style.left = `${((END - START) / (SCALE_MAX - START)) * 100}%`;
  cap.textContent = L.caption;
  num.textContent = START.toFixed(1);

  let finish = null;
  let skipped = false;

  const done = (app) => {
    root.classList.add('out');
    app.introGo = true;
    setTimeout(() => root.remove(), 1400);
    finish?.();
  };

  return {
    // 도시가 만들어진 뒤에 호출한다. 눈금이 차오르고, 다 차면 화면이 걷힌다.
    run(app, { quick = false } = {}) {
      return new Promise((resolve) => {
        finish = resolve;
        const total = app.reduced ? 500 : quick ? 900 : 2800;
        const t0 = performance.now();
        const step = (now) => {
          const k = skipped ? 1 : Math.min(1, (now - t0) / total);
          const e = 1 - (1 - k) ** 3; // 처음에 빠르게, 끝에서 천천히
          const v = START + (END - START) * e;
          num.textContent = v.toFixed(1);
          fill.style.transform = `scaleX(${((v - START) / (SCALE_MAX - START)).toFixed(4)})`;
          if (k < 1) return requestAnimationFrame(step);
          num.textContent = END.toFixed(1);
          root.classList.add('ready');
          cap.textContent = L.ready;
          // 36.5에 도착한 모습을 잠깐 보여 준 뒤 걷는다
          setTimeout(() => done(app), app.reduced || skipped ? 80 : 650);
        };
        requestAnimationFrame(step);
      });
    },
    skip() {
      skipped = true;
    },
    // 3D를 열 수 없을 때
    fail() {
      root.remove();
    },
  };
}
