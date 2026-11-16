import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { WeatherSnapshot } from './WeatherManager';
import type { ResolvedGraphicsProfile } from '../engine/GraphicsQualityManager';

export interface SkyLightingRig {
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  ambientLight: THREE.AmbientLight;
  skyDome: THREE.Mesh;
  moonMesh: THREE.Mesh;
  starField: THREE.Points;
  updateSunFollow: (playerPos: THREE.Vector3) => void;
  updateTimeOfDay: (
    worldHours: number,
    elapsed?: number,
    weather?: WeatherSnapshot,
  ) => void;
  applyGraphicsProfile: (
    renderer: THREE.WebGLRenderer,
    profile: ResolvedGraphicsProfile,
  ) => void;
  getSunDirection: (out: THREE.Vector3) => THREE.Vector3;
  getActiveLightDirection: (out: THREE.Vector3) => THREE.Vector3;
  getSunColor: (out: THREE.Color) => THREE.Color;
  getHorizonColor: (out: THREE.Color) => THREE.Color;
  getFogDensity: () => number;
  dispose: () => void;
}

interface TimeStop {
  hour: number;
  top: THREE.Color;
  mid: THREE.Color;
  horizon: THREE.Color;
  sunGlow: THREE.Color;
  sunLight: THREE.Color;
  sunIntensity: number;
  moonLight: THREE.Color;
  moonIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  fillColor: THREE.Color;
  fillIntensity: number;
  envIntensity: number;
  fogDensity: number;
  starVisibility: number;
  moonOpacity: number;
  shadowDarkness: number;
}

