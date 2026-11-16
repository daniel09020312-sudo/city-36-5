// 진전 정원: 휴식기 진전 주파수 분석
export const FS = 100; // 표본 주파수 (Hz)
export const WINDOW = 256; // 창 크기 (2.56초)
export const F_MAX = 15; // 그리는 최대 주파수 (Hz)
export const BAND = [3.5, 7]; // 선별 대역 (Hz)
export const BAND_THRESHOLD = 0.5; // 대역 에너지 비율 기준

export const BIN_HZ = FS / WINDOW;
export const BINS = Math.floor(F_MAX / BIN_HZ) + 1; // 0~15 Hz

const hann = new Float32Array(WINDOW);
for (let i = 0; i < WINDOW; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1));
const cosT = [];
const sinT = [];
for (let k = 0; k < BINS; k++) {
  const c = new Float32Array(WINDOW);
  const s = new Float32Array(WINDOW);
  for (let n = 0; n < WINDOW; n++) {
    c[n] = Math.cos((2 * Math.PI * k * n) / WINDOW);
    s[n] = Math.sin((2 * Math.PI * k * n) / WINDOW);
  }
  cosT.push(c);
  sinT.push(s);
}

// samples: 길이 WINDOW 배열(시간순). 0~15 Hz 구간의 DFT 크기를 돌려준다.
export function dftMagnitude(samples, out = new Float32Array(BINS)) {
  let mean = 0;
  for (let n = 0; n < WINDOW; n++) mean += samples[n];
  mean /= WINDOW;
  for (let k = 0; k < BINS; k++) {
    let re = 0;
    let im = 0;
    const c = cosT[k];
    const s = sinT[k];
    for (let n = 0; n < WINDOW; n++) {
      const v = (samples[n] - mean) * hann[n];
      re += v * c[n];
      im -= v * s[n];
    }
    out[k] = (2 * Math.sqrt(re * re + im * im)) / WINDOW;
  }
  return out;
}

// 3.5~7 Hz 대역 에너지가 전체(직류 제외)에서 차지하는 비율
export function bandRatio(mag) {
  let band = 0;
  let total = 0;
  for (let k = 1; k < mag.length; k++) {
    const f = k * BIN_HZ;
    const e = mag[k] * mag[k];
    total += e;
    if (f >= BAND[0] && f <= BAND[1]) band += e;
  }
  return total > 1e-9 ? band / total : 0;
}

export function peakHz(mag) {
  let best = 1;
  for (let k = 2; k < mag.length; k++) if (mag[k] > mag[best]) best = k;
  return best * BIN_HZ;
}

// 데모 신호 x(t) = A sin(2πft) + 잡음
export const MODES = {
  rest: (t, noise) => 0.9 * Math.sin(2 * Math.PI * 4.8 * t) + 0.16 * Math.sin(2 * Math.PI * 9.6 * t) + 0.25 * noise,
  move: (t, noise) => 1.3 * Math.sin(2 * Math.PI * 1.1 * t) + 0.45 * Math.sin(2 * Math.PI * 2.3 * t + 1) + 0.25 * noise,
  normal: (t, noise) => 0.1 * Math.sin(2 * Math.PI * 9.5 * t) + 0.22 * noise,
};

// 정규분포 잡음 (Box–Muller)
export function gaussian(rand) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
