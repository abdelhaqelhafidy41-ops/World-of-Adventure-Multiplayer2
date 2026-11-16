import * as THREE from 'three';
import type { WeatherSnapshot } from './WeatherManager';

const POLLEN_COUNT = 160;
const FIREFLY_COUNT = 110;

/**
 * GPU-driven atmospheric micro-particles (zero per-frame CPU iteration):
 * 1. Sunlit drifting pollen / dust motes during clear/cloudy daytime
 * 2. Warm pulsing emerald-gold fireflies during dusk/night when not raining
 */
export class AtmosphericParticles {
  private readonly scene: THREE.Scene;

  private readonly pollenGeo: THREE.BufferGeometry;
  private readonly pollenMat: THREE.ShaderMaterial;
  private readonly pollenPoints: THREE.Points;

  private readonly fireflyGeo: THREE.BufferGeometry;
  private readonly fireflyMat: THREE.ShaderMaterial;
  private readonly fireflyPoints: THREE.Points;
  private particleScale = 1.0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    let seed = 73915;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // --- 1. Sunlit Pollen / Dust Motes ---
    const pollenPos = new Float32Array(POLLEN_COUNT * 3);
    const pollenSeed = new Float32Array(POLLEN_COUNT);
    const pollenSize = new Float32Array(POLLEN_COUNT);
    for (let i = 0; i < POLLEN_COUNT; i++) {
      pollenPos[i * 3] = (rand() - 0.5) * 44;
      pollenPos[i * 3 + 1] = 0.4 + rand() * 7.2;
      pollenPos[i * 3 + 2] = (rand() - 0.5) * 44;
      pollenSeed[i] = rand() * Math.PI * 2;
      pollenSize[i] = 2.6 + rand() * 3.4;
    }

    this.pollenGeo = new THREE.BufferGeometry();
    this.pollenGeo.setAttribute('position', new THREE.BufferAttribute(pollenPos, 3));
    this.pollenGeo.setAttribute('aSeed', new THREE.BufferAttribute(pollenSeed, 1));
    this.pollenGeo.setAttribute('aSize', new THREE.BufferAttribute(pollenSize, 1));

