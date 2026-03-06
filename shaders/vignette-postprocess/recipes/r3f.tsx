import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import fragmentShader from "../fragment.glsl?raw";
import vertexShader from "../vertex.glsl?raw";

type VignetteEffectProps = {
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

export function VignetteEffect({
  darkness = 1.15,
  offset = 1.0,
}: VignetteEffectProps) {
  const { camera, gl, scene, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);
  const vignettePassRef = useRef<ShaderPass | null>(null);

  if (!composerRef.current) {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const vignettePass = new ShaderPass(vignetteShader);

    composer.addPass(renderPass);
    composer.addPass(vignettePass);

    composerRef.current = composer;
    vignettePassRef.current = vignettePass;
  }

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
  }, [size.height, size.width]);

  useEffect(() => {
    return () => {
      composerRef.current?.dispose();
    };
  }, []);

  useFrame(() => {
    if (!composerRef.current || !vignettePassRef.current) {
      return;
    }

    vignettePassRef.current.material.uniforms.offset.value = offset;
    vignettePassRef.current.material.uniforms.darkness.value = darkness;
    composerRef.current.render();
  }, 1);

  return null;
}