const TIME_STOPS: TimeStop[] = [
  {
    hour: 0.0, // Midnight
    top: new THREE.Color(0x040916),
    mid: new THREE.Color(0x0b162c),
    horizon: new THREE.Color(0x13233f),
    sunGlow: new THREE.Color(0x2d4675),
    sunLight: new THREE.Color(0x5271a8),
    sunIntensity: 0.0,
    moonLight: new THREE.Color(0x94b7f0),
    moonIntensity: 0.4,
    hemiSky: new THREE.Color(0x233861),
    hemiGround: new THREE.Color(0x0c1412),
    hemiIntensity: 0.25,
    ambientColor: new THREE.Color(0x172640),
    ambientIntensity: 0.14,
    fillColor: new THREE.Color(0x2d4570),
    fillIntensity: 0.13,
    envIntensity: 0.16,
    fogDensity: 0.003,
    starVisibility: 1.0,
    moonOpacity: 1.0,
    shadowDarkness: 0.56,
  },
  {
    hour: 4.5, // Late night / pre-dawn
    top: new THREE.Color(0x070f21),
    mid: new THREE.Color(0x13203d),
    horizon: new THREE.Color(0x253252),
    sunGlow: new THREE.Color(0x7c668f),
    sunLight: new THREE.Color(0x8c7ead),
    sunIntensity: 0.04,
    moonLight: new THREE.Color(0x8aaae3),
    moonIntensity: 0.28,
    hemiSky: new THREE.Color(0x2c4069),
    hemiGround: new THREE.Color(0x121915),
    hemiIntensity: 0.29,
    ambientColor: new THREE.Color(0x1e2c47),
    ambientIntensity: 0.16,
    fillColor: new THREE.Color(0x3a4f78),
    fillIntensity: 0.15,
    envIntensity: 0.19,
    fogDensity: 0.0028,
    starVisibility: 0.85,
    moonOpacity: 0.82,
    shadowDarkness: 0.52,
  },
  {
    hour: 6.0, // Sunrise
    top: new THREE.Color(0x234782),
    mid: new THREE.Color(0x946883),
    horizon: new THREE.Color(0xf7a468),
    sunGlow: new THREE.Color(0xffb76b),
    sunLight: new THREE.Color(0xffb373),
    sunIntensity: 1.08,
    moonLight: new THREE.Color(0x8daae0),
    moonIntensity: 0.06,
    hemiSky: new THREE.Color(0x918cbc),
    hemiGround: new THREE.Color(0x473b2d),
    hemiIntensity: 0.62,
    ambientColor: new THREE.Color(0x755c63),
    ambientIntensity: 0.25,
    fillColor: new THREE.Color(0x7e92c4),
    fillIntensity: 0.3,
    envIntensity: 0.38,
    fogDensity: 0.0026,
    starVisibility: 0.08,
    moonOpacity: 0.18,
    shadowDarkness: 0.84,
  },
  {
    hour: 8.5, // Crisp Morning
    top: new THREE.Color(0x2f70bd),
    mid: new THREE.Color(0x80b4e3),
    horizon: new THREE.Color(0xc7e0ed),
    sunGlow: new THREE.Color(0xfff1cc),
    sunLight: new THREE.Color(0xfff0d2),
    sunIntensity: 2.25,
    moonLight: new THREE.Color(0x9cb8e8),
    moonIntensity: 0.0,
    hemiSky: new THREE.Color(0xa3d3f7),
    hemiGround: new THREE.Color(0x4f613b),
    hemiIntensity: 0.84,
    ambientColor: new THREE.Color(0xd2e3f2),
    ambientIntensity: 0.32,
    fillColor: new THREE.Color(0xa8cceb),
    fillIntensity: 0.42,
    envIntensity: 0.56,
    fogDensity: 0.0022,
    starVisibility: 0.0,
    moonOpacity: 0.0,
    shadowDarkness: 1.0,
  },
  {
    hour: 12.0, // High Noon
    top: new THREE.Color(0x2064bd),
    mid: new THREE.Color(0x72b2eb),
    horizon: new THREE.Color(0xd1e7f5),
    sunGlow: new THREE.Color(0xfff9e8),
    sunLight: new THREE.Color(0xfff9eb),
    sunIntensity: 2.5,
    moonLight: new THREE.Color(0x9cb8e8),
    moonIntensity: 0.0,
    hemiSky: new THREE.Color(0xb3dffb),
    hemiGround: new THREE.Color(0x55663f),
    hemiIntensity: 0.9,
    ambientColor: new THREE.Color(0xdeecf8),
    ambientIntensity: 0.34,
    fillColor: new THREE.Color(0xb5d6f5),
    fillIntensity: 0.46,
    envIntensity: 0.6,
    fogDensity: 0.0019,
    starVisibility: 0.0,
    moonOpacity: 0.0,
    shadowDarkness: 1.0,
  },
  {
    hour: 16.0, // Warm Afternoon
    top: new THREE.Color(0x2c6ab8),
    mid: new THREE.Color(0x8cb4db),
    horizon: new THREE.Color(0xe6d2b5),
    sunGlow: new THREE.Color(0xffdfa3),
    sunLight: new THREE.Color(0xffdeaa),
    sunIntensity: 2.15,
    moonLight: new THREE.Color(0x9cb8e8),
    moonIntensity: 0.0,
    hemiSky: new THREE.Color(0xa8c6e8),
    hemiGround: new THREE.Color(0x585439),
    hemiIntensity: 0.8,
    ambientColor: new THREE.Color(0xd9d1c3),
    ambientIntensity: 0.3,
    fillColor: new THREE.Color(0x9cb7db),
    fillIntensity: 0.4,
    envIntensity: 0.52,
    fogDensity: 0.0021,
    starVisibility: 0.0,
    moonOpacity: 0.0,
    shadowDarkness: 0.96,
  },
  {
    hour: 18.0, // Sunset
    top: new THREE.Color(0x1d356b),
    mid: new THREE.Color(0x99526b),
    horizon: new THREE.Color(0xf07a43),
    sunGlow: new THREE.Color(0xff9248),
    sunLight: new THREE.Color(0xff9652),
    sunIntensity: 1.12,
    moonLight: new THREE.Color(0x8daae0),
    moonIntensity: 0.08,
    hemiSky: new THREE.Color(0x8776a3),
    hemiGround: new THREE.Color(0x42352a),
    hemiIntensity: 0.58,
    ambientColor: new THREE.Color(0x6e4d54),
    ambientIntensity: 0.24,
    fillColor: new THREE.Color(0x747ead),
    fillIntensity: 0.28,
    envIntensity: 0.36,
    fogDensity: 0.0026,
    starVisibility: 0.14,
    moonOpacity: 0.3,
    shadowDarkness: 0.82,
  },
  {
    hour: 19.5, // Dusk / Twilight
    top: new THREE.Color(0x0b1736),
    mid: new THREE.Color(0x1f2b54),
    horizon: new THREE.Color(0x453a5c),
    sunGlow: new THREE.Color(0xbd6e6b),
    sunLight: new THREE.Color(0xc7817b),
    sunIntensity: 0.12,
    moonLight: new THREE.Color(0x8eb2ed),
    moonIntensity: 0.3,
    hemiSky: new THREE.Color(0x354973),
    hemiGround: new THREE.Color(0x191d1b),
    hemiIntensity: 0.35,
    ambientColor: new THREE.Color(0x283452),
    ambientIntensity: 0.18,
    fillColor: new THREE.Color(0x445987),
    fillIntensity: 0.17,
    envIntensity: 0.21,
    fogDensity: 0.0028,
    starVisibility: 0.75,
    moonOpacity: 0.85,
    shadowDarkness: 0.64,
  },
  {
    hour: 21.5, // Deep Night
    top: new THREE.Color(0x050b18),
    mid: new THREE.Color(0x0c1930),
    horizon: new THREE.Color(0x162742),
    sunGlow: new THREE.Color(0x385282),
    sunLight: new THREE.Color(0x5676ad),
    sunIntensity: 0.0,
    moonLight: new THREE.Color(0x94b7f0),
    moonIntensity: 0.4,
    hemiSky: new THREE.Color(0x233861),
    hemiGround: new THREE.Color(0x0d1513),
    hemiIntensity: 0.25,
    ambientColor: new THREE.Color(0x17253e),
    ambientIntensity: 0.14,
    fillColor: new THREE.Color(0x2d4570),
    fillIntensity: 0.13,
    envIntensity: 0.16,
    fogDensity: 0.003,
    starVisibility: 0.98,
    moonOpacity: 1.0,
    shadowDarkness: 0.56,
  },
  {
    hour: 24.0, // Midnight wrap
    top: new THREE.Color(0x040916),
    mid: new THREE.Color(0x0b162c),
    horizon: new THREE.Color(0x13233f),
    sunGlow: new THREE.Color(0x2d4675),
    sunLight: new THREE.Color(0x5271a8),
    sunIntensity: 0.0,
    moonLight: new THREE.Color(0x94b7f0),
    moonIntensity: 0.4,
    hemiSky: new THREE.Color(0x233861),
    hemiGround: new THREE.Color(0x0c1412),
    hemiIntensity: 0.25,
    ambientColor: new THREE.Color(0x172640),
    ambientIntensity: 0.14,
    fillColor: new THREE.Color(0x2d4570),
    fillIntensity: 0.13,
    envIntensity: 0.16,
    fogDensity: 0.003,
    starVisibility: 1.0,
    moonOpacity: 1.0,
    shadowDarkness: 0.56,
  },
];

