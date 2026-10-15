/** GLSL for the planet's custom materials (WebGL2 / GLSL 3 via Three's ShaderMaterial). */

export const planetVertex = /* glsl */ `
  attribute vec3 color;
  attribute float lights;
  attribute float border;
  varying vec3 vColor;
  varying float vLights;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vColor = pow(color, vec3(2.2)); // authored in sRGB; light in linear space
    vLights = lights;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const planetFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform float ambient;
  uniform float nightLights;
  uniform float overlayMode;
  varying vec3 vColor;
  varying float vLights;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 radial = normalize(vWorld);
    float ndl = dot(n, sunDir);
    float day = smoothstep(-0.12, 0.25, dot(radial, sunDir));
    float diffuse = max(ndl, 0.0);
    float amb = mix(ambient, 0.75, overlayMode);
    vec3 lit = vColor * (amb + (1.0 - amb) * diffuse * 1.1);
    // Night side keeps a cool, legible tint.
    vec3 nightCol = vColor * mix(0.12, 0.55, overlayMode) * vec3(0.55, 0.65, 1.0);
    vec3 col = mix(nightCol, lit, max(day, overlayMode * 0.6));
    float glow = vLights * nightLights * (1.0 - day);
    col += vec3(1.0, 0.72, 0.38) * glow * 1.6;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export const oceanVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const oceanFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 deep;
  uniform vec3 shallow;
  uniform float time;
  uniform float overlayMode;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    float day = smoothstep(-0.12, 0.25, dot(n, sunDir));
    vec3 h = normalize(sunDir + viewDir);
    float spec = pow(max(dot(n, h), 0.0), 900.0) * 0.35 * day;
    vec3 col = mix(deep, shallow, fres * 0.8);
    col *= mix(0.16, 1.0, max(day, overlayMode * 0.5));
    col += vec3(1.0, 0.92, 0.75) * spec * (1.0 - overlayMode);
    col += vec3(0.35, 0.6, 0.9) * fres * 0.25 * day;
    float alpha = mix(0.82, 0.35, overlayMode) + fres * 0.15;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const atmosphereFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform float strength;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 2.6);
    float sun = smoothstep(-0.35, 0.6, dot(normalize(vWorld), sunDir));
    vec3 col = mix(vec3(0.12, 0.2, 0.45), vec3(0.45, 0.72, 1.0), sun);
    col = mix(col, vec3(1.0, 0.6, 0.35), pow(1.0 - abs(dot(normalize(vWorld), sunDir)), 6.0) * 0.35);
    gl_FragColor = vec4(col * rim * strength, rim * strength);
    #include <colorspace_fragment>
  }
`;

export const cloudFragment = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunDir;
  uniform float opacity;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float a = texture2D(map, vUv).r;
    float day = smoothstep(-0.2, 0.35, dot(normalize(vWorld), sunDir));
    vec3 col = mix(vec3(0.08, 0.1, 0.16), vec3(1.0), day);
    gl_FragColor = vec4(col, a * opacity * mix(0.35, 1.0, day));
    #include <colorspace_fragment>
  }
`;

export const cloudVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/** Animated dashed lines for trade flows and migration arcs. */
export const flowVertex = /* glsl */ `
  attribute float dist;
  attribute vec4 tint;
  varying float vDist;
  varying vec4 vTint;
  varying vec3 vWorld;
  void main() {
    vDist = dist;
    vTint = vec4(pow(tint.rgb, vec3(2.2)), tint.a);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const flowFragment = /* glsl */ `
  uniform float time;
  uniform float animate;
  varying float vDist;
  varying vec4 vTint;
  varying vec3 vWorld;
  void main() {
    // Fade lines on the far side of the planet.
    vec3 toCam = normalize(cameraPosition - vWorld);
    float facing = smoothstep(-0.05, 0.25, dot(normalize(vWorld), toCam));
    float dash = 0.55 + 0.45 * step(0.5, fract(vDist * 18.0 - time * 0.9 * animate));
    gl_FragColor = vec4(vTint.rgb, vTint.a * dash * facing);
    #include <colorspace_fragment>
  }
`;
