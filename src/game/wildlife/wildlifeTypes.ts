import type * as THREE from 'three';
import type { WorldCollider } from '../types';

export type AnimalSpecies =
  | 'deer'
  | 'rabbit'
  | 'wolf'
  | 'bear'
  | 'bird'
  | 'cow'
  | 'sheep'
  | 'chicken';

export type AnimalDiet = 'herbivore' | 'predator' | 'avian';

export type AnimalBehaviorState =
  | 'idle'
  | 'wander'
  | 'flee'
  | 'chase'
  | 'sleep'
  | 'eat'
  | 'dead';

export interface AnimalPoint2D {
  x: number;
  z: number;
}

export interface AnimalLootDrop {
  itemId: string;
  quantity: number;
}

export const ANIMAL_DROP_TABLES: Record<AnimalSpecies, AnimalLootDrop[]> = {
  deer: [
    { itemId: 'meat', quantity: 2 },
    { itemId: 'hide', quantity: 2 },
  ],
  cow: [
    { itemId: 'meat', quantity: 3 },
    { itemId: 'leather', quantity: 2 },
  ],
  sheep: [
    { itemId: 'meat', quantity: 2 },
    { itemId: 'wool', quantity: 2 },
  ],
  chicken: [
    { itemId: 'meat', quantity: 1 },
    { itemId: 'feathers', quantity: 3 },
  ],
  wolf: [
    { itemId: 'meat', quantity: 1 },
    { itemId: 'fur', quantity: 2 },
  ],
  bear: [
    { itemId: 'meat', quantity: 3 },
    { itemId: 'fur', quantity: 2 },
    { itemId: 'leather', quantity: 1 },
  ],
  rabbit: [
    { itemId: 'meat', quantity: 1 },
    { itemId: 'hide', quantity: 1 },
  ],
  bird: [
    { itemId: 'feathers', quantity: 2 },
    { itemId: 'meat', quantity: 1 },
  ],
};

export interface AnimalTraits {
  species: AnimalSpecies;
  diet: AnimalDiet;
  maxHp: number;
  attackDamage: number;
  walkSpeed: number;
  runSpeed: number;
  alertRadius: number;
  predatorDetectRadius: number;
  wanderRadius: number;
  bodyRadius: number;
  canFly: boolean;
  nocturnal: boolean;
  domestic?: boolean;
}

export interface AnimalConfig {
  id: string;
  species: AnimalSpecies;
  home: AnimalPoint2D;
  scale?: number;
  seed: number;
  variant?: number;
  dead?: boolean;
}

export interface AnimalBlackboard {
  targetX: number;
  targetZ: number;
  hasTarget: boolean;
  stateTimer: number;
  decisionCooldown: number;
  stuckTimer: number;
  lastDistToTarget: number;
  chaseTargetId: string | null;
  threatX: number;
  threatZ: number;
  hunger: number;
  fatigue: number;
  airborne: boolean;
  targetAltitude: number;
}

export interface NearbyAnimalEntry {
  id: string;
  species: AnimalSpecies;
  diet: AnimalDiet;
  x: number;
  z: number;
  behaviorState: AnimalBehaviorState;
  airborne: boolean;
  isDead: boolean;
}

export interface RemoteWildlifePlayerTarget {
  playerId: string;
  position: THREE.Vector3;
  isAlive: boolean;
}

export interface WildlifeTickContext {
  dt: number;
  elapsed: number;
  worldHours: number;
  playerPos: THREE.Vector3;
  localPlayerId?: string;
  remoteTargets?: RemoteWildlifePlayerTarget[];
  isNearPlayer: boolean;
  queryCollidersNear: (x: number, z: number) => WorldCollider[];
  queryNearbyAnimals: (
    x: number,
    z: number,
    radius: number,
    out: NearbyAnimalEntry[],
  ) => NearbyAnimalEntry[];
  isVillageClearance: (x: number, z: number) => boolean;
  onPredatorHitPlayer?: (animalId: string, species: AnimalSpecies, damage: number) => void;
  onPredatorHitRemotePlayer?: (
    animalId: string,
    species: AnimalSpecies,
    damage: number,
    targetPlayerId: string,
  ) => void;
}
