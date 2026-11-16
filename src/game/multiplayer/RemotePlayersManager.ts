import * as THREE from 'three';
import {
  generateNetworkEntityId,
  type AuthoritativePlayerVitals,
  type GameEventPayload,
  type PlayerNetworkState,
} from '../../../shared/multiplayerProtocol';
import type { WeaponAttackAnimType } from '../combat/weapons/Weapon';
import { BowWeapon } from '../combat/weapons/BowWeapon';
import { WeaponRegistry } from '../combat/weapons/WeaponRegistry';
import { PlayerCharacter } from '../entities/PlayerCharacter';
import { groundHeightAt } from '../math/noise';
import type { AvatarConfig } from '../../../shared/profileTypes';
import { resolveAvatarSrc } from '../profile/avatarUtils';
import type { PlayerMovementState } from '../types';
import type { MultiplayerPlayer } from './multiplayerTypes';

export const REMOTE_INTERP_DELAY_MS = 88;
export const REMOTE_MAX_EXTRAPOLATION_SEC = 0.2;
const TELEPORT_SNAP_THRESHOLD_SQ = 20 * 20;
const MAX_SNAPSHOT_HISTORY = 18;

export interface InterpolatedRemoteSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  aimYaw: number;
  pitch: number;
  vx: number;
  vy: number;
  vz: number;
  horizontalSpeed: number;
  movementState: PlayerMovementState;
  sprinting: boolean;
  jumping: boolean;
  crouching: boolean;
  grounded: boolean;
  weaponId: string | null;
  bowCharging: boolean;
  bowCharge: number;
  reloading: boolean;
  isDead: boolean;
  isExtrapolating: boolean;
}

interface SnapshotEntry {
  timelineMs: number;
  seq: number;
  state: PlayerNetworkState;
}

export function lerpAngle(a: number, b: number, t: number): number {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
}

/**
 * Pure snapshot buffer + interpolation + bounded extrapolation engine
 * for smooth remote player motion under irregular WebSocket arrival timing.
 */
export class RemoteSnapshotInterpolator {
  private readonly snapshots: SnapshotEntry[] = [];
  private clockOffsetMs: number | null = null;
  private lastSeq = -1;

  public push(state: PlayerNetworkState, receivedAtMs = Date.now()): void {
    if (typeof state.seq === 'number' && state.seq < this.lastSeq && this.lastSeq - state.seq < 1000) {
      // Discard out-of-order stale state packets
      return;
    }
    if (typeof state.seq === 'number') {
      this.lastSeq = state.seq;
    }

    let timelineMs = receivedAtMs;
    if (typeof state.serverTime === 'number' && Number.isFinite(state.serverTime)) {
      const sampleOffset = receivedAtMs - state.serverTime;
      if (this.clockOffsetMs === null) {
        this.clockOffsetMs = sampleOffset;
      } else {
        // Track upward drift quickly, downward jitter smoothly
        const alpha = sampleOffset < this.clockOffsetMs ? 0.25 : 0.08;
        this.clockOffsetMs += (sampleOffset - this.clockOffsetMs) * alpha;
      }
      timelineMs = state.serverTime + this.clockOffsetMs;
    }

    const last = this.snapshots[this.snapshots.length - 1];
    if (last && timelineMs <= last.timelineMs) {
      timelineMs = last.timelineMs + 1;
    }

    this.snapshots.push({
      timelineMs,
      seq: state.seq ?? (last ? last.seq + 1 : 0),
      state: { ...state },
    });

    if (this.snapshots.length > MAX_SNAPSHOT_HISTORY) {
      this.snapshots.splice(0, this.snapshots.length - MAX_SNAPSHOT_HISTORY);
    }
  }

