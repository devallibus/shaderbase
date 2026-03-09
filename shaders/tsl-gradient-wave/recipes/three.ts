import { createMaterial } from '../source';

/**
 * Create a NodeMaterial with an animated gradient wave.
 *
 * Usage:
 *   import { createTslGradientWaveMaterial } from './three';
 *   const material = createTslGradientWaveMaterial();
 *   mesh.material = material;
 *
 * Requires: WebGPURenderer, Three.js >= 0.170.0
 */
export function createTslGradientWaveMaterial() {
  return createMaterial();
}
