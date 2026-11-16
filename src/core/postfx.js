// 색 있는 것만 빛나는 bloom.
// 보통 bloom은 '밝은 것'을 번지게 하지만, 여기서는 '채도가 있는 것'만 번지게 한다.
// 무채색은 아무리 밝아도 max−min 이 0이라 문턱을 넘지 못한다.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const CHROMA_HIGHPASS = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float luminosityThreshold;
uniform float smoothWidth;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  float mx = max(texel.r, max(texel.g, texel.b));
  float mn = min(texel.r, min(texel.g, texel.b));
  float a = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, mx - mn);
  gl_FragColor = vec4(texel.rgb * a, 1.0);
}`;

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.3 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float v = smoothstep(0.92, 0.3, length(vUv - 0.5));
      c.rgb *= mix(1.0 - uAmount, 1.0, v);
      gl_FragColor = c;
    }`,
};

export function createPostFX(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    type: THREE.HalfFloatType,
    samples: renderer.capabilities.maxSamples > 0 ? 4 : 0,
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.5, 0.14);
  bloom.materialHighPassFilter.fragmentShader = CHROMA_HIGHPASS;
  bloom.materialHighPassFilter.uniforms.smoothWidth.value = 0.22;
  bloom.materialHighPassFilter.needsUpdate = true;
  composer.addPass(bloom);

  composer.addPass(new ShaderPass(VignetteShader));
  composer.addPass(new OutputPass());

  return {
    composer,
    bloom,
    render: () => composer.render(),
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
    },
  };
}
