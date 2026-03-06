// Adapted from three.js/examples/jsm/shaders/VignetteShader.js (MIT).
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
