// 색은 이 파일에서만 고친다.
import * as THREE from 'three';

export const PALETTE = {
  // 강조색 — 장면에서 뜻을 가진 색
  amber: '#F5A25D', // 36.5 · 균형, 회복, 사람의 온기
  red: '#E5484D', // 과열 · 비난, 의혹 표시
  blue: '#6E9BD6', // AI 판독·예측, 식어 버린 무관심

  // 화면 위 글자와 패널 (어두운 유리)
  sky: '#0C0C0E', // 패널·로딩 화면 바탕
  text: '#EDEDED',

  // 하늘과 빛 (낮)
  skyTop: '#7FA3C4',
  skyHorizon: '#DCE3E6',
  fog: '#D3DCE0',
  sun: '#FFF1DC',
  skyLight: '#E4EEF6',
  groundLight: '#8C8473',

  // 땅과 풍경
  grass: '#829C62',
  grassDark: '#6A8650',
  field1: '#C9BC86',
  field2: '#A5B672',
  field3: '#BFA77A',
  hill: '#7A9360',
  mountain: '#8995A0',
  snow: '#EEF1F2',
  water: '#5F88A6',
  bridge: '#A7A39A',

  // 도시 바닥과 길
  ground: '#BDB7AB', // 도시 바닥(포장)
  pavement: '#BDB7AB',
  plate: '#D2CCC0', // 장치가 놓인 광장 바닥
  road: '#5A5C62',
  roadPaint: '#ECEAE3',
  lawn: '#7E9A5D', // 도시 안 공원 잔디

  // 장치용 건물(체온탑, 병원 등)과 윤곽선 — 밝은 콘크리트
  buildingLow: '#A9A397',
  buildingHigh: '#D8D2C6',
  edge: '#4D4A44',
  edgeOpacity: 0.35,
  citizen: '#9A9AA2',

  // 일반 건물의 외벽 (모양에 따라 고른다)
  facades: {
    glass: ['#7F98B0', '#6D88A2', '#93AABF', '#5F7A94', '#86A0B5'], // 오피스 유리
    concrete: ['#CFCAC0', '#BEB9AF', '#D9D4C9', '#B3AEA5'], // 콘크리트
    warm: ['#D6C2A2', '#C4A281', '#B0826A', '#CFAF90', '#A9765E'], // 벽돌·석재
    apt: ['#E7E2D8', '#DDD6C9', '#EEEAE1', '#D5CEC1', '#E3DDD0'], // 아파트
  },
  roof: ['#8E5E4C', '#71605A', '#7E8790', '#A06B52', '#5F6A73'],
  trees: ['#5E8246', '#6C9050', '#507339', '#7A9B58', '#5A7A44'],
  clothes: ['#5B6F8C', '#8C5D5D', '#5E7F64', '#B59B6C', '#6D6D78', '#8F7A9E', '#C9C4B8', '#3F4A5C', '#A7745A', '#4E6E7E'],
  cars: ['#E6E3DC', '#2F3238', '#8B9AA8', '#9A5552', '#3E5B7E', '#C9BAA1', '#55595F', '#DAD7CF'],
};

// three.js용 색 객체 (문자열 값만)
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
