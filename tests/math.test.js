// 기획서 '인터랙션·계산 명세'의 검증값과 코드가 맞는지 확인한다.  npm test
import assert from 'node:assert/strict';
import { ppv, npv, counts, repeatPosterior } from '../src/math/ppv.js';
import { bedTumor, bedNormal, ratio, dosePerFraction } from '../src/math/bed.js';
import { dftMagnitude, bandRatio, peakHz, MODES, gaussian, FS, WINDOW, BAND_THRESHOLD } from '../src/math/dft.js';
import { step, SET_POINT, tone } from '../src/math/thermo.js';
import { rng } from '../src/core/rng.js';

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

console.log('분할 조사탑 BED');
for (const [nf, d, bt, bn, r] of [
  [1, 60, 420, 1260, '3.00'],
  [12, 5, 90, 160, '1.78'],
  [30, 2, 72, 100, '1.39'],
]) {
  ok(`n=${nf}: d=${d} Gy, 종양 ${bt}, 정상 ${bn}, R=${r}`, () => {
    assert.equal(dosePerFraction(nf), d);
    assert.equal(Math.round(bedTumor(nf)), bt);
    assert.equal(Math.round(bedNormal(nf)), bn);
    assert.equal(ratio(nf).toFixed(2), r);
  });
}

console.log('진전 정원 DFT');
const analyse = (mode, seed) => {
  const rand = rng(seed);
  const s = new Float32Array(WINDOW);
  for (let i = 0; i < WINDOW; i++) s[i] = MODES[mode](i / FS, gaussian(rand));
  const mag = dftMagnitude(s);
  return { r: bandRatio(mag), peak: peakHz(mag) };
};
ok('휴식기 진전은 4~6 Hz에 봉우리가 서고 선별 신호가 뜬다', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const a = analyse('rest', seed);
    assert.ok(a.r > BAND_THRESHOLD, `seed ${seed} ratio ${a.r}`);
    assert.ok(a.peak >= 4 && a.peak <= 6, `peak ${a.peak}`);
  }
});
ok('자발적 움직임과 정상에서는 선별 신호가 뜨지 않는다', () => {
  for (let seed = 1; seed <= 60; seed++) {
    assert.ok(analyse('move', seed).r < BAND_THRESHOLD);
    const nr = analyse('normal', seed).r;
    assert.ok(nr < BAND_THRESHOLD, `normal seed ${seed} ${nr}`);
  }
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
