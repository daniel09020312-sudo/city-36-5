// 체온탑: 되돌림 조절  dT/dt = −k(T − 36.5) + 교란
export const SET_POINT = 36.5;
export const K = 1.5; // s⁻¹
export const BAND = 0.3; // 36.5 ± 0.3 안이면 균형

export const step = (T, dt, disturbance = 0) => T + (-K * (T - SET_POINT) + disturbance) * dt;

// 장면 2의 교란: 0.6초 간격으로 위아래로 민다
export const KICK_INTERVAL = 0.6;
export const KICK_TARGETS = [38.9, 34.2, 38.4, 34.7, 37.8, 35.6];

export const tone = (T) => (T > SET_POINT + BAND ? 'red' : T < SET_POINT - BAND ? 'blue' : 'amber');
