// 온기 셰이더.
// '어디에 색이 올 수 있는가(마스크)'와 '무슨 색인가(물체 속성)'를 나눈다.
//  · 마스크: 초점(최대 4곳)에서 번지는 반경. 가장자리는 노이즈로 일렁인다.
//  · 색: 물체마다 달린 온도색(tint)과 열(heat 0~1).
// MeshStandardMaterial에 onBeforeCompile로 주입한다.
import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from '../palette.js';

export const SLOTS = 4;

// 창유리 색 (palette.js)
const WIN_U = {
  uWin: { value: new THREE.Color(PALETTE.window) },
  uWinSky: { value: new THREE.Color(PALETTE.windowSky) },
};

export const warmU = {
  uFocus: { value: Array.from({ length: SLOTS }, () => new THREE.Vector3(0, -999, 0)) },
  uRadius: { value: new Array(SLOTS).fill(0) },
  uSlotHeat: { value: new Array(SLOTS).fill(0) }, // 그 초점 안의 모든 물체에 주는 최소 열
  uFeather: { value: 3.2 },
  uTime: { value: 0 },
};

const VERT_HEAD = /* glsl */ `
#ifdef WARM_INSTANCED
  attribute vec3 aTint;
  attribute float aHeat;
#else
  uniform vec3 uTint;
  uniform float uHeat;
#endif
#ifdef WARM_BOW
  attribute float aBow;
#endif
varying vec3 vWorldPos;
varying vec3 vTint;
varying float vHeat;
#ifdef WARM_WINDOWS
  varying vec3 vWorldN;
#endif
`;

const VERT_BODY = /* glsl */ `
#ifdef WARM_BOW
  // 시민이 고개를 숙인다: 목 위쪽 꼭짓점만 앞으로 기울인다
  if (transformed.y > 0.44) {
    vec3 hp = transformed - vec3(0.0, 0.44, 0.0);
    float ha = aBow * 0.95;
    float hc = cos(ha), hs = sin(ha);
    transformed = vec3(hp.x, hc * hp.y - hs * hp.z, hs * hp.y + hc * hp.z) + vec3(0.0, 0.44, 0.0);
  }
#endif
{
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  vWorldPos = (modelMatrix * wp).xyz;
  #ifdef WARM_WINDOWS
    vec4 wn = vec4(objectNormal, 0.0);
    #ifdef USE_INSTANCING
      wn = instanceMatrix * wn;
    #endif
    vWorldN = normalize((modelMatrix * wn).xyz);
  #endif
}
#ifdef WARM_INSTANCED
  vTint = aTint; vHeat = aHeat;
#else
  vTint = uTint; vHeat = uHeat;
#endif
`;

