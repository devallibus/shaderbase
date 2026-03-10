import { mix, uv, sin, time, vec3 } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

type PreviewRuntime = {
  uniforms?: Record<string, unknown>
};

function readVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number')
  ) {
    return value as [number, number, number];
  }

  return fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

export function createMaterial(runtime?: PreviewRuntime): NodeMaterial {
  const material = new NodeMaterial();

  const uniforms = runtime?.uniforms ?? {};
  const colorA = readVec3(uniforms.uColorA, [0.1019607843, 0.1019607843, 0.1803921569]);
  const colorB = readVec3(uniforms.uColorB, [0.9137254902, 0.2705882353, 0.3764705882]);
  const waveSpeed = readNumber(uniforms.uWaveSpeed, 2.0);
  const waveMix = readNumber(uniforms.uWaveMix, 0.5);
  const waveFrequency = readNumber(uniforms.uWaveFrequency, 6.0);

  const uvMix = mix(uv().x, uv().y, waveMix).mul(waveFrequency);
  const t = sin(uvMix.add(time.mul(waveSpeed))).mul(0.5).add(0.5);

  material.colorNode = mix(
    vec3(...colorA),
    vec3(...colorB),
    t,
  );

  return material;
}
