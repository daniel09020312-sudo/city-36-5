// 도시 배치. 원형 대지 가운데에 광장, 세 지구를 120° 간격으로 둔다.
// 좌표는 (x, z). +z가 화면 앞쪽(기본 카메라 쪽)이다.
export const R_PLATFORM = 72;
export const R_CITY = 67; // 건물이 서는 한계 반경
export const GRID = 3.7; // 도시 블록 한 칸

const P = (x, z) => ({ x, z });

export const DISTRICTS = {
  plaza: { key: 'plaza', c: P(0, 0), r: 11, first: 1 },
  recovery: { key: 'recovery', c: P(-38, -22), r: 22, first: 3 },
  regulation: { key: 'regulation', c: P(38, -22), r: 22, first: 6 },
  dignity: { key: 'dignity', c: P(0, 44), r: 22, first: 9 },
};

export const SITES = {
  tower: P(0, 0), // 체온탑
  entrance: P(-14, -30), // 과열의 입구: 거리 시작
  entranceTarget: P(9, -30), // 비난이 몰리는 건물
  fraction: P(-50, -30), // 분할 조사탑
  screening: P(-33, -31), // 선별 광장
  bridgeA: P(-48, -12), // 재검의 다리 시작
  bridgeB: P(-38, -12), // 재검의 다리 끝
  court: P(-28.5, -12), // 부활 경기장
  alert: P(26, -28), // 흥분독성 경보탑
  forest: P(40, -28), // 별아교 숲
  street: P(38, -13), // 고개 드는 거리
  boards: P(53, -3), // 워터마크 전광판
  hospital: P(-12, 42), // 숨결 병원
  garden: P(10, 41), // 진전 정원
  stairs: P(0, 57), // 깨어남의 계단
};

// 일반 건물을 세우지 않는 구역. soft는 시민이 서 있어도 되는 곳(광장, 대로).
const S = SITES;
export const RESERVED = [
  { t: 'circle', x: 0, z: 0, r: 11.5, soft: true },
  { t: 'seg', ax: 0, az: 0, bx: -38, bz: -22, w: 4.2, soft: true },
  { t: 'seg', ax: 0, az: 0, bx: 38, bz: -22, w: 4.2, soft: true },
  { t: 'seg', ax: 0, az: 0, bx: 0, bz: 44, w: 4.2, soft: true },
  { t: 'rect', x0: -17, x1: 13, z0: -37, z1: -23 }, // 과열의 입구
  { t: 'circle', x: S.fraction.x, z: S.fraction.z, r: 8 },
  { t: 'rect', x0: -45, x1: -21, z0: -39.5, z1: -22.5 }, // 선별 광장
  { t: 'rect', x0: -54, x1: -21, z0: -18.5, z1: -5.5 }, // 다리 + 경기장
  { t: 'circle', x: S.alert.x, z: S.alert.z, r: 3.4 },
  { t: 'circle', x: S.forest.x, z: S.forest.z, r: 11 },
  { t: 'rect', x0: 28, x1: 48, z0: -17.5, z1: -8.5 }, // 고개 드는 거리
  { t: 'circle', x: S.boards.x, z: S.boards.z, r: 9 },
  { t: 'circle', x: S.hospital.x, z: S.hospital.z, r: 7.5 },
  { t: 'circle', x: S.garden.x, z: S.garden.z, r: 8.5 },
  { t: 'rect', x0: -11, x1: 11, z0: 51.5, z1: 62.5 }, // 깨어남의 계단
];

function inZone(zn, x, z, m) {
  if (zn.t === 'circle') return Math.hypot(x - zn.x, z - zn.z) < zn.r + m;
  if (zn.t === 'rect') return x > zn.x0 - m && x < zn.x1 + m && z > zn.z0 - m && z < zn.z1 + m;
  // seg: 선분에서 w/2 안쪽
  const dx = zn.bx - zn.ax;
  const dz = zn.bz - zn.az;
  const t = Math.min(1, Math.max(0, ((x - zn.ax) * dx + (z - zn.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (zn.ax + dx * t), z - (zn.az + dz * t)) < zn.w / 2 + m;
}

// 건물을 세워도 되는 자리인가
export function isFree(x, z, margin = 0) {
  if (Math.hypot(x, z) > R_CITY - margin) return false;
  for (const zn of RESERVED) if (inZone(zn, x, z, margin)) return false;
  return true;
}
// 시민이 서 있어도 되는 자리인가 (장치가 있는 구역만 피한다)
export function isWalkable(x, z) {
  if (Math.hypot(x, z) > R_CITY) return false;
  if (Math.hypot(x, z) < 3.2) return false;
  for (const zn of RESERVED) if (!zn.soft && inZone(zn, x, z, 0.4)) return false;
  return true;
}

// 클릭한 지점에서 가장 가까운 지구
export function districtAt(x, z) {
  let best = null;
  let bd = Infinity;
  for (const d of Object.values(DISTRICTS)) {
    const dist = Math.hypot(x - d.c.x, z - d.c.z);
    if (dist < d.r + 3 && dist < bd) {
      bd = dist;
      best = d;
    }
  }
  return best;
}
