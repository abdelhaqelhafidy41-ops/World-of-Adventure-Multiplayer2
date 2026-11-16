import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeightAt } from '../math/noise';
import type { ProceduralTextureSet } from './textures';

export interface VillageMaterialPalette {
  plasterCream: THREE.MeshStandardMaterial;
  plasterOchre: THREE.MeshStandardMaterial;
  plasterSage: THREE.MeshStandardMaterial;
  timberDark: THREE.MeshStandardMaterial;
  timberWarm: THREE.MeshStandardMaterial;
  stoneCobble: THREE.MeshStandardMaterial;
  stoneFoundation: THREE.MeshStandardMaterial;
  roadGravel: THREE.MeshStandardMaterial;
  roofTerracotta: THREE.MeshStandardMaterial;
  roofSlate: THREE.MeshStandardMaterial;
  roofCedar: THREE.MeshStandardMaterial;
  windowGlow: THREE.MeshStandardMaterial;
  lanternGlow: THREE.MeshStandardMaterial;
  ironDark: THREE.MeshStandardMaterial;
  awningAmber: THREE.MeshStandardMaterial;
  awningCrimson: THREE.MeshStandardMaterial;
  awningTeal: THREE.MeshStandardMaterial;
  soilTilled: THREE.MeshStandardMaterial;
  wheatGold: THREE.MeshStandardMaterial;
  cropLeaf: THREE.MeshStandardMaterial;
  hayGold: THREE.MeshStandardMaterial;
  wellWater: THREE.MeshStandardMaterial;
  foliageOak: THREE.MeshStandardMaterial;
  foliageOrchard: THREE.MeshStandardMaterial;
  flowerAccent: THREE.MeshStandardMaterial;
  sandstonePlaster: THREE.MeshStandardMaterial;
  adobeClay: THREE.MeshStandardMaterial;
  sandRoad: THREE.MeshStandardMaterial;
  palmFrond: THREE.MeshStandardMaterial;
  oasisWater: THREE.MeshStandardMaterial;
}

export interface HouseSpec {
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  wallTone: 'cream' | 'ochre' | 'sage';
  roofTone: 'terracotta' | 'slate' | 'cedar';
  hasChimney?: boolean;
  chimneySide?: -1 | 1;
  hasPorch?: boolean;
}

export interface ShopSpec extends HouseSpec {
  awningTone: 'amber' | 'crimson' | 'teal';
  signColor?: number;
}

export type DecorativePropKind =
  | 'barrel'
  | 'crate'
  | 'bench'
  | 'planter'
  | 'haybale'
  | 'woodpile'
  | 'noticeboard'
  | 'scarecrow'
  | 'signpost'
  | 'cart';

export function createVillageMaterialPalette(
  textures: ProceduralTextureSet,
  disposables: Array<{ dispose: () => void }>,
): VillageMaterialPalette {
  const palette: VillageMaterialPalette = {
    plasterCream: new THREE.MeshStandardMaterial({
      color: 0xeae0cb,
      normalMap: textures.plasterNormalMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 0.88,
      metalness: 0.02,
    }),
    plasterOchre: new THREE.MeshStandardMaterial({
      color: 0xd9bc8c,
      normalMap: textures.plasterNormalMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 0.88,
      metalness: 0.02,
    }),
    plasterSage: new THREE.MeshStandardMaterial({
      color: 0xc5cfb8,
      normalMap: textures.plasterNormalMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 0.88,
      metalness: 0.02,
    }),
    timberDark: new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(0.65, 0.65),
      color: 0x5d412d,
      roughness: 0.86,
      metalness: 0.04,
    }),
    timberWarm: new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      color: 0x865d3b,
      roughness: 0.82,
      metalness: 0.04,
    }),
    stoneCobble: new THREE.MeshStandardMaterial({
      map: textures.rockMap,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: textures.rockRoughnessMap,
      color: 0x9b9b92,
      roughness: 0.9,
      metalness: 0.04,
    }),
    stoneFoundation: new THREE.MeshStandardMaterial({
      map: textures.rockMap,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: textures.rockRoughnessMap,
      color: 0x767872,
      roughness: 0.92,
      metalness: 0.04,
    }),
    roadGravel: new THREE.MeshStandardMaterial({
      map: textures.rockMap,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      color: 0xa69474,
      roughness: 0.94,
      metalness: 0.01,
    }),
    roofTerracotta: new THREE.MeshStandardMaterial({
      color: 0xa95238,
      normalMap: textures.plasterNormalMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.72,
      metalness: 0.06,
    }),
    roofSlate: new THREE.MeshStandardMaterial({
      color: 0x4b5660,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.74,
      metalness: 0.1,
    }),
    roofCedar: new THREE.MeshStandardMaterial({
      color: 0x7a4e32,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.8,
      metalness: 0.04,
    }),
    windowGlow: new THREE.MeshStandardMaterial({
      color: 0xffe4a8,
      emissive: 0xffb84d,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.18,
    }),
    lanternGlow: new THREE.MeshStandardMaterial({
      color: 0xfff0c2,
      emissive: 0xffb744,
      emissiveIntensity: 1.45,
      roughness: 0.18,
      metalness: 0.05,
    }),
    ironDark: new THREE.MeshStandardMaterial({
      color: 0x2c3034,
      roughness: 0.38,
      metalness: 0.82,
    }),
    awningAmber: new THREE.MeshStandardMaterial({
      color: 0xc97b32,
      roughness: 0.84,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    awningCrimson: new THREE.MeshStandardMaterial({
      color: 0xa63c32,
      roughness: 0.84,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    awningTeal: new THREE.MeshStandardMaterial({
      color: 0x2f756e,
      roughness: 0.84,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    soilTilled: new THREE.MeshStandardMaterial({
      color: 0x523b28,
      normalMap: textures.grassNormalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.96,
      metalness: 0.0,
    }),
    wheatGold: new THREE.MeshStandardMaterial({
      color: 0xd6b04d,
      roughness: 0.84,
      metalness: 0.02,
    }),
    cropLeaf: new THREE.MeshStandardMaterial({
      color: 0x4b873c,
      roughness: 0.82,
      metalness: 0.02,
    }),
    hayGold: new THREE.MeshStandardMaterial({
      color: 0xcfae58,
      normalMap: textures.grassNormalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.9,
      metalness: 0.01,
    }),
    wellWater: new THREE.MeshStandardMaterial({
      color: 0x2b7e91,
      normalMap: textures.waterNormalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.1,
      metalness: 0.22,
    }),
    foliageOak: new THREE.MeshStandardMaterial({
      color: 0x457b37,
      roughness: 0.8,
      metalness: 0.02,
    }),
    foliageOrchard: new THREE.MeshStandardMaterial({
      color: 0x5d8f3c,
      roughness: 0.78,
      metalness: 0.02,
    }),
    flowerAccent: new THREE.MeshStandardMaterial({
      color: 0xe68856,
      roughness: 0.68,
      metalness: 0.02,
    }),
    sandstonePlaster: new THREE.MeshStandardMaterial({
      color: 0xe3c898,
      normalMap: textures.plasterNormalMap,
      normalScale: new THREE.Vector2(0.38, 0.38),
      roughness: 0.9,
      metalness: 0.01,
    }),
    adobeClay: new THREE.MeshStandardMaterial({
      color: 0xc99c6b,
      normalMap: textures.plasterNormalMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.92,
      metalness: 0.01,
    }),
    sandRoad: new THREE.MeshStandardMaterial({
      color: 0xf4e8ce,
      map: textures.sandMap,
      normalMap: textures.sandNormalMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 0.96,
      metalness: 0.0,
    }),
    palmFrond: new THREE.MeshStandardMaterial({
      color: 0x5c8b3f,
      roughness: 0.78,
      metalness: 0.02,
    }),
    oasisWater: new THREE.MeshStandardMaterial({
      color: 0x2a8e9c,
      normalMap: textures.waterNormalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.08,
      metalness: 0.2,
    }),
  };

  Object.values(palette).forEach((m) => disposables.push(m));
  return palette;
}

function getWallMaterial(
  tone: HouseSpec['wallTone'],
  mats: VillageMaterialPalette,
): THREE.Material {
  if (tone === 'ochre') return mats.plasterOchre;
  if (tone === 'sage') return mats.plasterSage;
  return mats.plasterCream;
}

function getRoofMaterial(
  tone: HouseSpec['roofTone'],
  mats: VillageMaterialPalette,
): THREE.Material {
  if (tone === 'slate') return mats.roofSlate;
  if (tone === 'cedar') return mats.roofCedar;
  return mats.roofTerracotta;
}

function getAwningMaterial(
  tone: ShopSpec['awningTone'],
  mats: VillageMaterialPalette,
): THREE.Material {
  if (tone === 'crimson') return mats.awningCrimson;
  if (tone === 'teal') return mats.awningTeal;
  return mats.awningAmber;
}

function enableShadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
      child.frustumCulled = true;
    }
  });
}

/**
 * Reusable Component 1: Stone foundation plinth extending below local grade so
 * buildings sit flush even across undulating terrain.
 */
