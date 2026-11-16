import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import type { AnimalBehaviorState, AnimalSpecies } from './wildlifeTypes';

export interface WildlifeSharedAssets {
  shadowGeo: THREE.PlaneGeometry;
  shadowMat: THREE.MeshBasicMaterial;

  // Shared materials with varied PBR roughness
  deerCoatMat: THREE.MeshStandardMaterial;
  deerBellyMat: THREE.MeshStandardMaterial;
  deerAntlerMat: THREE.MeshStandardMaterial;
  hoofDarkMat: THREE.MeshStandardMaterial;

  rabbitCoatMat: THREE.MeshStandardMaterial;
  rabbitBrownMat: THREE.MeshStandardMaterial;
  rabbitTailMat: THREE.MeshStandardMaterial;

  wolfCoatMat: THREE.MeshStandardMaterial;
  wolfRuffMat: THREE.MeshStandardMaterial;
  wolfEyeMat: THREE.MeshStandardMaterial;

  bearCoatMat: THREE.MeshStandardMaterial;
  bearSnoutMat: THREE.MeshStandardMaterial;

  birdSongMat: THREE.MeshStandardMaterial;
  birdWingMat: THREE.MeshStandardMaterial;
  birdBeakMat: THREE.MeshStandardMaterial;

  cowHideMat: THREE.MeshStandardMaterial;
  cowPatchMat: THREE.MeshStandardMaterial;
  cowUdderMat: THREE.MeshStandardMaterial;
  sheepWoolMat: THREE.MeshStandardMaterial;
  sheepFaceMat: THREE.MeshStandardMaterial;
  chickenFeatherMat: THREE.MeshStandardMaterial;
  chickenCombMat: THREE.MeshStandardMaterial;

  // Shared part geometries
  deerTorsoGeo: THREE.CapsuleGeometry;
  deerNeckGeo: THREE.CylinderGeometry;
  deerHeadGeo: THREE.SphereGeometry;
  deerSnoutGeo: THREE.CylinderGeometry;
  deerEarGeo: THREE.ConeGeometry;
  deerLegGeo: THREE.CylinderGeometry;
  deerTailGeo: THREE.ConeGeometry;
  deerAntlerStemGeo: THREE.CylinderGeometry;
  deerAntlerTineGeo: THREE.CylinderGeometry;

  rabbitTorsoGeo: THREE.SphereGeometry;
  rabbitHeadGeo: THREE.SphereGeometry;
  rabbitEarGeo: THREE.CapsuleGeometry;
  rabbitTailGeo: THREE.SphereGeometry;
  rabbitHindLegGeo: THREE.CapsuleGeometry;
  rabbitForeLegGeo: THREE.CylinderGeometry;

  wolfTorsoGeo: THREE.CapsuleGeometry;
  wolfRuffGeo: THREE.SphereGeometry;
  wolfHeadGeo: THREE.SphereGeometry;
  wolfSnoutGeo: THREE.ConeGeometry;
  wolfEarGeo: THREE.ConeGeometry;
  wolfLegGeo: THREE.CylinderGeometry;
  wolfTailGeo: THREE.ConeGeometry;
  eyeGeo: THREE.SphereGeometry;

  bearTorsoGeo: THREE.CapsuleGeometry;
  bearHumpGeo: THREE.SphereGeometry;
  bearHeadGeo: THREE.SphereGeometry;
  bearSnoutGeo: THREE.CylinderGeometry;
  bearEarGeo: THREE.SphereGeometry;
  bearLegGeo: THREE.CylinderGeometry;
  bearTailGeo: THREE.SphereGeometry;

  birdBodyGeo: THREE.SphereGeometry;
  birdHeadGeo: THREE.SphereGeometry;
  birdBeakGeo: THREE.ConeGeometry;
  birdWingGeo: THREE.BoxGeometry;
  birdTailGeo: THREE.ConeGeometry;
  birdLegGeo: THREE.CylinderGeometry;

  cowTorsoGeo: THREE.BoxGeometry;
  cowHeadGeo: THREE.BoxGeometry;
  cowHornGeo: THREE.ConeGeometry;
  cowLegGeo: THREE.CylinderGeometry;

  sheepFleeceGeo: THREE.DodecahedronGeometry;
  sheepHeadGeo: THREE.SphereGeometry;
  sheepLegGeo: THREE.CylinderGeometry;

  chickenBodyGeo: THREE.SphereGeometry;
  chickenCombGeo: THREE.BoxGeometry;
  chickenWingGeo: THREE.BoxGeometry;

  // Simplified merged LOD geometries (for InstancedMesh mid-distance tier)
  lodGeos: Record<AnimalSpecies, THREE.BufferGeometry>;
  lodMats: Record<AnimalSpecies, THREE.MeshLambertMaterial>;

  dispose: () => void;
}

