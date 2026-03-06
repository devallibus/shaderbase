import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, ShaderMaterial } from "three";
import fragmentShader from "../fragment.glsl?raw";
import vertexShader from "../vertex.glsl?raw";

type SimplexDisplacementMaterialProps = {
  amplitude?: number;
  frequency?: number;
  highColor?: string;
  lowColor?: string;
  speed?: number;
};

export function SimplexDisplacementMaterial({
  amplitude = 0.18,
  frequency = 1.6,
  highColor = "#6bdfeb",
  lowColor = "#12385b",
  speed = 0.4,
}: SimplexDisplacementMaterialProps) {
  const materialRef = useRef<ShaderMaterial | null>(null);

  if (!materialRef.current) {
    materialRef.current = new ShaderMaterial({
      fragmentShader,
      uniforms: {
        uAmplitude: { value: amplitude },
        uFrequency: { value: frequency },
        uHighColor: { value: new Color(highColor) },
        uLowColor: { value: new Color(lowColor) },
        uSpeed: { value: speed },
        uTime: { value: 0 },
      },
      vertexShader,
    });
  }

  useEffect(() => {
    if (!materialRef.current) {
      return;
    }

    materialRef.current.uniforms.uAmplitude.value = amplitude;
    materialRef.current.uniforms.uFrequency.value = frequency;
    materialRef.current.uniforms.uSpeed.value = speed;
    materialRef.current.uniforms.uLowColor.value = new Color(lowColor);
    materialRef.current.uniforms.uHighColor.value = new Color(highColor);
  }, [amplitude, frequency, highColor, lowColor, speed]);

  useFrame((_, delta) => {
    if (!materialRef.current) {
      return;
    }

    materialRef.current.uniforms.uTime.value += delta;
  });

  return <primitive attach="material" object={materialRef.current} />;
}