  public getLatestState(): PlayerNetworkState | null {
    return this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1].state
      : null;
  }

  public getSnapshotCount(): number {
    return this.snapshots.length;
  }

  public sample(
    renderNowMs = Date.now(),
    interpDelayMs = REMOTE_INTERP_DELAY_MS,
  ): InterpolatedRemoteSample | null {
    const count = this.snapshots.length;
    if (count === 0) return null;

    const targetTimeMs = renderNowMs - interpDelayMs;
    const first = this.snapshots[0];
    const newest = this.snapshots[count - 1];

    if (targetTimeMs <= first.timelineMs || count === 1) {
      return this.fromSingle(first.state, Math.max(0, (targetTimeMs - newest.timelineMs) / 1000));
    }

    if (targetTimeMs >= newest.timelineMs) {
      const extrapSec = Math.max(0, (targetTimeMs - newest.timelineMs) / 1000);
      return this.fromSingle(newest.state, extrapSec);
    }

    // Find bracketing snapshots [a, b]
    let aIdx = count - 2;
    for (let i = 0; i < count - 1; i++) {
      if (
        this.snapshots[i].timelineMs <= targetTimeMs &&
        this.snapshots[i + 1].timelineMs >= targetTimeMs
      ) {
        aIdx = i;
        break;
      }
    }

    const a = this.snapshots[aIdx];
    const b = this.snapshots[aIdx + 1];
    const span = Math.max(1, b.timelineMs - a.timelineMs);
    const t = Math.max(0, Math.min(1, (targetTimeMs - a.timelineMs) / span));

    const sa = a.state;
    const sb = b.state;

    // Large distance jump (e.g. respawn) should snap to newest rather than drag across world
    const dx = sb.x - sa.x;
    const dz = sb.z - sa.z;
    if (dx * dx + dz * dz > TELEPORT_SNAP_THRESHOLD_SQ) {
      return this.fromSingle(t >= 0.5 ? sb : sa, 0);
    }

    const vx = THREE.MathUtils.lerp(sa.vx ?? 0, sb.vx ?? 0, t);
    const vy = THREE.MathUtils.lerp(sa.vy ?? 0, sb.vy ?? 0, t);
    const vz = THREE.MathUtils.lerp(sa.vz ?? 0, sb.vz ?? 0, t);
    const horizontalSpeed = Math.hypot(vx, vz);

    const active = t >= 0.5 ? sb : sa;
    const yaw = lerpAngle(sa.yaw, sb.yaw, t);
    const aimYaw = lerpAngle(sa.aimYaw ?? sa.yaw, sb.aimYaw ?? sb.yaw, t);
    const pitch = THREE.MathUtils.lerp(sa.pitch ?? 0, sb.pitch ?? 0, t);

    return {
      x: THREE.MathUtils.lerp(sa.x, sb.x, t),
      y: THREE.MathUtils.lerp(sa.y, sb.y, t),
      z: THREE.MathUtils.lerp(sa.z, sb.z, t),
      yaw,
      aimYaw,
      pitch,
      vx,
      vy,
      vz,
      horizontalSpeed,
      movementState: active.movementState ?? this.inferMovementState(active, horizontalSpeed),
      sprinting: Boolean(active.sprinting),
      jumping: Boolean(active.jumping),
      crouching: Boolean(active.crouching),
      grounded: active.grounded !== false,
      weaponId: active.weaponId ?? null,
      bowCharging: Boolean(active.bowCharging),
      bowCharge: THREE.MathUtils.lerp(sa.bowCharge ?? 0, sb.bowCharge ?? 0, t),
      reloading: Boolean(active.reloading),
      isDead: Boolean(active.isDead),
      isExtrapolating: false,
    };
  }

  private fromSingle(state: PlayerNetworkState, extrapSec: number): InterpolatedRemoteSample {
    const cappedExtrap = Math.min(REMOTE_MAX_EXTRAPOLATION_SEC, Math.max(0, extrapSec));
    const vx = state.vx ?? 0;
    const vy = state.vy ?? 0;
    const vz = state.vz ?? 0;

    // Gentle exponential damping prevents overshoot during extrapolation
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let effectiveVx = vx;
    let effectiveVz = vz;

    if (cappedExtrap > 0.001 && !state.isDead) {
      const dampIntegral = (1 - Math.exp(-3.5 * cappedExtrap)) / 3.5;
      dx = vx * dampIntegral;
      dz = vz * dampIntegral;
      if (state.grounded === false) {
        dy = Math.max(-2.5, Math.min(2.5, vy * cappedExtrap - 0.5 * 9.8 * cappedExtrap * cappedExtrap));
      }
      const speedDecay = Math.exp(-3.5 * cappedExtrap);
      effectiveVx *= speedDecay;
      effectiveVz *= speedDecay;
    }

    const overCap = extrapSec > REMOTE_MAX_EXTRAPOLATION_SEC;
    const horizontalSpeed = overCap ? 0 : Math.hypot(effectiveVx, effectiveVz);
    const movementState = overCap
      ? 'idle'
      : state.movementState ?? this.inferMovementState(state, horizontalSpeed);

    return {
      x: state.x + dx,
      y: state.y + dy,
      z: state.z + dz,
      yaw: state.yaw,
      aimYaw: state.aimYaw ?? state.yaw,
      pitch: state.pitch ?? 0,
      vx: effectiveVx,
      vy,
      vz: effectiveVz,
      horizontalSpeed,
      movementState,
      sprinting: !overCap && Boolean(state.sprinting),
      jumping: !overCap && Boolean(state.jumping),
      crouching: Boolean(state.crouching),
      grounded: state.grounded !== false,
      weaponId: state.weaponId ?? null,
      bowCharging: Boolean(state.bowCharging),
      bowCharge: state.bowCharge ?? 0,
      reloading: Boolean(state.reloading),
      isDead: Boolean(state.isDead),
      isExtrapolating: extrapSec > 0.001,
    };
  }

  private inferMovementState(
    state: PlayerNetworkState,
    horizontalSpeed: number,
  ): PlayerMovementState {
    if (state.grounded === false) {
      return (state.vy ?? 0) > 0.2 || state.jumping ? 'jumping' : 'falling';
    }
    if (horizontalSpeed > 6.5 || state.sprinting) return 'running';
    if (horizontalSpeed > 0.3) return 'walking';
    return 'idle';
  }
}