function mergeNormalized(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = parts.map((g) => g.toNonIndexed());
  const merged = BufferGeometryUtils.mergeGeometries(nonIndexed, false);
  nonIndexed.forEach((g) => g.dispose());
  parts.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

export function createWildlifeSharedAssets(
  contactShadowMap: THREE.Texture,
): WildlifeSharedAssets {
  const shadowGeo = new THREE.PlaneGeometry(1.1, 1.1);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    depthWrite: false,
    opacity: 0.36,
  });

  const deerCoatMat = new THREE.MeshStandardMaterial({ color: 0xa67449, roughness: 0.86, metalness: 0.02 });
  const deerBellyMat = new THREE.MeshStandardMaterial({ color: 0xe6dac5, roughness: 0.9, metalness: 0.01 });
  const deerAntlerMat = new THREE.MeshStandardMaterial({ color: 0xcab89b, roughness: 0.56, metalness: 0.06 });
  const hoofDarkMat = new THREE.MeshStandardMaterial({ color: 0x262321, roughness: 0.38, metalness: 0.12 });

  const rabbitCoatMat = new THREE.MeshStandardMaterial({ color: 0xc8bca8, roughness: 0.92, metalness: 0.0 });
  const rabbitBrownMat = new THREE.MeshStandardMaterial({ color: 0x8e7258, roughness: 0.9, metalness: 0.0 });
  const rabbitTailMat = new THREE.MeshStandardMaterial({ color: 0xf4f2eb, roughness: 0.94, metalness: 0.0 });

  const wolfCoatMat = new THREE.MeshStandardMaterial({ color: 0x6f757a, roughness: 0.84, metalness: 0.03 });
  const wolfRuffMat = new THREE.MeshStandardMaterial({ color: 0xc9cdcf, roughness: 0.88, metalness: 0.02 });
  const wolfEyeMat = new THREE.MeshStandardMaterial({
    color: 0xe8b04b,
    emissive: 0x5c3e0a,
    emissiveIntensity: 0.35,
    roughness: 0.28,
    metalness: 0.1,
  });

  const bearCoatMat = new THREE.MeshStandardMaterial({ color: 0x4f3624, roughness: 0.9, metalness: 0.02 });
  const bearSnoutMat = new THREE.MeshStandardMaterial({ color: 0x8c6d52, roughness: 0.72, metalness: 0.02 });

  const birdSongMat = new THREE.MeshStandardMaterial({ color: 0x4e7aa6, roughness: 0.72, metalness: 0.05 });
  const birdWingMat = new THREE.MeshStandardMaterial({ color: 0x2e4359, roughness: 0.78, metalness: 0.04 });
  const birdBeakMat = new THREE.MeshStandardMaterial({ color: 0xe2a83b, roughness: 0.42, metalness: 0.08 });

  const cowHideMat = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.86, metalness: 0.02 });
  const cowPatchMat = new THREE.MeshStandardMaterial({ color: 0x3a2d24, roughness: 0.84, metalness: 0.02 });
  const cowUdderMat = new THREE.MeshStandardMaterial({ color: 0xe4b2b2, roughness: 0.78, metalness: 0.0 });
  const sheepWoolMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.96, metalness: 0.0 });
  const sheepFaceMat = new THREE.MeshStandardMaterial({ color: 0x423d37, roughness: 0.82, metalness: 0.02 });
  const chickenFeatherMat = new THREE.MeshStandardMaterial({ color: 0xe8ded1, roughness: 0.86, metalness: 0.02 });
  const chickenCombMat = new THREE.MeshStandardMaterial({ color: 0xc93832, roughness: 0.58, metalness: 0.03 });

  // Part geometries
  const deerTorsoGeo = new THREE.CapsuleGeometry(0.24, 0.78, 5, 10);
  deerTorsoGeo.rotateX(Math.PI * 0.5);
  const deerNeckGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.48, 8);
  const deerHeadGeo = new THREE.SphereGeometry(0.14, 9, 8);
  const deerSnoutGeo = new THREE.CylinderGeometry(0.055, 0.085, 0.19, 7);
  deerSnoutGeo.rotateX(Math.PI * 0.5);
  const deerEarGeo = new THREE.ConeGeometry(0.055, 0.16, 5);
  const deerLegGeo = new THREE.CylinderGeometry(0.055, 0.036, 0.72, 7);
  const deerTailGeo = new THREE.ConeGeometry(0.065, 0.2, 6);
  const deerAntlerStemGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.36, 5);
  const deerAntlerTineGeo = new THREE.CylinderGeometry(0.012, 0.016, 0.18, 5);

  const rabbitTorsoGeo = new THREE.SphereGeometry(0.18, 9, 8);
  rabbitTorsoGeo.scale(0.88, 0.85, 1.25);
  const rabbitHeadGeo = new THREE.SphereGeometry(0.125, 9, 8);
  const rabbitEarGeo = new THREE.CapsuleGeometry(0.032, 0.16, 3, 6);
  const rabbitTailGeo = new THREE.SphereGeometry(0.072, 7, 6);
  const rabbitHindLegGeo = new THREE.CapsuleGeometry(0.052, 0.12, 3, 6);
  rabbitHindLegGeo.rotateX(Math.PI * 0.35);
  const rabbitForeLegGeo = new THREE.CylinderGeometry(0.028, 0.024, 0.16, 6);

  const wolfTorsoGeo = new THREE.CapsuleGeometry(0.2, 0.66, 5, 9);
  wolfTorsoGeo.rotateX(Math.PI * 0.5);
  const wolfRuffGeo = new THREE.SphereGeometry(0.21, 8, 7);
  const wolfHeadGeo = new THREE.SphereGeometry(0.15, 9, 8);
  const wolfSnoutGeo = new THREE.ConeGeometry(0.08, 0.22, 7);
  wolfSnoutGeo.rotateX(Math.PI * 0.5);
  const wolfEarGeo = new THREE.ConeGeometry(0.052, 0.15, 5);
  const wolfLegGeo = new THREE.CylinderGeometry(0.055, 0.038, 0.48, 7);
  const wolfTailGeo = new THREE.ConeGeometry(0.07, 0.44, 6);
  const eyeGeo = new THREE.SphereGeometry(0.024, 6, 5);

  const bearTorsoGeo = new THREE.CapsuleGeometry(0.42, 0.92, 6, 10);
  bearTorsoGeo.rotateX(Math.PI * 0.5);
  const bearHumpGeo = new THREE.SphereGeometry(0.35, 8, 7);
  const bearHeadGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const bearSnoutGeo = new THREE.CylinderGeometry(0.11, 0.15, 0.24, 8);
  bearSnoutGeo.rotateX(Math.PI * 0.5);
  const bearEarGeo = new THREE.SphereGeometry(0.085, 7, 6);
  const bearLegGeo = new THREE.CylinderGeometry(0.125, 0.1, 0.56, 8);
  const bearTailGeo = new THREE.SphereGeometry(0.1, 6, 6);

  const birdBodyGeo = new THREE.SphereGeometry(0.115, 8, 7);
  birdBodyGeo.scale(0.85, 0.85, 1.35);
  const birdHeadGeo = new THREE.SphereGeometry(0.08, 8, 7);
  const birdBeakGeo = new THREE.ConeGeometry(0.032, 0.11, 5);
  birdBeakGeo.rotateX(Math.PI * 0.5);
  const birdWingGeo = new THREE.BoxGeometry(0.26, 0.025, 0.13);
  const birdTailGeo = new THREE.ConeGeometry(0.055, 0.19, 5);
  birdTailGeo.rotateX(-Math.PI * 0.5);
  const birdLegGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.11, 5);

  // Cow geometries
  const cowTorsoGeo = new THREE.BoxGeometry(0.68, 0.64, 1.34);
  const cowHeadGeo = new THREE.BoxGeometry(0.34, 0.34, 0.42);
  const cowHornGeo = new THREE.ConeGeometry(0.045, 0.22, 6);
  const cowLegGeo = new THREE.CylinderGeometry(0.08, 0.065, 0.62, 7);

  // Sheep geometries
  const sheepFleeceGeo = new THREE.DodecahedronGeometry(0.42, 1);
  sheepFleeceGeo.scale(0.92, 0.86, 1.28);
  const sheepHeadGeo = new THREE.SphereGeometry(0.17, 8, 7);
  const sheepLegGeo = new THREE.CylinderGeometry(0.048, 0.04, 0.38, 6);

  // Chicken geometries
  const chickenBodyGeo = new THREE.SphereGeometry(0.17, 8, 7);
  chickenBodyGeo.scale(0.88, 0.88, 1.25);
  const chickenCombGeo = new THREE.BoxGeometry(0.035, 0.08, 0.12);
  const chickenWingGeo = new THREE.BoxGeometry(0.04, 0.12, 0.2);

  // Mid-distance simplified LOD meshes
  const deerLodBody = new THREE.CapsuleGeometry(0.23, 0.74, 3, 6);
  deerLodBody.rotateX(Math.PI * 0.5);
  deerLodBody.translate(0, 0.84, 0);
  const deerLodNeck = new THREE.CylinderGeometry(0.09, 0.12, 0.45, 5);
  deerLodNeck.rotateX(-0.45);
  deerLodNeck.translate(0, 1.12, 0.36);
  const deerLodHead = new THREE.SphereGeometry(0.14, 6, 5);
  deerLodHead.translate(0, 1.32, 0.48);
  const deerLodLeg = new THREE.CylinderGeometry(0.05, 0.035, 0.7, 5);
  const dl1 = deerLodLeg.clone().translate(-0.14, 0.35, 0.28);
  const dl2 = deerLodLeg.clone().translate(0.14, 0.35, 0.28);
  const dl3 = deerLodLeg.clone().translate(-0.14, 0.35, -0.28);
  const dl4 = deerLodLeg.clone().translate(0.14, 0.35, -0.28);
  deerLodLeg.dispose();
  const deerLod = mergeNormalized([deerLodBody, deerLodNeck, deerLodHead, dl1, dl2, dl3, dl4]);

  const rabbitLodBody = new THREE.SphereGeometry(0.18, 6, 5);
  rabbitLodBody.scale(0.9, 0.85, 1.25);
  rabbitLodBody.translate(0, 0.19, 0);
  const rabbitLodHead = new THREE.SphereGeometry(0.12, 6, 5);
  rabbitLodHead.translate(0, 0.3, 0.18);
  const rabbitLodEarL = new THREE.BoxGeometry(0.05, 0.18, 0.05);
  rabbitLodEarL.translate(-0.05, 0.44, 0.16);
  const rabbitLodEarR = new THREE.BoxGeometry(0.05, 0.18, 0.05);
  rabbitLodEarR.translate(0.05, 0.44, 0.16);
  const rabbitLod = mergeNormalized([rabbitLodBody, rabbitLodHead, rabbitLodEarL, rabbitLodEarR]);

  const wolfLodBody = new THREE.CapsuleGeometry(0.2, 0.64, 3, 6);
  wolfLodBody.rotateX(Math.PI * 0.5);
  wolfLodBody.translate(0, 0.56, 0);
  const wolfLodHead = new THREE.ConeGeometry(0.14, 0.32, 6);
  wolfLodHead.rotateX(Math.PI * 0.5);
  wolfLodHead.translate(0, 0.72, 0.44);
  const wolfLodLeg = new THREE.CylinderGeometry(0.05, 0.035, 0.46, 5);
  const wl1 = wolfLodLeg.clone().translate(-0.12, 0.23, 0.24);
  const wl2 = wolfLodLeg.clone().translate(0.12, 0.23, 0.24);
  const wl3 = wolfLodLeg.clone().translate(-0.12, 0.23, -0.24);
  const wl4 = wolfLodLeg.clone().translate(0.12, 0.23, -0.24);
  wolfLodLeg.dispose();
  const wolfLod = mergeNormalized([wolfLodBody, wolfLodHead, wl1, wl2, wl3, wl4]);

  const bearLodBody = new THREE.CapsuleGeometry(0.42, 0.88, 4, 7);
  bearLodBody.rotateX(Math.PI * 0.5);
  bearLodBody.translate(0, 0.76, 0);
  const bearLodHead = new THREE.SphereGeometry(0.27, 7, 5);
  bearLodHead.translate(0, 0.9, 0.56);
  const bearLodLeg = new THREE.CylinderGeometry(0.12, 0.1, 0.52, 5);
  const bl1 = bearLodLeg.clone().translate(-0.24, 0.26, 0.32);
  const bl2 = bearLodLeg.clone().translate(0.24, 0.26, 0.32);
  const bl3 = bearLodLeg.clone().translate(-0.24, 0.26, -0.32);
  const bl4 = bearLodLeg.clone().translate(0.24, 0.26, -0.32);
  bearLodLeg.dispose();
  const bearLod = mergeNormalized([bearLodBody, bearLodHead, bl1, bl2, bl3, bl4]);

  const birdLodBody = new THREE.ConeGeometry(0.11, 0.32, 5);
  birdLodBody.rotateX(Math.PI * 0.5);
  birdLodBody.translate(0, 0.14, 0);
  const birdLodWings = new THREE.BoxGeometry(0.62, 0.03, 0.15);
  birdLodWings.translate(0, 0.16, 0.02);
  const birdLod = mergeNormalized([birdLodBody, birdLodWings]);

  const cowLodBody = new THREE.BoxGeometry(0.66, 0.62, 1.3);
  cowLodBody.translate(0, 0.92, 0);
  const cowLodHead = new THREE.BoxGeometry(0.32, 0.32, 0.38);
  cowLodHead.translate(0, 1.05, 0.76);
  const cowLodLeg = new THREE.CylinderGeometry(0.08, 0.06, 0.62, 5);
  const cl1 = cowLodLeg.clone().translate(-0.22, 0.31, 0.45);
  const cl2 = cowLodLeg.clone().translate(0.22, 0.31, 0.45);
  const cl3 = cowLodLeg.clone().translate(-0.22, 0.31, -0.45);
  const cl4 = cowLodLeg.clone().translate(0.22, 0.31, -0.45);
  cowLodLeg.dispose();
  const cowLod = mergeNormalized([cowLodBody, cowLodHead, cl1, cl2, cl3, cl4]);

  const sheepLodBody = new THREE.DodecahedronGeometry(0.42, 0);
  sheepLodBody.scale(0.92, 0.85, 1.25);
  sheepLodBody.translate(0, 0.62, 0);
  const sheepLodHead = new THREE.SphereGeometry(0.17, 6, 5);
  sheepLodHead.translate(0, 0.72, 0.52);
  const sheepLod = mergeNormalized([sheepLodBody, sheepLodHead]);

  const chickenLodBody = new THREE.SphereGeometry(0.17, 6, 5);
  chickenLodBody.scale(0.9, 0.9, 1.25);
  chickenLodBody.translate(0, 0.24, 0);
  const chickenLodHead = new THREE.SphereGeometry(0.09, 5, 5);
  chickenLodHead.translate(0, 0.4, 0.16);
  const chickenLod = mergeNormalized([chickenLodBody, chickenLodHead]);

  const lodGeos: Record<AnimalSpecies, THREE.BufferGeometry> = {
    deer: deerLod,
    rabbit: rabbitLod,
    wolf: wolfLod,
    bear: bearLod,
    bird: birdLod,
    cow: cowLod,
    sheep: sheepLod,
    chicken: chickenLod,
  };

  const lodMats: Record<AnimalSpecies, THREE.MeshLambertMaterial> = {
    deer: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    rabbit: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    wolf: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    bear: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    bird: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    cow: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    sheep: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    chicken: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  };

  return {
    shadowGeo,
    shadowMat,
    deerCoatMat,
    deerBellyMat,
    deerAntlerMat,
    hoofDarkMat,
    rabbitCoatMat,
    rabbitBrownMat,
    rabbitTailMat,
    wolfCoatMat,
    wolfRuffMat,
    wolfEyeMat,
    bearCoatMat,
    bearSnoutMat,
    birdSongMat,
    birdWingMat,
    birdBeakMat,
    cowHideMat,
    cowPatchMat,
    cowUdderMat,
    sheepWoolMat,
    sheepFaceMat,
    chickenFeatherMat,
    chickenCombMat,
    deerTorsoGeo,
    deerNeckGeo,
    deerHeadGeo,
    deerSnoutGeo,
    deerEarGeo,
    deerLegGeo,
    deerTailGeo,
    deerAntlerStemGeo,
    deerAntlerTineGeo,
    rabbitTorsoGeo,
    rabbitHeadGeo,
    rabbitEarGeo,
    rabbitTailGeo,
    rabbitHindLegGeo,
    rabbitForeLegGeo,
    wolfTorsoGeo,
    wolfRuffGeo,
    wolfHeadGeo,
    wolfSnoutGeo,
    wolfEarGeo,
    wolfLegGeo,
    wolfTailGeo,
    eyeGeo,
    bearTorsoGeo,
    bearHumpGeo,
    bearHeadGeo,
    bearSnoutGeo,
    bearEarGeo,
    bearLegGeo,
    bearTailGeo,
    birdBodyGeo,
    birdHeadGeo,
    birdBeakGeo,
    birdWingGeo,
    birdTailGeo,
    birdLegGeo,
    cowTorsoGeo,
    cowHeadGeo,
    cowHornGeo,
    cowLegGeo,
    sheepFleeceGeo,
    sheepHeadGeo,
    sheepLegGeo,
    chickenBodyGeo,
    chickenCombGeo,
    chickenWingGeo,
    lodGeos,
    lodMats,
    dispose: () => {
      shadowGeo.dispose();
      shadowMat.dispose();
      deerCoatMat.dispose();
      deerBellyMat.dispose();
      deerAntlerMat.dispose();
      hoofDarkMat.dispose();
      rabbitCoatMat.dispose();
      rabbitBrownMat.dispose();
      rabbitTailMat.dispose();
      wolfCoatMat.dispose();
      wolfRuffMat.dispose();
      wolfEyeMat.dispose();
      bearCoatMat.dispose();
      bearSnoutMat.dispose();
      birdSongMat.dispose();
      birdWingMat.dispose();
      birdBeakMat.dispose();
      cowHideMat.dispose();
      cowPatchMat.dispose();
      cowUdderMat.dispose();
      sheepWoolMat.dispose();
      sheepFaceMat.dispose();
      chickenFeatherMat.dispose();
      chickenCombMat.dispose();

      deerTorsoGeo.dispose();
      deerNeckGeo.dispose();
      deerHeadGeo.dispose();
      deerSnoutGeo.dispose();
      deerEarGeo.dispose();
      deerLegGeo.dispose();
      deerTailGeo.dispose();
      deerAntlerStemGeo.dispose();
      deerAntlerTineGeo.dispose();

      rabbitTorsoGeo.dispose();
      rabbitHeadGeo.dispose();
      rabbitEarGeo.dispose();
      rabbitTailGeo.dispose();
      rabbitHindLegGeo.dispose();
      rabbitForeLegGeo.dispose();

      wolfTorsoGeo.dispose();
      wolfRuffGeo.dispose();
      wolfHeadGeo.dispose();
      wolfSnoutGeo.dispose();
      wolfEarGeo.dispose();
      wolfLegGeo.dispose();
      wolfTailGeo.dispose();
      eyeGeo.dispose();

      bearTorsoGeo.dispose();
      bearHumpGeo.dispose();
      bearHeadGeo.dispose();
      bearSnoutGeo.dispose();
      bearEarGeo.dispose();
      bearLegGeo.dispose();
      bearTailGeo.dispose();

      birdBodyGeo.dispose();
      birdHeadGeo.dispose();
      birdBeakGeo.dispose();
      birdWingGeo.dispose();
      birdTailGeo.dispose();
      birdLegGeo.dispose();

      cowTorsoGeo.dispose();
      cowHeadGeo.dispose();
      cowHornGeo.dispose();
      cowLegGeo.dispose();
      sheepFleeceGeo.dispose();
      sheepHeadGeo.dispose();
      sheepLegGeo.dispose();
      chickenBodyGeo.dispose();
      chickenCombGeo.dispose();
      chickenWingGeo.dispose();

      Object.values(lodGeos).forEach((g) => g.dispose());
      Object.values(lodMats).forEach((m) => m.dispose());
    },
  };
}

