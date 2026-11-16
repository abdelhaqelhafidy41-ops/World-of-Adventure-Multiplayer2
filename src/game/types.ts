import type { QuestView } from './quest/questTypes';
import type { CombatEnemyHudTarget } from './combat/combatTypes';
import type { TimeSnapshot } from './world/TimeManager';
import type { WeatherSnapshot } from './world/WeatherManager';
import type { WorldType } from './save/saveTypes';

export type GamePhase = 'loading' | 'title' | 'playing' | 'paused';

export type ActiveModal =
  | 'none'
  | 'inventory'
  | 'map'
  | 'mobileSettings'
  | 'graphicsSettings'
  | 'customizeControls'
  | 'settings'
  | 'dialogue'
  | 'questJournal'
  | 'saveSlots'
  | 'chat';

export interface InteractableInfo {
  id: string;
  label: string;
  actionVerb: string;
  kind:
    | 'herb'
    | 'pickup'
    | 'signpost'
    | 'cairn'
    | 'well'
    | 'village'
    | 'npc'
    | 'bed'
    | 'resource'
    | 'chest'
    | 'door'
    | 'camp';
}

export type NpcRole =
  | 'villager'
  | 'merchant'
  | 'farmer'
  | 'guard'
  | 'blacksmith'
  | 'hunter'
  | 'woodcutter'
  | 'fisherman'
  | 'healer'
  | 'innkeeper'
  | 'carpenter'
  | 'miner'
  | 'elder'
  | 'traveling_merchant';

export type NpcBehaviorState =
  | 'idle'
  | 'walking'
  | 'wandering'
  | 'working'
  | 'talking'
  | 'sleeping';

export type NpcRoutinePeriod = 'morning' | 'midday' | 'evening' | 'night';

export interface NpcDialogueChoice {
  id: string;
  label: string;
  reply: string;
  nextState?: 'continue' | 'close';
}

export interface NpcDialogueSession {
  npcId: string;
  name: string;
  role: NpcRole;
  title: string;
  routineLabel: string;
  routinePeriod: NpcRoutinePeriod;
  currentLine: string;
  choices: NpcDialogueChoice[];
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  count: number;
  usable?: boolean;
}

export interface WorldLandmark {
  id: string;
  name: string;
  kind:
    | 'spawn'
    | 'cairn'
    | 'signpost'
    | 'herb'
    | 'village'
    | 'location'
    | 'camp'
    | 'ruins'
    | 'mine'
    | 'cave';
  x: number;
  z: number;
  discovered: boolean;
}

export type BiomeType = 'Plains' | 'Forest' | 'Mountains' | 'Desert' | 'Beach';

export type PlayerMovementState =
  | 'idle'
  | 'walking'
  | 'running'
  | 'jumping'
  | 'falling';

export interface WeaponSlotHudView {
  slotIndex: number;
  itemId: string;
  weaponId: string;
  name: string;
  nameAr: string;
  kind: 'sword' | 'axe' | 'bow' | 'spear' | 'crossbow' | 'knife';
  damage: number;
  cooldown: number;
  range: number;
  isRanged: boolean;
  equipped: boolean;
  durability?: number;
  maxDurability?: number;
}

export type CameraPerspective =
  | 'first-person'
  | 'second-person'
  | 'third-person';

export interface PlayerHudSnapshot {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  x: number;
  y: number;
  z: number;
  headingDeg: number;
  grounded: boolean;
  sprinting: boolean;
  speed: number;
  biome: BiomeType;
  inWater: boolean;
  movementState: PlayerMovementState;
  timeOfDayLabel: string;
  nearbyInteractable: InteractableInfo | null;
  level: number;
  xp: number;
  xpToNextLevel: number;
  coins: number;
  trackedQuest: QuestView | null;
  combatTarget?: CombatEnemyHudTarget | null;
  equippedWeapon?: WeaponSlotHudView | null;
  weaponCooldownRatio?: number;
  ownedWeapons?: WeaponSlotHudView[];
  timeSnapshot?: TimeSnapshot;
  weatherSnapshot?: WeatherSnapshot;
  isSleeping?: boolean;
  sleepProgress?: number;
  worldType?: WorldType;
  isChargingBow?: boolean;
  bowChargeProgress?: number;
  bowMaxCharge?: boolean;
  arrowCount?: number;
  bowTargetType?: 'none' | 'enemy' | 'animal' | 'npc';
  showBowTrajectory?: boolean;
  cameraPerspective?: CameraPerspective;
  indicatorX?: number;
  indicatorY?: number;
  biomeMaterialId?: string;
  biomeValidationOk?: boolean;
}

