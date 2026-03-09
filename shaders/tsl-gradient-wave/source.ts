import { color, mix, uv, sin, time } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

export function createMaterial(): NodeMaterial {
  const material = new NodeMaterial();
  const t = sin(time.mul(2.0)).mul(0.5).add(0.5);
  material.colorNode = mix(
    color(0x1a1a2e),
    color(0xe94560),
    mix(uv().x, uv().y, t),
  );
  return material;
}
