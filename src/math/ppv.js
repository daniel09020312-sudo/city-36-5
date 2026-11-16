// 선별 광장: 양성 예측도(PPV)
// Se = 재현율, Sp = 유병률 24.2%에서 정밀도 79.9%가 나오도록 역산한 값
export const SE = 0.946;
const BASE_P = 0.242; // 탐구 데이터의 유병률
const BASE_PRECISION = 0.799; // 그때의 정밀도
// 역산: 반올림한 0.924를 쓰면 표의 63.2%가 63.1%로 어긋나서 식으로 둔다 (≈ 0.92402)
export const SP = 1 - (SE * BASE_P * (1 / BASE_PRECISION - 1)) / (1 - BASE_P);

export const ppv = (p, se = SE, sp = SP) => (se * p) / (se * p + (1 - sp) * (1 - p));
export const npv = (p, se = SE, sp = SP) => (sp * (1 - p)) / (sp * (1 - p) + (1 - se) * p);

// 시민 N명 중 레드 표시 수와 그중 실제 양성 수 (둘 다 반올림)
export function counts(p, N = 1000) {
  const flagged = Math.round(N * (SE * p + (1 - SP) * (1 - p)));
  const truePos = Math.min(flagged, Math.round(N * SE * p));
  return { flagged, truePos };
}

// 독립 검사를 k번 연속 양성으로 통과했을 때의 확실성 (반복 진단검사)
export function repeatPosterior(p, k) {
  let q = p;
  for (let i = 0; i < k; i++) q = ppv(q);
  return q;
}

// 슬라이더(0~1) ↔ 유병률(로그 눈금 0.1%~30%)
export const P_MIN = 0.001;
export const P_MAX = 0.3;
export const sliderToP = (v) => P_MIN * Math.pow(P_MAX / P_MIN, v);
export const pToSlider = (p) => Math.log(p / P_MIN) / Math.log(P_MAX / P_MIN);
