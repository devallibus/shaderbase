import { useRef } from "react";
import { Color, ShaderMaterial } from "three";

type GradientRadialProps = {
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

export function GradientRadialMaterial({
  center = [0.5, 0.5],
  innerColor = "#ffc252",
  outerColor = "#19243d",
  radius = 0.42,
  softness = 0.18,
}: GradientRadialProps) {
  const materialRef = useRef<ShaderMaterial | null>(null);

  if (!materialRef.current) {
    materialRef.current = new ShaderMaterial({
      fragmentShader,
      uniforms: {
        uCenter: { value: center },
        uInnerColor: { value: new Color(innerColor) },
        uOuterColor: { value: new Color(outerColor) },
        uRadius: { value: radius },
        uSoftness: { value: softness },
      },
      vertexShader,
    });
  }

  return <primitive attach="material" object={materialRef.current} />;
}