export interface GameSettings {
  mouseSensitivity: number;
  muted: boolean;
  invertY: boolean;
}

export type ScreenOrientationMode = 'portrait' | 'landscape';

export type MobileControlSizePreset = 'small' | 'medium' | 'large';

export type MobileControlId =
  | 'joystick'
  | 'jump'
  | 'attack'
  | 'interact'
  | 'inventory'
  | 'map'
  | 'pause'
  | 'quests'
  | 'camera';

export interface MobileButtonVisibility {
  jump: boolean;
  attack: boolean;
  interact: boolean;
  inventory: boolean;
  map: boolean;
  pause: boolean;
  quests: boolean;
  camera: boolean;
}

export interface MobileControlLayoutItem {
  /** Normalized center X (0..1) inside the safe screen area */
  x: number;
  /** Normalized center Y (0..1) inside the safe screen area */
  y: number;
  /** Logical base width in px before global Control Size preset multiplier */
  width: number;
  /** Logical base height in px before global Control Size preset multiplier */
  height: number;
  /** Relative scale factor (width / defaultSize) */
  scale: number;
  /** Per-control opacity (0.2..1.0) */
  opacity: number;
  /** Whether this control is shown during gameplay */
  visible: boolean;
}

export type MobileOrientationLayout = Record<
  MobileControlId,
  MobileControlLayoutItem
>;

export interface PortraitCameraSettings {
  autoAdapt: boolean;
  fovBoost: number;
  distanceMultiplier: number;
  shoulderOffsetY: number;
}

export const CONTROL_SIZE_LIMITS = {
  joystick: { min: 100, default: 150, max: 250 },
  button: { min: 40, default: 70, max: 140 },
} as const;

export const CONTROL_SIZE_MULTIPLIER: Record<MobileControlSizePreset, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.2,
};

export const DEFAULT_PORTRAIT_CAMERA_SETTINGS: PortraitCameraSettings = {
  autoAdapt: true,
  fovBoost: 12,
  distanceMultiplier: 1.22,
  shoulderOffsetY: 0.16,
};

export function createDefaultPortraitLayout(
  opacity = 0.86,
): MobileOrientationLayout {
  return {
    joystick: {
      x: 0.21,
      y: 0.72,
      width: 138,
      height: 138,
      scale: 0.92,
      opacity,
      visible: true,
    },
    jump: {
      x: 0.86,
      y: 0.79,
      width: 68,
      height: 68,
      scale: 0.97,
      opacity,
      visible: true,
    },
    attack: {
      x: 0.86,
      y: 0.65,
      width: 64,
      height: 64,
      scale: 0.91,
      opacity,
      visible: true,
    },
    interact: {
      x: 0.62,
      y: 0.77,
      width: 64,
      height: 64,
      scale: 0.91,
      opacity: Math.max(opacity, 0.9),
      visible: true,
    },
    quests: {
      x: 0.56,
      y: 0.955,
      width: 40,
      height: 40,
      scale: 0.57,
      opacity,
      visible: true,
    },
    inventory: {
      x: 0.685,
      y: 0.955,
      width: 40,
      height: 40,
      scale: 0.57,
      opacity,
      visible: true,
    },
    map: {
      x: 0.81,
      y: 0.955,
      width: 40,
      height: 40,
      scale: 0.57,
      opacity,
      visible: true,
    },
    pause: {
      x: 0.935,
      y: 0.955,
      width: 40,
      height: 40,
      scale: 0.57,
      opacity,
      visible: true,
    },
    camera: {
      x: 0.435,
      y: 0.955,
      width: 40,
      height: 40,
      scale: 0.57,
      opacity,
      visible: true,
    },
  };
}

