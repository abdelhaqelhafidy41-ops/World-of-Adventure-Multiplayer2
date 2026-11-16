import * as THREE from 'three';
import { groundHeightAt } from '../math/noise';
import type { WeatherQuality, WeatherSnapshot } from './WeatherManager';

const MAX_RAIN_DROPS = 2200;
const QUALITY_DROP_COUNTS: Record<WeatherQuality, number> = {
  low: 650,
  medium: 1350,
  high: 2200,
};

const MIST_PARTICLE_COUNT = 110;
const SPLASH_PARTICLE_COUNT = 140;
const LIGHTNING_MAX_SEGMENTS = 22;

/**
 * Performance-friendly 3D weather effects:
 * - GPU-animated rain streak volume (1 draw call, zero per-frame CPU particle iteration)
 * - GPU ground rain splash ripple rings around player during rainfall (1 draw call)
 * - Wind-driven soft valley mist wisps (1 draw call, zero per-frame CPU iteration)
 * - Pre-allocated procedural jagged 3D lightning bolt geometry for storm strikes
 */
export class WeatherEffects {
  private readonly scene: THREE.Scene;
  private readonly rainGeo: THREE.BufferGeometry;
  private readonly rainMat: THREE.ShaderMaterial;
  private readonly rainMesh: THREE.LineSegments;

  private readonly splashGeo: THREE.BufferGeometry;
  private readonly splashMat: THREE.ShaderMaterial;
  private readonly splashMesh: THREE.Points;

  private readonly mistGeo: THREE.BufferGeometry;
  private readonly mistMat: THREE.ShaderMaterial;
  private readonly mistMesh: THREE.Points;

  private readonly boltGeo: THREE.BufferGeometry;
  private readonly boltMat: THREE.LineBasicMaterial;
  private readonly boltMesh: THREE.LineSegments;
  private boltPosAttr: THREE.BufferAttribute;

  private activeQuality: WeatherQuality = 'medium';
  private particleScale = 1.0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // --- 1. GPU Rain Streaks ---
    const rainPositions = new Float32Array(MAX_RAIN_DROPS * 2 * 3);
    const rainIsTail = new Float32Array(MAX_RAIN_DROPS * 2);
    const rainSeeds = new Float32Array(MAX_RAIN_DROPS * 2);

    let seed = 412983;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const boxSpan = 56;
    const boxHeight = 30;
    for (let i = 0; i < MAX_RAIN_DROPS; i++) {
      const rx = (rand() - 0.5) * boxSpan;
      const ry = rand() * boxHeight;
      const rz = (rand() - 0.5) * boxSpan;
      const s = 0.75 + rand() * 0.6;

      const idx0 = i * 2;
      const idx1 = idx0 + 1;

      rainPositions[idx0 * 3] = rx;
      rainPositions[idx0 * 3 + 1] = ry;
      rainPositions[idx0 * 3 + 2] = rz;

      rainPositions[idx1 * 3] = rx;
      rainPositions[idx1 * 3 + 1] = ry;
      rainPositions[idx1 * 3 + 2] = rz;

      rainIsTail[idx0] = 0.0;
      rainIsTail[idx1] = 1.0;

      rainSeeds[idx0] = s;
      rainSeeds[idx1] = s;
    }

    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    this.rainGeo.setAttribute('aTail', new THREE.BufferAttribute(rainIsTail, 1));
    this.rainGeo.setAttribute('aSpeed', new THREE.BufferAttribute(rainSeeds, 1));
    this.rainGeo.setDrawRange(0, QUALITY_DROP_COUNTS[this.activeQuality] * 2);

