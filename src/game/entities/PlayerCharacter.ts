import * as THREE from 'three';
import type { PlayerMovementState } from '../types';
import {
  AnimationStateMachine,
  type AnimationStateHandler,
  type PlayerRig,
} from '../player/AnimationStateMachine';
import type { WeaponAttackAnimType } from '../combat/weapons/Weapon';

/**
 * Articulated composite 11-part 3D adventurer character.
 * Bottom-center pivoted at y = 0 (boot soles rest directly on terrain).
 */
export class PlayerCharacter {
  public readonly root = new THREE.Group();
  private readonly bodyPivot = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftArmPivot = new THREE.Group();
  private readonly rightArmPivot = new THREE.Group();
  private readonly leftLegPivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly contactShadow: THREE.Mesh;

  private readonly animMachine = new AnimationStateMachine();
  private readonly rig: PlayerRig;
  private readonly weaponMount = new THREE.Group();
  private readonly bodyHideMeshes: THREE.Object3D[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private firstPersonActive = false;

  constructor(contactShadowMap: THREE.Texture) {
    // Materials with calibrated PBR roughness/metalness contrast
    const tunicMat = new THREE.MeshStandardMaterial({
      color: 0x2c6e58, // Forest green explorer tunic
      roughness: 0.84,
      metalness: 0.04,
    });
    const cloakMat = new THREE.MeshStandardMaterial({
      color: 0xb85c38, // Warm terracotta scarf & hood accent
      roughness: 0.88,
      metalness: 0.02,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x5c3c28, // Satchel, belt, boots
      roughness: 0.56,
      metalness: 0.08,
    });
    const trouserMat = new THREE.MeshStandardMaterial({
      color: 0x3b4248, // Slate travel trousers
      roughness: 0.86,
      metalness: 0.02,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xe6bfa0,
      roughness: 0.72,
      metalness: 0.0,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd9a84e, // Compass lantern & belt buckle
      roughness: 0.22,
      metalness: 0.88,
    });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffe4a0,
      emissive: 0xffb84d,
      emissiveIntensity: 0.85,
      roughness: 0.3,
      metalness: 0.1,
    });

    this.disposables.push(
      tunicMat,
      cloakMat,
      leatherMat,
      trouserMat,
      skinMat,
      brassMat,
      glowMat,
    );

    this.root.add(this.bodyPivot);

