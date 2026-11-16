export interface KeyboardUiCallbacks {
  onPauseToggle: () => void;
  onInventoryToggle: () => void;
  onMapToggle: () => void;
  onQuestJournalToggle: () => void;
  onWeaponSelect?: (slotIndex: number) => void;
  onWeaponCycle?: () => void;
  onWeaponUnequip?: () => void;
  onCameraCycle?: () => void;
  onDebugToggle?: () => void;
  onChatToggle?: () => void;
}

export interface KeyboardFrame {
  moveX: number;
  moveY: number;
  sprint: boolean;
  jump: boolean;
  attack: boolean;
  attackHeld: boolean;
  attackReleased: boolean;
  attackCancel: boolean;
  interact: boolean;
}

export class KeyboardInput {
  private readonly heldKeys = new Set<string>();
  private jumpQueued = false;
  private attackQueued = false;
  private attackHeld = false;
  private attackReleaseQueued = false;
  private attackCancelQueued = false;
  private interactQueued = false;
  private active = false;
  private readonly callbacks: KeyboardUiCallbacks;

  constructor(callbacks: KeyboardUiCallbacks) {
    this.callbacks = callbacks;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  public setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.clear();
    }
  }

  public clear(): void {
    this.heldKeys.clear();
    this.jumpQueued = false;
    this.attackQueued = false;
    this.attackHeld = false;
    this.attackReleaseQueued = false;
    this.attackCancelQueued = false;
    this.interactQueued = false;
  }

  public consumeFrame(): KeyboardFrame {
    const moveX =
      (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight') ? 1 : 0) -
      (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft') ? 1 : 0);
    const moveY =
      (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp') ? 1 : 0) -
      (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown') ? 1 : 0);

    const frame: KeyboardFrame = {
      moveX,
      moveY,
      sprint: this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight'),
      jump: this.jumpQueued,
      attack: this.attackQueued,
      attackHeld: this.attackHeld,
      attackReleased: this.attackReleaseQueued,
      attackCancel: this.attackCancelQueued,
      interact: this.interactQueued,
    };

    this.jumpQueued = false;
    this.attackQueued = false;
    this.attackReleaseQueued = false;
    this.attackCancelQueued = false;
    this.interactQueued = false;
    return frame;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const isTextInput = Boolean(
      target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable),
    );

    if (event.code === 'Escape') {
      if (!event.repeat) {
        this.callbacks.onPauseToggle();
      }
      return;
    }

    if (isTextInput) {
      return;
    }

    if (event.code === 'KeyP') {
      if (!event.repeat) {
        this.callbacks.onPauseToggle();
      }
      return;
    }

    if (event.code === 'KeyI') {
      if (!event.repeat) {
        this.callbacks.onInventoryToggle();
      }
      return;
    }

    if (event.code === 'KeyM') {
      if (!event.repeat) {
        this.callbacks.onMapToggle();
      }
      return;
    }

    if (event.code === 'KeyJ') {
      if (!event.repeat) {
        this.callbacks.onQuestJournalToggle();
      }
      return;
    }

    if (event.code === 'KeyT') {
      if (!event.repeat) {
        this.callbacks.onChatToggle?.();
      }
      return;
    }

    if (event.code === 'F3') {
      event.preventDefault();
      if (!event.repeat) {
        this.callbacks.onDebugToggle?.();
      }
      return;
    }

    if (!this.active) return;

    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) {
        this.jumpQueued = true;
      }
    } else if (event.code === 'KeyF') {
      if (!event.repeat) {
        this.attackQueued = true;
        this.attackHeld = true;
        this.attackReleaseQueued = false;
        this.attackCancelQueued = false;
      }
    } else if (event.code === 'KeyC') {
      if (!event.repeat) {
        if (this.attackHeld) {
          this.attackHeld = false;
          this.attackReleaseQueued = false;
        }
        this.attackCancelQueued = true;
      }
    } else if (event.code === 'KeyE') {
      if (!event.repeat) {
        this.interactQueued = true;
      }
    } else if (
      event.code.startsWith('Digit') &&
      event.code.length === 6 &&
      event.code >= 'Digit1' &&
      event.code <= 'Digit9'
    ) {
      if (!event.repeat) {
        const slotNum = Number(event.code.slice(5)) - 1;
        this.callbacks.onWeaponSelect?.(slotNum);
      }
    } else if (event.code === 'KeyQ') {
      if (!event.repeat) {
        this.callbacks.onWeaponCycle?.();
      }
    } else if (event.code === 'KeyX') {
      if (!event.repeat) {
        this.callbacks.onWeaponUnequip?.();
      }
    } else if (event.code === 'KeyV') {
      if (!event.repeat) {
        this.callbacks.onCameraCycle?.();
      }
    }

    this.heldKeys.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code);
    if (event.code === 'KeyF' && this.attackHeld) {
      this.attackHeld = false;
      this.attackReleaseQueued = true;
    }
  };

  private handleBlur = (): void => {
    this.clear();
  };

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
