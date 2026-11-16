import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import type { InteractableInfo, WorldCollider, WorldLandmark } from '../types';
import {
  PLAYABLE_RADIUS,
  groundHeightAt,
  groundSlopeAt,
  seededRandom,
} from '../math/noise';
import {
  findNearestValidResourceLocation,
  isLand,
  isNearWater,
  isValidResourceLocation,
} from './WorldPlacementValidator';

export interface WorldInteractable extends InteractableInfo {
  x: number;
  y: number;
  z: number;
  radius: number;
  collected: boolean;
  meshGroup?: THREE.Group;
  message: string;
}

export interface EnvironmentSystem {
  colliders: WorldCollider[];
  interactables: WorldInteractable[];
  landmarks: WorldLandmark[];
  dispose: () => void;
}

/**
 * Generates composite multi-part trees (pine & broadleaf oak), weathered rock outcrops,
 * scenic valley stone cairns, trail signposts, and gatherable meadow herbs using InstancedMesh
 * and lightweight groups, while registering exact physical colliders and interactables.
 */
export function createEnvironmentProps(
  scene: THREE.Scene,
  barkMap: THREE.CanvasTexture,
  rockMap: THREE.CanvasTexture,
): EnvironmentSystem {
  const colliders: WorldCollider[] = [];
  const interactables: WorldInteractable[] = [];
  const landmarks: WorldLandmark[] = [
    {
      id: 'spawn-glade',
      name: 'Sunlit Glade',
      kind: 'spawn',
      x: 0,
      z: 4,
      discovered: true,
    },
  ];
  const disposables: { dispose: () => void }[] = [];
  const rand = seededRandom(519234);

  // Materials
  const barkMat = new THREE.MeshStandardMaterial({
    map: barkMap,
    color: 0x8b6b52,
    roughness: 0.92,
    metalness: 0.02,
  });

  const pineNeedleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0.02,
  });

  const oakFoliageMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.02,
  });

  const rockMat = new THREE.MeshStandardMaterial({
    map: rockMap,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
  });

  const mossAccentMat = new THREE.MeshStandardMaterial({
    color: 0x547843,
    roughness: 0.95,
    metalness: 0.0,
  });

  const plankMat = new THREE.MeshStandardMaterial({
    color: 0x8d6747,
    roughness: 0.86,
    metalness: 0.02,
  });

  const herbBloomMat = new THREE.MeshStandardMaterial({
    color: 0xf4c95d,
    emissive: 0x6b4f12,
    emissiveIntensity: 0.25,
    roughness: 0.55,
  });

  disposables.push(
    barkMat,
    pineNeedleMat,
    oakFoliageMat,
    rockMat,
    mossAccentMat,
    plankMat,
    herbBloomMat,
  );

  // --- 1. Multi-Part Pine Tree Geometries ---
  const pineTrunkGeo = createPineTrunkGeometry();
  const pineCanopyGeo = createPineCanopyGeometry();
  disposables.push(pineTrunkGeo, pineCanopyGeo);

  // --- 2. Multi-Part Broadleaf Oak Tree Geometries ---
  const oakTrunkGeo = createOakTrunkGeometry();
  const oakCanopyGeo = createOakCanopyGeometry();
  disposables.push(oakTrunkGeo, oakCanopyGeo);

  // --- 3. Multi-Part Rock Outcrop Geometries ---
  const rockClusterGeo = createRockOutcropGeometry();
  const rockMossGeo = createRockMossCapGeometry();
  disposables.push(rockClusterGeo, rockMossGeo);

  // Scatter Trees (Pine & Oak)
  const pineMax = 140;
  const oakMax = 75;
  const rockMax = 110;

  const pineTrunks = new THREE.InstancedMesh(pineTrunkGeo, barkMat, pineMax);
  const pineCanopies = new THREE.InstancedMesh(pineCanopyGeo, pineNeedleMat, pineMax);
  const oakTrunks = new THREE.InstancedMesh(oakTrunkGeo, barkMat, oakMax);
  const oakCanopies = new THREE.InstancedMesh(oakCanopyGeo, oakFoliageMat, oakMax);
  const rockBodies = new THREE.InstancedMesh(rockClusterGeo, rockMat, rockMax);
  const rockMosses = new THREE.InstancedMesh(rockMossGeo, mossAccentMat, rockMax);

  for (const m of [
    pineTrunks,
    pineCanopies,
    oakTrunks,
    oakCanopies,
    rockBodies,
    rockMosses,
  ]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const occupiedSpots: Array<{ x: number; z: number; r: number }> = [
    // Keep immediate spawn glade & interactive trail spots clear
    { x: 0, z: 0, r: 10.5 },
    { x: -10, z: 8, r: 3.5 },
    { x: 34, z: -28, r: 3.5 },
  ];

  const isSpotFree = (x: number, z: number, minDist: number): boolean => {
    for (const s of occupiedSpots) {
      const dx = x - s.x;
      const dz = z - s.z;
      if (dx * dx + dz * dz < (minDist + s.r) * (minDist + s.r)) {
        return false;
      }
    }
    return true;
  };

  // Place Pine Trees
  let pineCount = 0;
  for (let attempt = 0; attempt < pineMax * 8 && pineCount < pineMax; attempt++) {
    const angle = rand() * Math.PI * 2;
    const dist = 16 + Math.sqrt(rand()) * (PLAYABLE_RADIUS - 12);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (!isLand(x, z, 0.9) || isNearWater(x, z, 4.5)) continue;
    if (groundSlopeAt(x, z) > 0.25) continue;
    if (!isSpotFree(x, z, 4.2)) continue;

    const y = groundHeightAt(x, z);
    const scale = 0.85 + rand() * 0.45;
    dummy.position.set(x, y - 0.12, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * (0.94 + rand() * 0.18), scale);
    dummy.updateMatrix();

    pineTrunks.setMatrixAt(pineCount, dummy.matrix);
    pineCanopies.setMatrixAt(pineCount, dummy.matrix);

    const gTint = 0.86 + rand() * 0.26;
    color.setRGB(0.18 * gTint, 0.38 * gTint, 0.22 * gTint);
    pineCanopies.setColorAt(pineCount, color);

    occupiedSpots.push({ x, z, r: 2.2 * scale });
    colliders.push({
      kind: 'cylinder',
      x,
      z,
      radius: 0.56 * scale,
      minY: y - 0.5,
      maxY: y + 6.5 * scale,
    });
    pineCount++;
  }

  // Place Broadleaf Oak Trees
  let oakCount = 0;
  for (let attempt = 0; attempt < oakMax * 8 && oakCount < oakMax; attempt++) {
    const angle = rand() * Math.PI * 2;
    const dist = 14 + Math.sqrt(rand()) * (PLAYABLE_RADIUS - 26);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (!isLand(x, z, 0.9) || isNearWater(x, z, 5.0)) continue;
    if (groundSlopeAt(x, z) > 0.19) continue;
    if (!isSpotFree(x, z, 5.2)) continue;

    const y = groundHeightAt(x, z);
    const scale = 0.85 + rand() * 0.35;
    dummy.position.set(x, y - 0.1, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();

    oakTrunks.setMatrixAt(oakCount, dummy.matrix);
    oakCanopies.setMatrixAt(oakCount, dummy.matrix);

    const shade = 0.88 + rand() * 0.26;
    color.setRGB(0.28 * shade, 0.52 * shade, 0.23 * shade);
    oakCanopies.setColorAt(oakCount, color);

    occupiedSpots.push({ x, z, r: 2.8 * scale });
    colliders.push({
      kind: 'cylinder',
      x,
      z,
      radius: 0.68 * scale,
      minY: y - 0.5,
      maxY: y + 5.5 * scale,
    });
    oakCount++;
  }

  // Place Weathered Rock Outcrops
  let rockCount = 0;
  for (let attempt = 0; attempt < rockMax * 8 && rockCount < rockMax; attempt++) {
    const angle = rand() * Math.PI * 2;
    const dist = 11 + Math.sqrt(rand()) * (PLAYABLE_RADIUS - 8);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (!isLand(x, z, 0.75) || isNearWater(x, z, 3.5)) continue;
    if (groundSlopeAt(x, z) > 0.36) continue;
    if (!isSpotFree(x, z, 3.0)) continue;

    const y = groundHeightAt(x, z);
    const scale = 0.72 + rand() * 1.15;
    dummy.position.set(x, y - 0.16 * scale, z);
    dummy.rotation.set(
      (rand() - 0.5) * 0.16,
      rand() * Math.PI * 2,
      (rand() - 0.5) * 0.16,
    );
    dummy.scale.set(
      scale * (0.9 + rand() * 0.25),
      scale * (0.78 + rand() * 0.35),
      scale * (0.9 + rand() * 0.25),
    );
    dummy.updateMatrix();

    rockBodies.setMatrixAt(rockCount, dummy.matrix);
    rockMosses.setMatrixAt(rockCount, dummy.matrix);

    const rockTone = 0.82 + rand() * 0.28;
    color.setRGB(0.55 * rockTone, 0.57 * rockTone, 0.55 * rockTone);
    rockBodies.setColorAt(rockCount, color);

    occupiedSpots.push({ x, z, r: 1.6 * scale });
    colliders.push({
      kind: 'sphere',
      x,
      y: y + 0.55 * scale,
      z,
      radius: 1.32 * scale,
    });
    rockCount++;
  }

  const meshes: THREE.InstancedMesh[] = [
    pineTrunks,
    pineCanopies,
    oakTrunks,
    oakCanopies,
    rockBodies,
    rockMosses,
  ];
  const counts = [pineCount, pineCount, oakCount, oakCount, rockCount, rockCount];

  meshes.forEach((mesh, idx) => {
    mesh.count = counts[idx];
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  });

  // Landmark Stone Waymarker Cairn near starting glade
  const cairnX = 12.5;
  const cairnZ = -14.0;
  const cairnY = groundHeightAt(cairnX, cairnZ);
  const cairn = createLandmarkCairn(rockMat, mossAccentMat, disposables);
  cairn.position.set(cairnX, cairnY - 0.06, cairnZ);
  scene.add(cairn);
  colliders.push({
    kind: 'cylinder',
    x: cairnX,
    z: cairnZ,
    radius: 1.15,
    minY: cairnY - 0.5,
    maxY: cairnY + 2.8,
  });
  interactables.push({
    id: 'cairn-glade',
    label: 'Trail Cairn',
    actionVerb: 'Inspect',
    kind: 'cairn',
    x: cairnX,
    y: cairnY,
    z: cairnZ,
    radius: 3.4,
    collected: false,
    message: 'Ancient Trail Cairn: "Follow the winding ridge paths to explore the valley."',
  });
  landmarks.push({
    id: 'cairn-glade',
    name: 'Trail Cairn',
    kind: 'cairn',
    x: cairnX,
    z: cairnZ,
    discovered: false,
  });

  // Wooden Trail Signposts
  const signConfigs = [
    {
      id: 'sign-west',
      label: 'Glade Signpost',
      x: -10.0,
      z: 8.0,
      rotY: 0.7,
      message: 'North Ridge Trail · Watch your footing on steep granite slopes.',
    },
    {
      id: 'sign-east',
      label: 'Overlook Signpost',
      x: 34.0,
      z: -28.0,
      rotY: -0.9,
      message: 'Emerald Overlook · High cliffs frame the eastern valley rim.',
    },
  ];

  for (const cfg of signConfigs) {
    const sy = groundHeightAt(cfg.x, cfg.z);
    const signGroup = createTrailSignpost(barkMat, plankMat, disposables);
    signGroup.position.set(cfg.x, sy - 0.04, cfg.z);
    signGroup.rotation.y = cfg.rotY;
    scene.add(signGroup);
    colliders.push({
      kind: 'cylinder',
      x: cfg.x,
      z: cfg.z,
      radius: 0.42,
      minY: sy - 0.5,
      maxY: sy + 2.2,
    });
    interactables.push({
      id: cfg.id,
      label: cfg.label,
      actionVerb: 'Read',
      kind: 'signpost',
      x: cfg.x,
      y: sy,
      z: cfg.z,
      radius: 3.2,
      collected: false,
      message: cfg.message,
    });
    landmarks.push({
      id: cfg.id,
      name: cfg.label,
      kind: 'signpost',
      x: cfg.x,
      z: cfg.z,
      discovered: false,
    });
  }

  // Gatherable Meadow Herbs
  const herbCoords = [
    { id: 'herb-1', x: -6.5, z: -7.5 },
    { id: 'herb-2', x: 18.0, z: 12.0 },
    { id: 'herb-3', x: -25.0, z: -18.0 },
    { id: 'herb-4', x: 32.0, z: 19.0 },
    { id: 'herb-5', x: -42.0, z: 34.0 },
  ];

  for (const hc of herbCoords) {
    const safeSpot = isValidResourceLocation(hc.x, hc.z, 'meadow-herb')
      ? { x: hc.x, y: groundHeightAt(hc.x, hc.z), z: hc.z }
      : findNearestValidResourceLocation(hc.x, hc.z, 'meadow-herb');
    if (!safeSpot) continue;
    const hy = safeSpot.y;
    const herbGroup = createHerbCluster(mossAccentMat, herbBloomMat, disposables);
    herbGroup.position.set(safeSpot.x, hy - 0.02, safeSpot.z);
    scene.add(herbGroup);
    interactables.push({
      id: hc.id,
      label: 'Meadow Herb',
      actionVerb: 'Gather',
      kind: 'herb',
      x: safeSpot.x,
      y: hy,
      z: safeSpot.z,
      radius: 2.9,
      collected: false,
      meshGroup: herbGroup,
      message: 'Gathered Meadow Herb (+15 Health, added to Explorer Pack).',
    });
    landmarks.push({
      id: hc.id,
      name: 'Meadow Herb Patch',
      kind: 'herb',
      x: safeSpot.x,
      z: safeSpot.z,
      discovered: false,
    });
  }

  return {
    colliders,
    interactables,
    landmarks,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

function createPineTrunkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Main tapered trunk (bottom-center at y=0)
  const trunk = new THREE.CylinderGeometry(0.18, 0.38, 4.4, 8);
  trunk.translate(0, 2.2, 0);
  parts.push(trunk);

  // 3 root buttress flares at base
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3 + 0.3;
    const root = new THREE.ConeGeometry(0.24, 0.85, 5);
    root.rotateZ(0.55);
    root.rotateY(angle);
    root.translate(Math.cos(angle) * 0.24, 0.3, Math.sin(angle) * 0.24);
    parts.push(root);
  }

  return BufferGeometryUtils.mergeGeometries(parts, false);
}

function createPineCanopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const tier1 = new THREE.ConeGeometry(1.95, 2.5, 9);
  tier1.translate(0, 3.25, 0);
  parts.push(tier1);

  const tier2 = new THREE.ConeGeometry(1.52, 2.35, 9);
  tier2.rotateY(0.35);
  tier2.translate(0, 4.6, 0);
  parts.push(tier2);

  const tier3 = new THREE.ConeGeometry(1.05, 2.1, 8);
  tier3.rotateY(0.7);
  tier3.translate(0, 5.95, 0);
  parts.push(tier3);

  return BufferGeometryUtils.mergeGeometries(parts, false);
}

function createOakTrunkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const base = new THREE.CylinderGeometry(0.34, 0.54, 2.8, 8);
  base.translate(0, 1.4, 0);
  parts.push(base);

  const branchA = new THREE.CylinderGeometry(0.14, 0.26, 2.0, 6);
  branchA.rotateZ(0.52);
  branchA.translate(-0.52, 3.0, 0.15);
  parts.push(branchA);

  const branchB = new THREE.CylinderGeometry(0.13, 0.24, 1.85, 6);
  branchB.rotateZ(-0.48);
  branchB.rotateY(0.9);
  branchB.translate(0.45, 2.95, -0.25);
  parts.push(branchB);

  return BufferGeometryUtils.mergeGeometries(parts, false);
}

function createOakCanopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const crownMain = new THREE.IcosahedronGeometry(1.85, 1);
  crownMain.scale(1.15, 0.88, 1.1);
  crownMain.translate(0, 4.35, 0);
  parts.push(crownMain);

  const crownLeft = new THREE.IcosahedronGeometry(1.25, 1);
  crownLeft.translate(-1.25, 3.75, 0.45);
  parts.push(crownLeft);

  const crownRight = new THREE.IcosahedronGeometry(1.3, 1);
  crownRight.translate(1.15, 3.85, -0.55);
  parts.push(crownRight);

  const crownTop = new THREE.IcosahedronGeometry(1.15, 1);
  crownTop.translate(0.15, 5.35, 0.2);
  parts.push(crownTop);

  return BufferGeometryUtils.mergeGeometries(parts, false);
}

function createRockOutcropGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const mainRock = displaceRock(new THREE.DodecahedronGeometry(1.18, 1), 0.18, 11);
  mainRock.scale(1.15, 0.85, 0.95);
  mainRock.translate(0, 0.68, 0);
  parts.push(mainRock);

  const sideStone = displaceRock(new THREE.DodecahedronGeometry(0.68, 0), 0.14, 29);
  sideStone.scale(1.1, 0.72, 1.0);
  sideStone.translate(0.82, 0.36, 0.42);
  parts.push(sideStone);

  const backStone = displaceRock(new THREE.DodecahedronGeometry(0.56, 0), 0.12, 47);
  backStone.translate(-0.74, 0.3, -0.45);
  parts.push(backStone);

  return BufferGeometryUtils.mergeGeometries(parts, false);
}

function createRockMossCapGeometry(): THREE.BufferGeometry {
  const cap = new THREE.SphereGeometry(0.75, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
  cap.scale(1.08, 0.38, 0.9);
  cap.translate(0, 1.24, 0);
  return cap;
}

function displaceRock(
  geo: THREE.BufferGeometry,
  amount: number,
  seedOffset: number,
): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      Math.sin(x * 3.1 + seedOffset) *
      Math.cos(y * 2.7 - seedOffset) *
      Math.sin(z * 3.5 + seedOffset * 0.5);
    const factor = 1 + n * amount;
    pos.setXYZ(i, x * factor, y * factor, z * factor);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Multi-part stacked trail stone cairn near the starting meadow.
 */
function createLandmarkCairn(
  rockMat: THREE.Material,
  mossMat: THREE.Material,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const group = new THREE.Group();

  const plinthGeo = new THREE.CylinderGeometry(0.92, 1.15, 0.48, 7);
  const plinth = new THREE.Mesh(plinthGeo, rockMat);
  plinth.position.y = 0.24;
  plinth.castShadow = true;
  plinth.receiveShadow = true;

  const midGeo = new THREE.CylinderGeometry(0.62, 0.84, 0.72, 7);
  const mid = new THREE.Mesh(midGeo, rockMat);
  mid.position.y = 0.82;
  mid.rotation.y = 0.35;
  mid.castShadow = true;
  mid.receiveShadow = true;

  const upperGeo = new THREE.DodecahedronGeometry(0.46, 0);
  const upper = new THREE.Mesh(upperGeo, rockMat);
  upper.scale.set(1.0, 0.8, 1.0);
  upper.position.y = 1.44;
  upper.castShadow = true;

  const finialGeo = new THREE.ConeGeometry(0.28, 0.58, 6);
  const finial = new THREE.Mesh(finialGeo, rockMat);
  finial.position.y = 1.98;
  finial.castShadow = true;

  const mossGeo = new THREE.CylinderGeometry(0.95, 0.98, 0.08, 7);
  const moss = new THREE.Mesh(mossGeo, mossMat);
  moss.position.y = 0.49;
  moss.receiveShadow = true;

  disposables.push(plinthGeo, midGeo, upperGeo, finialGeo, mossGeo);
  group.add(plinth, mid, upper, finial, moss);
  return group;
}

function createTrailSignpost(
  postMat: THREE.Material,
  boardMat: THREE.Material,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const group = new THREE.Group();

  const postGeo = new THREE.CylinderGeometry(0.08, 0.11, 1.85, 7);
  const post = new THREE.Mesh(postGeo, postMat);
  post.position.y = 0.92;
  post.castShadow = true;

  const boardGeo = new THREE.BoxGeometry(0.92, 0.34, 0.08);
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.set(0.12, 1.54, 0);
  board.rotation.z = 0.04;
  board.castShadow = true;

  const capGeo = new THREE.ConeGeometry(0.14, 0.16, 4);
  const cap = new THREE.Mesh(capGeo, boardMat);
  cap.position.y = 1.9;
  cap.rotation.y = Math.PI * 0.25;

  disposables.push(postGeo, boardGeo, capGeo);
  group.add(post, board, cap);
  return group;
}

function createHerbCluster(
  leafMat: THREE.Material,
  bloomMat: THREE.Material,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const group = new THREE.Group();

  const leafGeo = new THREE.ConeGeometry(0.28, 0.42, 6);
  const bloomGeo = new THREE.DodecahedronGeometry(0.11, 0);
  disposables.push(leafGeo, bloomGeo);

  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const rx = Math.cos(angle) * 0.22;
    const rz = Math.sin(angle) * 0.22;

    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(rx, 0.21, rz);
    leaf.rotation.z = (i - 1) * 0.18;
    leaf.castShadow = true;

    const bloom = new THREE.Mesh(bloomGeo, bloomMat);
    bloom.position.set(rx * 1.15, 0.45, rz * 1.15);

    group.add(leaf, bloom);
  }

  return group;
}