export function createStoneFoundationModule(
  width: number,
  depth: number,
  aboveGradeHeight: number,
  skirtBelowGrade: number,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Mesh {
  const totalH = aboveGradeHeight + skirtBelowGrade;
  const geo = new THREE.BoxGeometry(width + 0.34, totalH, depth + 0.34);
  disposables.push(geo);
  const mesh = new THREE.Mesh(geo, mats.stoneFoundation);
  mesh.position.y = aboveGradeHeight - totalH * 0.5;
  return mesh;
}

/**
 * Reusable Component 2: Timber-framed plaster wall module with corner posts & eave beams.
 */
export function createTimberWallModule(
  width: number,
  height: number,
  depth: number,
  wallMat: THREE.Material,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  const wallGeo = new THREE.BoxGeometry(width, height, depth);
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = height * 0.5;
  group.add(wall);

  const postGeo = new THREE.BoxGeometry(0.18, height + 0.04, 0.18);
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const corners = [
    [-hw, -hd],
    [hw, -hd],
    [-hw, hd],
    [hw, hd],
  ];
  for (const [cx, cz] of corners) {
    const post = new THREE.Mesh(postGeo, mats.timberDark);
    post.position.set(cx, height * 0.5, cz);
    group.add(post);
  }

  // Horizontal sill & eave timber bands
  const beamXGeo = new THREE.BoxGeometry(width + 0.2, 0.14, depth + 0.12);
  const topBeam = new THREE.Mesh(beamXGeo, mats.timberDark);
  topBeam.position.y = height - 0.05;
  const midBeam = new THREE.Mesh(beamXGeo, mats.timberDark);
  midBeam.position.y = 0.08;
  group.add(topBeam, midBeam);

  disposables.push(wallGeo, postGeo, beamXGeo);
  return group;
}

/**
 * Reusable Component 3: Pitched gabled roof prism with overhanging eaves & gable end.
 */
export function createGabledRoofModule(
  width: number,
  depth: number,
  ridgeHeight: number,
  roofMat: THREE.Material,
  gableWallMat: THREE.Material,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const overhang = 0.42;
  const slopeRun = width * 0.5 + overhang;
  const slopeLen = Math.hypot(slopeRun, ridgeHeight);
  const slopeAngle = Math.atan2(ridgeHeight, slopeRun);

  const panelGeo = new THREE.BoxGeometry(slopeLen, 0.16, depth + overhang * 2);
  const leftPanel = new THREE.Mesh(panelGeo, roofMat);
  leftPanel.position.set(-slopeRun * 0.5, ridgeHeight * 0.5, 0);
  leftPanel.rotation.z = slopeAngle;

  const rightPanel = new THREE.Mesh(panelGeo, roofMat);
  rightPanel.position.set(slopeRun * 0.5, ridgeHeight * 0.5, 0);
  rightPanel.rotation.z = -slopeAngle;

  // Ridge cap beam
  const ridgeGeo = new THREE.BoxGeometry(0.22, 0.2, depth + overhang * 2.05);
  const ridge = new THREE.Mesh(ridgeGeo, mats.timberDark);
  ridge.position.y = ridgeHeight;

  // Triangular gable end walls (front +Z and back -Z)
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-width * 0.5, 0);
  gableShape.lineTo(width * 0.5, 0);
  gableShape.lineTo(0, ridgeHeight - 0.06);
  gableShape.closePath();

  const gableGeo = new THREE.ExtrudeGeometry(gableShape, {
    depth: depth - 0.04,
    bevelEnabled: false,
  });
  gableGeo.translate(0, 0, -(depth - 0.04) * 0.5);
  const gableMesh = new THREE.Mesh(gableGeo, gableWallMat);

  disposables.push(panelGeo, ridgeGeo, gableGeo);
  group.add(leftPanel, rightPanel, ridge, gableMesh);
  return group;
}

/**
 * Reusable Component 4: Framed wooden doorway with stone step & brass handle.
 */
export function createDoorwayModule(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  const frameGeo = new THREE.BoxGeometry(1.16, 2.08, 0.14);
  const frame = new THREE.Mesh(frameGeo, mats.timberDark);
  frame.position.y = 1.04;

  const doorGeo = new THREE.BoxGeometry(0.92, 1.92, 0.16);
  const door = new THREE.Mesh(doorGeo, mats.timberWarm);
  door.position.set(0, 0.96, 0.02);

  const stepGeo = new THREE.BoxGeometry(1.4, 0.18, 0.58);
  const step = new THREE.Mesh(stepGeo, mats.stoneCobble);
  step.position.set(0, 0.06, 0.28);

  const knobGeo = new THREE.SphereGeometry(0.055, 6, 6);
  const knob = new THREE.Mesh(knobGeo, mats.hayGold);
  knob.position.set(0.32, 0.96, 0.12);

  disposables.push(frameGeo, doorGeo, stepGeo, knobGeo);
  group.add(frame, door, step, knob);
  return group;
}

/**
 * Reusable Component 5: Framed lit window with wooden sill & shutter accents.
 */
export function createWindowModule(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
  width = 0.86,
  height = 0.92,
): THREE.Group {
  const group = new THREE.Group();

  const frameGeo = new THREE.BoxGeometry(width + 0.16, height + 0.16, 0.12);
  const frame = new THREE.Mesh(frameGeo, mats.timberDark);

  const glassGeo = new THREE.BoxGeometry(width, height, 0.14);
  const glass = new THREE.Mesh(glassGeo, mats.windowGlow);

  const sillGeo = new THREE.BoxGeometry(width + 0.28, 0.1, 0.22);
  const sill = new THREE.Mesh(sillGeo, mats.timberWarm);
  sill.position.set(0, -height * 0.5 - 0.06, 0.05);

  disposables.push(frameGeo, glassGeo, sillGeo);
  group.add(frame, glass, sill);
  return group;
}

/**
 * Reusable Component 6: Stone chimney stack & cap.
 */
export function createChimneyModule(
  height: number,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const shaftGeo = new THREE.BoxGeometry(0.68, height, 0.68);
  const shaft = new THREE.Mesh(shaftGeo, mats.stoneFoundation);
  shaft.position.y = height * 0.5;

  const capGeo = new THREE.BoxGeometry(0.86, 0.18, 0.86);
  const cap = new THREE.Mesh(capGeo, mats.stoneCobble);
  cap.position.y = height + 0.06;

  disposables.push(shaftGeo, capGeo);
  group.add(shaft, cap);
  return group;
}

/**
 * Reusable Component 7: Market shopfront awning & display counter.
 */
export function createShopAwningModule(
  width: number,
  awningMat: THREE.Material,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  const canopyGeo = new THREE.BoxGeometry(width, 0.09, 1.55);
  const canopy = new THREE.Mesh(canopyGeo, awningMat);
  canopy.position.set(0, 2.38, 0.78);
  canopy.rotation.x = 0.26;

  const postGeo = new THREE.CylinderGeometry(0.065, 0.075, 2.25, 6);
  const leftPost = new THREE.Mesh(postGeo, mats.timberDark);
  leftPost.position.set(-width * 0.45, 1.12, 1.38);
  const rightPost = new THREE.Mesh(postGeo, mats.timberDark);
  rightPost.position.set(width * 0.45, 1.12, 1.38);

  const counterGeo = new THREE.BoxGeometry(width * 0.72, 0.82, 0.62);
  const counter = new THREE.Mesh(counterGeo, mats.timberWarm);
  counter.position.set(width * 0.12, 0.41, 0.96);

  const counterTopGeo = new THREE.BoxGeometry(width * 0.76, 0.08, 0.68);
  const counterTop = new THREE.Mesh(counterTopGeo, mats.plasterCream);
  counterTop.position.set(width * 0.12, 0.84, 0.96);

  disposables.push(canopyGeo, postGeo, counterGeo, counterTopGeo);
  group.add(canopy, leftPost, rightPost, counter, counterTop);
  return group;
}

/**
 * Procedural House Assembler built exclusively from reusable building modules.
 */
export function buildProceduralHouse(
  spec: HouseSpec,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const wallMat = getWallMaterial(spec.wallTone, mats);
  const roofMat = getRoofMaterial(spec.roofTone, mats);
  const baseH = 0.34;

  // 1. Stone Foundation (skirt -1.8m below grade so slopes never leave gaps)
  const foundation = createStoneFoundationModule(
    spec.width,
    spec.depth,
    baseH,
    1.8,
    mats,
    disposables,
  );
  group.add(foundation);

  // 2. Timber-Framed Walls
  const walls = createTimberWallModule(
    spec.width,
    spec.wallHeight,
    spec.depth,
    wallMat,
    mats,
    disposables,
  );
  walls.position.y = baseH;
  group.add(walls);

  // 3. Gabled Roof
  const roof = createGabledRoofModule(
    spec.width,
    spec.depth,
    spec.roofHeight,
    roofMat,
    wallMat,
    mats,
    disposables,
  );
  roof.position.y = baseH + spec.wallHeight;
  group.add(roof);

  // 4. Front Door (+Z)
  const door = createDoorwayModule(mats, disposables);
  door.position.set(spec.width * 0.16, baseH, spec.depth * 0.5);
  group.add(door);

  // 5. Front & Side Windows
  const frontWin = createWindowModule(mats, disposables);
  frontWin.position.set(-spec.width * 0.24, baseH + 1.45, spec.depth * 0.5 + 0.02);
  group.add(frontWin);

  const leftWin = createWindowModule(mats, disposables, 0.78, 0.85);
  leftWin.rotation.y = -Math.PI * 0.5;
  leftWin.position.set(-spec.width * 0.5 - 0.02, baseH + 1.45, 0);
  group.add(leftWin);

  const rightWin = createWindowModule(mats, disposables, 0.78, 0.85);
  rightWin.rotation.y = Math.PI * 0.5;
  rightWin.position.set(spec.width * 0.5 + 0.02, baseH + 1.45, 0);
  group.add(rightWin);

  // 6. Optional Chimney
  if (spec.hasChimney) {
    const side = spec.chimneySide ?? -1;
    const chimney = createChimneyModule(
      spec.wallHeight + spec.roofHeight + 0.9,
      mats,
      disposables,
    );
    chimney.position.set(side * (spec.width * 0.34), baseH, -spec.depth * 0.22);
    group.add(chimney);
  }

  // 7. Optional Porch Canopy
  if (spec.hasPorch) {
    const porchGeo = new THREE.BoxGeometry(2.0, 0.12, 1.15);
    const porch = new THREE.Mesh(porchGeo, roofMat);
    porch.position.set(spec.width * 0.16, baseH + 2.36, spec.depth * 0.5 + 0.52);
    porch.rotation.x = 0.22;
    disposables.push(porchGeo);
    group.add(porch);
  }

  enableShadows(group, true, true);
  return group;
}

/**
 * Procedural Small Shop Assembler composing walls, roof, awning, counter & hanging signboard.
 */
export function buildProceduralShop(
  spec: ShopSpec,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = buildProceduralHouse(
    { ...spec, hasPorch: false },
    mats,
    disposables,
  );
  const baseH = 0.34;

  // Market awning + counter on +Z facade
  const awning = createShopAwningModule(
    spec.width * 0.84,
    getAwningMaterial(spec.awningTone, mats),
    mats,
    disposables,
  );
  awning.position.set(0, baseH, spec.depth * 0.5);
  group.add(awning);

  // Hanging shop signboard bracket
  const armGeo = new THREE.BoxGeometry(0.08, 0.08, 0.85);
  const arm = new THREE.Mesh(armGeo, mats.ironDark);
  arm.position.set(-spec.width * 0.36, baseH + 2.75, spec.depth * 0.5 + 0.42);

  const boardGeo = new THREE.BoxGeometry(0.1, 0.52, 0.72);
  const board = new THREE.Mesh(boardGeo, mats.timberWarm);
  board.position.set(-spec.width * 0.36, baseH + 2.42, spec.depth * 0.5 + 0.54);

  disposables.push(armGeo, boardGeo);
  group.add(arm, board);

  enableShadows(group, true, true);
  return group;
}