const FRAG_HEAD = /* glsl */ `
#ifdef WARM_WINDOWS
  varying vec3 vWorldN;
  uniform vec3 uWin;
  uniform vec3 uWinSky;
#endif
uniform vec3 uFocus[${SLOTS}];
uniform float uRadius[${SLOTS}];
uniform float uSlotHeat[${SLOTS}];
uniform float uFeather;
uniform float uTime;
uniform float uGlow;
varying vec3 vWorldPos;
varying vec3 vTint;
varying float vHeat;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const FRAG_BODY = /* glsl */ `
{
#ifdef WARM_WINDOWS
  // 벽면(수직 면)에만, 1층 위로, 너무 멀면 흐리게
  float wWall = 1.0 - smoothstep(0.35, 0.6, abs(vWorldN.y));
  if (wWall > 0.0 && vWorldPos.y > 0.55) {
    vec2 tang = normalize(vec2(-vWorldN.z, vWorldN.x) + 1e-5);
    float wu = dot(vWorldPos.xz, tang);
    float wv = vWorldPos.y;
    vec2 cell = vec2(wu / 0.62, wv / 0.82);
    vec2 f = fract(cell);
    float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.82);
    float dist = length(vViewPosition);
    float fade = 1.0 - smoothstep(90.0, 220.0, dist);
    float sky = step(0.72, wHash(floor(cell) + floor(vWorldN.xz * 3.0)));
    vec3 glass = mix(uWin, uWinSky, sky * 0.7 + clamp(vWorldN.y, 0.0, 1.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, glass * (0.6 + 0.5 * dot(gl_FragColor.rgb, vec3(0.333))), win * wWall * fade * 0.82);
  }
#endif
  float wGray = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
  float wN = (wNoise(vWorldPos.xz * 0.35 + uTime * 0.2) - 0.5) * uFeather * 1.5
           + (wNoise(vWorldPos.xz * 1.3 - uTime * 0.31) - 0.5) * uFeather * 0.4;
  float wK = 0.0;
  for (int i = 0; i < ${SLOTS}; i++) {
    float d = distance(vWorldPos, uFocus[i]) + wN;
    float m = (1.0 - smoothstep(uRadius[i] - uFeather, uRadius[i], d)) * step(0.001, uRadius[i]);
    wK = max(wK, m * max(vHeat, uSlotHeat[i]));
  }
  vec3 warm = vTint * (0.55 + 0.6 * wGray + uGlow) * (1.0 + max(wK - 1.0, 0.0));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, warm, clamp(wK, 0.0, 1.0));
}
`;

// 온기가 스미는 재질.
//  instanced: 인스턴스 속성(aTint, aHeat)으로 색을 받는다. 아니면 재질마다 uTint·uHeat.
//  bow: 시민용(고개 숙임 aBow)
export function makeWarmMaterial({ instanced = true, color = 0xffffff, glow = 0, bow = false, roughness = 0.9, windows = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });
  mat.userData.uTint = { value: new THREE.Color(1, 1, 1) };
  mat.userData.uHeat = { value: 0 };
  mat.userData.uGlow = { value: glow };
  if (instanced) mat.defines.WARM_INSTANCED = '';
  if (bow) mat.defines.WARM_BOW = '';
  if (windows) mat.defines.WARM_WINDOWS = '';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, warmU, WIN_U, {
      uTint: mat.userData.uTint,
      uHeat: mat.userData.uHeat,
      uGlow: mat.userData.uGlow,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERT_HEAD + '\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAG_HEAD + '\n#include <common>')
      .replace('#include <tonemapping_fragment>', FRAG_BODY + '\n#include <tonemapping_fragment>');
  };
  mat.customProgramCacheKey = () => `warm-${instanced ? 1 : 0}-${bow ? 1 : 0}-${windows ? 1 : 0}`;
  return mat;
}

const tweens = new Array(SLOTS).fill(null);
let reduced = false;

export const warmth = {
  setReducedMotion(v) {
    reduced = v;
  },
  // i번 초점을 p에 두고 반경을 from → radius로 번지게 한다 (0.8~1.6초)
  focus(i, p, radius, { dur = 1.3, slotHeat = 0, from = 0, delay = 0, ease = 'power2.out' } = {}) {
    tweens[i]?.kill();
    warmU.uFocus.value[i].set(p.x, p.y ?? 0, p.z);
    warmU.uSlotHeat.value[i] = slotHeat;
    warmU.uRadius.value[i] = from;
    const o = { r: from };
    tweens[i] = gsap.to(o, {
      r: radius,
      duration: reduced ? 0.01 : dur,
      delay: reduced ? 0 : delay,
      ease,
      onUpdate: () => (warmU.uRadius.value[i] = o.r),
    });
  },
  move(i, p) {
    warmU.uFocus.value[i].set(p.x, p.y ?? 0, p.z);
  },
  fade(i, dur = 0.9) {
    tweens[i]?.kill();
    const o = { r: warmU.uRadius.value[i] };
    tweens[i] = gsap.to(o, {
      r: 0,
      duration: reduced ? 0.01 : dur,
      ease: 'power2.in',
      onUpdate: () => (warmU.uRadius.value[i] = o.r),
      onComplete: () => (warmU.uSlotHeat.value[i] = 0),
    });
  },
  clear(i) {
    tweens[i]?.kill();
    warmU.uRadius.value[i] = 0;
    warmU.uSlotHeat.value[i] = 0;
  },
  clearAll() {
    for (let i = 0; i < SLOTS; i++) this.clear(i);
  },
  update(t) {
    warmU.uTime.value = t;
  },
};
