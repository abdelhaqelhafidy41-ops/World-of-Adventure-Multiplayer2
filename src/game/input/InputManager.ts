import type { GameSettings, MobileControlSettings, UnifiedPlayerInput } from '../types';
import { KeyboardInput, type KeyboardUiCallbacks } from './KeyboardInput';
import { MouseInput } from './MouseInput';
import { MobileInputManager } from './MobileInputManager';

export interface InputCallbacks extends KeyboardUiCallbacks {
  onPointerLockChange: (locked: boolean) => void;
}

/**
 * Unified InputManager combining KeyboardInput, MouseInput, and MobileInputManager
 * into a single common UnifiedPlayerInput structure for the PlayerController / GameEngine.
 */
export class InputManager {
  public readonly keyboard: KeyboardInput;
  public readonly mouse: MouseInput;
  public readonly mobile: MobileInputManager;

  constructor(targetElement: HTMLElement, callbacks: InputCallbacks) {
    this.keyboard = new KeyboardInput({
      onPauseToggle: callbacks.onPauseToggle,
      onInventoryToggle: callbacks.onInventoryToggle,
      onMapToggle: callbacks.onMapToggle,
      onQuestJournalToggle: callbacks.onQuestJournalToggle,
      onWeaponSelect: callbacks.onWeaponSelect,
      onWeaponCycle: callbacks.onWeaponCycle,
      onWeaponUnequip: callbacks.onWeaponUnequip,
      onCameraCycle: callbacks.onCameraCycle,
      onDebugToggle: callbacks.onDebugToggle,
      onChatToggle: callbacks.onChatToggle,
    });
    this.mouse = new MouseInput(targetElement, callbacks.onPointerLockChange);
    this.mobile = new MobileInputManager();
  }

  public setActive(active: boolean): void {
    this.keyboard.setActive(active);
    this.mouse.setActive(active);
    this.mobile.setActive(active);
  }

  public setTouchMode(touchEnabled: boolean): void {
    this.mouse.setTouchControlsEnabled(touchEnabled);
  }

  public setRangedMode(enabled: boolean): void {
    this.mouse.setRangedMode(enabled);
  }

  public requestPointerLock(): void {
    this.mouse.requestPointerLock();
  }

  public exitPointerLock(): void {
    this.mouse.exitPointerLock();
  }

  public clearAll(): void {
    this.keyboard.clear();
    this.mouse.clear();
    this.mobile.resetAll();
  }

  public consumeInput(
    desktopSettings: GameSettings,
    mobileSettings: MobileControlSettings,
    dt = 1 / 60,
  ): UnifiedPlayerInput {
    const kb = this.keyboard.consumeFrame();
    const ms = this.mouse.consumeFrame(
      desktopSettings.mouseSensitivity,
      desktopSettings.invertY,
      dt,
    );
    const mb = this.mobile.consumeFrame(
      mobileSettings.cameraSensitivity,
      mobileSettings.invertY,
    );

    let moveX = kb.moveX + mb.moveX;
    let moveY = kb.moveY + mb.moveY;
    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    const attackHeld = kb.attackHeld || ms.attackHeld || mb.attackHeld;
    const attackReleased =
      !attackHeld && (kb.attackReleased || ms.attackReleased || mb.attackReleased);

    return {
      moveX,
      moveY,
      lookX: ms.lookX + mb.lookX,
      lookY: ms.lookY + mb.lookY,
      jump: kb.jump || mb.jump,
      sprint: kb.sprint || mb.sprint,
      attack: kb.attack || ms.attack || mb.attack,
      attackHeld,
      attackReleased,
      attackCancel: kb.attackCancel || ms.attackCancel || mb.attackCancel,
      interact: kb.interact || mb.interact,
    };
  }

  public dispose(): void {
    this.keyboard.dispose();
    this.mouse.dispose();
    this.mobile.resetAll();
  }
}
