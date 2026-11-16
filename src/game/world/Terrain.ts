import * as THREE from 'three';
import {
  WORLD_SIZE,
  PLAYABLE_RADIUS,
  groundHeightAt,
  groundSlopeAt,
  seededRandom,
} from '../math/noise';

export interface TerrainSystem {
  terrainMesh: THREE.Mesh;
  grassMesh: THREE.InstancedMesh;
  update: (elapsed: number) => void;
  dispose: () => void;
}

export function createTerrainAndGrass(
  scene: THREE.Scene,
  grassTexture: THREE.CanvasTexture,
): TerrainSystem {
  // 1. Displaced 3D Terrain Mesh with vertex-colored elevation & slope blending
  const segments = 160;
  const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const colors = new Float32Array(vertexCount * 3);

  const meadowColor = new THREE.Color(0x699b4c);
  const lushColor = new THREE.Color(0x52843c);
  const trailColor = new THREE.Color(0x9a8c62);
  const cliffColor = new THREE.Color(0x6d726e);
  const highPeakColor = new THREE.Color(0x949a96);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    const slope = groundSlopeAt(x, z);
    const dist = Math.hypot(x, z);

    // Base meadow vs lush grass variation
    const patch = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.5 + 0.5;
    tmpColor.copy(meadowColor).lerp(lushColor, patch);

    // Subtle sunlit dirt path tint near spawn & valley floor
    const pathWave = Math.sin(x * 0.028) * 18 + Math.cos(z * 0.02) * 10;
    const distToPath = Math.abs(z - pathWave * 0.45);
    if (dist < 130 && distToPath < 7.5 && slope < 0.14) {
      const pathAlpha = (1 - distToPath / 7.5) * 0.55;
      tmpColor.lerp(trailColor, pathAlpha);
    }

    // Steep slopes & mountain rim rock blending
    const rockMask = THREE.MathUtils.smoothstep(slope, 0.14, 0.34);
    tmpColor.lerp(cliffColor, rockMask);

    if (y > 16) {
      const peakMask = THREE.MathUtils.smoothstep(y, 16, 36);
      tmpColor.lerp(highPeakColor, peakMask * 0.75);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: grassTexture,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  scene.add(terrainMesh);

  // 2. Instanced Grass Blades across the walkable meadow
  const grassCount = 7200;
  const bladeGeo = createGrassClusterGeometry();
  const windUniforms = { uTime: { value: 0 } };

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float bladeHeightMask = clamp(position.y / 0.55, 0.0, 1.0);
        #ifdef USE_INSTANCING
          vec4 instPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 2.1 + instPos.x * 0.32 + instPos.z * 0.28) * 0.12;
          float gust = cos(uTime * 1.15 + instPos.x * 0.12 - instPos.z * 0.14) * 0.06;
          transformed.x += (sway + gust) * bladeHeightMask * bladeHeightMask;
          transformed.z += (sway * 0.5) * bladeHeightMask * bladeHeightMask;
        #endif
        `,
      );
  };

  const grassMesh = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
  grassMesh.castShadow = false;
  grassMesh.receiveShadow = true;

  const rand = seededRandom(847291);
  const dummy = new THREE.Object3D();
  const instanceColor = new THREE.Color();

  let placed = 0;
  let attempts = 0;
  while (placed < grassCount && attempts < grassCount * 4) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const radius = Math.sqrt(rand()) * (PLAYABLE_RADIUS - 14);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const slope = groundSlopeAt(x, z);
    if (slope > 0.16) continue;

    // Leave the winding footpath slightly sparser so the path reads clearly
    const pathWave = Math.sin(x * 0.028) * 18 + Math.cos(z * 0.02) * 10;
    if (Math.abs(z - pathWave * 0.45) < 2.2 && rand() < 0.78) continue;

    const y = groundHeightAt(x, z);
    dummy.position.set(x, y - 0.03, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    const scaleXZ = 0.78 + rand() * 0.55;
    const scaleY = 0.72 + rand() * 0.75;
    dummy.scale.set(scaleXZ, scaleY, scaleXZ);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(placed, dummy.matrix);

    const tint = 0.85 + rand() * 0.3;
    instanceColor.setRGB(0.36 * tint, 0.58 * tint, 0.24 * tint);
    grassMesh.setColorAt(placed, instanceColor);
    placed++;
  }

  grassMesh.count = placed;
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  grassMesh.computeBoundingSphere();
  scene.add(grassMesh);

  return {
    terrainMesh,
    grassMesh,
    update: (elapsed: number) => {
      windUniforms.uTime.value = elapsed;
    },
    dispose: () => {
      terrainGeo.dispose();
      terrainMat.dispose();
      bladeGeo.dispose();
      grassMat.dispose();
    },
  };
}

/**
 * Creates a crisp 3-blade crossed grass tuft geometry pivoted at bottom-center (y = 0).
 */
function createGrassClusterGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const bladeConfigs = [
    { angle: 0, lean: 0.08, height: 0.52, width: 0.09 },
    { angle: (Math.PI * 2) / 3, lean: 0.11, height: 0.45, width: 0.085 },
    { angle: (Math.PI * 4) / 3, lean: 0.09, height: 0.56, width: 0.085 },
  ];

  let vertOffset = 0;
  for (const cfg of bladeConfigs) {
    const cos = Math.cos(cfg.angle);
    const sin = Math.sin(cfg.angle);
    const hw = cfg.width * 0.5;

    // 5 vertices forming a tapered 2-segment grass blade
    const pts = [
      [-hw, 0, 0],
      [hw, 0, 0],
      [-hw * 0.55, cfg.height * 0.5, cfg.lean * 0.4],
      [hw * 0.55, cfg.height * 0.5, cfg.lean * 0.4],
      [0, cfg.height, cfg.lean],
    ];

    for (let i = 0; i < pts.length; i++) {
      const [lx, ly, lz] = pts[i];
      const wx = lx * cos - lz * sin;
      const wz = lx * sin + lz * cos;
      positions.push(wx, ly, wz);
      normals.push(0, 1, 0);
      uvs.push(i % 2, ly / cfg.height);
    }

    indices.push(
      vertOffset + 0,
      vertOffset + 1,
      vertOffset + 2,
      vertOffset + 1,
      vertOffset + 3,
      vertOffset + 2,
      vertOffset + 2,
      vertOffset + 3,
      vertOffset + 4,
    );
    vertOffset += 5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
