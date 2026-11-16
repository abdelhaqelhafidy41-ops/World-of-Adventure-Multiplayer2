import type { DamageResult } from './combatTypes';

export interface HealthComponentOptions {
  maxHealth: number;
  initialHealth?: number;
  invulnerabilityDuration?: number;
  damageReduction?: number;
}

/**
 * Reusable health & survivability component attachable to any combatant
 * (player or enemy). Handles damage clamping, invulnerability windows,
 * armor/damage reduction, healing, and revival.
 */
export class HealthComponent {
  private maxHealth: number;
  private currentHealth: number;
  private invulnerabilityDuration: number;
  private invulnerabilityTimer = 0;
  private damageReduction: number;
  private dead = false;

  constructor(options: HealthComponentOptions) {
    this.maxHealth = Math.max(1, options.maxHealth);
    this.currentHealth = Math.max(
      0,
      Math.min(this.maxHealth, options.initialHealth ?? this.maxHealth),
    );
    this.invulnerabilityDuration = Math.max(0, options.invulnerabilityDuration ?? 0);
    this.damageReduction = Math.max(0, Math.min(0.85, options.damageReduction ?? 0));
    this.dead = this.currentHealth <= 0;
  }

  public update(dt: number): void {
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);
    }
  }

  public getCurrentHealth(): number {
    return this.currentHealth;
  }

  public getMaxHealth(): number {
    return this.maxHealth;
  }

  public getHealthRatio(): number {
    return this.maxHealth > 0 ? Math.max(0, this.currentHealth / this.maxHealth) : 0;
  }

  public isAlive(): boolean {
    return !this.dead && this.currentHealth > 0;
  }

  public isDead(): boolean {
    return this.dead;
  }

  public isInvulnerable(): boolean {
    return this.invulnerabilityTimer > 0;
  }

  public setDamageReduction(reduction: number): void {
    this.damageReduction = Math.max(0, Math.min(0.85, reduction));
  }

  public setMaxHealth(nextMax: number, preserveRatio = false): void {
    const safeMax = Math.max(1, nextMax);
    const ratio = this.getHealthRatio();
    this.maxHealth = safeMax;
    if (preserveRatio) {
      this.currentHealth = Math.min(safeMax, Math.round(safeMax * ratio));
    } else {
      this.currentHealth = Math.min(safeMax, this.currentHealth);
    }
  }

  /**
   * Synchronizes current health directly from an external controller (e.g. PlayerController regen/consumables).
   */
  public syncHealth(value: number): void {
    this.currentHealth = Math.max(0, Math.min(this.maxHealth, value));
    this.dead = this.currentHealth <= 0;
  }

  public applyDamage(
    rawAmount: number,
    isCrit = false,
    ignoreInvuln = false,
  ): DamageResult {
    if (this.dead || rawAmount <= 0 || (!ignoreInvuln && this.invulnerabilityTimer > 0)) {
      return {
        applied: false,
        rawAmount,
        finalAmount: 0,
        remainingHealth: this.currentHealth,
        maxHealth: this.maxHealth,
        killed: false,
        isCrit,
      };
    }

    const mitigated = Math.max(1, Math.round(rawAmount * (1 - this.damageReduction)));
    this.currentHealth = Math.max(0, this.currentHealth - mitigated);
    if (this.invulnerabilityDuration > 0) {
      this.invulnerabilityTimer = this.invulnerabilityDuration;
    }

    const killed = this.currentHealth <= 0;
    if (killed) {
      this.dead = true;
    }

    return {
      applied: true,
      rawAmount,
      finalAmount: mitigated,
      remainingHealth: this.currentHealth,
      maxHealth: this.maxHealth,
      killed,
      isCrit,
    };
  }

  public heal(amount: number): number {
    if (this.dead || amount <= 0) return 0;
    const prev = this.currentHealth;
    this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    return this.currentHealth - prev;
  }

  public revive(healthRatio = 1): void {
    const ratio = Math.max(0.1, Math.min(1, healthRatio));
    this.dead = false;
    this.invulnerabilityTimer = 0;
    this.currentHealth = Math.max(1, Math.round(this.maxHealth * ratio));
  }
}
