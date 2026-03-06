import { Color, ShaderMaterial } from "three";
import fragmentShader from "../fragment.glsl?raw";
import vertexShader from "../vertex.glsl?raw";

type SimplexDisplacementOptions = {
  amplitude?: number;
  frequency?: number;
  highColor?: string;
  lowColor?: string;
  speed?: number;
};

export function createSimplexDisplacementMaterial(
  options: SimplexDisplacementOptions = {},
) {
  return new ShaderMaterial({
    fragmentShader,
    uniforms: {
      uAmplitude: { value: options.amplitude ?? 0.18 },
      uFrequency: { value: options.frequency ?? 1.6 },
      uHighColor: { value: new Color(options.highColor ?? "#6bdfeb") },
      uLowColor: { value: new Color(options.lowColor ?? "#12385b") },
      uSpeed: { value: options.speed ?? 0.4 },
      uTime: { value: 0 },
    },
    vertexShader,
  });
}