/**
 * Terrain-conforming Village Square Cobblestone Plaza + stone perimeter curb.
 */
export function buildCentralSquare(
  cx: number,
  cz: number,
  radius: number,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  // Subdivided terrain-hugging disc mesh
  const geo = new THREE.CircleGeometry(radius, 28);
  geo.rotateX(-Math.PI / 2);

  // Subdivide ring manually by sampling concentric grid or using Ring/Plane?
  // Let's sample a polar grid so vertices smoothly follow groundHeightAt(x, z)!
  const rings = 5;
  const segs = 28;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const rad = (r / rings) * radius;
    for (let s = 0; s <= segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      const lx = Math.cos(ang) * rad;
      const lz = Math.sin(ang) * rad;
      const wy = groundHeightAt(cx + lx, cz + lz) + 0.055;
      positions.push(lx, wy, lz);
      uvs.push(lx * 0.25, lz * 0.25);
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * (segs + 1) + s;
      const b = a + segs + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  geo.dispose();
  const plazaGeo = new THREE.BufferGeometry();
  plazaGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  plazaGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  plazaGeo.setIndex(indices);
  plazaGeo.computeVertexNormals();
  plazaGeo.computeBoundingSphere();

  const plaza = new THREE.Mesh(plazaGeo, mats.stoneCobble);
  plaza.position.set(cx, 0, cz);
  plaza.receiveShadow = true;
  plaza.frustumCulled = true;
  group.add(plaza);
  disposables.push(plazaGeo);

  // Decorative stone curb stones around perimeter (with gaps at cardinal roads)
  const curbGeo = new THREE.BoxGeometry(1.15, 0.28, 0.55);
  disposables.push(curbGeo);
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    // Leave openings near N, S, E, W road entrances
    const modQuarter = ((ang % (Math.PI * 0.5)) + Math.PI * 0.5) % (Math.PI * 0.5);
    if (modQuarter < 0.34 || modQuarter > Math.PI * 0.5 - 0.34) continue;

    const sx = cx + Math.cos(ang) * (radius - 0.25);
    const sz = cz + Math.sin(ang) * (radius - 0.25);
    const sy = groundHeightAt(sx, sz);
    const curb = new THREE.Mesh(curbGeo, mats.stoneFoundation);
    curb.position.set(sx, sy + 0.08, sz);
    curb.rotation.y = -ang + Math.PI * 0.5;
    curb.castShadow = true;
    curb.receiveShadow = true;
    group.add(curb);
  }

  return group;
}

/**
 * Terrain-hugging subdivided road strip between 2D waypoints.
 */
export function buildTerrainRoadStrip(
  waypoints: Array<[number, number]>,
  width: number,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
  material: THREE.Material = mats.roadGravel,
): THREE.Mesh {
  const sampled: Array<[number, number]> = [];
  const stepDist = 2.5;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const [x1, z1] = waypoints[i];
    const [x2, z2] = waypoints[i + 1];
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(2, Math.ceil(dist / stepDist));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      sampled.push([x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]);
    }
  }
  sampled.push(waypoints[waypoints.length - 1]);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const hw = width * 0.5;
  let accumDist = 0;

  for (let i = 0; i < sampled.length; i++) {
    const [px, pz] = sampled[i];
    const prev = sampled[Math.max(0, i - 1)];
    const next = sampled[Math.min(sampled.length - 1, i + 1)];
    if (i > 0) {
      accumDist += Math.hypot(px - prev[0], pz - prev[1]);
    }
    const tx = next[0] - prev[0];
    const tz = next[1] - prev[1];
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;

    // 3 vertices across road width (left edge, center crown, right edge)
    const lx = px + nx * hw;
    const lz = pz + nz * hw;
    const rx = px - nx * hw;
    const rz = pz - nz * hw;

    positions.push(
      lx, groundHeightAt(lx, lz) + 0.035, lz,
      px, groundHeightAt(px, pz) + 0.06, pz,
      rx, groundHeightAt(rx, rz) + 0.035, rz,
    );
    uvs.push(0, accumDist * 0.25, 0.5, accumDist * 0.25, 1, accumDist * 0.25);
  }

  for (let i = 0; i < sampled.length - 1; i++) {
    const r0 = i * 3;
    const r1 = (i + 1) * 3;
    indices.push(r0, r1, r0 + 1, r1, r1 + 1, r0 + 1);
    indices.push(r0 + 1, r1 + 1, r0 + 2, r1 + 1, r1 + 2, r0 + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  disposables.push(geo);

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  return mesh;
}

/**
 * Water Well component with stone ring wall, timber roof frame, windlass & bucket.
 */
export function buildWaterWell(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  // Embedded stone skirt + circular rim wall
  const baseGeo = new THREE.CylinderGeometry(1.18, 1.28, 1.3, 14);
  const base = new THREE.Mesh(baseGeo, mats.stoneFoundation);
  base.position.y = 0.15;

  const rimGeo = new THREE.TorusGeometry(1.06, 0.16, 8, 16);
  rimGeo.rotateX(Math.PI * 0.5);
  const rim = new THREE.Mesh(rimGeo, mats.stoneCobble);
  rim.position.y = 0.82;

  const waterGeo = new THREE.CircleGeometry(0.95, 14);
  waterGeo.rotateX(-Math.PI * 0.5);
  const water = new THREE.Mesh(waterGeo, mats.wellWater);
  water.position.y = 0.72;

  const postGeo = new THREE.BoxGeometry(0.14, 2.05, 0.14);
  const leftPost = new THREE.Mesh(postGeo, mats.timberDark);
  leftPost.position.set(-1.02, 1.68, 0);
  const rightPost = new THREE.Mesh(postGeo, mats.timberDark);
  rightPost.position.set(1.02, 1.68, 0);

  const axleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.1, 8);
  axleGeo.rotateZ(Math.PI * 0.5);
  const axle = new THREE.Mesh(axleGeo, mats.timberWarm);
  axle.position.y = 2.05;

  const bucketGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.28, 8);
  const bucket = new THREE.Mesh(bucketGeo, mats.timberWarm);
  bucket.position.set(0, 1.4, 0);

  const roofGeo = new THREE.ConeGeometry(1.55, 0.92, 4);
  roofGeo.rotateY(Math.PI * 0.25);
  const roof = new THREE.Mesh(roofGeo, mats.roofCedar);
  roof.position.y = 2.95;

  disposables.push(baseGeo, rimGeo, waterGeo, postGeo, axleGeo, bucketGeo, roofGeo);
  group.add(base, rim, water, leftPost, rightPost, axle, bucket, roof);
  enableShadows(group, true, true);
  return group;
}

/**
 * Village Lamp Post with stone base, iron bracket, and warm glowing lantern.
 */
export function buildLampPost(
  withPointLight: boolean,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
  outLights?: THREE.PointLight[],
): THREE.Group {
  const group = new THREE.Group();

  const baseGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.45, 8);
  const base = new THREE.Mesh(baseGeo, mats.stoneFoundation);
  base.position.y = 0.12;

  const poleGeo = new THREE.CylinderGeometry(0.06, 0.09, 3.25, 8);
  const pole = new THREE.Mesh(poleGeo, mats.timberDark);
  pole.position.y = 1.82;

  const armGeo = new THREE.BoxGeometry(0.07, 0.07, 0.62);
  const arm = new THREE.Mesh(armGeo, mats.ironDark);
  arm.position.set(0, 3.38, 0.25);

  const capGeo = new THREE.ConeGeometry(0.22, 0.16, 4);
  capGeo.rotateY(Math.PI * 0.25);
  const cap = new THREE.Mesh(capGeo, mats.ironDark);
  cap.position.set(0, 3.22, 0.5);

  const lanternGeo = new THREE.BoxGeometry(0.22, 0.28, 0.22);
  const lantern = new THREE.Mesh(lanternGeo, mats.lanternGlow);
  lantern.position.set(0, 3.02, 0.5);

  disposables.push(baseGeo, poleGeo, armGeo, capGeo, lanternGeo);
  group.add(base, pole, arm, cap, lantern);

  if (withPointLight) {
    const light = new THREE.PointLight(0xffbe6b, 4.8, 18, 1.8);
    light.position.set(0, 2.95, 0.5);
    light.castShadow = false;
    group.add(light);
    outLights?.push(light);
  }

  enableShadows(group, true, false);
  return group;
}

/**
 * Terrain-following wooden post-and-rail fence run.
 */
export function buildFenceRun(
  points: Array<[number, number]>,
  postStep: number,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): { group: THREE.Group; postPositions: Array<[number, number]> } {
  const group = new THREE.Group();
  const postPositions: Array<[number, number]> = [];
  const postGeo = new THREE.BoxGeometry(0.14, 1.05, 0.14);
  disposables.push(postGeo);

  for (let i = 0; i < points.length - 1; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[i + 1];
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const spans = Math.max(1, Math.round(dist / postStep));

    for (let s = 0; s < spans; s++) {
      const t0 = s / spans;
      const t1 = (s + 1) / spans;
      const px0 = x1 + (x2 - x1) * t0;
      const pz0 = z1 + (z2 - z1) * t0;
      const py0 = groundHeightAt(px0, pz0);

      const post = new THREE.Mesh(postGeo, mats.timberWarm);
      post.position.set(px0, py0 + 0.45, pz0);
      group.add(post);
      postPositions.push([px0, pz0]);

      const px1 = x1 + (x2 - x1) * t1;
      const pz1 = z1 + (z2 - z1) * t1;
      const py1 = groundHeightAt(px1, pz1);
      const spanLen = Math.hypot(px1 - px0, pz1 - pz0);
      const railGeo = new THREE.BoxGeometry(0.06, 0.08, spanLen);
      disposables.push(railGeo);

      const mx = (px0 + px1) * 0.5;
      const mz = (pz0 + pz1) * 0.5;
      const my = (py0 + py1) * 0.5;
      const yaw = Math.atan2(px1 - px0, pz1 - pz0);

      const upperRail = new THREE.Mesh(railGeo, mats.timberWarm);
      upperRail.position.set(mx, my + 0.78, mz);
      upperRail.rotation.y = yaw;

      const lowerRail = new THREE.Mesh(railGeo, mats.timberWarm);
      lowerRail.position.set(mx, my + 0.44, mz);
      lowerRail.rotation.y = yaw;

      group.add(upperRail, lowerRail);
    }

    if (i === points.length - 2) {
      const pyEnd = groundHeightAt(x2, z2);
      const endPost = new THREE.Mesh(postGeo, mats.timberWarm);
      endPost.position.set(x2, pyEnd + 0.45, z2);
      group.add(endPost);
      postPositions.push([x2, z2]);
    }
  }

  enableShadows(group, true, true);
  return { group, postPositions };
}

