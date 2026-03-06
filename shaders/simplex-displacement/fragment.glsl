precision highp float;

varying float vElevation;

uniform vec3 uLowColor;
uniform vec3 uHighColor;

void main() {
  float blend = smoothstep(-1.0, 1.0, vElevation);
  vec3 color = mix(uLowColor, uHighColor, blend);

  gl_FragColor = vec4(color, 1.0);
}
