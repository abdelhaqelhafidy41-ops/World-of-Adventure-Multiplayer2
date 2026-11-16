import * as THREE from 'three';

export interface ProceduralTextureSet {
  grassMap: THREE.CanvasTexture;
  grassNormalMap: THREE.DataTexture;
  grassRoughnessMap: THREE.DataTexture;
  sandMap: THREE.CanvasTexture;
  sandNormalMap: THREE.DataTexture;
  sandRoughnessMap: THREE.DataTexture;
  barkMap: THREE.CanvasTexture;
  barkNormalMap: THREE.DataTexture;
  rockMap: THREE.CanvasTexture;
  rockNormalMap: THREE.DataTexture;
  rockRoughnessMap: THREE.DataTexture;
  plasterNormalMap: THREE.DataTexture;
  waterNormalMap: THREE.DataTexture;
  contactShadowMap: THREE.CanvasTexture;
  disposeWorldMaps: () => void;
  dispose: () => void;
}

function hash2D(ix: number, iy: number, seed: number): number {
  const n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  const m = (n ^ (n >>> 13)) * 1274126177;
  return ((m ^ (m >>> 16)) >>> 0) / 4294967295;
}

function periodicNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const ix0 = ((x0 % period) + period) % period;
  const iy0 = ((y0 % period) + period) % period;
  const ix1 = (ix0 + 1) % period;
  const iy1 = (iy0 + 1) % period;

  const a = hash2D(ix0, iy0, seed);
  const b = hash2D(ix1, iy0, seed);
  const c = hash2D(ix0, iy1, seed);
  const d = hash2D(ix1, iy1, seed);

  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

function periodicFbm(
  u: number,
  v: number,
  basePeriod: number,
  octaves: number,
  seed: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicNoise(u, v, period, seed + o * 97);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / (norm || 1);
}

