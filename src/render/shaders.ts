/**
 * GLSL for the planet's custom materials. All colours are lit in linear space;
 * `tonemapping_fragment` + `colorspace_fragment` keep direct rendering and the
 * bloom composer path visually identical.
 */

/** Shared helpers: equirectangular lookup for a direction rotated about Y, and cheap value noise. */
const common = /* glsl */ `
  vec2 dirToUv(vec3 d, float rot) {
    float c = cos(rot), s = sin(rot);
    vec3 r = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
    float lon = atan(r.z, r.x);
    float lat = asin(clamp(r.y, -1.0, 1.0));
    return vec2(lon / 6.2831853 + 0.5, lat / 3.1415927 + 0.5);
  }
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
                   mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                   mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

export const planetVertex = /* glsl */ `
  attribute vec3 color;
  attribute float lights;
  attribute float border;
  varying vec3 vColor;
  varying float vLights;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vDir;
  void main() {
    vColor = pow(color, vec3(2.2)); // authored in sRGB; light in linear space
    vLights = lights;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const planetFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform float ambient;
  uniform float nightLights;
  uniform float overlayMode;
  uniform float time;
  uniform sampler2D cloudMap;
  uniform float cloudRot;
  uniform float cloudShadow;
  uniform vec3 hazeColor;
  varying vec3 vColor;
  varying float vLights;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vDir;
  ${common}
  void main() {
    vec3 n = normalize(vNormal);
    vec3 radial = normalize(vWorld);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float sunR = dot(radial, sunDir);
    // Soft terminator: light wraps slightly past 90° like a thin atmosphere.
    float day = smoothstep(-0.18, 0.28, sunR);
    float diffuse = clamp((dot(n, sunDir) + 0.12) / 1.12, 0.0, 1.0);
    // Relief: steep slopes read darker, emphasising mountain ranges.
    float relief = mix(1.0, 0.72 + 0.28 * clamp(dot(n, radial), 0.0, 1.0), 0.6);
    float shadow = 1.0;
    if (cloudShadow > 0.0) {
      // Sample the cloud layer slightly toward the sun so shadows fall offset from clouds.
      vec3 sd = normalize(vDir + sunDir * 0.012);
      shadow = 1.0 - cloudShadow * texture2D(cloudMap, dirToUv(sd, cloudRot)).r;
    }
    float amb = mix(ambient, 0.7, overlayMode);
    vec3 lit = vColor * (amb + (1.0 - amb) * diffuse * 1.18 * relief * shadow);
    // Warm scattering band along the terminator.
    float dusk = exp(-pow((sunR - 0.02) / 0.12, 2.0));
    lit += vColor * vec3(0.55, 0.22, 0.06) * dusk * 0.6 * (1.0 - overlayMode);
    vec3 nightCol = vColor * mix(0.05, 0.5, overlayMode) * vec3(0.45, 0.58, 1.0);
    vec3 col = mix(nightCol, lit, max(day, overlayMode * 0.65));
    // Aerial perspective: the limb dissolves into atmosphere on the day side.
    float fres = pow(1.0 - max(dot(radial, viewDir), 0.0), 3.5);
    col = mix(col, hazeColor * (0.25 + 0.75 * day), fres * 0.55 * (1.0 - overlayMode * 0.7));
    // City lights: warm, gently flickering, only in darkness.
    float flicker = 0.92 + 0.08 * vnoise(vDir * 140.0 + time * 0.6);
    // Pixel-scale speckle: clustered towns and roads of light rather than flat patches.
    float towns = pow(vnoise(vDir * 260.0), 3.0) * 1.6 + pow(vnoise(vDir * 75.0), 2.0) * 0.5;
    float glow = vLights * nightLights * (1.0 - smoothstep(-0.15, 0.12, sunR)) * flicker * (0.25 + towns + smoothstep(0.7, 1.1, vLights) * 0.8);
    col += vec3(1.0, 0.64, 0.3) * glow * 1.9;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const oceanVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const oceanFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 deep;
  uniform vec3 shallow;
  uniform float time;
  uniform float overlayMode;
  uniform float waves;
  uniform vec3 hazeColor;
  varying vec3 vWorld;
  varying vec3 vDir;
  ${common}
  float swell(vec3 p) { return vnoise(p) + 0.5 * vnoise(p * 2.7 - time * 0.2); }
  void main() {
    vec3 n = normalize(vDir);
    if (waves > 0.0) {
      // Two drifting octaves of value noise perturb the normal for glitter and swell.
      vec3 p = vDir * 90.0 + vec3(time * 0.15, 0.0, time * 0.11);
      float e = 0.35;
      float h0 = swell(p);
      vec3 g = vec3(swell(p + vec3(e, 0, 0)) - h0, swell(p + vec3(0, e, 0)) - h0, swell(p + vec3(0, 0, e)) - h0) / e;
      g -= n * dot(g, n);
      n = normalize(n - g * 0.035 * waves);
    }
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float ndv = max(dot(n, viewDir), 0.0);
    float fres = pow(1.0 - ndv, 4.0);
    float sunR = dot(normalize(vDir), sunDir);
    float day = smoothstep(-0.18, 0.28, sunR);
    vec3 h = normalize(sunDir + viewDir);
    float nh = max(dot(n, h), 0.0);
    float spec = (pow(nh, 700.0) * 0.9 + pow(nh, 60.0) * 0.05) * day * (1.0 - overlayMode);
    vec3 col = mix(deep, shallow, 0.25 + 0.5 * fres);
    col *= mix(0.07, 1.0, max(day, overlayMode * 0.5));
    col += vec3(1.0, 0.9, 0.72) * spec;
    col = mix(col, hazeColor * (0.2 + 0.8 * day), fres * 0.45);
    float alpha = mix(0.62, 0.32, overlayMode) + fres * 0.3;
    gl_FragColor = vec4(col, clamp(alpha + spec, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const atmosphereVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * Atmospheric halo: for each view ray, find its closest approach to the planet
 * centre; glow decays exponentially with altitude above the surface, coloured
 * by how sunlit that point is (blue by day, amber at the terminator).
 */
export const atmosphereFragment = /* glsl */ `
  uniform vec3 sunDir;
  uniform float strength;
  uniform float planetRadius;
  varying vec3 vWorld;
  void main() {
    vec3 rd = normalize(vWorld - cameraPosition);
    float t = -dot(cameraPosition, rd);
    vec3 closest = cameraPosition + rd * t;
    float d = length(closest);
    float alt = max(0.0, d - planetRadius);
    float glow = exp(-alt / 0.024) * 0.5 + exp(-alt / 0.08) * 0.16;
    vec3 up = normalize(closest);
    float sun = dot(up, sunDir);
    float lit = smoothstep(-0.35, 0.35, sun);
    vec3 col = mix(vec3(0.05, 0.08, 0.2), vec3(0.32, 0.6, 1.0), lit);
    col += vec3(1.0, 0.45, 0.15) * exp(-pow(sun / 0.18, 2.0)) * 0.55;
    float a = glow * strength * (0.25 + 0.75 * lit);
    gl_FragColor = vec4(col * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const cloudVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * Clouds: two drifting samples of a weather texture, masked by the live
 * precipitation of the simulation (dry regions clear, wet regions overcast),
 * lit with a sunset rim and dark night side.
 */
export const cloudFragment = /* glsl */ `
  uniform sampler2D map;
  uniform sampler2D wetMap;
  uniform vec3 sunDir;
  uniform float opacity;
  uniform float rot;
  uniform float overlayMode;
  varying vec3 vWorld;
  varying vec3 vDir;
  ${common}
  void main() {
    float a1 = texture2D(map, dirToUv(vDir, rot)).r;
    float a2 = texture2D(map, dirToUv(vDir, rot * 0.63 + 1.7)).g;
    float wet = texture2D(wetMap, dirToUv(vDir, 0.0)).r;
    float raw = a1 * 0.7 + a2 * 0.3;
    float lo = 0.57 - wet * 0.1;
    float density = smoothstep(lo, lo + 0.17, raw) * (0.55 + 0.45 * smoothstep(lo + 0.05, lo + 0.3, raw));
    float sunR = dot(vDir, sunDir);
    float day = smoothstep(-0.2, 0.3, sunR);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float limb = pow(1.0 - max(dot(vDir, viewDir), 0.0), 2.0);
    vec3 col = mix(vec3(0.03, 0.04, 0.07), vec3(0.86, 0.88, 0.92), day * (0.7 + 0.3 * density));
    col = mix(col, vec3(1.0, 0.62, 0.38), exp(-pow((sunR - 0.05) / 0.14, 2.0)) * 0.55);
    float a = density * opacity * mix(0.25, 1.0, day) * (1.0 - limb * 0.35) * (1.0 - overlayMode * 0.85);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Glowing camera-facing points (settlement beacons, shipments, particles). */
export const glowVertex = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  uniform float pixelScale;
  varying vec4 vTint;
  void main() {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    // Fade glows that sit on the far side or right at the limb.
    float facing = dot(normalize(wp), normalize(cameraPosition - wp));
    vTint = vec4(pow(tint.rgb, vec3(2.2)), tint.a * smoothstep(0.02, 0.3, facing));
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Perspective-scaled but capped so glows stay crisp markers when zoomed in.
    gl_PointSize = min(size * pixelScale / max(0.2, -mv.z), size * 1.6);
    gl_Position = projectionMatrix * mv;
  }
`;

export const glowFragment = /* glsl */ `
  varying vec4 vTint;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float core = exp(-d * 9.0);
    float halo = exp(-d * 2.5) * 0.35;
    float a = (core + halo) * vTint.a;
    gl_FragColor = vec4(vTint.rgb * a * 1.6, a);
    #include <colorspace_fragment>
  }
`;

/** Expanding surface ripples for events (instanced flat quads). */
export const rippleVertex = /* glsl */ `
  attribute float age;
  attribute vec3 rippleColor;
  varying vec2 vP;
  varying float vAge;
  varying vec3 vColor;
  void main() {
    vP = position.xz;
    vAge = age;
    vColor = pow(rippleColor, vec3(2.2));
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

export const rippleFragment = /* glsl */ `
  varying vec2 vP;
  varying float vAge;
  varying vec3 vColor;
  void main() {
    float d = length(vP);
    if (d > 1.0 || vAge >= 1.0) discard;
    float ring = smoothstep(0.78, 0.94, d) * (1.0 - smoothstep(0.94, 1.0, d));
    float fill = (1.0 - d) * 0.18;
    float fade = (1.0 - vAge) * (1.0 - vAge);
    float a = (ring + fill) * fade;
    gl_FragColor = vec4(vColor * a * 1.8, a);
    #include <colorspace_fragment>
  }
`;

export const starVertex = /* glsl */ `
  attribute float size;
  attribute vec3 tint;
  attribute float phase;
  uniform float time;
  uniform float twinkle;
  varying vec3 vTint;
  varying float vBright;
  void main() {
    vTint = tint;
    vBright = 1.0 - twinkle * 0.35 * (0.5 + 0.5 * sin(time * (0.6 + phase) + phase * 40.0));
    gl_PointSize = size;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const starFragment = /* glsl */ `
  varying vec3 vTint;
  varying float vBright;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float a = exp(-d * 4.0) * vBright;
    gl_FragColor = vec4(vTint * a, a);
    #include <colorspace_fragment>
  }
`;

/** Faint procedural galactic band behind everything. */
export const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

export const skyFragment = /* glsl */ `
  varying vec3 vDir;
  ${common}
  void main() {
    vec3 bandN = normalize(vec3(0.35, 0.86, 0.38));
    float b = dot(vDir, bandN);
    float band = exp(-b * b / 0.018);
    float n = vnoise(vDir * 7.0) * 0.6 + vnoise(vDir * 19.0) * 0.4;
    float dust = smoothstep(0.35, 0.9, n);
    vec3 col = mix(vec3(0.03, 0.04, 0.09), vec3(0.16, 0.13, 0.2), dust) * band * 0.55;
    col += vec3(0.02, 0.025, 0.05) * (1.0 - abs(b));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
