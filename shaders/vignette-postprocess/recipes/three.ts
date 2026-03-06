import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import fragmentShader from "../fragment.glsl?raw";
import vertexShader from "../vertex.glsl?raw";

type VignetteOptions = {
  darkness?: number;
  offset?: number;
};

const vignetteShader = {
  uniforms: {
    darkness: { value: 1.15 },
    offset: { value: 1.0 },
    tDiffuse: { value: null },
  },
  fragmentShader,
  vertexShader,
};

export function createVignettePass(options: VignetteOptions = {}) {
  const pass = new ShaderPass(vignetteShader);

  pass.material.uniforms.offset.value = options.offset ?? 1.0;
  pass.material.uniforms.darkness.value = options.darkness ?? 1.15;

  return pass;
}