const _arrowLookTarget = new THREE.Vector3();

interface SyncedArrowVisual {
  arrowId: string;
  mesh: THREE.Group;
  vel: THREE.Vector3;
  gravity: number;
  life: number;
}

interface RemotePlayerEntity {
  playerId: string;
  networkEntityId: string;
  displayName: string;
  playerTag: string;
  avatar?: AvatarConfig;
  avatarColor: string;
  isHost: boolean;
  health: number;
  maxHealth: number;
  isDead: boolean;
  character: PlayerCharacter;
  weaponRegistry: WeaponRegistry;
  equippedWeaponId: string | null;
  interpolator: RemoteSnapshotInterpolator;
  displayPos: THREE.Vector3;
  displayYaw: number;
  hasInitialPose: boolean;
  deathBlend: number;
  crouchBlend: number;
  lastShootingFlag: boolean;
  lastAnimStateSeq: number;
  nameplateSprite: THREE.Sprite;
  nameplateCanvas: HTMLCanvasElement;
  nameplateTexture: THREE.CanvasTexture;
  nameplateMaterial: THREE.SpriteMaterial;
  lastBadgeKey: string;
}

const VALID_ATTACK_ANIMS = new Set<WeaponAttackAnimType>([
  'melee_slash',
  'heavy_chop',
  'bow_shot',
  'spear_thrust',
  'knife_slash',
  'unarmed_punch',
]);

/**
 * Renders and smoothly animates all remote multiplayer explorers inside the 3D scene.
 * Strictly isolated from local-only effects (no footstep audio, no camera shake, no HUD popups).
 */
export class RemotePlayersManager {
  private readonly scene: THREE.Scene;
  private readonly contactShadowMap: THREE.Texture;
  private readonly isSoftwareGl: boolean;
  private readonly entities = new Map<string, RemotePlayerEntity>();
  private readonly syncedArrows: SyncedArrowVisual[] = [];
  private readonly avatarImageCache = new Map<string, HTMLImageElement | 'loading' | 'failed'>();
  private readonly arrowShaftGeo: THREE.CylinderGeometry;
  private readonly arrowShaftMat: THREE.MeshStandardMaterial;
  private readonly arrowTipGeo: THREE.ConeGeometry;
  private readonly arrowTipMat: THREE.MeshStandardMaterial;
  private readonly arrowFletchGeo: THREE.BoxGeometry;
  private readonly arrowFletchMat: THREE.MeshStandardMaterial;
  private readonly boltFletchMat: THREE.MeshStandardMaterial;
  private localPlayerId: string | null = null;
  private showPlayerNames = true;