export function createDefaultLandscapeLayout(
  opacity = 0.86,
): MobileOrientationLayout {
  return {
    joystick: {
      x: 0.13,
      y: 0.78,
      width: 145,
      height: 145,
      scale: 0.97,
      opacity,
      visible: true,
    },
    jump: {
      x: 0.9,
      y: 0.81,
      width: 70,
      height: 70,
      scale: 1.0,
      opacity,
      visible: true,
    },
    attack: {
      x: 0.78,
      y: 0.83,
      width: 66,
      height: 66,
      scale: 0.94,
      opacity,
      visible: true,
    },
    interact: {
      x: 0.85,
      y: 0.56,
      width: 70,
      height: 70,
      scale: 1.0,
      opacity: Math.max(opacity, 0.9),
      visible: true,
    },
    quests: {
      x: 0.67,
      y: 0.08,
      width: 44,
      height: 44,
      scale: 0.63,
      opacity,
      visible: true,
    },
    inventory: {
      x: 0.76,
      y: 0.08,
      width: 44,
      height: 44,
      scale: 0.63,
      opacity,
      visible: true,
    },
    map: {
      x: 0.85,
      y: 0.08,
      width: 44,
      height: 44,
      scale: 0.63,
      opacity,
      visible: true,
    },
    pause: {
      x: 0.94,
      y: 0.08,
      width: 44,
      height: 44,
      scale: 0.63,
      opacity,
      visible: true,
    },
    camera: {
      x: 0.58,
      y: 0.08,
      width: 44,
      height: 44,
      scale: 0.63,
      opacity,
      visible: true,
    },
  };
}

export interface MobileControlSettings {
  version: number;
  /** null = auto-detect device; boolean = explicit user override */
  touchControlsEnabled: boolean | null;
  forceMobileControls: boolean;
  controlSize: MobileControlSizePreset;
  joystickSize: number;
  buttonSize: number;
  controlOpacity: number;
  cameraSensitivity: number;
  invertY: boolean;
  portraitCamera: PortraitCameraSettings;
  visibleButtons: MobileButtonVisibility;
  layouts: {
    portrait: MobileOrientationLayout;
    landscape: MobileOrientationLayout;
  };
}

export const DEFAULT_MOBILE_SETTINGS: MobileControlSettings = {
  version: 2,
  touchControlsEnabled: null,
  forceMobileControls: false,
  controlSize: 'medium',
  joystickSize: 1.0,
  buttonSize: 1.0,
  controlOpacity: 0.86,
  cameraSensitivity: 1.0,
  invertY: false,
  portraitCamera: { ...DEFAULT_PORTRAIT_CAMERA_SETTINGS },
  visibleButtons: {
    jump: true,
    attack: true,
    interact: true,
    inventory: true,
    map: true,
    pause: true,
    quests: true,
    camera: true,
  },
  layouts: {
    portrait: createDefaultPortraitLayout(0.86),
    landscape: createDefaultLandscapeLayout(0.86),
  },
};

export interface CylinderCollider {
  kind: 'cylinder';
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

export interface SphereCollider {
  kind: 'sphere';
  x: number;
  y: number;
  z: number;
  radius: number;
}

export type WorldCollider = CylinderCollider | SphereCollider;

/**
 * Common unified player input consumed by GameEngine / PlayerController
 * regardless of whether the source is keyboard, mouse, or mobile touch.
 */
export interface UnifiedPlayerInput {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  jump: boolean;
  sprint: boolean;
  attack: boolean;
  attackHeld: boolean;
  attackReleased: boolean;
  attackCancel: boolean;
  interact: boolean;
}