/**
 * Farm raised soil bed + procedural wheat or garden vegetable rows.
 */
export function buildFarmPlot(
  cx: number,
  cz: number,
  width: number,
  depth: number,
  cropKind: 'wheat' | 'greens',
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const baseY = groundHeightAt(cx, cz);

  const frameGeo = new THREE.BoxGeometry(width + 0.3, 0.45, depth + 0.3);
  const frame = new THREE.Mesh(frameGeo, mats.timberDark);
  frame.position.set(cx, baseY - 0.05, cz);

  const soilGeo = new THREE.BoxGeometry(width, 0.48, depth);
  const soil = new THREE.Mesh(soilGeo, mats.soilTilled);
  soil.position.set(cx, baseY - 0.01, cz);

  disposables.push(frameGeo, soilGeo);
  group.add(frame, soil);

  const cols = Math.max(3, Math.floor(width / 0.72));
  const rows = Math.max(4, Math.floor(depth / 0.68));
  const cropGeo =
    cropKind === 'wheat'
      ? new THREE.CylinderGeometry(0.05, 0.08, 0.75, 5)
      : new THREE.DodecahedronGeometry(0.2, 0);
  const cropMat = cropKind === 'wheat' ? mats.wheatGold : mats.cropLeaf;
  disposables.push(cropGeo);

  const count = cols * rows;
  const inst = new THREE.InstancedMesh(cropGeo, cropMat, count);
  inst.castShadow = true;
  inst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lx = cx - width * 0.42 + (c / Math.max(1, cols - 1)) * width * 0.84;
      const lz = cz - depth * 0.42 + (r / Math.max(1, rows - 1)) * depth * 0.84;
      const ly = baseY + (cropKind === 'wheat' ? 0.56 : 0.34);
      dummy.position.set(lx, ly, lz);
      dummy.rotation.set(0, ((r * 7 + c * 13) % 6) * 0.9, 0);
      dummy.scale.setScalar(0.88 + ((r + c) % 3) * 0.12);
      dummy.updateMatrix();
      inst.setMatrixAt(idx++, dummy.matrix);
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.matrixAutoUpdate = false;
  inst.updateMatrix();
  group.add(inst);

  enableShadows(group, true, true);
  return group;
}

/**
 * Reusable Decorative Props for yards, market stalls, square, and farm.
 */
export function buildDecorativeProp(
  kind: DecorativePropKind,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'barrel') {
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.82, 10);
    const body = new THREE.Mesh(bodyGeo, mats.timberWarm);
    body.position.y = 0.41;
    const bandGeo = new THREE.CylinderGeometry(0.335, 0.335, 0.08, 10);
    const topBand = new THREE.Mesh(bandGeo, mats.ironDark);
    topBand.position.y = 0.64;
    const botBand = new THREE.Mesh(bandGeo, mats.ironDark);
    botBand.position.y = 0.2;
    disposables.push(bodyGeo, bandGeo);
    group.add(body, topBand, botBand);
  } else if (kind === 'crate') {
    const boxGeo = new THREE.BoxGeometry(0.76, 0.72, 0.76);
    const box = new THREE.Mesh(boxGeo, mats.timberWarm);
    box.position.y = 0.36;
    const trimGeo = new THREE.BoxGeometry(0.8, 0.1, 0.8);
    const trim = new THREE.Mesh(trimGeo, mats.timberDark);
    trim.position.y = 0.66;
    disposables.push(boxGeo, trimGeo);
    group.add(box, trim);
  } else if (kind === 'bench') {
    const seatGeo = new THREE.BoxGeometry(1.75, 0.1, 0.5);
    const seat = new THREE.Mesh(seatGeo, mats.timberWarm);
    seat.position.y = 0.46;
    const backGeo = new THREE.BoxGeometry(1.75, 0.36, 0.08);
    const back = new THREE.Mesh(backGeo, mats.timberWarm);
    back.position.set(0, 0.76, -0.22);
    const legGeo = new THREE.BoxGeometry(0.12, 0.46, 0.44);
    const leftLeg = new THREE.Mesh(legGeo, mats.timberDark);
    leftLeg.position.set(-0.7, 0.23, 0);
    const rightLeg = new THREE.Mesh(legGeo, mats.timberDark);
    rightLeg.position.set(0.7, 0.23, 0);
    disposables.push(seatGeo, backGeo, legGeo);
    group.add(seat, back, leftLeg, rightLeg);
  } else if (kind === 'planter') {
    const boxGeo = new THREE.BoxGeometry(1.1, 0.42, 0.54);
    const box = new THREE.Mesh(boxGeo, mats.timberDark);
    box.position.y = 0.21;
    const bushGeo = new THREE.DodecahedronGeometry(0.24, 0);
    const bloomGeo = new THREE.DodecahedronGeometry(0.11, 0);
    disposables.push(boxGeo, bushGeo, bloomGeo);
    group.add(box);
    for (let i = -1; i <= 1; i++) {
      const bush = new THREE.Mesh(bushGeo, mats.cropLeaf);
      bush.position.set(i * 0.3, 0.48, 0);
      const bloom = new THREE.Mesh(bloomGeo, mats.flowerAccent);
      bloom.position.set(i * 0.3 + 0.04, 0.68, 0.05);
      group.add(bush, bloom);
    }
  } else if (kind === 'haybale') {
    const baleGeo = new THREE.CylinderGeometry(0.46, 0.46, 1.05, 10);
    baleGeo.rotateZ(Math.PI * 0.5);
    const bale = new THREE.Mesh(baleGeo, mats.hayGold);
    bale.position.y = 0.46;
    disposables.push(baleGeo);
    group.add(bale);
  } else if (kind === 'woodpile') {
    const logGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.86, 6);
    logGeo.rotateZ(Math.PI * 0.5);
    disposables.push(logGeo);
    for (let row = 0; row < 2; row++) {
      const count = 3 - row;
      for (let i = 0; i < count; i++) {
        const log = new THREE.Mesh(logGeo, mats.timberDark);
        log.position.set(0, 0.12 + row * 0.19, (i - (count - 1) * 0.5) * 0.24);
        group.add(log);
      }
    }
  } else if (kind === 'noticeboard') {
    const postGeo = new THREE.BoxGeometry(0.12, 2.0, 0.12);
    const leftPost = new THREE.Mesh(postGeo, mats.timberDark);
    leftPost.position.set(-0.75, 1.0, 0);
    const rightPost = new THREE.Mesh(postGeo, mats.timberDark);
    rightPost.position.set(0.75, 1.0, 0);
    const boardGeo = new THREE.BoxGeometry(1.45, 0.95, 0.1);
    const board = new THREE.Mesh(boardGeo, mats.timberWarm);
    board.position.set(0, 1.38, 0);
    const noteGeo = new THREE.BoxGeometry(0.38, 0.45, 0.12);
    const note1 = new THREE.Mesh(noteGeo, mats.plasterCream);
    note1.position.set(-0.34, 1.42, 0.01);
    const note2 = new THREE.Mesh(noteGeo, mats.plasterOchre);
    note2.position.set(0.28, 1.34, 0.01);
    const capGeo = new THREE.BoxGeometry(1.75, 0.14, 0.36);
    const cap = new THREE.Mesh(capGeo, mats.roofCedar);
    cap.position.set(0, 2.04, 0);
    disposables.push(postGeo, boardGeo, noteGeo, capGeo);
    group.add(leftPost, rightPost, board, note1, note2, cap);
  } else if (kind === 'scarecrow') {
    const stakeGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.9, 6);
    const stake = new THREE.Mesh(stakeGeo, mats.timberDark);
    stake.position.y = 0.95;
    const armGeo = new THREE.BoxGeometry(1.35, 0.08, 0.08);
    const arms = new THREE.Mesh(armGeo, mats.timberWarm);
    arms.position.y = 1.42;
    const coatGeo = new THREE.ConeGeometry(0.32, 0.72, 6);
    const coat = new THREE.Mesh(coatGeo, mats.awningTeal);
    coat.position.y = 1.24;
    const headGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const head = new THREE.Mesh(headGeo, mats.hayGold);
    head.position.y = 1.78;
    const hatGeo = new THREE.ConeGeometry(0.32, 0.24, 7);
    const hat = new THREE.Mesh(hatGeo, mats.timberDark);
    hat.position.y = 1.98;
    disposables.push(stakeGeo, armGeo, coatGeo, headGeo, hatGeo);
    group.add(stake, arms, coat, head, hat);
  } else if (kind === 'signpost') {
    const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.95, 7);
    const post = new THREE.Mesh(postGeo, mats.timberDark);
    post.position.y = 0.96;
    const boardGeo = new THREE.BoxGeometry(1.05, 0.34, 0.08);
    const board = new THREE.Mesh(boardGeo, mats.timberWarm);
    board.position.set(0.14, 1.56, 0);
    disposables.push(postGeo, boardGeo);
    group.add(post, board);
  } else if (kind === 'cart') {
    const bedGeo = new THREE.BoxGeometry(1.4, 0.36, 2.0);
    const bed = new THREE.Mesh(bedGeo, mats.timberWarm);
    bed.position.y = 0.56;
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.12, 10);
    wheelGeo.rotateZ(Math.PI * 0.5);
    const wL = new THREE.Mesh(wheelGeo, mats.timberDark);
    wL.position.set(-0.78, 0.38, 0);
    const wR = new THREE.Mesh(wheelGeo, mats.timberDark);
    wR.position.set(0.78, 0.38, 0);
    const handleGeo = new THREE.BoxGeometry(0.1, 0.1, 1.1);
    const hL = new THREE.Mesh(handleGeo, mats.timberDark);
    hL.position.set(-0.45, 0.45, 1.35);
    const hR = new THREE.Mesh(handleGeo, mats.timberDark);
    hR.position.set(0.45, 0.45, 1.35);
    disposables.push(bedGeo, wheelGeo, handleGeo);
    group.add(bed, wL, wR, hL, hR);
  }

  enableShadows(group, true, true);
  return group;
}

