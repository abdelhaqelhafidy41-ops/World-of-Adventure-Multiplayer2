import type { WorldType } from '../save/saveTypes';

export const STAMINA_CONFIG_VERSION = 1;

/**
 * Centralized maximum stamina configuration per world/game mode.
 * Creative mode uses Infinity so stamina is truly unlimited and never drains.
 */
export const STAMINA_BY_MODE: Record<WorldType, number> = {
  creative: Infinity,
  survival: 200,
  normal: 500,
  adventure: 350,
};

export function isInfiniteStaminaMode(worldType: WorldType): boolean {
  return worldType === 'creative' || STAMINA_BY_MODE[worldType] === Infinity;
}

export function getBaseMaxStaminaForMode(worldType: WorldType): number {
  const value = STAMINA_BY_MODE[worldType];
  return value === Infinity ? Infinity : value;
}

export function formatStaminaDisplay(
  stamina: number,
  maxStamina: number,
): string {
  if (!Number.isFinite(maxStamina) || !Number.isFinite(stamina)) {
    return '∞';
  }
  return `${Math.max(0, Math.round(stamina))} / ${Math.round(maxStamina)}`;
}
