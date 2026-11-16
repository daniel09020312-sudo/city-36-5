// 기획서 '인터랙션·계산 명세'의 검증값과 코드가 맞는지 확인한다.  npm test
import assert from 'node:assert/strict';
import { ppv, npv, counts, repeatPosterior } from '../src/math/ppv.js';
import { step, SET_POINT, tone } from '../src/math/thermo.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log('  ✓', name);
};
const pct = (v, d = 1) => (v * 100).toFixed(d);

console.log('선별 광장 PPV');
for (const [p, P, N, flagged, truePos] of [
  [0.242, '79.9', '98.2', 287, 229],
  [0.121, '63.2', '99.2', 181, 114],
  [0.01, '11.2', '99.9', 85, 9],
  [0.001, '1.2', '99.99', 77, 1],
]) {
  ok(`유병률 ${pct(p)}% → PPV ${P}%, NPV ${N}%, 레드 ${flagged}명 중 ${truePos}명`, () => {
    assert.equal(pct(ppv(p)), P);
    assert.equal(pct(npv(p), N.split('.')[1].length), N);
    assert.deepEqual(counts(p), { flagged, truePos });
  });
}
ok('반복 검증으로 확실성이 오른다 (1% → 11% → 61% → 95%)', () => {
  assert.equal(pct(repeatPosterior(0.01, 1), 0), '11');
  assert.equal(pct(repeatPosterior(0.01, 2), 0), '61');
  assert.equal(pct(repeatPosterior(0.01, 3), 0), '95');
});

console.log('체온탑');
ok('교란이 멈추면 36.5로 되돌아온다', () => {
  let T = 38.9;
  for (let i = 0; i < 600; i++) T = step(T, 1 / 60);
  assert.equal(T.toFixed(1), SET_POINT.toFixed(1));
  assert.equal(tone(38.9), 'red');
  assert.equal(tone(34.2), 'blue');
  assert.equal(tone(36.6), 'amber');
});

console.log(`\n${n}개 검증 통과`);