/**
 * Curated shade & orchard trees for the village lanes & yards.
 */
export function buildVillageTree(
  kind: 'broadleaf' | 'orchard' | 'palm',
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'palm') {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 4.2, 7);
    const trunk = new THREE.Mesh(trunkGeo, mats.timberWarm);
    trunk.position.y = 2.05;
    trunk.rotation.z = 0.07;
    group.add(trunk);

    const frondGeo = new THREE.ConeGeometry(0.45, 2.2, 5);
    disposables.push(trunkGeo, frondGeo);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const frond = new THREE.Mesh(frondGeo, mats.palmFrond);
      frond.position.set(
        -0.15 + Math.cos(ang) * 0.85,
        4.15,
        Math.sin(ang) * 0.85,
      );
      frond.rotation.order = 'YXZ';
      frond.rotation.y = -ang + Math.PI * 0.5;
      frond.rotation.x = 1.15;
      group.add(frond);
    }

    enableShadows(group, true, true);
    return group;
  }

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.6, 7);
  const trunk = new THREE.Mesh(trunkGeo, mats.timberDark);
  trunk.position.y = 1.25;
  group.add(trunk);

  const canopyMat = kind === 'broadleaf' ? mats.foliageOak : mats.foliageOrchard;
  const crownGeo1 = new THREE.IcosahedronGeometry(kind === 'broadleaf' ? 1.75 : 1.4, 1);
  const crown1 = new THREE.Mesh(crownGeo1, canopyMat);
  crown1.position.y = 3.35;

  const crownGeo2 = new THREE.IcosahedronGeometry(kind === 'broadleaf' ? 1.25 : 1.0, 1);
  const crown2 = new THREE.Mesh(crownGeo2, canopyMat);
  crown2.position.set(0.75, 2.95, 0.45);

  const crown3 = new THREE.Mesh(crownGeo2, canopyMat);
  crown3.position.set(-0.68, 3.05, -0.45);

  disposables.push(trunkGeo, crownGeo1, crownGeo2);
  group.add(crown1, crown2, crown3);

  enableShadows(group, true, true);
  return group;
}

/**
 * Merges all static child THREE.Mesh geometry inside `targetGroup` by (material, castShadow, receiveShadow)
 * to collapse hundreds of individual village building/prop draw calls into ~15–25 batched meshes.
 * Skips InstancedMesh, PointLight, and any subgroups listed in `excludedRoots`.
 */
