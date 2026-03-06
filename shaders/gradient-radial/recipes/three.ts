import { Color, ShaderMaterial } from "three";

type GradientRadialOptions = {
  center?: [number, number];
  innerColor?: string;
  outerColor?: string;
  radius?: number;
  softness?: number;
};

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

varying vec2 vUv;

uniform vec3 uInnerColor;
uniform vec3 uOuterColor;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uSoftness;

void main() {
  float distanceFromCenter = distance(vUv, uCenter);
  float outerEdge = max(uRadius + uSoftness, 0.0001);
  float blend = smoothstep(uRadius, outerEdge, distanceFromCenter);
  vec3 color = mix(uInnerColor, uOuterColor, blend);

  gl_FragColor = vec4(color, 1.0);
}
`;

export function createGradientRadialMaterial(
  options: GradientRadialOptions = {},
) {
  return new ShaderMaterial({
    fragmentShader,
    uniforms: {
      uCenter: { value: options.center ?? [0.5, 0.5] },
      uInnerColor: { value: new Color(options.innerColor ?? "#ffc252") },
      uOuterColor: { value: new Color(options.outerColor ?? "#19243d") },
      uRadius: { value: options.radius ?? 0.42 },
      uSoftness: { value: options.softness ?? 0.18 },
    },
    vertexShader,
  });
}