    this.rainMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uPlayerPos: { value: new THREE.Vector3() },
        uWindVec: { value: new THREE.Vector2(0, 0) },
        uColor: { value: new THREE.Color(0xcbdcf0) },
      },
      vertexShader: `
        attribute float aTail;
        attribute float aSpeed;
        uniform float uTime;
        uniform vec3 uPlayerPos;
        uniform vec2 uWindVec;
        varying float vEdgeFade;
        varying float vTail;

        void main() {
          vTail = aTail;
          vec3 base = position;

          float fallSpeed = 23.0 * aSpeed;
          float boxH = 30.0;
          float span = 56.0;
          float halfSpan = 28.0;

          vec3 p;
          p.x = mod(base.x + uWindVec.x * uTime * 9.5 - uPlayerPos.x + halfSpan, span) - halfSpan + uPlayerPos.x;
          p.z = mod(base.z + uWindVec.y * uTime * 9.5 - uPlayerPos.z + halfSpan, span) - halfSpan + uPlayerPos.z;
          p.y = mod(base.y - uTime * fallSpeed - uPlayerPos.y + 8.0, boxH) - 8.0 + uPlayerPos.y;

          float streakLen = 0.9 + 0.5 * length(uWindVec);
          vec3 streakDir = normalize(vec3(-uWindVec.x * 0.45, 1.0, -uWindVec.y * 0.45));
          p += streakDir * (aTail * streakLen);

          float distXZ = length(p.xz - uPlayerPos.xz);
          vEdgeFade = 1.0 - smoothstep(16.0, 27.5, distXZ);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;
        varying float vEdgeFade;
        varying float vTail;

        void main() {
          float tipFade = mix(0.24, 1.0, vTail);
          float alpha = uOpacity * vEdgeFade * tipFade;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.rainMesh = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.rainMesh.renderOrder = 4;
    this.scene.add(this.rainMesh);

    // --- 2. Ground Rain Splash Ripple Rings ---
    const splashPos = new Float32Array(SPLASH_PARTICLE_COUNT * 3);
    const splashPhase = new Float32Array(SPLASH_PARTICLE_COUNT);
    const splashSize = new Float32Array(SPLASH_PARTICLE_COUNT);
    for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
      splashPos[i * 3] = (rand() - 0.5) * 32;
      splashPos[i * 3 + 1] = 0.08;
      splashPos[i * 3 + 2] = (rand() - 0.5) * 32;
      splashPhase[i] = rand();
      splashSize[i] = 5.5 + rand() * 5.0;
    }

    this.splashGeo = new THREE.BufferGeometry();
    this.splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
    this.splashGeo.setAttribute('aPhase', new THREE.BufferAttribute(splashPhase, 1));
    this.splashGeo.setAttribute('aSize', new THREE.BufferAttribute(splashSize, 1));

    this.splashMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uPlayerPos: { value: new THREE.Vector3() },
        uGroundY: { value: 0 },
        uColor: { value: new THREE.Color(0xd7e7fa) },
      },
      vertexShader: `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        uniform vec3 uPlayerPos;
        uniform float uGroundY;
        varying float vCycle;
        varying float vDistFade;

        void main() {
          float span = 32.0;
          float halfSpan = 16.0;
          float cycle = fract(uTime * 1.95 + aPhase);
          vCycle = cycle;

          vec3 p;
          p.x = mod(position.x - uPlayerPos.x + halfSpan, span) - halfSpan + uPlayerPos.x;
          p.z = mod(position.z - uPlayerPos.z + halfSpan, span) - halfSpan + uPlayerPos.z;
          p.y = uGroundY + 0.14 + (1.0 - cycle) * 0.08;

          float d = length(p.xz - uPlayerPos.xz);
          vDistFade = 1.0 - smoothstep(10.0, 16.0, d);

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = aSize * (0.45 + cycle * 0.9) * (65.0 / max(6.0, -mvPos.z));
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;
        varying float vCycle;
        varying float vDistFade;

        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          // Flatten slightly in Y to suggest ground-plane ripple perspective
          c.y *= 1.5;
          float r = length(c);
          float ringRadius = 0.12 + vCycle * 0.34;
          float ring = 1.0 - smoothstep(0.0, 0.09, abs(r - ringRadius));
          float fade = (1.0 - vCycle) * smoothstep(0.0, 0.12, vCycle);
          float alpha = ring * fade * uOpacity * vDistFade;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.splashMesh = new THREE.Points(this.splashGeo, this.splashMat);
    this.splashMesh.frustumCulled = false;
    this.splashMesh.visible = false;
    this.splashMesh.renderOrder = 3;
    this.scene.add(this.splashMesh);

    // --- 3. GPU Drifting Valley Mist Particles ---
    const mistPos = new Float32Array(MIST_PARTICLE_COUNT * 3);
    const mistSize = new Float32Array(MIST_PARTICLE_COUNT);
    const mistSeed = new Float32Array(MIST_PARTICLE_COUNT);
    for (let i = 0; i < MIST_PARTICLE_COUNT; i++) {
      mistPos[i * 3] = (rand() - 0.5) * 72;
      mistPos[i * 3 + 1] = 0.5 + rand() * 7.8;
      mistPos[i * 3 + 2] = (rand() - 0.5) * 72;
      mistSize[i] = 16 + rand() * 20;
      mistSeed[i] = rand() * Math.PI * 2;
    }

    this.mistGeo = new THREE.BufferGeometry();
    this.mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
    this.mistGeo.setAttribute('aSize', new THREE.BufferAttribute(mistSize, 1));
    this.mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(mistSeed, 1));

    this.mistMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uPlayerPos: { value: new THREE.Vector3() },
        uWindVec: { value: new THREE.Vector2(0, 0) },
        uColor: { value: new THREE.Color(0xc5d2de) },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aSeed;
        uniform float uTime;
        uniform vec3 uPlayerPos;
        uniform vec2 uWindVec;
        varying float vFade;
        varying float vSeed;

        void main() {
          vSeed = aSeed;
          float span = 72.0;
          float halfSpan = 36.0;

          vec3 p;
          p.x = mod(position.x + uWindVec.x * uTime * 3.8 - uPlayerPos.x + halfSpan, span) - halfSpan + uPlayerPos.x;
          p.z = mod(position.z + uWindVec.y * uTime * 3.8 - uPlayerPos.z + halfSpan, span) - halfSpan + uPlayerPos.z;
          p.y = uPlayerPos.y + position.y + sin(uTime * 0.45 + position.x) * 0.45;

          float d = length(p.xz - uPlayerPos.xz);
          vFade = smoothstep(3.5, 11.5, d) * (1.0 - smoothstep(23.0, 35.5, d));

          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = aSize * (225.0 / max(12.0, -mvPos.z));
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;
        varying float vFade;
        varying float vSeed;

        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          // Soft multi-lobe organic cloud wisp mask
          float ang = atan(c.y, c.x) * 3.0 + vSeed;
          float wobble = 0.045 * sin(ang);
          float r = length(c) + wobble;
          if (r > 0.5) discard;
          float puff = smoothstep(0.5, 0.04, r);
          float alpha = puff * puff * uOpacity * vFade;
          if (alpha < 0.005) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.mistMesh = new THREE.Points(this.mistGeo, this.mistMat);
    this.mistMesh.frustumCulled = false;
    this.mistMesh.visible = false;
    this.mistMesh.renderOrder = 3;
    this.scene.add(this.mistMesh);

    // --- 4. Procedural 3D Lightning Bolt ---
    const boltPositions = new Float32Array(LIGHTNING_MAX_SEGMENTS * 2 * 3);
    this.boltGeo = new THREE.BufferGeometry();
    this.boltPosAttr = new THREE.BufferAttribute(boltPositions, 3);
    this.boltGeo.setAttribute('position', this.boltPosAttr);

    this.boltMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(1.4, 1.65, 2.0),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });

    this.boltMesh = new THREE.LineSegments(this.boltGeo, this.boltMat);
    this.boltMesh.frustumCulled = false;
    this.boltMesh.visible = false;
    this.boltMesh.renderOrder = 5;
    this.scene.add(this.boltMesh);
  }

  public spawnLightningBolt(
    azimuthRad: number,
    distanceMeters: number,
    playerPos: THREE.Vector3,
  ): void {
    const clampedDist = Math.max(120, Math.min(340, distanceMeters * 0.45));
    const baseX = playerPos.x + Math.cos(azimuthRad) * clampedDist;
    const baseZ = playerPos.z + Math.sin(azimuthRad) * clampedDist;
    const topY = playerPos.y + 138;
    const bottomY = Math.max(-2, playerPos.y - 6);

    const arr = this.boltPosAttr.array as Float32Array;
    arr.fill(0);

    const mainSegments = 14;
    let curX = baseX;
    let curY = topY;
    let curZ = baseZ;
    let segIdx = 0;

    for (let i = 1; i <= mainSegments && segIdx < LIGHTNING_MAX_SEGMENTS; i++) {
      const frac = i / mainSegments;
      const nextY = THREE.MathUtils.lerp(topY, bottomY, frac);
      const nextX = baseX + (Math.random() - 0.5) * 18;
      const nextZ = baseZ + (Math.random() - 0.5) * 18;

      const offset = segIdx * 6;
      arr[offset] = curX;
      arr[offset + 1] = curY;
      arr[offset + 2] = curZ;
      arr[offset + 3] = nextX;
      arr[offset + 4] = nextY;
      arr[offset + 5] = nextZ;
      segIdx++;

      if (i > 2 && i < mainSegments - 2 && Math.random() < 0.45 && segIdx + 1 < LIGHTNING_MAX_SEGMENTS) {
        const forkMidX = nextX + (Math.random() - 0.5) * 16;
        const forkMidY = nextY - 9 - Math.random() * 8;
        const forkMidZ = nextZ + (Math.random() - 0.5) * 16;
        const fOffset = segIdx * 6;
        arr[fOffset] = nextX;
        arr[fOffset + 1] = nextY;
        arr[fOffset + 2] = nextZ;
        arr[fOffset + 3] = forkMidX;
        arr[fOffset + 4] = forkMidY;
        arr[fOffset + 5] = forkMidZ;
        segIdx++;

        const forkEndX = forkMidX + (Math.random() - 0.5) * 14;
        const forkEndY = forkMidY - 8 - Math.random() * 7;
        const forkEndZ = forkMidZ + (Math.random() - 0.5) * 14;
        const f2Offset = segIdx * 6;
        arr[f2Offset] = forkMidX;
        arr[f2Offset + 1] = forkMidY;
        arr[f2Offset + 2] = forkMidZ;
        arr[f2Offset + 3] = forkEndX;
        arr[f2Offset + 4] = forkEndY;
        arr[f2Offset + 5] = forkEndZ;
        segIdx++;
      }

      curX = nextX;
      curY = nextY;
      curZ = nextZ;
    }

    this.boltGeo.setDrawRange(0, segIdx * 2);
    this.boltPosAttr.needsUpdate = true;
    this.boltMesh.visible = true;
  }

  public setParticleScale(scale: number): void {
    const clamped = Math.max(0.25, Math.min(1.0, scale));
    if (Math.abs(clamped - this.particleScale) < 0.02) return;
    this.particleScale = clamped;
    this.applyParticleDrawRanges();
  }

  private applyParticleDrawRanges(): void {
    const rainDrops = Math.max(
      180,
      Math.round(QUALITY_DROP_COUNTS[this.activeQuality] * this.particleScale),
    );
    this.rainGeo.setDrawRange(0, rainDrops * 2);
    this.splashGeo.setDrawRange(
      0,
      Math.max(24, Math.round(SPLASH_PARTICLE_COUNT * this.particleScale)),
    );
    this.mistGeo.setDrawRange(
      0,
      Math.max(20, Math.round(MIST_PARTICLE_COUNT * this.particleScale)),
    );
  }

  public update(
    elapsed: number,
    playerPos: THREE.Vector3,
    weather: WeatherSnapshot,
    nightFactor = 0,
  ): void {
    if (weather.quality !== this.activeQuality) {
      this.activeQuality = weather.quality;
      this.applyParticleDrawRanges();
    }

    const windX = Math.cos(weather.windAngleRad) * weather.atmosphere.windStrength;
    const windZ = Math.sin(weather.windAngleRad) * weather.atmosphere.windStrength;

    const rainInt = weather.atmosphere.rainIntensity;
    this.rainMesh.visible = rainInt > 0.02;
    if (this.rainMesh.visible) {
      this.rainMat.uniforms.uTime.value = elapsed;
      this.rainMat.uniforms.uOpacity.value = Math.min(0.62, rainInt * 0.55);
      (this.rainMat.uniforms.uPlayerPos.value as THREE.Vector3).copy(playerPos);
      (this.rainMat.uniforms.uWindVec.value as THREE.Vector2).set(windX, windZ);
      const rainCol = this.rainMat.uniforms.uColor.value as THREE.Color;
      const dayBright = 1 - nightFactor * 0.52 + weather.lightningFlash * 0.35;
      rainCol.setRGB(0.75 * dayBright, 0.83 * dayBright, 0.94 * dayBright);
    }

    // Rain splash ripples near player ground level
    this.splashMesh.visible =
      rainInt > 0.14 && weather.quality !== 'low' && this.particleScale >= 0.5;
    if (this.splashMesh.visible) {
      this.splashMat.uniforms.uTime.value = elapsed;
      this.splashMat.uniforms.uOpacity.value = Math.min(0.45, (rainInt - 0.14) * 0.52);
      (this.splashMat.uniforms.uPlayerPos.value as THREE.Vector3).copy(playerPos);
      this.splashMat.uniforms.uGroundY.value = groundHeightAt(playerPos.x, playerPos.z);
      const splashCol = this.splashMat.uniforms.uColor.value as THREE.Color;
      const dayBright = 1 - nightFactor * 0.45 + weather.lightningFlash * 0.4;
      splashCol.setRGB(0.82 * dayBright, 0.89 * dayBright, 0.98 * dayBright);
    }

    const mistStrength = Math.max(
      0,
      weather.atmosphere.fogMistTint - 0.18,
    ) / 0.82;
    this.mistMesh.visible = mistStrength > 0.03;
    if (this.mistMesh.visible) {
      this.mistMat.uniforms.uTime.value = elapsed;
      this.mistMat.uniforms.uOpacity.value = Math.min(0.22, mistStrength * 0.18);
      (this.mistMat.uniforms.uPlayerPos.value as THREE.Vector3).copy(playerPos);
      (this.mistMat.uniforms.uWindVec.value as THREE.Vector2).set(windX, windZ);
      const mistCol = this.mistMat.uniforms.uColor.value as THREE.Color;
      const dayBright = 1 - nightFactor * 0.65 + weather.lightningFlash * 0.25;
      mistCol.setRGB(0.76 * dayBright, 0.82 * dayBright, 0.86 * dayBright);
    }

    if (weather.lightningFlash > 0.04) {
      this.boltMesh.visible = true;
      this.boltMat.opacity = Math.min(1, weather.lightningFlash * 1.15);
    } else {
      this.boltMesh.visible = false;
      this.boltMat.opacity = 0;
    }
  }

  public dispose(): void {
    this.scene.remove(this.rainMesh, this.splashMesh, this.mistMesh, this.boltMesh);
    this.rainGeo.dispose();
    this.rainMat.dispose();
    this.splashGeo.dispose();
    this.splashMat.dispose();
    this.mistGeo.dispose();
    this.mistMat.dispose();
    this.boltGeo.dispose();
    this.boltMat.dispose();
  }
}