export function mergeStaticGroupMeshes(
  targetGroup: THREE.Group,
  disposables: Array<{ dispose: () => void }>,
  excludedRoots?: Set<THREE.Object3D>,
  noShadowMaterials?: Set<THREE.Material>,
): void {
  targetGroup.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(targetGroup.matrixWorld).invert();
  const relMatrix = new THREE.Matrix4();

  const meshesToBatch: THREE.Mesh[] = [];
  const visit = (node: THREE.Object3D) => {
    if (node !== targetGroup && excludedRoots?.has(node)) return;
    if ((node as THREE.InstancedMesh).isInstancedMesh) return;
    if ((node as THREE.Mesh).isMesh) {
      meshesToBatch.push(node as THREE.Mesh);
    }
    for (let i = 0; i < node.children.length; i++) {
      visit(node.children[i]);
    }
  };
  visit(targetGroup);

  interface MeshBucket {
    mat: THREE.Material;
    castShadow: boolean;
    receiveShadow: boolean;
    geos: THREE.BufferGeometry[];
  }
  const buckets = new Map<string, MeshBucket>();
  const matIds = new Map<THREE.Material, number>();
  let nextMatId = 1;

  for (let i = 0; i < meshesToBatch.length; i++) {
    const mesh = meshesToBatch[i];
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!mat || !mesh.geometry) continue;

    let matId = matIds.get(mat);
    if (matId === undefined) {
      matId = nextMatId++;
      matIds.set(mat, matId);
    }

    const castShadow = mesh.castShadow && !(noShadowMaterials?.has(mat) ?? false);
    const receiveShadow = mesh.receiveShadow;
    const key = `${matId}|${castShadow ? 1 : 0}|${receiveShadow ? 1 : 0}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { mat, castShadow, receiveShadow, geos: [] };
      buckets.set(key, bucket);
    }

    relMatrix.multiplyMatrices(invRoot, mesh.matrixWorld);
    const nonIndexed = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    if (!nonIndexed.hasAttribute('normal')) {
      nonIndexed.computeVertexNormals();
    }
    nonIndexed.applyMatrix4(relMatrix);
    bucket.geos.push(nonIndexed);

    mesh.removeFromParent();
  }

  for (const bucket of buckets.values()) {
    if (bucket.geos.length === 0) continue;

    // Ensure all geometries in the bucket share identical attribute keys
    const allHaveUv = bucket.geos.every((g) => g.hasAttribute('uv'));
    for (let i = 0; i < bucket.geos.length; i++) {
      const g = bucket.geos[i];
      if (!allHaveUv && g.hasAttribute('uv')) g.deleteAttribute('uv');
      if (g.hasAttribute('tangent')) g.deleteAttribute('tangent');
      if (g.hasAttribute('color')) g.deleteAttribute('color');
    }

    const merged = BufferGeometryUtils.mergeGeometries(bucket.geos, false);
    for (let i = 0; i < bucket.geos.length; i++) {
      bucket.geos[i].dispose();
    }
    if (!merged) continue;
    merged.computeBoundingSphere();
    disposables.push(merged);

    const batchedMesh = new THREE.Mesh(merged, bucket.mat);
    batchedMesh.castShadow = bucket.castShadow;
    batchedMesh.receiveShadow = bucket.receiveShadow;
    batchedMesh.frustumCulled = true;
    batchedMesh.matrixAutoUpdate = false;
    batchedMesh.updateMatrix();
    targetGroup.add(batchedMesh);
  }
}

export interface WalkableHouseColliderSpec {
  lx: number;
  lz: number;
  radius: number;
  maxY: number;
}

export interface WalkableHouseResult {
  group: THREE.Group;
  doorPivot: THREE.Group;
  doorLocalPos: THREE.Vector3;
  doorEntryLocal: THREE.Vector3;
  doorThresholdLocal: THREE.Vector3;
  bedLocalPos: THREE.Vector3;
  bedLocalYaw: number;
  wallCollidersLocal: WalkableHouseColliderSpec[];
}

export function buildBedProp(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
  blanketColor = 0x9b4436,
): THREE.Group {
  const group = new THREE.Group();

  const blanketMat = new THREE.MeshStandardMaterial({
    color: blanketColor,
    roughness: 0.88,
  });
  const sheetMat = new THREE.MeshStandardMaterial({
    color: 0xe6dcc8,
    roughness: 0.84,
  });
  disposables.push(blanketMat, sheetMat);

  const frameGeo = new THREE.BoxGeometry(1.16, 0.22, 2.04);
  const frame = new THREE.Mesh(frameGeo, mats.timberWarm);
  frame.position.y = 0.24;

  const headboardGeo = new THREE.BoxGeometry(1.22, 0.72, 0.12);
  const headboard = new THREE.Mesh(headboardGeo, mats.timberDark);
  headboard.position.set(0, 0.5, -0.96);

  const legGeo = new THREE.BoxGeometry(0.12, 0.28, 0.12);
  const legOffsets = [
    [-0.5, 0.14, -0.92],
    [0.5, 0.14, -0.92],
    [-0.5, 0.14, 0.92],
    [0.5, 0.14, 0.92],
  ];
  for (const [lx, ly, lz] of legOffsets) {
    const leg = new THREE.Mesh(legGeo, mats.timberDark);
    leg.position.set(lx, ly, lz);
    group.add(leg);
  }

  const mattressGeo = new THREE.BoxGeometry(1.06, 0.16, 1.88);
  const mattress = new THREE.Mesh(mattressGeo, sheetMat);
  mattress.position.set(0, 0.4, 0.02);

  const blanketGeo = new THREE.BoxGeometry(1.08, 0.18, 1.32);
  const blanket = new THREE.Mesh(blanketGeo, blanketMat);
  blanket.position.set(0, 0.41, 0.3);

  const pillowGeo = new THREE.BoxGeometry(0.76, 0.14, 0.38);
  const pillow = new THREE.Mesh(pillowGeo, sheetMat);
  pillow.position.set(0, 0.52, -0.66);

  disposables.push(frameGeo, headboardGeo, legGeo, mattressGeo, blanketGeo, pillowGeo);
  group.add(frame, headboard, mattress, blanket, pillow);
  return group;
}

export function buildChestProp(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): { group: THREE.Group; lidPivot: THREE.Group } {
  const group = new THREE.Group();
  const baseGeo = new THREE.BoxGeometry(0.94, 0.48, 0.62);
  const base = new THREE.Mesh(baseGeo, mats.timberWarm);
  base.position.y = 0.24;

  const trimGeo = new THREE.BoxGeometry(0.98, 0.1, 0.66);
  const trim = new THREE.Mesh(trimGeo, mats.ironDark);
  trim.position.y = 0.44;

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.48, -0.31);
  const lidGeo = new THREE.BoxGeometry(0.96, 0.18, 0.64);
  const lid = new THREE.Mesh(lidGeo, mats.timberWarm);
  lid.position.set(0, 0.08, 0.31);
  const strapGeo = new THREE.BoxGeometry(0.98, 0.2, 0.12);
  const strap = new THREE.Mesh(strapGeo, mats.ironDark);
  strap.position.set(0, 0.08, 0.31);
  lidPivot.add(lid, strap);

  const lockGeo = new THREE.BoxGeometry(0.16, 0.18, 0.08);
  const lock = new THREE.Mesh(lockGeo, mats.lanternGlow);
  lock.position.set(0, 0.44, 0.34);

  disposables.push(baseGeo, trimGeo, lidGeo, strapGeo, lockGeo);
  group.add(base, trim, lidPivot, lock);
  return { group, lidPivot };
}

/**
 * Walkable house with genuine doorway opening, plank floor, interior bed,
 * windows, chimney, and segmented wall colliders so villagers & player can enter.
 */
export function buildWalkableInteriorHouse(
  spec: HouseSpec,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): WalkableHouseResult {
  const group = new THREE.Group();
  const { width, depth, wallHeight, roofHeight } = spec;
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const wallT = 0.28;
  const doorW = Math.min(1.55, width * 0.32);
  const doorH = Math.min(2.25, wallHeight - 0.35);

  const wallMat =
    spec.wallTone === 'ochre'
      ? mats.plasterOchre
      : spec.wallTone === 'sage'
        ? mats.plasterSage
        : mats.plasterCream;
  const roofMat =
    spec.roofTone === 'slate'
      ? mats.roofSlate
      : spec.roofTone === 'cedar'
        ? mats.roofCedar
        : mats.roofTerracotta;

  // Stone foundation pad + interior warm timber plank floor
  const foundGeo = new THREE.BoxGeometry(width + 0.36, 0.42, depth + 0.36);
  const found = new THREE.Mesh(foundGeo, mats.stoneFoundation);
  found.position.y = 0.04;
  group.add(found);

  const floorGeo = new THREE.BoxGeometry(width - 0.25, 0.08, depth - 0.25);
  const floor = new THREE.Mesh(floorGeo, mats.timberWarm);
  floor.position.y = 0.26;
  group.add(floor);
  disposables.push(foundGeo, floorGeo);

  // Back wall
  const backGeo = new THREE.BoxGeometry(width, wallHeight, wallT);
  const back = new THREE.Mesh(backGeo, wallMat);
  back.position.set(0, 0.26 + wallHeight * 0.5, -hd + wallT * 0.5);
  group.add(back);

  // Left & Right walls
  const sideGeo = new THREE.BoxGeometry(wallT, wallHeight, depth);
  const leftW = new THREE.Mesh(sideGeo, wallMat);
  leftW.position.set(-hw + wallT * 0.5, 0.26 + wallHeight * 0.5, 0);
  const rightW = new THREE.Mesh(sideGeo, wallMat);
  rightW.position.set(hw - wallT * 0.5, 0.26 + wallHeight * 0.5, 0);
  group.add(leftW, rightW);

  // Front wall segments leaving open doorway in the center
  const sideFrontW = Math.max(0.6, (width - doorW) * 0.5);
  const frontSegGeo = new THREE.BoxGeometry(sideFrontW, wallHeight, wallT);
  const frontL = new THREE.Mesh(frontSegGeo, wallMat);
  frontL.position.set(-hw + sideFrontW * 0.5, 0.26 + wallHeight * 0.5, hd - wallT * 0.5);
  const frontR = new THREE.Mesh(frontSegGeo, wallMat);
  frontR.position.set(hw - sideFrontW * 0.5, 0.26 + wallHeight * 0.5, hd - wallT * 0.5);
  group.add(frontL, frontR);

  const lintelH = Math.max(0.32, wallHeight - doorH);
  const lintelGeo = new THREE.BoxGeometry(doorW + 0.1, lintelH, wallT);
  const lintel = new THREE.Mesh(lintelGeo, wallMat);
  lintel.position.set(0, 0.26 + doorH + lintelH * 0.5, hd - wallT * 0.5);
  group.add(lintel);

  // Timber door jambs & hinged door leaf (open by default so NPCs pass unobstructed)
  const jambGeo = new THREE.BoxGeometry(0.14, doorH, wallT + 0.08);
  const jL = new THREE.Mesh(jambGeo, mats.timberDark);
  jL.position.set(-doorW * 0.5, 0.26 + doorH * 0.5, hd - wallT * 0.5);
  const jR = new THREE.Mesh(jambGeo, mats.timberDark);
  jR.position.set(doorW * 0.5, 0.26 + doorH * 0.5, hd - wallT * 0.5);
  const leafW = doorW * 0.9;
  const doorLeafGeo = new THREE.BoxGeometry(leafW, doorH - 0.1, 0.09);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-doorW * 0.5 + 0.05, 0.26, hd - wallT * 0.5);
  doorPivot.rotation.y = -1.25;
  const doorLeaf = new THREE.Mesh(doorLeafGeo, mats.timberWarm);
  doorLeaf.position.set(leafW * 0.5, (doorH - 0.1) * 0.5, 0);
  doorPivot.add(doorLeaf);
  group.add(jL, jR, doorPivot);

  // Exterior corner timber posts & side windows
  const postGeo = new THREE.BoxGeometry(0.24, wallHeight + 0.1, 0.24);
  for (const [px, pz] of [
    [-hw + 0.08, -hd + 0.08],
    [hw - 0.08, -hd + 0.08],
    [-hw + 0.08, hd - 0.08],
    [hw - 0.08, hd - 0.08],
  ]) {
    const p = new THREE.Mesh(postGeo, mats.timberDark);
    p.position.set(px, 0.26 + wallHeight * 0.5, pz);
    group.add(p);
  }
  const winGeo = new THREE.BoxGeometry(0.08, 0.72, 0.68);
  const wL = new THREE.Mesh(winGeo, mats.windowGlow);
  wL.position.set(-hw - 0.02, 0.26 + wallHeight * 0.56, 0);
  const wR = new THREE.Mesh(winGeo, mats.windowGlow);
  wR.position.set(hw + 0.02, 0.26 + wallHeight * 0.56, 0);
  group.add(wL, wR);

  // Pitched Gable Roof (two angled slopes + gable triangles via prism-like boxes)
  const slopeRun = hw + 0.45;
  const slopeLen = Math.hypot(slopeRun, roofHeight);
  const slopeAngle = Math.atan2(roofHeight, slopeRun);
  const slopeGeo = new THREE.BoxGeometry(slopeLen, 0.18, depth + 0.75);
  const slopeL = new THREE.Mesh(slopeGeo, roofMat);
  slopeL.position.set(-slopeRun * 0.5, 0.26 + wallHeight + roofHeight * 0.5, 0);
  slopeL.rotation.z = slopeAngle;
  const slopeR = new THREE.Mesh(slopeGeo, roofMat);
  slopeR.position.set(slopeRun * 0.5, 0.26 + wallHeight + roofHeight * 0.5, 0);
  slopeR.rotation.z = -slopeAngle;
  const ridgeGeo = new THREE.BoxGeometry(0.24, 0.22, depth + 0.82);
  const ridge = new THREE.Mesh(ridgeGeo, mats.timberDark);
  ridge.position.set(0, 0.26 + wallHeight + roofHeight, 0);
  group.add(slopeL, slopeR, ridge);

  // Stone step in front of doorway
  const stepGeo = new THREE.BoxGeometry(doorW + 0.5, 0.24, 0.95);
  const step = new THREE.Mesh(stepGeo, mats.stoneCobble);
  step.position.set(0, 0.12, hd + 0.42);
  group.add(step);

  if (spec.hasChimney) {
    const chX = (spec.chimneySide ?? 1) * (hw - 0.75);
    const chGeo = new THREE.BoxGeometry(0.85, wallHeight + roofHeight + 1.35, 0.85);
    const ch = new THREE.Mesh(chGeo, mats.stoneCobble);
    ch.position.set(chX, (wallHeight + roofHeight + 1.35) * 0.5, -hd + 0.75);
    group.add(ch);
    disposables.push(chGeo);
  }

  // Interior Bed tucked neatly along left-back quadrant
  const bedLocalX = -hw + 1.05;
  const bedLocalZ = -hd + 1.35;
  const bedLocalYaw = 0;
  const bedMesh = buildBedProp(mats, disposables);
  bedMesh.position.set(bedLocalX, 0.3, bedLocalZ);
  bedMesh.rotation.y = bedLocalYaw;
  group.add(bedMesh);

  // Small interior bedside stool & glowing lantern
  const tableGeo = new THREE.BoxGeometry(0.62, 0.58, 0.62);
  const table = new THREE.Mesh(tableGeo, mats.timberWarm);
  table.position.set(hw - 0.95, 0.58, -hd + 0.95);
  const lampGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.26, 6);
  const lamp = new THREE.Mesh(lampGeo, mats.lanternGlow);
  lamp.position.set(hw - 0.95, 1.0, -hd + 0.95);
  group.add(table, lamp);

  disposables.push(
    backGeo,
    sideGeo,
    frontSegGeo,
    lintelGeo,
    jambGeo,
    doorLeafGeo,
    postGeo,
    winGeo,
    slopeGeo,
    ridgeGeo,
    stepGeo,
    tableGeo,
    lampGeo,
  );

  // Wall collision cylinders leaving the front center doorway clean & unobstructed
  const wallCollidersLocal: WalkableHouseColliderSpec[] = [];
  const colMaxY = wallHeight + 0.6;
  const colR = 0.55;
  for (let x = -hw + 0.5; x <= hw - 0.49; x += 1.0) {
    wallCollidersLocal.push({ lx: x, lz: -hd + 0.2, radius: colR, maxY: colMaxY });
    if (Math.abs(x) > doorW * 0.58) {
      wallCollidersLocal.push({ lx: x, lz: hd - 0.2, radius: colR, maxY: colMaxY });
    }
  }
  for (let z = -hd + 0.9; z <= hd - 0.89; z += 1.0) {
    wallCollidersLocal.push({ lx: -hw + 0.2, lz: z, radius: colR, maxY: colMaxY });
    wallCollidersLocal.push({ lx: hw - 0.2, lz: z, radius: colR, maxY: colMaxY });
  }

  return {
    group,
    doorPivot,
    doorLocalPos: new THREE.Vector3(0, 0.26, hd - wallT * 0.5),
    doorEntryLocal: new THREE.Vector3(0, 0, hd + 1.55),
    doorThresholdLocal: new THREE.Vector3(0, 0.3, 0.35),
    bedLocalPos: new THREE.Vector3(bedLocalX + 0.72, 0.3, bedLocalZ + 0.25),
    bedLocalYaw: bedLocalYaw,
    wallCollidersLocal,
  };
}

export function buildBlacksmithForge(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  const floorGeo = new THREE.BoxGeometry(6.4, 0.34, 5.2);
  const floor = new THREE.Mesh(floorGeo, mats.stoneFoundation);
  floor.position.y = 0.08;
  group.add(floor);

  // Corner posts + pitched shelter roof (open-sided smithy)
  const postGeo = new THREE.BoxGeometry(0.26, 2.85, 0.26);
  for (const [px, pz] of [
    [-2.8, -2.2],
    [2.8, -2.2],
    [-2.8, 2.2],
    [2.8, 2.2],
  ]) {
    const post = new THREE.Mesh(postGeo, mats.timberDark);
    post.position.set(px, 1.55, pz);
    group.add(post);
  }

  const roofGeo = new THREE.BoxGeometry(6.8, 0.2, 5.8);
  const roof = new THREE.Mesh(roofGeo, mats.roofSlate);
  roof.position.set(0, 3.12, 0);
  roof.rotation.x = 0.14;
  group.add(roof);

  // Stone forge hearth & chimney + glowing coal pit
  const hearthGeo = new THREE.BoxGeometry(1.9, 1.45, 1.5);
  const hearth = new THREE.Mesh(hearthGeo, mats.stoneCobble);
  hearth.position.set(-1.55, 0.9, -1.35);
  const chimGeo = new THREE.BoxGeometry(1.1, 3.5, 1.0);
  const chim = new THREE.Mesh(chimGeo, mats.stoneCobble);
  chim.position.set(-1.55, 2.85, -1.55);
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xff6b22,
    emissive: 0xff4510,
    emissiveIntensity: 1.8,
  });
  const coalGeo = new THREE.BoxGeometry(1.1, 0.22, 0.72);
  const coal = new THREE.Mesh(coalGeo, emberMat);
  coal.position.set(-1.55, 1.52, -1.12);

  // Anvil + stump
  const stumpGeo = new THREE.CylinderGeometry(0.34, 0.42, 0.62, 8);
  const stump = new THREE.Mesh(stumpGeo, mats.timberDark);
  stump.position.set(0.65, 0.56, 0.35);
  const anvilGeo = new THREE.BoxGeometry(0.74, 0.34, 0.38);
  const anvil = new THREE.Mesh(anvilGeo, mats.ironDark);
  anvil.position.set(0.65, 1.04, 0.35);

  // Quench barrel
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.4, 0.85, 8);
  const barrel = new THREE.Mesh(barrelGeo, mats.timberWarm);
  barrel.position.set(2.05, 0.68, -0.95);

  disposables.push(
    floorGeo,
    postGeo,
    roofGeo,
    hearthGeo,
    chimGeo,
    emberMat,
    coalGeo,
    stumpGeo,
    anvilGeo,
    barrelGeo,
  );
  group.add(hearth, chim, coal, stump, anvil, barrel);
  return group;
}

export function buildMarketStall(
  awningTone: 'amber' | 'crimson' | 'teal',
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const awningMat =
    awningTone === 'crimson'
      ? mats.awningCrimson
      : awningTone === 'teal'
        ? mats.awningTeal
        : mats.awningAmber;

  const counterGeo = new THREE.BoxGeometry(3.2, 0.92, 1.15);
  const counter = new THREE.Mesh(counterGeo, mats.timberWarm);
  counter.position.set(0, 0.46, 0);

  const postGeo = new THREE.CylinderGeometry(0.08, 0.09, 2.35, 6);
  for (const [px, pz] of [
    [-1.45, -0.45],
    [1.45, -0.45],
    [-1.45, 0.45],
    [1.45, 0.45],
  ]) {
    const p = new THREE.Mesh(postGeo, mats.timberDark);
    p.position.set(px, 1.18, pz);
    group.add(p);
  }

  const awningGeo = new THREE.BoxGeometry(3.6, 0.1, 2.15);
  const awning = new THREE.Mesh(awningGeo, awningMat);
  awning.position.set(0, 2.38, 0.12);
  awning.rotation.x = 0.24;

  const crateGeo = new THREE.BoxGeometry(0.54, 0.4, 0.48);
  const crateA = new THREE.Mesh(crateGeo, mats.wheatGold);
  crateA.position.set(-0.78, 1.12, 0);
  const crateB = new THREE.Mesh(crateGeo, mats.cropLeaf);
  crateB.position.set(0.68, 1.12, 0.05);

  disposables.push(counterGeo, postGeo, awningGeo, crateGeo);
  group.add(counter, awning, crateA, crateB);
  return group;
}

export function buildGuardPost(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const baseGeo = new THREE.BoxGeometry(2.8, 0.36, 2.8);
  const base = new THREE.Mesh(baseGeo, mats.stoneFoundation);
  base.position.y = 0.18;

  const postGeo = new THREE.CylinderGeometry(0.11, 0.13, 3.1, 6);
  for (const [px, pz] of [
    [-1.15, -1.15],
    [1.15, -1.15],
    [-1.15, 1.15],
    [1.15, 1.15],
  ]) {
    const p = new THREE.Mesh(postGeo, mats.timberDark);
    p.position.set(px, 1.72, pz);
    group.add(p);
  }

  const roofGeo = new THREE.ConeGeometry(2.35, 1.35, 4);
  const roof = new THREE.Mesh(roofGeo, mats.roofSlate);
  roof.position.y = 3.85;
  roof.rotation.y = Math.PI * 0.25;

  const lampGeo = new THREE.BoxGeometry(0.24, 0.34, 0.24);
  const lamp = new THREE.Mesh(lampGeo, mats.lanternGlow);
  lamp.position.set(1.22, 2.65, 1.22);

  disposables.push(baseGeo, postGeo, roofGeo, lampGeo);
  group.add(base, roof, lamp);
  return group;
}

/**
 * Sun-baked sandstone & adobe Desert Village house with flat roof parapet,
 * cedar roof vigas (protruding beams), cool shaded porch awning, and warm lantern.
 */
export function buildDesertHouse(
  spec: {
    width: number;
    depth: number;
    wallHeight: number;
    warmAdobe?: boolean;
    hasDome?: boolean;
    awningTone?: 'amber' | 'crimson' | 'teal';
  },
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const { width, depth, wallHeight } = spec;
  const wallMat = spec.warmAdobe ? mats.adobeClay : mats.sandstonePlaster;
  const trimMat = spec.warmAdobe ? mats.sandstonePlaster : mats.adobeClay;

  // Deep sandstone base plinth
  const baseGeo = new THREE.BoxGeometry(width + 0.5, 1.5, depth + 0.5);
  const base = new THREE.Mesh(baseGeo, mats.adobeClay);
  base.position.y = -0.5;
  group.add(base);

  // Main sandstone/adobe structure
  const bodyGeo = new THREE.BoxGeometry(width, wallHeight, depth);
  const body = new THREE.Mesh(bodyGeo, wallMat);
  body.position.y = 0.25 + wallHeight * 0.5;
  group.add(body);

  // Flat roof cornice parapet
  const parapetGeo = new THREE.BoxGeometry(width + 0.28, 0.42, depth + 0.28);
  const parapet = new THREE.Mesh(parapetGeo, trimMat);
  parapet.position.y = 0.25 + wallHeight + 0.16;
  group.add(parapet);

  // Protruding cedar roof vigas (traditional desert architecture detail)
  const beamGeo = new THREE.CylinderGeometry(0.08, 0.08, depth + 0.72, 6);
  beamGeo.rotateX(Math.PI * 0.5);
  for (let bx = -width * 0.36; bx <= width * 0.37; bx += Math.max(1.2, width * 0.24)) {
    const beam = new THREE.Mesh(beamGeo, mats.timberDark);
    beam.position.set(bx, 0.25 + wallHeight - 0.18, 0);
    group.add(beam);
  }

  // Optional desert earthen dome atop roof
  if (spec.hasDome) {
    const domeGeo = new THREE.SphereGeometry(
      Math.min(width, depth) * 0.28,
      10,
      8,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.55,
    );
    const dome = new THREE.Mesh(domeGeo, mats.sandstonePlaster);
    dome.position.set(0, 0.25 + wallHeight + 0.28, 0);
    group.add(dome);
    disposables.push(domeGeo);
  }

  // Recessed timber arched doorway & step
  const doorGeo = new THREE.BoxGeometry(1.12, 2.1, 0.14);
  const door = new THREE.Mesh(doorGeo, mats.timberDark);
  door.position.set(0, 1.3, depth * 0.5 + 0.03);
  const stepGeo = new THREE.BoxGeometry(1.85, 0.26, 0.85);
  const step = new THREE.Mesh(stepGeo, trimMat);
  step.position.set(0, 0.14, depth * 0.5 + 0.42);
  group.add(door, step);

  // Shaded fabric awning over entry
  const awningMat =
    spec.awningTone === 'teal'
      ? mats.awningTeal
      : spec.awningTone === 'crimson'
        ? mats.awningCrimson
        : mats.awningAmber;
  const canopyGeo = new THREE.BoxGeometry(width * 0.65, 0.08, 1.5);
  const canopy = new THREE.Mesh(canopyGeo, awningMat);
  canopy.position.set(0, 2.55, depth * 0.5 + 0.72);
  canopy.rotation.x = 0.22;
  group.add(canopy);

  // Glowing side windows & doorway lantern
  const winGeo = new THREE.BoxGeometry(0.62, 0.84, 0.12);
  const winL = new THREE.Mesh(winGeo, mats.windowGlow);
  winL.position.set(-width * 0.28, 1.75, depth * 0.5 + 0.02);
  const winR = new THREE.Mesh(winGeo, mats.windowGlow);
  winR.position.set(width * 0.28, 1.75, depth * 0.5 + 0.02);
  const lampGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.28, 6);
  const lamp = new THREE.Mesh(lampGeo, mats.lanternGlow);
  lamp.position.set(0.85, 2.15, depth * 0.5 + 0.22);
  group.add(winL, winR, lamp);

  disposables.push(
    baseGeo,
    bodyGeo,
    parapetGeo,
    beamGeo,
    doorGeo,
    stepGeo,
    canopyGeo,
    winGeo,
    lampGeo,
  );
  enableShadows(group, true, true);
  return group;
}

/**
 * Desert Sandstone Well with twin columns and timber crossbeam shade.
 */
export function buildDesertWell(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  const apronGeo = new THREE.CylinderGeometry(2.45, 2.7, 0.34, 12);
  const apron = new THREE.Mesh(apronGeo, mats.adobeClay);
  apron.position.y = 0.06;

  const wallGeo = new THREE.CylinderGeometry(1.32, 1.4, 0.92, 12, 1, true);
  const wall = new THREE.Mesh(wallGeo, mats.sandstonePlaster);
  wall.position.y = 0.58;

  const rimGeo = new THREE.TorusGeometry(1.3, 0.17, 6, 12);
  rimGeo.rotateX(Math.PI * 0.5);
  const rim = new THREE.Mesh(rimGeo, mats.adobeClay);
  rim.position.y = 1.05;

  const waterGeo = new THREE.CircleGeometry(1.16, 12);
  waterGeo.rotateX(-Math.PI * 0.5);
  const water = new THREE.Mesh(waterGeo, mats.oasisWater);
  water.position.y = 0.78;

  const colGeo = new THREE.BoxGeometry(0.28, 2.35, 0.28);
  const colL = new THREE.Mesh(colGeo, mats.sandstonePlaster);
  colL.position.set(-1.12, 1.95, 0);
  const colR = new THREE.Mesh(colGeo, mats.sandstonePlaster);
  colR.position.set(1.12, 1.95, 0);

  const canopyGeo = new THREE.BoxGeometry(2.85, 0.14, 1.85);
  const canopy = new THREE.Mesh(canopyGeo, mats.awningTeal);
  canopy.position.set(0, 3.16, 0);

  disposables.push(apronGeo, wallGeo, rimGeo, waterGeo, colGeo, canopyGeo);
  group.add(apron, wall, rim, water, colL, colR, canopy);
  enableShadows(group, true, true);
  return group;
}

/**
 * Desert irrigated herb & spice planter plot framed in sandstone curb.
 */
export function buildDesertOasisPlot(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  const curbGeo = new THREE.BoxGeometry(6.8, 0.42, 4.8);
  const curb = new THREE.Mesh(curbGeo, mats.adobeClay);
  curb.position.y = 0.12;

  const soilGeo = new THREE.BoxGeometry(6.0, 0.14, 4.0);
  const soil = new THREE.Mesh(soilGeo, mats.soilTilled);
  soil.position.y = 0.34;

  const tuftGeo = new THREE.ConeGeometry(0.32, 0.62, 6);
  for (let gx = -2.2; gx <= 2.21; gx += 1.1) {
    for (let gz = -1.2; gz <= 1.21; gz += 1.2) {
      const tuft = new THREE.Mesh(tuftGeo, mats.cropLeaf);
      tuft.position.set(gx, 0.65, gz);
      group.add(tuft);
    }
  }

  disposables.push(curbGeo, soilGeo, tuftGeo);
  group.add(curb, soil);
  enableShadows(group, true, true);
  return group;
}

/**
 * Elevated timber & stone watchtower guarding village approaches and perimeters.
 */
export function buildWatchtower(
  isDesertOrCoastal: boolean,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();
  const baseMat = isDesertOrCoastal ? mats.sandstonePlaster : mats.stoneFoundation;
  const trimMat = isDesertOrCoastal ? mats.adobeClay : mats.timberDark;
  const roofMat = isDesertOrCoastal ? mats.awningAmber : mats.roofCedar;

  const plinthGeo = new THREE.BoxGeometry(3.2, 0.7, 3.2);
  const plinth = new THREE.Mesh(plinthGeo, baseMat);
  plinth.position.y = 0.25;

  const postGeo = new THREE.BoxGeometry(0.28, 4.6, 0.28);
  const postOffsets: Array<[number, number]> = [
    [-1.18, -1.18],
    [1.18, -1.18],
    [-1.18, 1.18],
    [1.18, 1.18],
  ];
  for (const [px, pz] of postOffsets) {
    const post = new THREE.Mesh(postGeo, trimMat);
    post.position.set(px, 2.75, pz);
    group.add(post);
  }

  const deckGeo = new THREE.BoxGeometry(3.35, 0.24, 3.35);
  const deck = new THREE.Mesh(deckGeo, mats.timberWarm);
  deck.position.y = 3.9;

  const railGeo = new THREE.BoxGeometry(3.35, 0.72, 0.14);
  const railN = new THREE.Mesh(railGeo, trimMat);
  railN.position.set(0, 4.38, -1.58);
  const railS = new THREE.Mesh(railGeo, trimMat);
  railS.position.set(0, 4.38, 1.58);

  const railSideGeo = new THREE.BoxGeometry(0.14, 0.72, 3.05);
  const railW = new THREE.Mesh(railSideGeo, trimMat);
  railW.position.set(-1.58, 4.38, 0);
  const railE = new THREE.Mesh(railSideGeo, trimMat);
  railE.position.set(1.58, 4.38, 0);

  const roofGeo = new THREE.ConeGeometry(2.65, 1.75, 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 5.85;
  roof.rotation.y = Math.PI * 0.25;

  const lanternGeo = new THREE.BoxGeometry(0.26, 0.34, 0.26);
  const lantern = new THREE.Mesh(lanternGeo, mats.lanternGlow);
  lantern.position.set(0, 4.78, 1.66);

  disposables.push(plinthGeo, postGeo, deckGeo, railGeo, railSideGeo, roofGeo, lanternGeo);
  group.add(plinth, deck, railN, railS, railW, railE, roof, lantern);
  enableShadows(group, true, true);
  return group;
}

/**
 * Timber & hayloft barn for farming, plains, and valley villages.
 */
export function buildBarn(
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  const baseGeo = new THREE.BoxGeometry(6.8, 0.45, 5.4);
  const base = new THREE.Mesh(baseGeo, mats.stoneFoundation);
  base.position.y = 0.12;

  const bodyGeo = new THREE.BoxGeometry(6.4, 3.2, 5.0);
  const body = new THREE.Mesh(bodyGeo, mats.timberWarm);
  body.position.y = 1.9;

  const roofGeo = new THREE.CylinderGeometry(0.1, 3.85, 6.9, 4, 1);
  roofGeo.rotateZ(Math.PI * 0.5);
  roofGeo.rotateX(Math.PI * 0.25);
  const roof = new THREE.Mesh(roofGeo, mats.roofTerracotta);
  roof.position.y = 4.35;
  roof.scale.set(1.0, 0.55, 1.0);

  const doorGeo = new THREE.BoxGeometry(2.2, 2.35, 0.16);
  const door = new THREE.Mesh(doorGeo, mats.timberDark);
  door.position.set(0, 1.5, 2.52);

  const hayGeo = new THREE.BoxGeometry(1.3, 0.85, 1.05);
  const hay = new THREE.Mesh(hayGeo, mats.hayGold);
  hay.position.set(2.25, 0.68, 2.8);

  const loftWinGeo = new THREE.BoxGeometry(0.9, 0.85, 0.14);
  const loftWin = new THREE.Mesh(loftWinGeo, mats.windowGlow);
  loftWin.position.set(0, 3.1, 2.52);

  disposables.push(baseGeo, bodyGeo, roofGeo, doorGeo, hayGeo, loftWinGeo);
  group.add(base, body, roof, door, hay, loftWin);
  enableShadows(group, true, true);
  return group;
}

/**
 * Village storage shed / supply depot for crates, grain, timber, or desert trade goods.
 */
export function buildStorageShed(
  isDesert: boolean,
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  const floorGeo = new THREE.BoxGeometry(4.4, 0.32, 3.6);
  const floor = new THREE.Mesh(floorGeo, isDesert ? mats.adobeClay : mats.stoneCobble);
  floor.position.y = 0.08;

  const wallMat = isDesert ? mats.sandstonePlaster : mats.plasterOchre;
  const wallGeo = new THREE.BoxGeometry(4.0, 2.35, 3.2);
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = 1.38;

  const roofGeo = new THREE.BoxGeometry(4.5, 0.22, 3.7);
  const roof = new THREE.Mesh(roofGeo, isDesert ? mats.awningAmber : mats.roofCedar);
  roof.position.y = 2.66;
  roof.rotation.x = 0.14;

  const doorGeo = new THREE.BoxGeometry(1.15, 1.78, 0.12);
  const door = new THREE.Mesh(doorGeo, mats.timberDark);
  door.position.set(-0.7, 1.12, 1.62);

  const crateGeo = new THREE.BoxGeometry(0.75, 0.72, 0.75);
  const crate1 = new THREE.Mesh(crateGeo, mats.timberWarm);
  crate1.position.set(1.0, 0.56, 1.9);
  const crate2 = new THREE.Mesh(crateGeo, mats.timberDark);
  crate2.position.set(1.75, 0.56, 1.72);
  crate2.rotation.y = 0.35;

  disposables.push(floorGeo, wallGeo, roofGeo, doorGeo, crateGeo);
  group.add(floor, walls, roof, door, crate1, crate2);
  enableShadows(group, true, true);
  return group;
}

/**
 * Biome-specific village work yard (lumber pile, mining ore depot, coastal rack, or caravan yard).
 */
export function buildWorkYard(
  yardKind: 'lumber' | 'mining' | 'coastal' | 'oasis',
  mats: VillageMaterialPalette,
  disposables: Array<{ dispose: () => void }>,
): THREE.Group {
  const group = new THREE.Group();

  const padGeo = new THREE.CylinderGeometry(3.4, 3.7, 0.22, 10);
  const padMat = yardKind === 'oasis' ? mats.sandRoad : mats.roadGravel;
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.y = 0.04;
  group.add(pad);
  disposables.push(padGeo);

  if (yardKind === 'lumber' || yardKind === 'coastal') {
    const logGeo = new THREE.CylinderGeometry(0.18, 0.21, 2.6, 7);
    logGeo.rotateZ(Math.PI * 0.5);
    disposables.push(logGeo);
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(logGeo, mats.timberWarm);
      log.position.set(-0.6, 0.32 + (i === 2 ? 0.32 : 0), (i === 2 ? 0 : (i - 0.5) * 0.44));
      group.add(log);
    }
    const benchGeo = new THREE.BoxGeometry(1.9, 0.75, 0.75);
    const bench = new THREE.Mesh(benchGeo, mats.timberDark);
    bench.position.set(1.3, 0.48, 0.8);
    group.add(bench);
    disposables.push(benchGeo);
  } else if (yardKind === 'mining') {
    const oreGeo = new THREE.DodecahedronGeometry(0.62, 0);
    disposables.push(oreGeo);
    for (const [ox, oy, oz] of [
      [-1.0, 0.5, -0.5],
      [0.6, 0.46, 0.4],
      [1.2, 0.52, -0.7],
    ]) {
      const ore = new THREE.Mesh(oreGeo, mats.stoneCobble);
      ore.position.set(ox, oy, oz);
      group.add(ore);
    }
    const anvilGeo = new THREE.BoxGeometry(0.95, 0.82, 0.65);
    const anvil = new THREE.Mesh(anvilGeo, mats.ironDark);
    anvil.position.set(-0.2, 0.5, 1.1);
    group.add(anvil);
    disposables.push(anvilGeo);
  } else {
    const baleGeo = new THREE.BoxGeometry(1.1, 0.75, 0.85);
    const b1 = new THREE.Mesh(baleGeo, mats.adobeClay);
    b1.position.set(-1.0, 0.5, -0.4);
    const b2 = new THREE.Mesh(baleGeo, mats.awningTeal);
    b2.position.set(1.0, 0.5, 0.5);
    group.add(b1, b2);
    disposables.push(baleGeo);
  }

  enableShadows(group, true, true);
  return group;
}