  constructor(
    scene: THREE.Scene,
    contactShadowMap: THREE.Texture,
    isSoftwareGl: boolean,
  ) {
    this.scene = scene;
    this.contactShadowMap = contactShadowMap;
    this.isSoftwareGl = isSoftwareGl;
    this.arrowShaftGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.68, 6);
    this.arrowShaftGeo.rotateX(Math.PI * 0.5);
    this.arrowShaftMat = new THREE.MeshStandardMaterial({
      color: 0xc29b61,
      roughness: 0.72,
      metalness: 0.05,
    });
    this.arrowTipGeo = new THREE.ConeGeometry(0.032, 0.14, 6);
    this.arrowTipGeo.rotateX(Math.PI * 0.5);
    this.arrowTipMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.35,
      metalness: 0.78,
    });
    this.arrowFletchGeo = new THREE.BoxGeometry(0.058, 0.008, 0.13);
    this.arrowFletchMat = new THREE.MeshStandardMaterial({
      color: 0xe63946,
      roughness: 0.8,
    });
    this.boltFletchMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.7,
    });
  }

  public setLocalPlayerId(playerId: string | null): void {
    this.localPlayerId = playerId;
    if (playerId && this.entities.has(playerId)) {
      this.removePlayer(playerId);
    }
  }

  public setShowPlayerNames(enabled: boolean): void {
    this.showPlayerNames = enabled;
    for (const entity of this.entities.values()) {
      entity.nameplateSprite.visible = enabled;
    }
  }

  public getRemotePlayerCount(): number {
    return this.entities.size;
  }

  public getRemoteEntityIds(): string[] {
    return Array.from(this.entities.values()).map((e) => e.networkEntityId);
  }

  public syncRoster(players: MultiplayerPlayer[], localPlayerId?: string | null): void {
    if (localPlayerId !== undefined) {
      this.localPlayerId = localPlayerId;
    }

    const activeRemoteIds = new Set<string>();
    for (const p of players) {
      if (!p.id || p.id === this.localPlayerId || p.isLocal) continue;
      activeRemoteIds.add(p.id);
      const existing = this.entities.get(p.id);
      if (!existing) {
        this.spawnRemotePlayer(p);
      } else {
        existing.displayName = p.displayName;
        existing.playerTag = p.playerTag ?? existing.playerTag;
        existing.avatar = p.avatar ?? existing.avatar;
        existing.avatarColor = p.avatarColor || existing.avatarColor;
        existing.isHost = p.isHost;
        if (typeof p.health === 'number') existing.health = p.health;
        if (typeof p.maxHealth === 'number') existing.maxHealth = p.maxHealth;
        if (typeof p.isDead === 'boolean') existing.isDead = p.isDead;
        if (p.state) {
          existing.interpolator.push(p.state, Date.now());
        }
        this.refreshNameplate(existing);
      }
    }

    for (const id of Array.from(this.entities.keys())) {
      if (!activeRemoteIds.has(id)) {
        this.removePlayer(id);
      }
    }
  }

  public pushPlayerState(
    playerId: string,
    state: PlayerNetworkState,
    receivedAtMs = Date.now(),
  ): void {
    if (!playerId || playerId === this.localPlayerId) return;
    let entity = this.entities.get(playerId);
    if (!entity) {
      entity = this.spawnRemotePlayer({
        id: playerId,
        networkEntityId: state.networkEntityId ?? generateNetworkEntityId(playerId),
        displayName: 'Explorer',
        isHost: false,
        isReady: true,
        joinedAt: receivedAtMs,
        avatarColor: '#3b82f6',
        pingMs: null,
        connectionQuality: 'good',
        health: state.health ?? 100,
        maxHealth: state.maxHealth ?? 100,
        isDead: Boolean(state.isDead),
      });
    }

    entity.interpolator.push(state, receivedAtMs);

    if (typeof state.health === 'number') entity.health = state.health;
    if (typeof state.maxHealth === 'number') entity.maxHealth = state.maxHealth;
    if (typeof state.isDead === 'boolean') entity.isDead = state.isDead;

    if (state.shooting && !entity.lastShootingFlag) {
      this.triggerRemoteAttackVisual(entity, 'bow_shot');
    }
    entity.lastShootingFlag = Boolean(state.shooting);

    if (
      state.animState &&
      VALID_ATTACK_ANIMS.has(state.animState as WeaponAttackAnimType) &&
      (state.seq ?? 0) !== entity.lastAnimStateSeq
    ) {
      entity.lastAnimStateSeq = state.seq ?? entity.lastAnimStateSeq;
      if (!state.shooting) {
        this.triggerRemoteAttackVisual(
          entity,
          state.animState as WeaponAttackAnimType,
        );
      }
    }

    this.refreshNameplate(entity);
  }

  public applyVitals(vitals: AuthoritativePlayerVitals): void {
    const entity = this.entities.get(vitals.playerId);
    if (!entity) return;
    entity.health = vitals.health;
    entity.maxHealth = vitals.maxHealth;
    entity.isDead = vitals.isDead;
    this.refreshNameplate(entity);
  }

  public handleGameEvent(playerId: string, payload: GameEventPayload): void {
    if (!playerId || playerId === this.localPlayerId) return;
    const entity = this.entities.get(playerId);
    if (!entity) return;

    const data = payload.data ?? {};
    if (payload.event === 'player:shoot') {
      const weaponId =
        typeof data.weaponId === 'string' ? data.weaponId : entity.equippedWeaponId;
      this.syncRemoteWeapon(entity, weaponId ?? null);
      this.triggerRemoteAttackVisual(entity, 'bow_shot');
    } else if (payload.event === 'player:attack') {
      const weaponId =
        typeof data.weaponId === 'string' ? data.weaponId : entity.equippedWeaponId;
      this.syncRemoteWeapon(entity, weaponId ?? null);
      const animType =
        typeof data.animType === 'string' &&
        VALID_ATTACK_ANIMS.has(data.animType as WeaponAttackAnimType)
          ? (data.animType as WeaponAttackAnimType)
          : 'melee_slash';
      this.triggerRemoteAttackVisual(entity, animType);
    }
  }

  public spawnSyncedArrow(opts: {
    arrowId: string;
    shooterId: string;
    weaponId?: string;
    bowCharge?: number;
    originX: number;
    originY: number;
    originZ: number;
    dirX: number;
    dirY: number;
    dirZ: number;
    speed: number;
    gravity: number;
  }): void {
    if (!opts.shooterId || opts.shooterId === this.localPlayerId) return;
    const entity = this.entities.get(opts.shooterId);
    if (entity && !entity.isDead) {
      if (opts.weaponId) {
        this.syncRemoteWeapon(entity, opts.weaponId);
      }
      entity.character.triggerAttack(0.24, 'bow_shot');
    }

    const existingIdx = this.syncedArrows.findIndex((a) => a.arrowId === opts.arrowId);
    if (existingIdx !== -1) {
      this.syncedArrows[existingIdx].mesh.removeFromParent();
      this.syncedArrows.splice(existingIdx, 1);
    }

    if (this.syncedArrows.length >= 32) {
      const oldest = this.syncedArrows.shift();
      oldest?.mesh.removeFromParent();
    }

    const group = this.createRemoteArrowGroup(opts.weaponId, opts.bowCharge ?? 1);
    group.position.set(opts.originX, opts.originY, opts.originZ);
    const vel = new THREE.Vector3(
      opts.dirX * opts.speed,
      opts.dirY * opts.speed,
      opts.dirZ * opts.speed,
    );
    if (vel.lengthSq() > 0.001) {
      _arrowLookTarget.copy(group.position).add(vel);
      group.lookAt(_arrowLookTarget);
    }
    this.scene.add(group);
    this.syncedArrows.push({
      arrowId: opts.arrowId,
      mesh: group,
      vel,
      gravity: opts.gravity,
      life: 4.0,
    });
  }

  private createRemoteArrowGroup(weaponId?: string, bowCharge = 1): THREE.Group {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(this.arrowShaftGeo, this.arrowShaftMat);
    const tip = new THREE.Mesh(this.arrowTipGeo, this.arrowTipMat);
    tip.position.set(0, 0, 0.39);
    const fletchMat = weaponId === 'crossbow' ? this.boltFletchMat : this.arrowFletchMat;
    const fletchA = new THREE.Mesh(this.arrowFletchGeo, fletchMat);
    fletchA.position.set(0, 0, -0.26);
    const fletchB = new THREE.Mesh(this.arrowFletchGeo, fletchMat);
    fletchB.position.set(0, 0, -0.26);
    fletchB.rotation.z = Math.PI * 0.5;
    group.add(shaft, tip, fletchA, fletchB);

    const c = Math.max(0, Math.min(1, bowCharge));
    if (weaponId === 'crossbow') {
      group.scale.set(1.18, 1.18, 0.72);
    } else {
      group.scale.set(1, 1, 0.92 + 0.14 * c);
    }
    return group;
  }

  public resolveSyncedArrowHit(opts: {
    arrowId: string;
    x: number;
    y: number;
    z: number;
    targetKind: string;
  }): void {
    const idx = this.syncedArrows.findIndex((a) => a.arrowId === opts.arrowId);
    if (idx !== -1) {
      const arrow = this.syncedArrows[idx];
      if (opts.targetKind === 'world') {
        arrow.mesh.position.set(opts.x, opts.y, opts.z);
        arrow.vel.set(0, 0, 0);
        arrow.gravity = 0;
        arrow.life = Math.min(arrow.life, 3.0);
      } else {
        arrow.mesh.removeFromParent();
        this.syncedArrows.splice(idx, 1);
      }
    }
  }

  public update(dt: number, nowMs = Date.now(), viewerPos?: THREE.Vector3): void {
    if (dt <= 0) return;

    for (const entity of this.entities.values()) {
      const sample = entity.interpolator.sample(nowMs, REMOTE_INTERP_DELAY_MS);
      if (!sample) continue;

      if (!entity.hasInitialPose) {
        entity.displayPos.set(sample.x, sample.y, sample.z);
        entity.displayYaw = sample.yaw;
        entity.hasInitialPose = true;
      } else {
        const distSq =
          (sample.x - entity.displayPos.x) ** 2 +
          (sample.y - entity.displayPos.y) ** 2 +
          (sample.z - entity.displayPos.z) ** 2;
        if (distSq > TELEPORT_SNAP_THRESHOLD_SQ) {
          entity.displayPos.set(sample.x, sample.y, sample.z);
          entity.displayYaw = sample.yaw;
        } else {
          // Smooth anti-teleport blend on top of snapshot interpolation
          const blend = 1 - Math.exp(-20 * dt);
          entity.displayPos.x = THREE.MathUtils.lerp(entity.displayPos.x, sample.x, blend);
          entity.displayPos.y = THREE.MathUtils.lerp(entity.displayPos.y, sample.y, blend);
          entity.displayPos.z = THREE.MathUtils.lerp(entity.displayPos.z, sample.z, blend);
          entity.displayYaw = lerpAngle(entity.displayYaw, sample.yaw, blend);
        }
      }

      entity.character.root.position.copy(entity.displayPos);
      entity.character.root.rotation.y = entity.displayYaw;

      // Sync equipped 3D weapon & bow draw visual
      this.syncRemoteWeapon(entity, sample.weaponId);
      const equippedWeapon = entity.equippedWeaponId
        ? entity.weaponRegistry.getOrCreate(entity.equippedWeaponId)
        : null;
      if (equippedWeapon instanceof BowWeapon) {
        equippedWeapon.setDrawState(
          sample.bowCharging && !entity.isDead,
          sample.bowCharge,
        );
      }

      entity.character.setBowChargeState(
        sample.bowCharging && !entity.isDead,
        sample.bowCharge,
        sample.pitch,
      );

      const groundY = groundHeightAt(entity.displayPos.x, entity.displayPos.z);
      const isDead = entity.isDead || sample.isDead;
      const moveState: PlayerMovementState = isDead ? 'idle' : sample.movementState;
      const horizSpeed = isDead ? 0 : sample.horizontalSpeed;

      entity.character.updateAnimation(
        dt,
        horizSpeed,
        sample.grounded,
        sample.vy,
        moveState,
        groundY,
        false,
        sample.sprinting ? 10.8 : 7.6,
      );

      const yawDiff = Math.atan2(
        Math.sin(sample.aimYaw - entity.displayYaw),
        Math.cos(sample.aimYaw - entity.displayYaw),
      );

      entity.crouchBlend = THREE.MathUtils.damp(
        entity.crouchBlend,
        sample.crouching && !isDead ? 1 : 0,
        14,
        dt,
      );
      entity.deathBlend = THREE.MathUtils.damp(
        entity.deathBlend,
        isDead ? 1 : 0,
        10,
        dt,
      );

      entity.character.applyRemotePose(
        {
          aimYawOffset: yawDiff,
          aimPitch: sample.pitch,
          crouchBlend: entity.crouchBlend,
          deathBlend: entity.deathBlend,
          reloading: sample.reloading,
          bowCharging: sample.bowCharging,
          isDead,
        },
        dt,
      );

      if (!this.showPlayerNames) {
        entity.nameplateSprite.visible = false;
      } else if (viewerPos) {
        const dist = entity.displayPos.distanceTo(viewerPos);
        if (dist > 28) {
          entity.nameplateSprite.visible = false;
        } else {
          entity.nameplateSprite.visible = true;
          entity.nameplateMaterial.opacity =
            dist <= 18 ? 1 : Math.max(0, Math.min(1, 1 - (dist - 18) / 10));
        }
      } else {
        entity.nameplateSprite.visible = true;
        entity.nameplateMaterial.opacity = 1;
      }
    }

    // Update synchronized remote arrows along authoritative ballistic arc
    for (let i = this.syncedArrows.length - 1; i >= 0; i--) {
      const sa = this.syncedArrows[i];
      sa.life -= dt;
      if (sa.life <= 0) {
        sa.mesh.removeFromParent();
        this.syncedArrows.splice(i, 1);
        continue;
      }
      if (sa.vel.lengthSq() > 0.001) {
        sa.vel.y -= sa.gravity * dt;
        sa.mesh.position.addScaledVector(sa.vel, dt);
        _arrowLookTarget.copy(sa.mesh.position).add(sa.vel);
        sa.mesh.lookAt(_arrowLookTarget);
      }
    }
  }

  public dispose(): void {
    for (const id of Array.from(this.entities.keys())) {
      this.removePlayer(id);
    }
    for (const sa of this.syncedArrows) {
      sa.mesh.removeFromParent();
    }
    this.syncedArrows.length = 0;
    this.arrowShaftGeo.dispose();
    this.arrowShaftMat.dispose();
    this.arrowTipGeo.dispose();
    this.arrowTipMat.dispose();
    this.arrowFletchGeo.dispose();
    this.arrowFletchMat.dispose();
    this.boltFletchMat.dispose();
  }

  private spawnRemotePlayer(player: MultiplayerPlayer): RemotePlayerEntity {
    const networkEntityId =
      player.networkEntityId ?? generateNetworkEntityId(player.id);
    const character = new PlayerCharacter(this.contactShadowMap);
    character.root.name = `remote_player_${networkEntityId}`;
    character.root.userData.playerId = player.id;
    character.root.userData.networkEntityId = networkEntityId;

    const initialX = player.state?.x ?? 0;
    const initialZ = player.state?.z ?? 4;
    const initialY = player.state?.y ?? groundHeightAt(initialX, initialZ);
    character.root.position.set(initialX, initialY, initialZ);
    character.root.rotation.y = player.state?.yaw ?? 0;

    // World-space floating nameplate + avatar + health bar
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 80;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, 2.38, 0);
    sprite.scale.set(1.88, 0.47, 1);
    sprite.visible = this.showPlayerNames;
    character.root.add(sprite);

    this.scene.add(character.root);

    const interpolator = new RemoteSnapshotInterpolator();
    if (player.state) {
      interpolator.push(player.state, Date.now());
    }

    const entity: RemotePlayerEntity = {
      playerId: player.id,
      networkEntityId,
      displayName: player.displayName || 'Explorer',
      playerTag: player.playerTag ?? '',
      avatar: player.avatar,
      avatarColor: player.avatarColor || '#3b82f6',
      isHost: player.isHost,
      health: typeof player.health === 'number' ? player.health : 100,
      maxHealth: typeof player.maxHealth === 'number' ? player.maxHealth : 100,
      isDead: Boolean(player.isDead),
      character,
      weaponRegistry: new WeaponRegistry(),
      equippedWeaponId: null,
      interpolator,
      displayPos: new THREE.Vector3(initialX, initialY, initialZ),
      displayYaw: player.state?.yaw ?? 0,
      hasInitialPose: Boolean(player.state),
      deathBlend: 0,
      crouchBlend: 0,
      lastShootingFlag: false,
      lastAnimStateSeq: -1,
      nameplateSprite: sprite,
      nameplateCanvas: canvas,
      nameplateTexture: texture,
      nameplateMaterial: material,
      lastBadgeKey: '',
    };

    if (player.state?.weaponId) {
      this.syncRemoteWeapon(entity, player.state.weaponId);
    }

    this.refreshNameplate(entity);
    this.entities.set(player.id, entity);
    return entity;
  }

  private removePlayer(playerId: string): void {
    const entity = this.entities.get(playerId);
    if (!entity) return;
    entity.character.root.removeFromParent();
    entity.weaponRegistry.disposeAll();
    entity.character.dispose();
    entity.nameplateTexture.dispose();
    entity.nameplateMaterial.dispose();
    this.entities.delete(playerId);
  }

  private syncRemoteWeapon(entity: RemotePlayerEntity, weaponId: string | null): void {
    if (entity.equippedWeaponId === weaponId) return;
    if (entity.equippedWeaponId) {
      const prev = entity.weaponRegistry.getOrCreate(entity.equippedWeaponId);
      prev?.onUnequip();
    }
    entity.equippedWeaponId = weaponId;
    if (weaponId) {
      const next = entity.weaponRegistry.getOrCreate(weaponId);
      next?.onEquip(entity.character.getWeaponMount());
    }
  }

  private triggerRemoteAttackVisual(
    entity: RemotePlayerEntity,
    animType: WeaponAttackAnimType,
  ): void {
    if (entity.isDead) return;
    const duration = animType === 'heavy_chop' ? 0.42 : animType === 'bow_shot' ? 0.24 : 0.28;
    entity.character.triggerAttack(duration, animType);
  }

  private resolveCachedAvatarImage(
    src: string,
    entity: RemotePlayerEntity,
  ): HTMLImageElement | null {
    const existing = this.avatarImageCache.get(src);
    if (existing instanceof HTMLImageElement) {
      return existing;
    }
    if (existing === 'loading' || existing === 'failed') {
      return null;
    }
    this.avatarImageCache.set(src, 'loading');
    const img = new Image();
    img.onload = () => {
      this.avatarImageCache.set(src, img);
      if (this.entities.has(entity.playerId)) {
        this.refreshNameplate(entity, true);
      }
    };
    img.onerror = () => {
      this.avatarImageCache.set(src, 'failed');
    };
    img.src = src;
    return null;
  }

  private refreshNameplate(entity: RemotePlayerEntity, forceRedraw = false): void {
    const pct = Math.max(0, Math.min(1, entity.health / Math.max(1, entity.maxHealth)));
    const pctRounded = Math.round(pct * 100);
    const avatarSrc = resolveAvatarSrc(entity.avatar, entity.playerId);
    const avatarKey = entity.avatar
      ? `${entity.avatar.kind}:${entity.avatar.value.slice(0, 48)}:${entity.avatar.value.length}`
      : 'none';
    const key = `${entity.displayName}|${entity.playerTag}|${avatarKey}|${entity.isHost ? 1 : 0}|${entity.isDead ? 1 : 0}|${pctRounded}|${entity.avatarColor}`;
    if (!forceRedraw && key === entity.lastBadgeKey) return;
    entity.lastBadgeKey = key;

    const ctx = entity.nameplateCanvas.getContext('2d');
    if (!ctx) return;

    const w = entity.nameplateCanvas.width;
    const h = entity.nameplateCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Translucent dark emerald plaque
    ctx.fillStyle = 'rgba(11, 22, 16, 0.84)';
    ctx.beginPath();
    ctx.roundRect(10, 6, w - 20, h - 12, 14);
    ctx.fill();

    ctx.strokeStyle = entity.isDead
      ? 'rgba(239, 68, 68, 0.78)'
      : entity.isHost
        ? 'rgba(229, 169, 60, 0.72)'
        : 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rounded avatar thumbnail on left
    const avX = 20;
    const avY = 16;
    const avSize = 46;
    const avatarImg = this.resolveCachedAvatarImage(avatarSrc, entity);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(avX, avY, avSize, avSize, 10);
    ctx.clip();
    if (avatarImg) {
      ctx.drawImage(avatarImg, avX, avY, avSize, avSize);
    } else {
      ctx.fillStyle = entity.avatarColor;
      ctx.fillRect(avX, avY, avSize, avSize);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        (entity.displayName.trim()[0] || 'E').toUpperCase(),
        avX + avSize / 2,
        avY + avSize / 2,
      );
      ctx.textAlign = 'left';
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(avX, avY, avSize, avSize, 10);
    ctx.stroke();

    // Display name (+ host crown mark + #Tag)
    const textX = 76;
    const maxNameChars = entity.playerTag ? 13 : 17;
    const cleanName = entity.displayName.slice(0, maxNameChars);
    const nameLabel = entity.isHost ? `★ ${cleanName}` : cleanName;
    ctx.fillStyle = entity.isDead ? '#fca5a5' : '#f8fafc';
    ctx.font = 'bold 20px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(nameLabel, textX, 30);

    if (entity.playerTag) {
      const nameWidth = ctx.measureText(nameLabel).width;
      const tagX = Math.min(w - 72, textX + nameWidth + 7);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 15px monospace';
      ctx.fillText(`#${entity.playerTag}`, tagX, 31);
    }

    // Health bar or DOWN status
    if (entity.isDead) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('DOWNED', textX, 54);
    } else {
      const barX = textX;
      const barY = 50;
      const barW = w - textX - 24;
      const barH = 9;
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle =
        pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(barX, barY, Math.max(2, Math.round(barW * pct)), barH);
    }

    entity.nameplateTexture.needsUpdate = true;
  }
}