function heightFieldToNormalTexture(
  size: number,
  heightField: Float32Array,
  strength: number,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const hL = heightField[y * size + xm];
      const hR = heightField[y * size + xp];
      const hD = heightField[ym * size + x];
      const hU = heightField[yp * size + x];

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function grayscaleFieldToDataTexture(
  size: number,
  field: Float32Array,
  minVal: number,
  maxVal: number,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const span = maxVal - minVal;
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(1, field[i]));
    const byte = Math.round((minVal + v * span) * 255);
    const idx = i * 4;
    data[idx] = byte;
    data[idx + 1] = byte;
    data[idx + 2] = byte;
    data[idx + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export type ProceduralTextureQuality = 'low' | 'medium' | 'high';

export function createProceduralTextures(
  maxAnisotropy: number,
  textureQuality: ProceduralTextureQuality = 'high',
  reuseContactShadow?: THREE.CanvasTexture,
): ProceduralTextureSet {
  const maxAllowedAniso =
    textureQuality === 'low' ? 1 : textureQuality === 'medium' ? 2 : 4;
  const effectiveAniso = Math.max(1, Math.min(maxAllowedAniso, maxAnisotropy));

  const grassCanvasSize =
    textureQuality === 'low' ? 128 : textureQuality === 'medium' ? 256 : 512;
  const grassDataSize =
    textureQuality === 'low' ? 64 : textureQuality === 'medium' ? 128 : 256;
  const detailCanvasSize =
    textureQuality === 'low' ? 64 : textureQuality === 'medium' ? 128 : 256;
  const detailDataSize =
    textureQuality === 'low' ? 64 : textureQuality === 'medium' ? 96 : 128;
  const waterDataSize =
    textureQuality === 'low' ? 64 : textureQuality === 'medium' ? 128 : 256;

  // 1. Lush Meadow Grass Albedo + Normal + Roughness
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = grassCanvasSize;
  grassCanvas.height = grassCanvasSize;
  const gCtx = grassCanvas.getContext('2d')!;
  gCtx.fillStyle = '#538442';
  gCtx.fillRect(0, 0, grassCanvasSize, grassCanvasSize);

  const grassScale = grassCanvasSize / 512;
  const patchCount = Math.round(420 * (0.4 + 0.6 * grassScale));
  for (let i = 0; i < patchCount; i++) {
    const x = Math.random() * grassCanvasSize;
    const y = Math.random() * grassCanvasSize;
    const r = (6 + Math.random() * 18) * grassScale;
    gCtx.fillStyle =
      i % 2 === 0 ? 'rgba(66, 102, 46, 0.16)' : 'rgba(116, 148, 76, 0.12)';
    gCtx.beginPath();
    gCtx.arc(x, y, r, 0, Math.PI * 2);
    gCtx.fill();
  }
  const bladeCount = Math.round(8200 * (0.28 + 0.72 * grassScale));
  for (let i = 0; i < bladeCount; i++) {
    const x = Math.random() * grassCanvasSize;
    const y = Math.random() * grassCanvasSize;
    const h = (4 + Math.random() * 9) * grassScale;
    const w = (1 + Math.random() * 1.8) * Math.max(0.7, grassScale);
    const shade = Math.random();
    gCtx.fillStyle =
      shade < 0.28
        ? '#3b6730'
        : shade < 0.62
          ? '#5e8e48'
          : shade < 0.88
            ? '#74a353'
            : '#87b261';
    gCtx.fillRect(x, y, w, h);
  }

  const grassMap = new THREE.CanvasTexture(grassCanvas);
  grassMap.colorSpace = THREE.SRGBColorSpace;
  grassMap.wrapS = THREE.RepeatWrapping;
  grassMap.wrapT = THREE.RepeatWrapping;
  grassMap.repeat.set(36, 36);
  grassMap.anisotropy = effectiveAniso;

  const grassSize = grassDataSize;
  const grassHeights = new Float32Array(grassSize * grassSize);
  const grassRoughField = new Float32Array(grassSize * grassSize);
  for (let y = 0; y < grassSize; y++) {
    const v = y / grassSize;
    for (let x = 0; x < grassSize; x++) {
      const u = x / grassSize;
      const macro = periodicFbm(u, v, 8, 3, 101);
      const blades = periodicFbm(u * 2.0, v * 1.0, 24, 2, 203);
      const h = macro * 0.55 + blades * 0.45;
      grassHeights[y * grassSize + x] = h;
      grassRoughField[y * grassSize + x] = 1 - h * 0.7;
    }
  }
  const grassNormalMap = heightFieldToNormalTexture(
    grassSize,
    grassHeights,
    2.6,
    36,
    36,
    effectiveAniso,
  );
  const grassRoughnessMap = grayscaleFieldToDataTexture(
    grassSize,
    grassRoughField,
    0.78,
    0.96,
    36,
    36,
    effectiveAniso,
  );

  // 1b. Dry Desert Sand Albedo + Wind-Rippled Normal + Matte Roughness
  const sandCanvas = document.createElement('canvas');
  sandCanvas.width = grassCanvasSize;
  sandCanvas.height = grassCanvasSize;
  const sandCtx = sandCanvas.getContext('2d')!;
  const sandImg = sandCtx.createImageData(grassCanvasSize, grassCanvasSize);
  const sandPixels = sandImg.data;
  const sandHeights = new Float32Array(grassSize * grassSize);
  const sandRoughField = new Float32Array(grassSize * grassSize);

  for (let y = 0; y < grassCanvasSize; y++) {
    const v = y / grassCanvasSize;
    for (let x = 0; x < grassCanvasSize; x++) {
      const u = x / grassCanvasSize;
      const macro = periodicFbm(u, v, 4, 3, 701);
      const rippleWarp = periodicFbm(u, v, 6, 2, 733) * 0.16;
      const ripple =
        Math.sin((u * 9.0 + v * 4.0 + rippleWarp) * Math.PI * 2) * 0.5 + 0.5;
      const grain = hash2D(x, y, 761);
      // Warm luminous neutral-sand albedo (~#f6ebd2 .. #e8d4ac) designed to multiply cleanly with biome vertex colors
      const shade = 0.89 + macro * 0.06 + ripple * 0.045 + (grain - 0.5) * 0.05;
      const idx = (y * grassCanvasSize + x) * 4;
      sandPixels[idx] = Math.min(255, Math.max(0, Math.round(250 * shade)));
      sandPixels[idx + 1] = Math.min(255, Math.max(0, Math.round(234 * shade)));
      sandPixels[idx + 2] = Math.min(255, Math.max(0, Math.round(198 * shade)));
      sandPixels[idx + 3] = 255;
    }
  }
  sandCtx.putImageData(sandImg, 0, 0);

  const sandMap = new THREE.CanvasTexture(sandCanvas);
  sandMap.colorSpace = THREE.SRGBColorSpace;
  sandMap.wrapS = THREE.RepeatWrapping;
  sandMap.wrapT = THREE.RepeatWrapping;
  sandMap.repeat.set(36, 36);
  sandMap.anisotropy = effectiveAniso;

  for (let y = 0; y < grassSize; y++) {
    const v = y / grassSize;
    for (let x = 0; x < grassSize; x++) {
      const u = x / grassSize;
      const macro = periodicFbm(u, v, 6, 3, 809);
      const rippleWarp = periodicFbm(u, v, 6, 2, 733) * 0.16;
      const ripple =
        Math.sin((u * 9.0 + v * 4.0 + rippleWarp) * Math.PI * 2) * 0.5 + 0.5;
      const fineGrain = hash2D(x, y, 827) * 0.18;
      const h = macro * 0.32 + ripple * 0.5 + fineGrain;
      sandHeights[y * grassSize + x] = h;
      sandRoughField[y * grassSize + x] = 0.4 + (1.0 - ripple) * 0.45 + fineGrain * 0.15;
    }
  }
  const sandNormalMap = heightFieldToNormalTexture(
    grassSize,
    sandHeights,
    2.1,
    36,
    36,
    effectiveAniso,
  );
  const sandRoughnessMap = grayscaleFieldToDataTexture(
    grassSize,
    sandRoughField,
    0.9,
    0.98,
    36,
    36,
    effectiveAniso,
  );

  // 2. Tree Bark Albedo + Normal
  const barkCanvas = document.createElement('canvas');
  barkCanvas.width = detailCanvasSize;
  barkCanvas.height = detailCanvasSize;
  const bCtx = barkCanvas.getContext('2d')!;
  bCtx.fillStyle = '#5c4230';
  bCtx.fillRect(0, 0, detailCanvasSize, detailCanvasSize);

  const detailScale = detailCanvasSize / 256;
  const barkStreaks = Math.round(950 * (0.35 + 0.65 * detailScale));
  for (let i = 0; i < barkStreaks; i++) {
    const x = Math.random() * detailCanvasSize;
    const y = Math.random() * detailCanvasSize;
    const w = (1.5 + Math.random() * 4.5) * Math.max(0.65, detailScale);
    const h = (16 + Math.random() * 48) * detailScale;
    const r = Math.random();
    bCtx.fillStyle = r < 0.35 ? '#3e2a1d' : r < 0.75 ? '#6f513b' : '#7b5f47';
    bCtx.fillRect(x, y, w, h);
  }

  const barkMap = new THREE.CanvasTexture(barkCanvas);
  barkMap.colorSpace = THREE.SRGBColorSpace;
  barkMap.wrapS = THREE.RepeatWrapping;
  barkMap.wrapT = THREE.RepeatWrapping;
  barkMap.repeat.set(2, 3);
  barkMap.anisotropy = effectiveAniso;

  const barkSize = detailDataSize;
  const barkHeights = new Float32Array(barkSize * barkSize);
  for (let y = 0; y < barkSize; y++) {
    const v = y / barkSize;
    for (let x = 0; x < barkSize; x++) {
      const u = x / barkSize;
      // Vertically elongated bark ridges
      const furrow = periodicFbm(u, v * 0.35, 12, 3, 309);
      const ridge = Math.abs(Math.sin(u * Math.PI * 14 + furrow * 3.2));
      barkHeights[y * barkSize + x] = furrow * 0.55 + ridge * 0.45;
    }
  }
  const barkNormalMap = heightFieldToNormalTexture(
    barkSize,
    barkHeights,
    4.2,
    2,
    3,
    effectiveAniso,
  );

  // 3. Weathered Granite Rock Albedo + Normal + Roughness
  const rockCanvas = document.createElement('canvas');
  rockCanvas.width = detailCanvasSize;
  rockCanvas.height = detailCanvasSize;
  const rCtx = rockCanvas.getContext('2d')!;
  rCtx.fillStyle = '#7e837f';
  rCtx.fillRect(0, 0, detailCanvasSize, detailCanvasSize);

  const rockSpecks = Math.round(3200 * (0.35 + 0.65 * detailScale));
  for (let i = 0; i < rockSpecks; i++) {
    const x = Math.random() * detailCanvasSize;
    const y = Math.random() * detailCanvasSize;
    const s = (2 + Math.random() * 8) * Math.max(0.65, detailScale);
    const tone = Math.random();
    rCtx.fillStyle =
      tone < 0.34
        ? 'rgba(64, 68, 67, 0.48)'
        : tone < 0.72
          ? 'rgba(154, 158, 150, 0.4)'
          : 'rgba(94, 114, 84, 0.3)';
    rCtx.fillRect(x, y, s, s);
  }

  const rockMap = new THREE.CanvasTexture(rockCanvas);
  rockMap.colorSpace = THREE.SRGBColorSpace;
  rockMap.wrapS = THREE.RepeatWrapping;
  rockMap.wrapT = THREE.RepeatWrapping;
  rockMap.repeat.set(2, 2);
  rockMap.anisotropy = effectiveAniso;

  const rockSize = detailDataSize;
  const rockHeights = new Float32Array(rockSize * rockSize);
  const rockRoughField = new Float32Array(rockSize * rockSize);
  for (let y = 0; y < rockSize; y++) {
    const v = y / rockSize;
    for (let x = 0; x < rockSize; x++) {
      const u = x / rockSize;
      const base = periodicFbm(u, v, 6, 4, 419);
      const cracks = Math.abs(base - 0.5) * 2.0;
      const h = base * 0.65 + cracks * 0.35;
      rockHeights[y * rockSize + x] = h;
      rockRoughField[y * rockSize + x] = 1.0 - cracks * 0.55;
    }
  }
  const rockNormalMap = heightFieldToNormalTexture(
    rockSize,
    rockHeights,
    3.6,
    2,
    2,
    effectiveAniso,
  );
  const rockRoughnessMap = grayscaleFieldToDataTexture(
    rockSize,
    rockRoughField,
    0.62,
    0.94,
    2,
    2,
    effectiveAniso,
  );

  // 4. Subtle Village Stucco Plaster Normal Map
  const plasterSize = detailDataSize;
  const plasterHeights = new Float32Array(plasterSize * plasterSize);
  for (let y = 0; y < plasterSize; y++) {
    const v = y / plasterSize;
    for (let x = 0; x < plasterSize; x++) {
      const u = x / plasterSize;
      plasterHeights[y * plasterSize + x] = periodicFbm(u, v, 10, 3, 521);
    }
  }
  const plasterNormalMap = heightFieldToNormalTexture(
    plasterSize,
    plasterHeights,
    1.35,
    2,
    2,
    effectiveAniso,
  );

  // 5. Tileable Water Ripple Normal Map (smooth multi-wave interference)
  const waterSize = waterDataSize;
  const waterHeights = new Float32Array(waterSize * waterSize);
  for (let y = 0; y < waterSize; y++) {
    const v = y / waterSize;
    for (let x = 0; x < waterSize; x++) {
      const u = x / waterSize;
      const w1 = Math.sin((u * 4 + v * 2) * Math.PI * 2) * 0.25;
      const w2 = Math.cos((u * 3 - v * 5) * Math.PI * 2) * 0.22;
      const w3 = Math.sin((u * 7 + v * 6) * Math.PI * 2) * 0.14;
      const f = periodicFbm(u, v, 8, 3, 643) * 0.45;
      waterHeights[y * waterSize + x] = (w1 + w2 + w3) * 0.5 + f;
    }
  }
  const waterNormalMap = heightFieldToNormalTexture(
    waterSize,
    waterHeights,
    2.4,
    48,
    48,
    effectiveAniso,
  );

  // 6. Soft Radial Contact Shadow Texture
  let contactShadowMap: THREE.CanvasTexture;
  if (reuseContactShadow) {
    contactShadowMap = reuseContactShadow;
  } else {
    const shadowSize = textureQuality === 'low' ? 64 : 128;
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowSize;
    shadowCanvas.height = shadowSize;
    const sCtx = shadowCanvas.getContext('2d')!;
    const halfShadow = shadowSize * 0.5;
    const grad = sCtx.createRadialGradient(
      halfShadow,
      halfShadow,
      shadowSize * 0.045,
      halfShadow,
      halfShadow,
      shadowSize * 0.48,
    );
    grad.addColorStop(0, 'rgba(10, 18, 12, 0.56)');
    grad.addColorStop(0.55, 'rgba(10, 18, 12, 0.22)');
    grad.addColorStop(1, 'rgba(10, 18, 12, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, shadowSize, shadowSize);

    contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
    contactShadowMap.colorSpace = THREE.SRGBColorSpace;
  }

  const disposeWorldMaps = () => {
    grassMap.dispose();
    grassNormalMap.dispose();
    grassRoughnessMap.dispose();
    sandMap.dispose();
    sandNormalMap.dispose();
    sandRoughnessMap.dispose();
    barkMap.dispose();
    barkNormalMap.dispose();
    rockMap.dispose();
    rockNormalMap.dispose();
    rockRoughnessMap.dispose();
    plasterNormalMap.dispose();
    waterNormalMap.dispose();
  };

  return {
    grassMap,
    grassNormalMap,
    grassRoughnessMap,
    sandMap,
    sandNormalMap,
    sandRoughnessMap,
    barkMap,
    barkNormalMap,
    rockMap,
    rockNormalMap,
    rockRoughnessMap,
    plasterNormalMap,
    waterNormalMap,
    contactShadowMap,
    disposeWorldMaps,
    dispose: () => {
      disposeWorldMaps();
      contactShadowMap.dispose();
    },
  };
}
