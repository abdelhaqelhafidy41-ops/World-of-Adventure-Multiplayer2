import type * as THREE from 'three';
import type { HealthComponent } from './HealthComponent';

export type DamageType = 'physical' | 'slash' | 'blunt' | 'pierce' | 'arcane';

export type WeaponCategory = 'melee' | 'heavy' | 'ranged';

export interface WeaponProfile {
  id: string;
  name: string;
  nameAr: string;
  category: WeaponCategory;
  damageType: DamageType;
  baseDamage: number;
  critChance: number;
  critMultiplier: number;
  range: number;
  arcAngleRad: number;
  cooldown: number;
  hitDelay: number;
  swingDuration: number;
  knockback: number;
  staminaCost: number;
}

export interface DamagePacket {
  amount: number;
  damageType: DamageType;
  sourceId: string;
  sourcePosition: THREE.Vector3;
  knockback: number;
  isCrit: boolean;
}

export interface DamageResult {
  applied: boolean;
  rawAmount: number;
  finalAmount: number;
  remainingHealth: number;
  maxHealth: number;
  killed: boolean;
  isCrit: boolean;
}

export interface CombatTarget {
  id: string;
  name: string;
  nameAr: string;
  faction: 'player' | 'enemy';
  health: HealthComponent;
  position: THREE.Vector3;
  hitRadius: number;
  hitHeight: number;
  onDamaged?: (result: DamageResult, packet: DamagePacket) => void;
  onDeath?: (packet: DamagePacket) => void;
}

export type EnemyArchetypeId = 'bandit_scout' | 'thorn_stalker' | 'stone_sentinel';

export type EnemyBehaviorState =
  | 'patrol'
  | 'chase'
  | 'attack_windup'
  | 'attack_recover'
  | 'stagger'
  | 'dead';

export interface EnemyArchetypeConfig {
  id: EnemyArchetypeId;
  name: string;
  nameAr: string;
  maxHealth: number;
  damage: number;
  damageType: DamageType;
  moveSpeed: number;
  chaseSpeed: number;
  detectionRange: number;
  attackRange: number;
  attackCooldown: number;
  attackWindup: number;
  leashRange: number;
  patrolRadius: number;
  hitRadius: number;
  hitHeight: number;
  knockback: number;
  damageReduction: number;
  xpReward: number;
  coinReward: number;
  respawnDelay: number;
  aggression: number;
}

export interface CombatEnemyHudTarget {
  id: string;
  name: string;
  nameAr: string;
  health: number;
  maxHealth: number;
}