    // 1. Torso Tunic (Primary silhouette)
    const torsoGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.68, 12);
    const torso = new THREE.Mesh(torsoGeo, tunicMat);
    torso.position.y = 1.06;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.bodyPivot.add(torso);

    // Tunic lower skirt flare
    const skirtGeo = new THREE.CylinderGeometry(0.28, 0.32, 0.22, 12);
    const skirt = new THREE.Mesh(skirtGeo, tunicMat);
    skirt.position.y = 0.68;
    skirt.castShadow = true;
    this.bodyPivot.add(skirt);

    // 2. Belt & Brass Buckle (Accent detail)
    const beltGeo = new THREE.CylinderGeometry(0.285, 0.295, 0.09, 12);
    const belt = new THREE.Mesh(beltGeo, leatherMat);
    belt.position.y = 0.82;
    this.bodyPivot.add(belt);

    const buckleGeo = new THREE.BoxGeometry(0.11, 0.1, 0.05);
    const buckle = new THREE.Mesh(buckleGeo, brassMat);
    buckle.position.set(0, 0.82, 0.28);
    this.bodyPivot.add(buckle);

    // 3. Traveler Scarf / Shoulder Mantle (Secondary read)
    const scarfGeo = new THREE.TorusGeometry(0.23, 0.08, 8, 16);
    scarfGeo.rotateX(Math.PI / 2);
    const scarf = new THREE.Mesh(scarfGeo, cloakMat);
    scarf.position.y = 1.38;
    scarf.castShadow = true;
    this.bodyPivot.add(scarf);

    // 4. Backpack + Bedroll + Compass Charm (Secondary read + Accent)
    const packGeo = new THREE.BoxGeometry(0.36, 0.44, 0.22);
    const pack = new THREE.Mesh(packGeo, leatherMat);
    pack.position.set(0, 1.08, -0.29);
    pack.castShadow = true;
    this.bodyPivot.add(pack);

    const rollGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.4, 10);
    rollGeo.rotateZ(Math.PI / 2);
    const bedroll = new THREE.Mesh(rollGeo, cloakMat);
    bedroll.position.set(0, 1.34, -0.3);
    bedroll.castShadow = true;
    this.bodyPivot.add(bedroll);

    const lanternRimGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.04, 8);
    const lanternRim = new THREE.Mesh(lanternRimGeo, brassMat);
    lanternRim.position.set(0.16, 0.9, -0.4);
    this.bodyPivot.add(lanternRim);

    const lanternCoreGeo = new THREE.SphereGeometry(0.045, 8, 8);
    const lanternCore = new THREE.Mesh(lanternCoreGeo, glowMat);
    lanternCore.position.set(0.16, 0.84, -0.4);
    this.bodyPivot.add(lanternCore);

    this.bodyHideMeshes.push(
      torso,
      skirt,
      belt,
      buckle,
      scarf,
      pack,
      bedroll,
      lanternRim,
      lanternCore,
      this.headGroup,
      this.leftLegPivot,
      this.rightLegPivot,
    );

    // 5. Head + Explorer Hat (Secondary read)
    this.headGroup.position.set(0, 1.44, 0);
    this.bodyPivot.add(this.headGroup);

    const headGeo = new THREE.SphereGeometry(0.2, 14, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 0.16;
    head.castShadow = true;
    this.headGroup.add(head);

    // Subtle facial visor / eyes direction cue (+Z is character forward)
    const eyeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.03);
    const leftEye = new THREE.Mesh(eyeGeo, trouserMat);
    leftEye.position.set(-0.07, 0.18, 0.185);
    const rightEye = new THREE.Mesh(eyeGeo, trouserMat);
    rightEye.position.set(0.07, 0.18, 0.185);
    this.headGroup.add(leftEye, rightEye);

    // Explorer wide-brim hat
    const brimGeo = new THREE.CylinderGeometry(0.36, 0.38, 0.045, 16);
    const brim = new THREE.Mesh(brimGeo, leatherMat);
    brim.position.y = 0.31;
    brim.rotation.x = -0.06;
    brim.castShadow = true;
    this.headGroup.add(brim);

    const crownGeo = new THREE.ConeGeometry(0.21, 0.28, 12);
    const crown = new THREE.Mesh(crownGeo, cloakMat);
    crown.position.y = 0.45;
    crown.rotation.x = -0.06;
    crown.castShadow = true;
    this.headGroup.add(crown);

    // 6. Articulated Arms (Pivoted at shoulders)
    const armGeo = new THREE.CapsuleGeometry(0.072, 0.36, 4, 8);
    const gloveGeo = new THREE.SphereGeometry(0.072, 8, 8);

    this.leftArmPivot.position.set(-0.32, 1.32, 0);
    const leftArm = new THREE.Mesh(armGeo, tunicMat);
    leftArm.position.y = -0.22;
    leftArm.castShadow = true;
    const leftGlove = new THREE.Mesh(gloveGeo, leatherMat);
    leftGlove.position.y = -0.44;
    this.leftArmPivot.add(leftArm, leftGlove);
    this.bodyPivot.add(this.leftArmPivot);

    this.rightArmPivot.position.set(0.32, 1.32, 0);
    const rightArm = new THREE.Mesh(armGeo, tunicMat);
    rightArm.position.y = -0.22;
    rightArm.castShadow = true;
    const rightGlove = new THREE.Mesh(gloveGeo, leatherMat);
    rightGlove.position.y = -0.44;
    this.weaponMount.position.set(0, -0.45, 0.05);
    this.rightArmPivot.add(rightArm, rightGlove, this.weaponMount);
    this.bodyPivot.add(this.rightArmPivot);

    // 7. Articulated Legs + Boots (Pivoted at hips, soles end at y = 0)
    const legGeo = new THREE.CylinderGeometry(0.095, 0.08, 0.44, 8);
    const bootGeo = new THREE.BoxGeometry(0.15, 0.18, 0.24);

    this.leftLegPivot.position.set(-0.125, 0.66, 0);
    const leftLeg = new THREE.Mesh(legGeo, trouserMat);
    leftLeg.position.y = -0.25;
    leftLeg.castShadow = true;
    const leftBoot = new THREE.Mesh(bootGeo, leatherMat);
    leftBoot.position.set(0, -0.57, 0.035);
    leftBoot.castShadow = true;
    this.leftLegPivot.add(leftLeg, leftBoot);
    this.bodyPivot.add(this.leftLegPivot);

    this.rightLegPivot.position.set(0.125, 0.66, 0);
    const rightLeg = new THREE.Mesh(legGeo, trouserMat);
    rightLeg.position.y = -0.25;
    rightLeg.castShadow = true;
    const rightBoot = new THREE.Mesh(bootGeo, leatherMat);
    rightBoot.position.set(0, -0.57, 0.035);
    rightBoot.castShadow = true;
    this.rightLegPivot.add(rightLeg, rightBoot);
    this.bodyPivot.add(this.rightLegPivot);

    // 8. Soft Radial Contact Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(1.35, 1.35);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    });
    this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadow.position.y = 0.03;
    this.root.add(this.contactShadow);

    this.disposables.push(
      torsoGeo,
      skirtGeo,
      beltGeo,
      buckleGeo,
      scarfGeo,
      packGeo,
      rollGeo,
      lanternRimGeo,
      lanternCoreGeo,
      headGeo,
      eyeGeo,
      brimGeo,
      crownGeo,
      armGeo,
      gloveGeo,
      legGeo,
      bootGeo,
      shadowGeo,
      shadowMat,
    );

    this.rig = {
      root: this.root,
      bodyPivot: this.bodyPivot,
      headGroup: this.headGroup,
      leftArmPivot: this.leftArmPivot,
      rightArmPivot: this.rightArmPivot,
      leftLegPivot: this.leftLegPivot,
      rightLegPivot: this.rightLegPivot,
      contactShadow: this.contactShadow,
    };
  }

  public registerAnimationState(
    state: PlayerMovementState,
    handler: AnimationStateHandler,
  ): void {
    this.animMachine.registerState(state, handler);
  }

  public getMovementState(): PlayerMovementState {
    return this.animMachine.getState();
  }

  public getWeaponMount(): THREE.Group {
    return this.weaponMount;
  }

  public registerAttackAnimation(
    type: WeaponAttackAnimType,
    handler: (progress: number, rig: PlayerRig, dt: number) => void,
  ): void {
    this.animMachine.registerAttackAnimation(type, handler);
  }

  public triggerLandSquash(strength: number): void {
    this.animMachine.triggerLandSquash(strength);
  }

  public triggerAttack(
    duration = 0.28,
    animType: WeaponAttackAnimType = 'melee_slash',
  ): boolean {
    return this.animMachine.triggerAttack(duration, animType);
  }

  public setBowChargeState(active: boolean, progress: number, aimPitch = 0): void {
    this.animMachine.setBowChargeState(active, progress, aimPitch);
  }

  public triggerInteractGesture(): void {
    this.animMachine.triggerInteractGesture();
  }

  public updateAnimation(
    dt: number,
    horizontalSpeed: number,
    grounded: boolean,
    verticalVel: number,
    state: PlayerMovementState,
    groundElevationUnderPlayer: number,
    inWater = false,
    maxRunSpeed = 10.8,
  ): void {
    this.animMachine.update(
      {
        dt,
        state,
        horizontalSpeed,
        maxRunSpeed,
        verticalVel,
        grounded,
        inWater,
        groundElevationUnderPlayer,
      },
      this.rig,
    );
  }

  public setFirstPersonMode(enabled: boolean, cameraPitch = 0): void {
    if (this.firstPersonActive !== enabled) {
      this.firstPersonActive = enabled;
      for (let i = 0; i < this.bodyHideMeshes.length; i++) {
        this.bodyHideMeshes[i].visible = !enabled;
      }
      if (!enabled) {
        this.leftArmPivot.position.set(-0.32, 1.32, 0);
        this.rightArmPivot.position.set(0.32, 1.32, 0);
        this.bodyPivot.rotation.y = 0;
      }
    }

    if (enabled) {
      // Position arms slightly forward/lower-right in front of eye height so hands & weapons render cleanly in 1P
      this.leftArmPivot.position.set(-0.26, 1.39, 0.22);
      this.rightArmPivot.position.set(0.24, 1.43, 0.24);
      // Offset pitch so arms/held weapons angle cleanly with camera look (positive pitch = looking down -> more positive rx)
      const pitchFollow = THREE.MathUtils.clamp(cameraPitch * 0.72, -0.85, 0.85);
      this.rightArmPivot.rotation.x = Math.min(-0.78, this.rightArmPivot.rotation.x - 0.88) + pitchFollow;
      this.leftArmPivot.rotation.x = Math.min(-0.55, this.leftArmPivot.rotation.x - 0.62) + pitchFollow;
    }
  }

  public getStepCycleValue(): number {
    return Math.sin(this.animMachine.internal.walkPhase);
  }

  public applyRemotePose(
    opts: {
      aimYawOffset: number;
      aimPitch: number;
      crouchBlend: number;
      deathBlend: number;
      reloading: boolean;
      bowCharging: boolean;
      isDead: boolean;
    },
    dt: number,
  ): void {
    if (!opts.isDead) {
      this.headGroup.rotation.y = THREE.MathUtils.damp(
        this.headGroup.rotation.y,
        THREE.MathUtils.clamp(opts.aimYawOffset, -0.7, 0.7),
        12,
        dt,
      );
      if (!opts.bowCharging) {
        this.headGroup.rotation.x = THREE.MathUtils.damp(
          this.headGroup.rotation.x,
          THREE.MathUtils.clamp(-opts.aimPitch * 0.45, -0.5, 0.5),
          12,
          dt,
        );
      }
      if (opts.crouchBlend > 0.01) {
        this.bodyPivot.position.y -= opts.crouchBlend * 0.22;
      }
      if (opts.reloading && !opts.bowCharging) {
        this.rightArmPivot.rotation.x = THREE.MathUtils.damp(
          this.rightArmPivot.rotation.x,
          -0.95,
          14,
          dt,
        );
      }
    }

    if (opts.deathBlend > 0.01) {
      this.bodyPivot.rotation.x = THREE.MathUtils.lerp(
        this.bodyPivot.rotation.x,
        -Math.PI * 0.46,
        opts.deathBlend,
      );
      this.bodyPivot.position.y = THREE.MathUtils.lerp(
        this.bodyPivot.position.y,
        0.26,
        opts.deathBlend,
      );
    } else {
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(
        this.bodyPivot.rotation.x,
        0,
        14,
        dt,
      );
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
