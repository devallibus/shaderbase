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
