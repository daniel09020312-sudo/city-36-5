// 심전도 한 박동의 모양 (P · QRS · T). phase는 0~1.
const g = (p, m, s, a) => a * Math.exp(-((p - m) ** 2) / (2 * s * s));
export const R_PHASE = 0.36;
export function ecg(phase) {
  const p = phase - Math.floor(phase);
  return g(p, 0.18, 0.026, 0.11) - g(p, 0.335, 0.008, 0.13) + g(p, R_PHASE, 0.011, 1) - g(p, 0.388, 0.01, 0.2) + g(p, 0.6, 0.045, 0.26);
}