/**
 * Articulated composite 3D rig for all wildlife and livestock species.
 */
export class AnimalRig {
  public readonly species: AnimalSpecies;
  public readonly root = new THREE.Group();

  private readonly bodyPivot = new THREE.Group();
  private readonly headPivot = new THREE.Group();
  private readonly tailPivot = new THREE.Group();
  private readonly legFL = new THREE.Group();
  private readonly legFR = new THREE.Group();
  private readonly legBL = new THREE.Group();
  private readonly legBR = new THREE.Group();
  private readonly wingL = new THREE.Group();
  private readonly wingR = new THREE.Group();
  private readonly antlersGroup = new THREE.Group();
  private readonly shadowMesh: THREE.Mesh;

  private phase = 0;
  private baseBodyY = 0;
  private baseHeadRotX = 0;
  private readonly shadowCasters: THREE.Mesh[] = [];
  private lastCastShadow: boolean;

  constructor(
    species: AnimalSpecies,
    assets: WildlifeSharedAssets,
    isSoftwareGl: boolean,
  ) {
    this.species = species;
    this.lastCastShadow = !isSoftwareGl;
    this.root.add(this.bodyPivot);

    this.shadowMesh = new THREE.Mesh(assets.shadowGeo, assets.shadowMat);
    this.shadowMesh.position.y = 0.03;
    this.root.add(this.shadowMesh);

    if (species === 'deer') {
      this.buildDeer(assets, isSoftwareGl);
    } else if (species === 'rabbit') {
      this.buildRabbit(assets, isSoftwareGl);
    } else if (species === 'wolf') {
      this.buildWolf(assets, isSoftwareGl);
    } else if (species === 'bear') {
      this.buildBear(assets, isSoftwareGl);
    } else if (species === 'cow') {
      this.buildCow(assets, isSoftwareGl);
    } else if (species === 'sheep') {
      this.buildSheep(assets, isSoftwareGl);
    } else if (species === 'chicken') {
      this.buildChicken(assets, isSoftwareGl);
    } else {
      this.buildBird(assets, isSoftwareGl);
    }

    if (!isSoftwareGl) {
      this.bodyPivot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).castShadow) {
          this.shadowCasters.push(obj as THREE.Mesh);
        }
      });
    }
  }

  public setShadowCasting(enabled: boolean): void {
    if (this.lastCastShadow === enabled) return;
    this.lastCastShadow = enabled;
    for (let i = 0; i < this.shadowCasters.length; i++) {
      this.shadowCasters[i].castShadow = enabled;
    }
  }

  public setVariant(variant: number): void {
    if (this.species === 'deer') {
      this.antlersGroup.visible = variant % 2 === 0;
    }
  }

  private buildDeer(assets: WildlifeSharedAssets, isSoftwareGl: boolean): void {
    const cast = !isSoftwareGl;
    this.shadowMesh.scale.setScalar(1.3);
    this.baseBodyY = 0;

    const torso = new THREE.Mesh(assets.deerTorsoGeo, assets.deerCoatMat);
    torso.position.set(0, 0.88, 0);
    torso.castShadow = cast;
    torso.receiveShadow = true;

    const belly = new THREE.Mesh(assets.deerTorsoGeo, assets.deerBellyMat);
    belly.scale.set(0.84, 0.72, 0.92);
    belly.position.set(0, 0.81, -0.02);

    this.tailPivot.position.set(0, 0.98, -0.52);
    const tail = new THREE.Mesh(assets.deerTailGeo, assets.deerBellyMat);
    tail.rotation.x = -0.6;
    tail.position.set(0, 0.03, -0.07);
    this.tailPivot.add(tail);

    this.headPivot.position.set(0, 1.0, 0.42);
    this.baseHeadRotX = 0;

    const neck = new THREE.Mesh(assets.deerNeckGeo, assets.deerCoatMat);
    neck.rotation.x = 0.42;
    neck.position.set(0, 0.18, 0.1);
    neck.castShadow = cast;

    const head = new THREE.Mesh(assets.deerHeadGeo, assets.deerCoatMat);
    head.position.set(0, 0.39, 0.21);
    head.castShadow = cast;

    const snout = new THREE.Mesh(assets.deerSnoutGeo, assets.deerCoatMat);
    snout.position.set(0, 0.35, 0.34);

    const nose = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    nose.position.set(0, 0.36, 0.43);

    const eyeL = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeL.position.set(-0.085, 0.42, 0.28);
    const eyeR = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeR.position.set(0.085, 0.42, 0.28);

    const earL = new THREE.Mesh(assets.deerEarGeo, assets.deerCoatMat);
    earL.position.set(-0.11, 0.5, 0.14);
    earL.rotation.set(-0.3, 0, 0.55);
    const earR = new THREE.Mesh(assets.deerEarGeo, assets.deerCoatMat);
    earR.position.set(0.11, 0.5, 0.14);
    earR.rotation.set(-0.3, 0, -0.55);

    this.antlersGroup.position.set(0, 0.5, 0.18);
    for (const side of [-1, 1]) {
      const stem = new THREE.Mesh(assets.deerAntlerStemGeo, assets.deerAntlerMat);
      stem.position.set(side * 0.1, 0.16, -0.02);
      stem.rotation.z = -side * 0.42;
      stem.rotation.x = -0.2;
      const tine = new THREE.Mesh(assets.deerAntlerTineGeo, assets.deerAntlerMat);
      tine.position.set(side * 0.16, 0.23, 0.05);
      tine.rotation.x = 0.45;
      tine.rotation.z = -side * 0.2;
      this.antlersGroup.add(stem, tine);
    }

    this.headPivot.add(neck, head, snout, nose, eyeL, eyeR, earL, earR, this.antlersGroup);

    const legs: Array<[THREE.Group, number, number]> = [
      [this.legFL, -0.15, 0.33],
      [this.legFR, 0.15, 0.33],
      [this.legBL, -0.15, -0.33],
      [this.legBR, 0.15, -0.33],
    ];
    for (const [grp, lx, lz] of legs) {
      grp.position.set(lx, 0.72, lz);
      const legMesh = new THREE.Mesh(assets.deerLegGeo, assets.deerCoatMat);
      legMesh.position.y = -0.36;
      legMesh.castShadow = cast;
      const hoof = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
      hoof.scale.set(1.5, 1.3, 1.6);
      hoof.position.y = -0.7;
      grp.add(legMesh, hoof);
      this.bodyPivot.add(grp);
    }

    this.bodyPivot.add(torso, belly, this.tailPivot, this.headPivot);
  }

  private buildRabbit(assets: WildlifeSharedAssets, isSoftwareGl: boolean): void {
    const cast = !isSoftwareGl;
    this.shadowMesh.scale.setScalar(0.5);
    this.baseBodyY = 0;

    const torso = new THREE.Mesh(assets.rabbitTorsoGeo, assets.rabbitCoatMat);
    torso.position.set(0, 0.19, 0);
    torso.castShadow = cast;

    this.tailPivot.position.set(0, 0.18, -0.2);
    const tail = new THREE.Mesh(assets.rabbitTailGeo, assets.rabbitTailMat);
    this.tailPivot.add(tail);

    this.headPivot.position.set(0, 0.25, 0.17);
    this.baseHeadRotX = 0;
    const head = new THREE.Mesh(assets.rabbitHeadGeo, assets.rabbitCoatMat);
    head.position.set(0, 0.04, 0.04);
    head.castShadow = cast;

    const earL = new THREE.Mesh(assets.rabbitEarGeo, assets.rabbitBrownMat);
    earL.position.set(-0.055, 0.21, -0.01);
    earL.rotation.set(-0.18, 0, 0.16);
    const earR = new THREE.Mesh(assets.rabbitEarGeo, assets.rabbitBrownMat);
    earR.position.set(0.055, 0.21, -0.01);
    earR.rotation.set(-0.18, 0, -0.16);

    const eyeL = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeL.scale.setScalar(0.7);
    eyeL.position.set(-0.08, 0.07, 0.12);
    const eyeR = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeR.scale.setScalar(0.7);
    eyeR.position.set(0.08, 0.07, 0.12);
    this.headPivot.add(head, earL, earR, eyeL, eyeR);

    this.legFL.position.set(-0.07, 0.14, 0.12);
    const fL = new THREE.Mesh(assets.rabbitForeLegGeo, assets.rabbitCoatMat);
    fL.position.y = -0.07;
    this.legFL.add(fL);

    this.legFR.position.set(0.07, 0.14, 0.12);
    const fR = new THREE.Mesh(assets.rabbitForeLegGeo, assets.rabbitCoatMat);
    fR.position.y = -0.07;
    this.legFR.add(fR);

    this.legBL.position.set(-0.1, 0.14, -0.1);
    const bL = new THREE.Mesh(assets.rabbitHindLegGeo, assets.rabbitBrownMat);
    bL.position.set(0, -0.05, 0.03);
    this.legBL.add(bL);

    this.legBR.position.set(0.1, 0.14, -0.1);
    const bR = new THREE.Mesh(assets.rabbitHindLegGeo, assets.rabbitBrownMat);
    bR.position.set(0, -0.05, 0.03);
    this.legBR.add(bR);

    this.bodyPivot.add(
      torso,
      this.tailPivot,
      this.headPivot,
      this.legFL,
      this.legFR,
      this.legBL,
      this.legBR,
    );
  }

  private buildWolf(assets: WildlifeSharedAssets, isSoftwareGl: boolean): void {
    const cast = !isSoftwareGl;
    this.shadowMesh.scale.setScalar(1.05);
    this.baseBodyY = 0;

    const torso = new THREE.Mesh(assets.wolfTorsoGeo, assets.wolfCoatMat);
    torso.position.set(0, 0.56, 0);
    torso.castShadow = cast;
    torso.receiveShadow = true;

    const ruff = new THREE.Mesh(assets.wolfRuffGeo, assets.wolfRuffMat);
    ruff.scale.set(0.95, 0.92, 0.88);
    ruff.position.set(0, 0.59, 0.25);

    this.tailPivot.position.set(0, 0.6, -0.44);
    const tail = new THREE.Mesh(assets.wolfTailGeo, assets.wolfCoatMat);
    tail.rotation.x = -1.95;
    tail.position.set(0, -0.05, -0.18);
    this.tailPivot.add(tail);

    this.headPivot.position.set(0, 0.66, 0.36);
    this.baseHeadRotX = 0;

    const head = new THREE.Mesh(assets.wolfHeadGeo, assets.wolfCoatMat);
    head.position.set(0, 0.08, 0.11);
    head.castShadow = cast;

    const snout = new THREE.Mesh(assets.wolfSnoutGeo, assets.wolfRuffMat);
    snout.position.set(0, 0.05, 0.26);

    const nose = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    nose.position.set(0, 0.06, 0.36);

    const eyeL = new THREE.Mesh(assets.eyeGeo, assets.wolfEyeMat);
    eyeL.position.set(-0.07, 0.12, 0.21);
    const eyeR = new THREE.Mesh(assets.eyeGeo, assets.wolfEyeMat);
    eyeR.position.set(0.07, 0.12, 0.21);

    const earL = new THREE.Mesh(assets.wolfEarGeo, assets.wolfCoatMat);
    earL.position.set(-0.085, 0.23, 0.06);
    earL.rotation.z = 0.18;
    const earR = new THREE.Mesh(assets.wolfEarGeo, assets.wolfCoatMat);
    earR.position.set(0.085, 0.23, 0.06);
    earR.rotation.z = -0.18;

    this.headPivot.add(head, snout, nose, eyeL, eyeR, earL, earR);

    const legs: Array<[THREE.Group, number, number]> = [
      [this.legFL, -0.12, 0.26],
      [this.legFR, 0.12, 0.26],
      [this.legBL, -0.12, -0.28],
      [this.legBR, 0.12, -0.28],
    ];
    for (const [grp, lx, lz] of legs) {
      grp.position.set(lx, 0.46, lz);
      const legMesh = new THREE.Mesh(assets.wolfLegGeo, assets.wolfCoatMat);
      legMesh.position.y = -0.23;
      legMesh.castShadow = cast;
      grp.add(legMesh);
      this.bodyPivot.add(grp);
    }

    this.bodyPivot.add(torso, ruff, this.tailPivot, this.headPivot);
  }

  private buildBear(assets: WildlifeSharedAssets, isSoftwareGl: boolean): void {
    const cast = !isSoftwareGl;
    this.shadowMesh.scale.setScalar(1.85);
    this.baseBodyY = 0;

    const torso = new THREE.Mesh(assets.bearTorsoGeo, assets.bearCoatMat);
    torso.position.set(0, 0.78, 0);
    torso.castShadow = cast;
    torso.receiveShadow = true;

    const hump = new THREE.Mesh(assets.bearHumpGeo, assets.bearCoatMat);
    hump.position.set(0, 0.95, 0.26);
    hump.castShadow = cast;

    this.tailPivot.position.set(0, 0.82, -0.68);
    const tail = new THREE.Mesh(assets.bearTailGeo, assets.bearCoatMat);
    this.tailPivot.add(tail);

    this.headPivot.position.set(0, 0.88, 0.56);
    this.baseHeadRotX = 0;

    const head = new THREE.Mesh(assets.bearHeadGeo, assets.bearCoatMat);
    head.position.set(0, 0.05, 0.14);
    head.castShadow = cast;

    const snout = new THREE.Mesh(assets.bearSnoutGeo, assets.bearSnoutMat);
    snout.position.set(0, -0.02, 0.36);

    const nose = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    nose.scale.setScalar(1.7);
    nose.position.set(0, 0.02, 0.48);

    const eyeL = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeL.scale.setScalar(1.1);
    eyeL.position.set(-0.12, 0.12, 0.34);
    const eyeR = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeR.scale.setScalar(1.1);
    eyeR.position.set(0.12, 0.12, 0.34);

    const earL = new THREE.Mesh(assets.bearEarGeo, assets.bearCoatMat);
    earL.position.set(-0.2, 0.26, 0.08);
    const earR = new THREE.Mesh(assets.bearEarGeo, assets.bearCoatMat);
    earR.position.set(0.2, 0.26, 0.08);

    this.headPivot.add(head, snout, nose, eyeL, eyeR, earL, earR);

    const legs: Array<[THREE.Group, number, number]> = [
      [this.legFL, -0.25, 0.36],
      [this.legFR, 0.25, 0.36],
      [this.legBL, -0.25, -0.38],
      [this.legBR, 0.25, -0.38],
    ];
    for (const [grp, lx, lz] of legs) {
      grp.position.set(lx, 0.54, lz);
      const legMesh = new THREE.Mesh(assets.bearLegGeo, assets.bearCoatMat);
      legMesh.position.y = -0.27;
      legMesh.castShadow = cast;
      grp.add(legMesh);
      this.bodyPivot.add(grp);
    }

    this.bodyPivot.add(torso, hump, this.tailPivot, this.headPivot);
  }

  private buildCow(assets: WildlifeSharedAssets, isSoftwareGl: boolean): void {
    const cast = !isSoftwareGl;
    this.shadowMesh.scale.setScalar(1.7);
    this.baseBodyY = 0;

    const torso = new THREE.Mesh(assets.cowTorsoGeo, assets.cowHideMat);
    torso.position.set(0, 0.92, 0);
    torso.castShadow = cast;
    torso.receiveShadow = true;

    const patch1 = new THREE.Mesh(assets.cowHeadGeo, assets.cowPatchMat);
    patch1.scale.set(1.2, 1.1, 1.35);
    patch1.position.set(-0.18, 0.95, 0.18);

    const patch2 = new THREE.Mesh(assets.cowHeadGeo, assets.cowPatchMat);
    patch2.scale.set(1.15, 1.0, 1.15);
    patch2.position.set(0.18, 0.92, -0.32);

    const udder = new THREE.Mesh(assets.bearTailGeo, assets.cowUdderMat);
    udder.scale.set(1.5, 1.1, 1.4);
    udder.position.set(0, 0.56, -0.3);

    this.tailPivot.position.set(0, 1.06, -0.68);
    const tail = new THREE.Mesh(assets.wolfTailGeo, assets.cowPatchMat);
    tail.rotation.x = 0.2;
    tail.position.set(0, -0.2, -0.05);
    this.tailPivot.add(tail);

    this.headPivot.position.set(0, 1.06, 0.62);
    this.baseHeadRotX = 0;

    const head = new THREE.Mesh(assets.cowHeadGeo, assets.cowHideMat);
    head.position.set(0, 0.02, 0.22);
    head.castShadow = cast;

    const snout = new THREE.Mesh(assets.cowHeadGeo, assets.cowUdderMat);
    snout.scale.set(0.92, 0.55, 0.42);
    snout.position.set(0, -0.08, 0.42);

    const hornL = new THREE.Mesh(assets.cowHornGeo, assets.deerAntlerMat);
    hornL.position.set(-0.19, 0.2, 0.18);
    hornL.rotation.z = 0.55;
    const hornR = new THREE.Mesh(assets.cowHornGeo, assets.deerAntlerMat);
    hornR.position.set(0.19, 0.2, 0.18);
    hornR.rotation.z = -0.55;

    const eyeL = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeL.position.set(-0.17, 0.07, 0.34);
    const eyeR = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeR.position.set(0.17, 0.07, 0.34);

    this.headPivot.add(head, snout, hornL, hornR, eyeL, eyeR);

    const legs: Array<[THREE.Group, number, number]> = [
      [this.legFL, -0.22, 0.46],
      [this.legFR, 0.22, 0.46],
      [this.legBL, -0.22, -0.46],
      [this.legBR, 0.22, -0.46],
    ];
    for (const [grp, lx, lz] of legs) {
      grp.position.set(lx, 0.62, lz);
      const legMesh = new THREE.Mesh(assets.cowLegGeo, assets.cowHideMat);
      legMesh.position.y = -0.31;
      legMesh.castShadow = cast;
      const hoof = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
      hoof.scale.set(2.2, 1.5, 2.2);
      hoof.position.y = -0.59;
      grp.add(legMesh, hoof);
      this.bodyPivot.add(grp);
    }

    this.bodyPivot.add(torso, patch1, patch2, udder, this.tailPivot, this.headPivot);
  }

  private buildSheep(assets: WildlifeSharedAssets, isSoftwareGl: boolean): void {
    const cast = !isSoftwareGl;
    this.shadowMesh.scale.setScalar(1.05);
    this.baseBodyY = 0;

    const wool = new THREE.Mesh(assets.sheepFleeceGeo, assets.sheepWoolMat);
    wool.position.set(0, 0.62, 0);
    wool.castShadow = cast;
    wool.receiveShadow = true;

    this.tailPivot.position.set(0, 0.6, -0.52);
    const tail = new THREE.Mesh(assets.rabbitTailGeo, assets.sheepWoolMat);
    tail.scale.setScalar(1.3);
    this.tailPivot.add(tail);

    this.headPivot.position.set(0, 0.72, 0.45);
    this.baseHeadRotX = 0;
    const head = new THREE.Mesh(assets.sheepHeadGeo, assets.sheepFaceMat);
    head.position.set(0, 0, 0.14);
    head.castShadow = cast;
    const earL = new THREE.Mesh(assets.deerEarGeo, assets.sheepFaceMat);
    earL.position.set(-0.15, 0.04, 0.08);
    earL.rotation.z = 1.1;
    const earR = new THREE.Mesh(assets.deerEarGeo, assets.sheepFaceMat);
    earR.position.set(0.15, 0.04, 0.08);
    earR.rotation.z = -1.1;
    this.headPivot.add(head, earL, earR);

    const legs: Array<[THREE.Group, number, number]> = [
      [this.legFL, -0.16, 0.28],
      [this.legFR, 0.16, 0.28],
      [this.legBL, -0.16, -0.28],
      [this.legBR, 0.16, -0.28],
    ];
    for (const [grp, lx, lz] of legs) {
      grp.position.set(lx, 0.38, lz);
      const legMesh = new THREE.Mesh(assets.sheepLegGeo, assets.sheepFaceMat);
      legMesh.position.y = -0.19;
      legMesh.castShadow = cast;
      grp.add(legMesh);
      this.bodyPivot.add(grp);
    }

    this.bodyPivot.add(wool, this.tailPivot, this.headPivot);
  }

  private buildChicken(assets: WildlifeSharedAssets, isSoftwareGl: boolean): void {
    const cast = !isSoftwareGl;
    this.shadowMesh.scale.setScalar(0.45);
    this.baseBodyY = 0;

    const body = new THREE.Mesh(assets.chickenBodyGeo, assets.chickenFeatherMat);
    body.position.set(0, 0.24, 0);
    body.castShadow = cast;

    this.headPivot.position.set(0, 0.34, 0.15);
    this.baseHeadRotX = 0;

    const head = new THREE.Mesh(assets.birdHeadGeo, assets.chickenFeatherMat);
    head.scale.setScalar(1.15);
    head.position.set(0, 0.06, 0.03);
    const comb = new THREE.Mesh(assets.chickenCombGeo, assets.chickenCombMat);
    comb.position.set(0, 0.15, 0.03);
    const wattle = new THREE.Mesh(assets.chickenCombGeo, assets.chickenCombMat);
    wattle.scale.set(0.7, 0.55, 0.5);
    wattle.position.set(0, 0.0, 0.1);
    const beak = new THREE.Mesh(assets.birdBeakGeo, assets.birdBeakMat);
    beak.position.set(0, 0.05, 0.14);
    this.headPivot.add(head, comb, wattle, beak);

    this.tailPivot.position.set(0, 0.28, -0.18);
    const tail = new THREE.Mesh(assets.birdTailGeo, assets.chickenFeatherMat);
    tail.rotation.x = -0.65;
    this.tailPivot.add(tail);

    this.wingL.position.set(-0.15, 0.24, 0);
    const wl = new THREE.Mesh(assets.chickenWingGeo, assets.chickenFeatherMat);
    this.wingL.add(wl);
    this.wingR.position.set(0.15, 0.24, 0);
    const wr = new THREE.Mesh(assets.chickenWingGeo, assets.chickenFeatherMat);
    this.wingR.add(wr);

    this.legFL.position.set(-0.05, 0.13, 0);
    const lLeg = new THREE.Mesh(assets.birdLegGeo, assets.birdBeakMat);
    lLeg.position.y = -0.065;
    this.legFL.add(lLeg);

    this.legFR.position.set(0.05, 0.13, 0);
    const rLeg = new THREE.Mesh(assets.birdLegGeo, assets.birdBeakMat);
    rLeg.position.y = -0.065;
    this.legFR.add(rLeg);

    this.bodyPivot.add(
      body,
      this.headPivot,
      this.tailPivot,
      this.wingL,
      this.wingR,
      this.legFL,
      this.legFR,
    );
  }

  private buildBird(assets: WildlifeSharedAssets, isSoftwareGl: boolean): void {
    const cast = !isSoftwareGl;
    this.shadowMesh.scale.setScalar(0.38);
    this.baseBodyY = 0;

    const body = new THREE.Mesh(assets.birdBodyGeo, assets.birdSongMat);
    body.position.set(0, 0.16, 0);
    body.castShadow = cast;

    this.headPivot.position.set(0, 0.23, 0.11);
    this.baseHeadRotX = 0;

    const head = new THREE.Mesh(assets.birdHeadGeo, assets.birdSongMat);
    head.position.set(0, 0.03, 0.03);
    head.castShadow = cast;

    const beak = new THREE.Mesh(assets.birdBeakGeo, assets.birdBeakMat);
    beak.position.set(0, 0.02, 0.13);

    const eyeL = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeL.scale.setScalar(0.55);
    eyeL.position.set(-0.06, 0.05, 0.07);
    const eyeR = new THREE.Mesh(assets.eyeGeo, assets.hoofDarkMat);
    eyeR.scale.setScalar(0.55);
    eyeR.position.set(0.06, 0.05, 0.07);

    this.headPivot.add(head, beak, eyeL, eyeR);

    this.tailPivot.position.set(0, 0.16, -0.14);
    const tail = new THREE.Mesh(assets.birdTailGeo, assets.birdWingMat);
    tail.rotation.x = 0.26;
    tail.position.z = -0.07;
    this.tailPivot.add(tail);

    this.wingL.position.set(-0.085, 0.18, 0.01);
    const wlMesh = new THREE.Mesh(assets.birdWingGeo, assets.birdWingMat);
    wlMesh.position.x = -0.12;
    wlMesh.castShadow = cast;
    this.wingL.add(wlMesh);

    this.wingR.position.set(0.085, 0.18, 0.01);
    const wrMesh = new THREE.Mesh(assets.birdWingGeo, assets.birdWingMat);
    wrMesh.position.x = 0.12;
    wrMesh.castShadow = cast;
    this.wingR.add(wrMesh);

    this.legFL.position.set(-0.035, 0.1, 0);
    const lLeg = new THREE.Mesh(assets.birdLegGeo, assets.birdBeakMat);
    lLeg.position.y = -0.05;
    this.legFL.add(lLeg);

    this.legFR.position.set(0.035, 0.1, 0);
    const rLeg = new THREE.Mesh(assets.birdLegGeo, assets.birdBeakMat);
    rLeg.position.y = -0.05;
    this.legFR.add(rLeg);

    this.bodyPivot.add(
      body,
      this.headPivot,
      this.tailPivot,
      this.wingL,
      this.wingR,
      this.legFL,
      this.legFR,
    );
  }

  public updateAnimation(
    dt: number,
    elapsed: number,
    behaviorState: AnimalBehaviorState,
    speed: number,
    airborne: boolean,
    altitude: number,
    seedPhase: number,
  ): void {
    // Death collapse animation (topple sideways & stop all motion)
    if (behaviorState === 'dead') {
      const collapseY =
        this.species === 'cow' || this.species === 'deer' || this.species === 'bear'
          ? 0.34
          : this.species === 'wolf' || this.species === 'sheep'
            ? 0.24
            : 0.1;
      this.bodyPivot.rotation.z = THREE.MathUtils.damp(
        this.bodyPivot.rotation.z,
        Math.PI * 0.48,
        10,
        dt,
      );
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0.08, 10, dt);
      this.bodyPivot.position.y = THREE.MathUtils.damp(
        this.bodyPivot.position.y,
        collapseY,
        10,
        dt,
      );
      this.shadowMesh.visible = false;
      return;
    }

    this.shadowMesh.visible = true;
    const t = elapsed + seedPhase;
    const isMoving =
      behaviorState === 'wander' ||
      behaviorState === 'flee' ||
      behaviorState === 'chase';

    if (this.species === 'bird') {
      this.bodyPivot.rotation.z = THREE.MathUtils.damp(this.bodyPivot.rotation.z, 0, 10, dt);
      const targetBodyY = airborne ? altitude : 0;
      this.bodyPivot.position.y = THREE.MathUtils.damp(
        this.bodyPivot.position.y,
        targetBodyY,
        10,
        dt,
      );
      this.shadowMesh.scale.setScalar(airborne ? Math.max(0.18, 0.4 - altitude * 0.018) : 0.38);

      if (airborne) {
        const flapFreq = behaviorState === 'flee' ? 20 : 14;
        const flap = Math.sin(t * flapFreq) * 0.72;
        this.wingL.rotation.z = flap;
        this.wingR.rotation.z = -flap;
        this.wingL.rotation.x = 0;
        this.wingR.rotation.x = 0;
        this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, -0.08, 8, dt);
        this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, 0, 8, dt);
        this.tailPivot.rotation.x = Math.sin(t * 4) * 0.08;
      } else {
        this.wingL.rotation.z = THREE.MathUtils.damp(this.wingL.rotation.z, 1.05, 12, dt);
        this.wingR.rotation.z = THREE.MathUtils.damp(this.wingR.rotation.z, -1.05, 12, dt);
        if (behaviorState === 'eat') {
          const peck = Math.max(0, Math.sin(t * 6.5)) * 0.65;
          this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, peck, 14, dt);
          this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0.25, 10, dt);
        } else if (behaviorState === 'sleep') {
          this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, -0.05, 8, dt);
          this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, 0.35, 8, dt);
          this.headPivot.rotation.y = THREE.MathUtils.damp(this.headPivot.rotation.y, 0.5, 8, dt);
        } else {
          this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0, 10, dt);
          this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, 0, 10, dt);
          this.headPivot.rotation.y = THREE.MathUtils.damp(
            this.headPivot.rotation.y,
            Math.sin(t * 2.3) * 0.32,
            8,
            dt,
          );
        }
      }
      return;
    }

    if (this.species === 'chicken') {
      this.bodyPivot.rotation.z = THREE.MathUtils.damp(this.bodyPivot.rotation.z, 0, 10, dt);
      if (behaviorState === 'sleep') {
        this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, -0.08, 8, dt);
        this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, 0.35, 8, dt);
        return;
      }
      if (behaviorState === 'eat') {
        const peck = Math.max(0, Math.sin(t * 7.5)) * 0.72;
        this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, 0, 10, dt);
        this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0.32, 10, dt);
        this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, peck, 14, dt);
        return;
      }
      if (isMoving && speed > 0.2) {
        this.phase += dt * (behaviorState === 'flee' ? 16 : 9);
        const swing = Math.sin(this.phase) * 0.6;
        this.legFL.rotation.x = swing;
        this.legFR.rotation.x = -swing;
        this.bodyPivot.position.y = Math.abs(Math.cos(this.phase)) * 0.03;
        this.headPivot.rotation.z = Math.sin(this.phase) * 0.08;
        this.wingL.rotation.z = behaviorState === 'flee' ? Math.sin(t * 18) * 0.45 : 0;
        this.wingR.rotation.z = -this.wingL.rotation.z;
        return;
      }
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, 0, 10, dt);
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0, 10, dt);
      this.legFL.rotation.x = THREE.MathUtils.damp(this.legFL.rotation.x, 0, 10, dt);
      this.legFR.rotation.x = THREE.MathUtils.damp(this.legFR.rotation.x, 0, 10, dt);
      this.headPivot.rotation.y = THREE.MathUtils.damp(
        this.headPivot.rotation.y,
        Math.sin(t * 2.1) * 0.35,
        8,
        dt,
      );
      return;
    }

    // Quadrupeds (Deer, Rabbit, Wolf, Bear, Cow, Sheep)
    if (behaviorState === 'sleep') {
      const dropY =
        this.species === 'bear' || this.species === 'cow'
          ? -0.34
          : this.species === 'deer'
            ? -0.45
            : this.species === 'wolf' || this.species === 'sheep'
              ? -0.26
              : -0.08;
      const breath = Math.sin(t * 1.4) * 0.015;
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, dropY + breath, 6, dt);
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0.06, 6, dt);
      this.bodyPivot.rotation.z = THREE.MathUtils.damp(this.bodyPivot.rotation.z, 0, 6, dt);
      this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, 0.42, 6, dt);
      this.headPivot.rotation.y = THREE.MathUtils.damp(this.headPivot.rotation.y, 0.45, 6, dt);
      this.legFL.rotation.x = THREE.MathUtils.damp(this.legFL.rotation.x, -0.95, 6, dt);
      this.legFR.rotation.x = THREE.MathUtils.damp(this.legFR.rotation.x, -0.95, 6, dt);
      this.legBL.rotation.x = THREE.MathUtils.damp(this.legBL.rotation.x, 0.95, 6, dt);
      this.legBR.rotation.x = THREE.MathUtils.damp(this.legBR.rotation.x, 0.95, 6, dt);
      return;
    }

    if (behaviorState === 'eat') {
      const dip =
        this.species === 'deer' || this.species === 'cow'
          ? 0.95
          : this.species === 'bear' || this.species === 'sheep'
            ? 0.68
            : this.species === 'wolf'
              ? 0.58
              : 0.32;
      const nibble = Math.sin(t * 6.0) * 0.14;
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, this.baseBodyY, 10, dt);
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0.12, 8, dt);
      this.bodyPivot.rotation.z = THREE.MathUtils.damp(this.bodyPivot.rotation.z, 0, 8, dt);
      this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, dip + nibble, 12, dt);
      this.headPivot.rotation.y = THREE.MathUtils.damp(
        this.headPivot.rotation.y,
        Math.sin(t * 1.7) * 0.2,
        6,
        dt,
      );
      this.legFL.rotation.x = THREE.MathUtils.damp(this.legFL.rotation.x, -0.12, 8, dt);
      this.legFR.rotation.x = THREE.MathUtils.damp(this.legFR.rotation.x, 0.12, 8, dt);
      this.legBL.rotation.x = THREE.MathUtils.damp(this.legBL.rotation.x, 0, 8, dt);
      this.legBR.rotation.x = THREE.MathUtils.damp(this.legBR.rotation.x, 0, 8, dt);
      this.tailPivot.rotation.y = Math.sin(t * 3.5) * 0.18;
      return;
    }

    if (isMoving && speed > 0.25) {
      const gallop = behaviorState === 'flee' || behaviorState === 'chase';
      const freq = this.species === 'rabbit' ? 12 : gallop ? 12.5 : 6.4;
      this.phase += dt * freq;

      if (this.species === 'rabbit') {
        const hop = Math.abs(Math.sin(this.phase));
        const hopHeight = gallop ? 0.34 : 0.16;
        const pitch = Math.cos(this.phase) * (gallop ? 0.38 : 0.22);
        this.bodyPivot.position.y = hop * hopHeight;
        this.bodyPivot.rotation.x = pitch;
        this.bodyPivot.rotation.z = THREE.MathUtils.damp(this.bodyPivot.rotation.z, 0, 10, dt);
        this.legFL.rotation.x = Math.sin(this.phase) * 0.7;
        this.legFR.rotation.x = Math.sin(this.phase) * 0.7;
        this.legBL.rotation.x = -Math.sin(this.phase) * 0.85;
        this.legBR.rotation.x = -Math.sin(this.phase) * 0.85;
      } else {
        const amp = gallop ? 0.68 : 0.42;
        const swingA = Math.sin(this.phase) * amp;
        const swingB = gallop ? Math.sin(this.phase + 0.45) * amp : -swingA;
        this.legFL.rotation.x = swingA;
        this.legFR.rotation.x = gallop ? swingA * 0.9 : -swingA;
        this.legBL.rotation.x = gallop ? -swingB : -swingA;
        this.legBR.rotation.x = gallop ? -swingB * 0.9 : swingA;

        const bounceAmp = gallop ? 0.08 : 0.028;
        this.bodyPivot.position.y = Math.abs(Math.cos(this.phase)) * bounceAmp;
        this.bodyPivot.rotation.x = THREE.MathUtils.damp(
          this.bodyPivot.rotation.x,
          gallop ? 0.06 : 0,
          10,
          dt,
        );
        this.bodyPivot.rotation.z =
          this.species === 'bear' || this.species === 'cow'
            ? Math.sin(this.phase) * 0.04
            : 0;
      }

      const headTargetX = behaviorState === 'chase' ? 0.22 : this.baseHeadRotX;
      this.headPivot.rotation.x = THREE.MathUtils.damp(this.headPivot.rotation.x, headTargetX, 10, dt);
      this.headPivot.rotation.y = THREE.MathUtils.damp(this.headPivot.rotation.y, 0, 10, dt);
      this.tailPivot.rotation.y = Math.sin(t * 7) * 0.22;
      return;
    }

    // Idle alert breathing & scan
    const breath = Math.sin(t * 2.1) * 0.015;
    this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, breath, 10, dt);
    this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0, 10, dt);
    this.bodyPivot.rotation.z = THREE.MathUtils.damp(this.bodyPivot.rotation.z, 0, 10, dt);
    this.headPivot.rotation.x = THREE.MathUtils.damp(
      this.headPivot.rotation.x,
      this.species === 'rabbit' ? -0.14 : 0,
      8,
      dt,
    );
    this.headPivot.rotation.y = THREE.MathUtils.damp(
      this.headPivot.rotation.y,
      Math.sin(t * 0.95) * 0.28,
      6,
      dt,
    );
    this.legFL.rotation.x = THREE.MathUtils.damp(this.legFL.rotation.x, 0, 10, dt);
    this.legFR.rotation.x = THREE.MathUtils.damp(this.legFR.rotation.x, 0, 10, dt);
    this.legBL.rotation.x = THREE.MathUtils.damp(this.legBL.rotation.x, 0, 10, dt);
    this.legBR.rotation.x = THREE.MathUtils.damp(this.legBR.rotation.x, 0, 10, dt);
    this.tailPivot.rotation.y = Math.sin(t * 2.4) * 0.12;
  }

  public dispose(): void {
    this.root.removeFromParent();
  }
}