// Reusable pre-allocated math scratch objects (zero GC in loop)
const _sunDir = new THREE.Vector3();
const _moonDir = new THREE.Vector3();
const _activeLightDir = new THREE.Vector3();
const _shadowColorTmp = new THREE.Color();
const _topTmp = new THREE.Color();
const _midTmp = new THREE.Color();
const _overcastTopTmp = new THREE.Color();
const _overcastHorizonTmp = new THREE.Color();
const _lightningTint = new THREE.Color(0xdbe8ff);
const _cloudOffset = new THREE.Vector2();

function createMoonTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size * 0.44,
      size * 0.42,
      size * 0.06,
      size * 0.5,
      size * 0.5,
      size * 0.52,
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.65, '#dfe9f8');
    grad.addColorStop(1, '#b6c6de');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const craters = [
      { x: 0.34, y: 0.36, r: 0.14, a: 0.15 },
      { x: 0.58, y: 0.32, r: 0.11, a: 0.13 },
      { x: 0.46, y: 0.58, r: 0.16, a: 0.14 },
      { x: 0.68, y: 0.62, r: 0.09, a: 0.16 },
      { x: 0.28, y: 0.65, r: 0.07, a: 0.14 },
      { x: 0.54, y: 0.46, r: 0.06, a: 0.12 },
    ];
    for (const c of craters) {
      ctx.beginPath();
      ctx.arc(c.x * size, c.y * size, c.r * size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(92, 110, 142, ${c.a})`;
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createStarField(starCount = 1600): {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
} {
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);

  const colorPalette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xdbe9ff),
    new THREE.Color(0xfff1d6),
    new THREE.Color(0xc5dbff),
  ];

  let seed = 918273;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const radius = 615;
  for (let i = 0; i < starCount; i++) {
    const theta = nextRand() * Math.PI * 2;
    const yNorm = 0.04 + Math.pow(nextRand(), 0.72) * 0.96;
    const rHoriz = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));

    positions[i * 3] = Math.cos(theta) * rHoriz * radius;
    positions[i * 3 + 1] = yNorm * radius;
    positions[i * 3 + 2] = Math.sin(theta) * rHoriz * radius;

    const tint = colorPalette[Math.floor(nextRand() * colorPalette.length)];
    const brightness = 0.55 + nextRand() * 0.45;
    colors[i * 3] = tint.r * brightness;
    colors[i * 3 + 1] = tint.g * brightness;
    colors[i * 3 + 2] = tint.b * brightness;

    sizes[i] = 1.6 + Math.pow(nextRand(), 2.2) * 3.6;
    phases[i] = nextRand() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 0.0 },
      uTime: { value: 0.0 },
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      varying vec3 vColor;
      varying float vTwinkle;
      varying float vHorizonFade;

      void main() {
        vColor = aColor;
        vTwinkle = 0.7 + 0.3 * sin(uTime * 1.9 + aPhase);
        vHorizonFade = smoothstep(18.0, 110.0, position.y);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = aSize * (320.0 / max(100.0, -mvPos.z));
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vTwinkle;
      varying float vHorizonFade;

      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.06, d);
        float alpha = core * uOpacity * vTwinkle * vHorizonFade;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -2;
  return { points, geometry, material };
}

export function createSkyAndLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): SkyLightingRig {
  const skyGroup = new THREE.Group();
  scene.add(skyGroup);

  const sunOffset = new THREE.Vector3(62, 86, 48);

  // 1. Studio / Sky PMREM environment reflection for realistic PBR response
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTarget = pmremGenerator.fromScene(envScene, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.56;
  envScene.dispose();
  pmremGenerator.dispose();

  // 2. Horizon-matched atmospheric fog
  const horizonColor = new THREE.Color(0xc5dce8);
  const fog = new THREE.FogExp2(0xc5dce8, 0.0022);
  scene.background = horizonColor;
  scene.fog = fog;

  // 3. Procedural atmospheric scattering sky dome with Mie halo, volumetric cloud shading & night Milky Way
  const skyGeo = new THREE.SphereGeometry(680, 36, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x2f70bd) },
      midColor: { value: new THREE.Color(0x80b4e3) },
      horizonColor: { value: horizonColor },
      sunDir: { value: sunOffset.clone().normalize() },
      moonDir: { value: new THREE.Vector3(-0.6, -0.6, -0.3).normalize() },
      sunColor: { value: new THREE.Color(0xfff1cf) },
      sunDiscVisibility: { value: 1.0 },
      moonHaloStrength: { value: 0.0 },
      uCloudCoverage: { value: 0.22 },
      uCloudDarkness: { value: 0.05 },
      uCloudOffset: { value: new THREE.Vector2(0, 0) },
      uLightningFlash: { value: 0.0 },
      uDayBrightness: { value: 1.0 },
      uStarVisibility: { value: 0.0 },
      uSkyQuality: { value: isSoftwareGl ? 0.0 : 2.0 },
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      uniform vec3 sunDir;
      uniform vec3 moonDir;
      uniform vec3 sunColor;
      uniform float sunDiscVisibility;
      uniform float moonHaloStrength;
      uniform float uCloudCoverage;
      uniform float uCloudDarkness;
      uniform vec2 uCloudOffset;
      uniform float uLightningFlash;
      uniform float uDayBrightness;
      uniform float uStarVisibility;
      uniform float uSkyQuality;
      varying vec3 vWorldDirection;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbmClouds(vec2 p) {
        float val = 0.0;
        float amp = 0.52;
        for (int i = 0; i < 4; i++) {
          val += amp * valueNoise(p);
          p = p * 2.07 + vec2(17.3, 9.1);
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        vec3 dir = normalize(vWorldDirection);
        vec3 sDir = normalize(sunDir);
        vec3 mDir = normalize(moonDir);
        float h = clamp(dir.y, 0.0, 1.0);

        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
        col = mix(col, topColor, smoothstep(0.24, 0.85, h));

        // Rayleigh / Mie horizon forward-scatter warmth toward the sun
        float sunDot = max(dot(dir, sDir), 0.0);
        float horizonBand = exp(-max(dir.y, 0.0) * 6.5);
        float mieGlow = pow(sunDot, 3.0) * horizonBand * (0.35 + (1.0 - max(sDir.y, 0.0)) * 0.45);
        col += sunColor * mieGlow * (0.28 + 0.4 * sunDiscVisibility) * (1.0 - uCloudDarkness * 0.55);

        // Subtle Milky Way cosmic band visible on clear dark nights (disabled on Very Low sky quality)
        if (uSkyQuality > 0.5 && uStarVisibility > 0.05 && dir.y > 0.04) {
          float mwPlane = dir.x * 0.48 + dir.y * 0.35 - dir.z * 0.8;
          float bandMask = exp(-mwPlane * mwPlane * 16.0) * smoothstep(0.05, 0.38, dir.y);
          float dustNoise = uSkyQuality > 1.5
            ? fbmClouds(dir.xz * 3.2 + vec2(4.2, -1.7))
            : valueNoise(dir.xz * 3.2 + vec2(4.2, -1.7));
          float rift = smoothstep(0.32, 0.72, dustNoise);
          vec3 galaxyCol = mix(vec3(0.09, 0.14, 0.27), vec3(0.22, 0.25, 0.42), dustNoise);
          col += galaxyCol * bandMask * rift * uStarVisibility * 0.55;
        }

        // Volumetric-shaded 2-layer procedural clouds (scaled by uSkyQuality for mobile/low-end)
        float cloudAlpha = 0.0;
        if (dir.y > 0.015 && uCloudCoverage > 0.02) {
          vec2 cloudUv = dir.xz / (dir.y + 0.16) * 0.58 + uCloudOffset;
          float n;
          float detail = 0.5;
          float selfShadow = 0.7;

          if (uSkyQuality < 0.5) {
            n = valueNoise(cloudUv) * 0.72 + valueNoise(cloudUv * 2.1 + vec2(5.2, 3.1)) * 0.28;
          } else if (uSkyQuality < 1.5) {
            n = valueNoise(cloudUv) * 0.58 + valueNoise(cloudUv * 2.07 + vec2(17.3, 9.1)) * 0.3 + valueNoise(cloudUv * 4.2) * 0.12;
            detail = valueNoise(cloudUv * 3.2 - uCloudOffset * 0.45);
          } else {
            n = fbmClouds(cloudUv);
            detail = valueNoise(cloudUv * 3.6 - uCloudOffset * 0.45);
            float cirrus = fbmClouds(cloudUv * 1.45 + vec2(9.4, -3.1) + uCloudOffset * 0.35);
            n = n * 0.76 + detail * 0.18 + cirrus * 0.06;
          }

          float thresh = mix(0.84, 0.24, uCloudCoverage);
          float rawCloud = smoothstep(thresh, thresh + 0.27, n);
          float horizonFade = smoothstep(0.015, 0.19, dir.y);
          cloudAlpha = clamp(rawCloud * horizonFade * mix(0.68, 0.96, uCloudCoverage), 0.0, 0.96);

          if (uSkyQuality > 1.5) {
            vec2 sunStep = sDir.xz / max(0.35, abs(sDir.y) + 0.35) * 0.085;
            float sunSample = fbmClouds(cloudUv + sunStep);
            selfShadow = clamp(0.58 + (n - sunSample) * 3.2, 0.22, 1.0);
          } else {
            selfShadow = clamp(0.45 + n * 0.45, 0.25, 0.95);
          }

          vec3 litDayCloud = mix(vec3(0.99, 0.99, 1.0), vec3(0.38, 0.43, 0.5), uCloudDarkness);
          vec3 shadowDayCloud = mix(vec3(0.64, 0.72, 0.84), vec3(0.21, 0.25, 0.31), uCloudDarkness);
          vec3 dayCloud = mix(shadowDayCloud, litDayCloud, selfShadow);

          vec3 nightCloud = mix(vec3(0.14, 0.21, 0.34), vec3(0.07, 0.1, 0.17), uCloudDarkness);
          vec3 cloudBase = mix(nightCloud, dayCloud, uDayBrightness);

          // Sunlit silver lining & warm twilight rim on clouds
          float rim = pow(sunDot, 5.0) * (1.0 - rawCloud * 0.35);
          cloudBase += sunColor * rim * 0.42 * sunDiscVisibility * (1.0 - uCloudDarkness * 0.7);
          // Internal storm lightning illumination inside cloud deck
          cloudBase += vec3(0.75, 0.88, 1.05) * uLightningFlash * (0.48 + 0.68 * (1.0 - detail));

          col = mix(col, cloudBase, cloudAlpha);
        }

        // Sun glow, corona & crisp HDR solar disc attenuated by cloud occlusion
        float cloudPass = 1.0 - cloudAlpha * 0.9;
        float horizonMask = smoothstep(-0.08, 0.04, dir.y);
        col += sunColor * pow(sunDot, 12.0) * 0.36 * sunDiscVisibility * (1.0 - cloudAlpha * 0.65);
        col += sunColor * pow(sunDot, 64.0) * 0.55 * sunDiscVisibility * horizonMask * cloudPass;
        col += vec3(1.18, 1.12, 0.98) * smoothstep(0.9986, 0.99945, sunDot) * 1.55 * sunDiscVisibility * horizonMask * cloudPass;

        // Soft cool silver lunar halo around moon
        float moonDot = max(dot(dir, mDir), 0.0);
        col += vec3(0.58, 0.76, 1.02) * pow(moonDot, 20.0) * 0.38 * moonHaloStrength * horizonMask * (1.0 - cloudAlpha * 0.75);

        // Ambient sky sheet flash during lightning
        col += vec3(0.48, 0.62, 0.88) * uLightningFlash * 0.3;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -3;
  skyGroup.add(skyDome);

  // 4. Night starfield dome
  const stars = createStarField(1600);
  skyGroup.add(stars.points);

  // 5. 3D Textured Moon sphere orbiting opposite the sun
  const moonTex = createMoonTexture();
  const moonGeo = new THREE.SphereGeometry(20, 20, 16);
  const moonMat = new THREE.MeshBasicMaterial({
    map: moonTex,
    color: new THREE.Color(0xeef5ff),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.frustumCulled = false;
  moonMesh.renderOrder = -1;
  skyGroup.add(moonMesh);

  // 6. Ambient + Hemisphere Fill Lights
  const ambientLight = new THREE.AmbientLight(0xd2e3f2, 0.32);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xa3d3f7, 0x4f613b, 0.84);
  hemiLight.position.set(0, 80, 0);
  scene.add(hemiLight);

  // 7. Primary Shadow-Casting Directional Light (smoothly follows Sun by day, Moon by night)
  const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.25);
  sunLight.position.copy(sunOffset);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.width = 1536;
  sunLight.shadow.mapSize.height = 1536;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 215;
  const shadowBounds = 44;
  sunLight.shadow.camera.left = -shadowBounds;
  sunLight.shadow.camera.right = shadowBounds;
  sunLight.shadow.camera.top = shadowBounds;
  sunLight.shadow.camera.bottom = -shadowBounds;
  sunLight.shadow.bias = -0.00038;
  sunLight.shadow.normalBias = 0.028;
  sunLight.shadow.radius = 2.2;
  sunLight.shadow.intensity = 1.0;

  scene.add(sunLight);
  scene.add(sunLight.target);

  // Subtle cool rim/bounce fill from opposite sky quadrant
  const fillLight = new THREE.DirectionalLight(0xa8cceb, 0.42);
  fillLight.position.set(-50, 32, -45);
  scene.add(fillLight);

  let cloudTravelX = 0;
  let cloudTravelY = 0;
  let lastCloudElapsed = 0;

  const updateTimeOfDay = (
    worldHours: number,
    elapsed = 0,
    weather?: WeatherSnapshot,
  ) => {
    const h = ((worldHours % 24) + 24) % 24;

    let a = TIME_STOPS[0];
    let b = TIME_STOPS[TIME_STOPS.length - 1];
    for (let i = 0; i < TIME_STOPS.length - 1; i++) {
      if (h >= TIME_STOPS[i].hour && h <= TIME_STOPS[i + 1].hour) {
        a = TIME_STOPS[i];
        b = TIME_STOPS[i + 1];
        break;
      }
    }

    const span = Math.max(0.001, b.hour - a.hour);
    const linearT = THREE.MathUtils.clamp((h - a.hour) / span, 0, 1);
    const t = linearT * linearT * (3 - 2 * linearT);

    const cloudCov = weather?.atmosphere.cloudCoverage ?? 0.22;
    const cloudDark = weather?.atmosphere.cloudDarkness ?? 0.05;
    const fogMult = weather?.atmosphere.fogMultiplier ?? 1.0;
    const fogMist = weather?.atmosphere.fogMistTint ?? 0.0;
    const lightAtten = weather?.atmosphere.lightAttenuation ?? 1.0;
    const ambBoost = weather?.atmosphere.ambientBoost ?? 1.0;
    const windStrength = weather?.atmosphere.windStrength ?? 0.16;
    const windAngle = weather?.windAngleRad ?? 0.62;
    const flash = weather?.lightningFlash ?? 0.0;

    const dtCloud = Math.max(0, Math.min(0.25, elapsed - lastCloudElapsed));
    lastCloudElapsed = elapsed;
    const cloudSpeed = 0.008 + windStrength * 0.036;
    cloudTravelX += Math.cos(windAngle) * cloudSpeed * dtCloud;
    cloudTravelY += Math.sin(windAngle) * cloudSpeed * dtCloud;
    _cloudOffset.set(cloudTravelX, cloudTravelY);

    _topTmp.copy(a.top).lerp(b.top, t);
    _midTmp.copy(a.mid).lerp(b.mid, t);
    horizonColor.copy(a.horizon).lerp(b.horizon, t);

    const dayLum = THREE.MathUtils.clamp(
      (a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t) / 2.4,
      0,
      1,
    );
    if (fogMist > 0.005) {
      const darkFactor = 1 - cloudDark * 0.48;
      const baseDay = 0.16 + dayLum * 0.58;
      _overcastTopTmp.setRGB(
        baseDay * 0.68 * darkFactor,
        baseDay * 0.74 * darkFactor,
        baseDay * 0.82 * darkFactor,
      );
      _overcastHorizonTmp.setRGB(
        baseDay * 0.84 * darkFactor,
        baseDay * 0.88 * darkFactor,
        baseDay * 0.91 * darkFactor,
      );
      _topTmp.lerp(_overcastTopTmp, fogMist * 0.82);
      _midTmp.lerp(_overcastHorizonTmp, fogMist * 0.72);
      horizonColor.lerp(_overcastHorizonTmp, fogMist * 0.85);
    }

    if (flash > 0.01) {
      horizonColor.lerp(_lightningTint, flash * 0.25);
    }

    (skyMat.uniforms.topColor.value as THREE.Color).copy(_topTmp);
    (skyMat.uniforms.midColor.value as THREE.Color).copy(_midTmp);
    fog.color.copy(horizonColor);
    fog.density = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, t) * fogMult;
    (skyMat.uniforms.sunColor.value as THREE.Color).copy(a.sunGlow).lerp(b.sunGlow, t);

    skyMat.uniforms.uCloudCoverage.value = cloudCov;
    skyMat.uniforms.uCloudDarkness.value = cloudDark;
    (skyMat.uniforms.uCloudOffset.value as THREE.Vector2).copy(_cloudOffset);
    skyMat.uniforms.uLightningFlash.value = flash;
    skyMat.uniforms.uDayBrightness.value = dayLum;

    ambientLight.color.copy(a.ambientColor).lerp(b.ambientColor, t);
    ambientLight.intensity =
      THREE.MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, t) * ambBoost +
      flash * 0.55;
    hemiLight.color.copy(a.hemiSky).lerp(b.hemiSky, t);
    hemiLight.groundColor.copy(a.hemiGround).lerp(b.hemiGround, t);
    hemiLight.intensity =
      THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, t) * (0.68 + lightAtten * 0.32) +
      flash * 0.75;
    fillLight.color.copy(a.fillColor).lerp(b.fillColor, t);
    fillLight.intensity =
      THREE.MathUtils.lerp(a.fillIntensity, b.fillIntensity, t) * (0.6 + lightAtten * 0.4);
    scene.environmentIntensity =
      THREE.MathUtils.lerp(a.envIntensity, b.envIntensity, t) * (0.55 + lightAtten * 0.45) +
      flash * 0.35;

    const orbitAngle = ((h - 6.0) / 24.0) * Math.PI * 2;
    const tiltZ = 0.34;
    _sunDir
      .set(Math.cos(orbitAngle), Math.sin(orbitAngle), tiltZ * Math.sin(orbitAngle))
      .normalize();

    _moonDir
      .set(-_sunDir.x, -_sunDir.y, -_sunDir.z * 0.8 + 0.16)
      .normalize();

    (skyMat.uniforms.sunDir.value as THREE.Vector3).copy(_sunDir);
    (skyMat.uniforms.moonDir.value as THREE.Vector3).copy(_moonDir);

    const sunVis = THREE.MathUtils.smoothstep(_sunDir.y, -0.06, 0.08);
    skyMat.uniforms.sunDiscVisibility.value = sunVis * (1 - fogMist * 0.75);

    const moonHorizonFade = THREE.MathUtils.smoothstep(_moonDir.y, -0.05, 0.08);
    const cloudOcc = 1 - Math.max(0, cloudCov - 0.35) * 1.1;
    const targetMoonOpacity =
      THREE.MathUtils.lerp(a.moonOpacity, b.moonOpacity, t) *
      moonHorizonFade *
      THREE.MathUtils.clamp(cloudOcc, 0.05, 1);
    moonMat.opacity = targetMoonOpacity;
    moonMesh.visible = targetMoonOpacity > 0.01;
    moonMesh.position.copy(_moonDir).multiplyScalar(580);
    moonMesh.lookAt(skyGroup.position);
    skyMat.uniforms.moonHaloStrength.value = targetMoonOpacity;

    const starVis =
      THREE.MathUtils.lerp(a.starVisibility, b.starVisibility, t) *
      THREE.MathUtils.clamp(1 - cloudCov * 1.15, 0, 1);
    skyMat.uniforms.uStarVisibility.value = starVis;
    stars.material.uniforms.uOpacity.value = starVis;
    stars.material.uniforms.uTime.value = elapsed;
    stars.points.visible = starVis > 0.005;
    stars.points.rotation.y = (h / 24) * Math.PI * 2 * 0.25;

    const sunInt = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
    const moonInt = THREE.MathUtils.lerp(a.moonIntensity, b.moonIntensity, t);

    if (sunInt >= moonInt) {
      _activeLightDir.copy(_sunDir);
      sunLight.color.copy(a.sunLight).lerp(b.sunLight, t);
      sunLight.intensity = sunInt * lightAtten + flash * 1.4;
    } else {
      _activeLightDir.copy(_moonDir);
      _shadowColorTmp.copy(a.moonLight).lerp(b.moonLight, t);
      sunLight.color.copy(_shadowColorTmp);
      sunLight.intensity = moonInt * lightAtten + flash * 1.4;
    }
    if (flash > 0.05) {
      sunLight.color.lerp(_lightningTint, Math.min(1, flash * 0.85));
    }

    // Keep fillLight opposite active directional light for natural rim contrast
    fillLight.position.set(
      -_activeLightDir.x * 48,
      Math.max(18, 34 - _activeLightDir.y * 8),
      -_activeLightDir.z * 48,
    );

    const shadowDark = THREE.MathUtils.lerp(a.shadowDarkness, b.shadowDarkness, t);
    const handoffFade = THREE.MathUtils.smoothstep(Math.abs(sunInt - moonInt), 0.0, 0.16);
    sunLight.shadow.intensity = shadowDark * handoffFade * (0.25 + lightAtten * 0.75);
    sunLight.shadow.radius = THREE.MathUtils.lerp(3.4, 2.0, sunVis) + cloudCov * 1.4;

    const lightDist = 112;
    sunOffset.set(
      _activeLightDir.x * lightDist,
      Math.max(18, _activeLightDir.y * lightDist),
      _activeLightDir.z * lightDist,
    );
  };

  const updateSunFollow = (playerPos: THREE.Vector3) => {
    const snapX = Math.round(playerPos.x * 2) * 0.5;
    const snapZ = Math.round(playerPos.z * 2) * 0.5;
    sunLight.target.position.set(snapX, playerPos.y, snapZ);
    sunLight.position.set(
      snapX + sunOffset.x,
      playerPos.y + sunOffset.y,
      snapZ + sunOffset.z,
    );
    skyGroup.position.set(playerPos.x, 0, playerPos.z);
  };

  const applyGraphicsProfile = (
    targetRenderer: THREE.WebGLRenderer,
    profile: ResolvedGraphicsProfile,
  ) => {
    skyMat.uniforms.uSkyQuality.value = profile.skyQuality;
    stars.geometry.setDrawRange(0, Math.min(1600, Math.max(0, profile.starCount)));
    fillLight.visible = profile.fillLightEnabled;

    const shadowOn = profile.shadowEnabled;
    if (targetRenderer.shadowMap.enabled !== shadowOn) {
      targetRenderer.shadowMap.enabled = shadowOn;
      targetRenderer.shadowMap.needsUpdate = true;
    }
    const desiredType = profile.shadowBasicFilter
      ? THREE.BasicShadowMap
      : THREE.PCFSoftShadowMap;
    if (targetRenderer.shadowMap.type !== desiredType) {
      targetRenderer.shadowMap.type = desiredType;
      targetRenderer.shadowMap.needsUpdate = true;
    }

    sunLight.castShadow = shadowOn;
    if (shadowOn && profile.shadowMapSize > 0) {
      if (
        sunLight.shadow.mapSize.width !== profile.shadowMapSize ||
        sunLight.shadow.mapSize.height !== profile.shadowMapSize
      ) {
        sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
        if (sunLight.shadow.map) {
          sunLight.shadow.map.dispose();
          sunLight.shadow.map = null;
        }
      }
      if (sunLight.shadow.camera.right !== profile.shadowBounds) {
        const b = profile.shadowBounds;
        sunLight.shadow.camera.left = -b;
        sunLight.shadow.camera.right = b;
        sunLight.shadow.camera.top = b;
        sunLight.shadow.camera.bottom = -b;
        sunLight.shadow.camera.updateProjectionMatrix();
      }
    }
  };

  updateTimeOfDay(8.5, 0);

  return {
    sunLight,
    hemiLight,
    ambientLight,
    skyDome,
    moonMesh,
    starField: stars.points,
    updateSunFollow,
    updateTimeOfDay,
    applyGraphicsProfile,
    getSunDirection: (out: THREE.Vector3) => out.copy(_sunDir),
    getActiveLightDirection: (out: THREE.Vector3) => out.copy(_activeLightDir),
    getSunColor: (out: THREE.Color) => out.copy(sunLight.color),
    getHorizonColor: (out: THREE.Color) => out.copy(horizonColor),
    getFogDensity: () => fog.density,
    dispose: () => {
      skyGeo.dispose();
      skyMat.dispose();
      moonGeo.dispose();
      moonMat.dispose();
      moonTex.dispose();
      stars.geometry.dispose();
      stars.material.dispose();
      envTarget.dispose();
    },
  };
}
