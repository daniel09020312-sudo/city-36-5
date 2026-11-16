// 색은 이 파일에서만 고친다. (기획서 '3D 시각 원칙' 표 그대로)
import * as THREE from 'three';

export const PALETTE = {
  // 온도색 — 색은 온도를 뜻할 때만 쓴다
  amber: '#F5A25D', // 36.5 · 균형, 회복, 사람의 온기
  red: '#E5484D', // 과열 · 혐오, 과잉 자극, 한꺼번의 판정
  blue: '#6E9BD6', // 저체온 · 무관심, 기계 판정, 오판
  // 무채색
  sky: '#0C0C0E',
  ground: '#18181B',
  plate: '#1F1F23',
  buildingLow: '#2B2B30',
  buildingHigh: '#7C7C84',
  edge: '#3A3A40',
  edgeOpacity: 0.6,
  citizen: '#9A9AA2',
  text: '#EDEDED',
};

// three.js용 색 객체
export const C = Object.fromEntries(
  Object.entries(PALETTE)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => [k, new THREE.Color(v)]),
);

// CSS 변수로도 내보내 HTML 오버레이가 같은 값을 쓰게 한다
export function applyCssPalette(root = document.documentElement) {
  for (const [k, v] of Object.entries(PALETTE)) {
    if (typeof v === 'string') root.style.setProperty(`--${k}`, v);
  }
}