export class AnimalRigPool {
  private readonly pools: Record<AnimalSpecies, AnimalRig[]> = {
    deer: [],
    rabbit: [],
    wolf: [],
    bear: [],
    bird: [],
    cow: [],
    sheep: [],
    chicken: [],
  };
  private readonly container: THREE.Group;
  private readonly assets: WildlifeSharedAssets;
  private readonly isSoftwareGl: boolean;

  constructor(
    container: THREE.Group,
    assets: WildlifeSharedAssets,
    isSoftwareGl: boolean,
  ) {
    this.container = container;
    this.assets = assets;
    this.isSoftwareGl = isSoftwareGl;
  }

  public claim(species: AnimalSpecies, variant: number): AnimalRig {
    const bucket = this.pools[species];
    let rig = bucket.pop();
    if (!rig) {
      rig = new AnimalRig(species, this.assets, this.isSoftwareGl);
      this.container.add(rig.root);
    }
    rig.setVariant(variant);
    rig.root.visible = true;
    return rig;
  }

  public release(rig: AnimalRig): void {
    rig.root.visible = false;
    this.pools[rig.species].push(rig);
  }

  public dispose(): void {
    (Object.keys(this.pools) as AnimalSpecies[]).forEach((sp) => {
      for (const rig of this.pools[sp]) {
        rig.dispose();
      }
      this.pools[sp].length = 0;
    });
  }
}