    this.pollenMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uPlayerPos: { value: new THREE.Vector3() },
        uWindVec: { value: new THREE.Vector2(0, 0) },
        uColor: { value: new THREE.Color(0xfff1c4) },
      },
      vertexShader: `
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        uniform vec3 uPlayerPos;
        uniform vec2 uWindVec;
        varying float vFade;
        varying float vPulse;

        void main() {
          float span = 44.0;
          float halfSpan = 22.0;

          vec3 p;
          float driftX = uWindVec.x * uTime * 2.4 + sin(uTime * 0.65 + aSeed) * 1.1;
          float driftZ = uWindVec.y * uTime * 2.4 + cos(uTime * 0.58 + aSeed * 1.3) * 1.1;
          p.x = mod(position.x + driftX - uPlayerPos.x + halfSpan, span) - halfSpan + uPlayerPos.x;
          p.z = mod(position.z + driftZ - uPlayerPos.z + halfSpan, span) - halfSpan + uPlayerPos.z;
          p.y = uPlayerPos.y + position.y + sin(uTime * 0.9 + aSeed * 2.1) * 0.55;

          float d = length(p.xz - uPlayerPos.xz);
          vFade = smoothstep(1.5, 5.5, d) * (1.0 - smoothstep(13.5, 21.5, d));
          vPulse = 0.55 + 0.45 * sin(uTime * 1.6 + aSeed * 4.0);

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = aSize * (95.0 / max(8.0, -mvPos.z));
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;
        varying float vFade;
        varying float vPulse;

        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float r = length(c);
          if (r > 0.5) discard;
          float glow = smoothstep(0.5, 0.05, r);
          float alpha = glow * glow * uOpacity * vFade * vPulse;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.pollenPoints = new THREE.Points(this.pollenGeo, this.pollenMat);
    this.pollenPoints.frustumCulled = false;
    this.pollenPoints.renderOrder = 3;
    this.scene.add(this.pollenPoints);

    // --- 2. Dusk & Night Fireflies ---
    const ffPos = new Float32Array(FIREFLY_COUNT * 3);
    const ffSeed = new Float32Array(FIREFLY_COUNT);
    const ffSize = new Float32Array(FIREFLY_COUNT);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      ffPos[i * 3] = (rand() - 0.5) * 52;
      ffPos[i * 3 + 1] = 0.35 + rand() * 3.8;
      ffPos[i * 3 + 2] = (rand() - 0.5) * 52;
      ffSeed[i] = rand() * Math.PI * 2;
      ffSize[i] = 4.5 + rand() * 4.2;
    }

    this.fireflyGeo = new THREE.BufferGeometry();
    this.fireflyGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    this.fireflyGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeed, 1));
    this.fireflyGeo.setAttribute('aSize', new THREE.BufferAttribute(ffSize, 1));

    this.fireflyMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uPlayerPos: { value: new THREE.Vector3() },
      },
      vertexShader: `
        attribute float aSeed;
        attribute float aSize;
        uniform float uTime;
        uniform vec3 uPlayerPos;
        varying float vFade;
        varying float vBlink;
        varying float vHue;

        void main() {
          float span = 52.0;
          float halfSpan = 26.0;

          vec3 p;
          float wanderX = sin(uTime * 0.52 + aSeed * 1.7) * 1.9 + cos(uTime * 0.27 + aSeed) * 1.2;
          float wanderZ = cos(uTime * 0.48 + aSeed * 2.1) * 1.9 + sin(uTime * 0.31 + aSeed) * 1.2;
          p.x = mod(position.x + wanderX - uPlayerPos.x + halfSpan, span) - halfSpan + uPlayerPos.x;
          p.z = mod(position.z + wanderZ - uPlayerPos.z + halfSpan, span) - halfSpan + uPlayerPos.z;
          p.y = uPlayerPos.y + position.y + sin(uTime * 1.15 + aSeed * 3.0) * 0.65;

          float d = length(p.xz - uPlayerPos.xz);
          vFade = smoothstep(2.0, 6.5, d) * (1.0 - smoothstep(16.0, 25.5, d));

          // Organic blink envelope (slow off/on pulse)
          float pulse = sin(uTime * (1.3 + fract(aSeed) * 1.1) + aSeed * 6.2831);
          vBlink = smoothstep(-0.15, 0.85, pulse);
          vHue = fract(aSeed * 1.73);

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = aSize * (0.7 + 0.55 * vBlink) * (110.0 / max(8.0, -mvPos.z));
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vFade;
        varying float vBlink;
        varying float vHue;

        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float r = length(c);
          if (r > 0.5) discard;
          float halo = smoothstep(0.5, 0.04, r);
          float core = smoothstep(0.22, 0.0, r);
          vec3 glowCol = mix(vec3(0.82, 1.0, 0.36), vec3(1.0, 0.86, 0.32), vHue);
          vec3 finalCol = mix(glowCol, vec3(1.15, 1.15, 0.85), core);
          float alpha = (halo * halo * 0.75 + core * 0.65) * uOpacity * vFade * vBlink;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(finalCol, alpha);
        }
      `,
    });

    this.fireflyPoints = new THREE.Points(this.fireflyGeo, this.fireflyMat);
    this.fireflyPoints.frustumCulled = false;
    this.fireflyPoints.visible = false;
    this.fireflyPoints.renderOrder = 4;
    this.scene.add(this.fireflyPoints);
  }

  public setParticleScale(scale: number): void {
    const clamped = Math.max(0.25, Math.min(1.0, scale));
    if (Math.abs(clamped - this.particleScale) < 0.02) return;
    this.particleScale = clamped;
    this.pollenGeo.setDrawRange(0, Math.round(POLLEN_COUNT * clamped));
    this.fireflyGeo.setDrawRange(0, Math.round(FIREFLY_COUNT * clamped));
  }

  public update(
    elapsed: number,
    playerPos: THREE.Vector3,
    weather: WeatherSnapshot,
    nightFactor: number,
  ): void {
    const rainQuiet = THREE.MathUtils.clamp(1 - weather.atmosphere.rainIntensity * 3.5, 0, 1);
    const windX = Math.cos(weather.windAngleRad) * weather.atmosphere.windStrength;
    const windZ = Math.sin(weather.windAngleRad) * weather.atmosphere.windStrength;

    // Daytime pollen motes fade out at night and in rain
    const pollenAlpha = (1 - nightFactor * 0.88) * rainQuiet * (1 - weather.atmosphere.fogMistTint * 0.6);
    this.pollenPoints.visible = pollenAlpha > 0.03 && this.particleScale >= 0.35;
    if (this.pollenPoints.visible) {
      this.pollenMat.uniforms.uTime.value = elapsed;
      this.pollenMat.uniforms.uOpacity.value = pollenAlpha * 0.34;
      (this.pollenMat.uniforms.uPlayerPos.value as THREE.Vector3).copy(playerPos);
      (this.pollenMat.uniforms.uWindVec.value as THREE.Vector2).set(windX, windZ);
    }

    // Dusk/night fireflies emerge as sun sets
    const fireflyAlpha = THREE.MathUtils.smoothstep(nightFactor, 0.18, 0.75) * rainQuiet;
    this.fireflyPoints.visible = fireflyAlpha > 0.02;
    if (this.fireflyPoints.visible) {
      this.fireflyMat.uniforms.uTime.value = elapsed;
      this.fireflyMat.uniforms.uOpacity.value = fireflyAlpha * 0.88;
      (this.fireflyMat.uniforms.uPlayerPos.value as THREE.Vector3).copy(playerPos);
    }
  }

  public dispose(): void {
    this.scene.remove(this.pollenPoints, this.fireflyPoints);
    this.pollenGeo.dispose();
    this.pollenMat.dispose();
    this.fireflyGeo.dispose();
    this.fireflyMat.dispose();
  }
}
