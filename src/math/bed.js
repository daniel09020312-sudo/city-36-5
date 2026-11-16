// 분할 조사탑: 생물학적 효과 선량(BED), 선형이차 모형
export const TOTAL_DOSE = 60; // Gy, 고정
export const AB_NORMAL = 3; // 정상 조직 α/β (Gy)
export const AB_TUMOR = 10; // 종양 α/β (Gy)

export const dosePerFraction = (n) => TOTAL_DOSE / n;
export const bed = (n, ab) => {
  const d = dosePerFraction(n);
  return n * d * (1 + d / ab);
};
export const bedTumor = (n) => bed(n, AB_TUMOR);
export const bedNormal = (n) => bed(n, AB_NORMAL);
// R = 정상 조직이 받는 효과 / 종양이 받는 효과
export const ratio = (n) => bedNormal(n) / bedTumor(n);
// 화면 연출용: R이 1(차이 없음)~3(한 번에) 사이 어디인지 0~1로
export const collateral = (n) => Math.min(1, Math.max(0, (ratio(n) - 1) / (ratio(1) - 1)));
