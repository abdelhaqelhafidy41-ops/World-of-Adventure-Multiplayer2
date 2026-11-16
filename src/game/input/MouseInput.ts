export interface MouseFrame {
  lookX: number;
  lookY: number;
  attack: boolean;
  attackHeld: boolean;
  attackReleased: boolean;
  attackCancel: boolean;
}

export class MouseInput {
  private readonly targetElement: HTMLElement;
  private readonly onPointerLockChange: (locked: boolean) => void;

  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private dragVelX = 0;
  private dragVelY = 0;
  private attackQueued = false;
  private attackHeld = false;
  private attackReleaseQueued = false;
  private attackCancelQueued = false;
  private isPointerLocked = false;
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastDragMoveTime = 0;
  private active = false;
  private touchActive = false;
  private rangedMode = false;

  // Increased drag ratio and longer momentum decay for smooth mouse-drag orbiting
  private readonly dragRatio = 2.45;
  private readonly dragCoastDecay = 3.2;

  constructor(
    targetElement: HTMLElement,
    onPointerLockChange: (locked: boolean) => void,
  ) {
    this.targetElement = targetElement;
    this.onPointerLockChange = onPointerLockChange;

    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    this.targetElement.addEventListener('pointerdown', this.handlePointerDown);
    this.targetElement.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('blur', this.handleBlur);
  }

  public setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.clear();
      this.exitPointerLock();
    }
  }

  public setTouchControlsEnabled(enabled: boolean): void {
    this.touchActive = enabled;
    if (enabled) {
      this.exitPointerLock();
    }
  }

  public setRangedMode(enabled: boolean): void {
    this.rangedMode = enabled;
  }

  public requestPointerLock(): void {
    if (!this.active || this.touchActive) return;
    if (document.pointerLockElement !== this.targetElement) {
      try {
        const result = this.targetElement.requestPointerLock?.() as unknown;
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(() => {
            // Drag-to-look fallback remains active
          });
        }
      } catch {
        // Fallback drag-to-look stays enabled
      }
    }
  }

  public exitPointerLock(): void {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore
      }
    }
    this.isDraggingLook = false;
  }

  public getPointerLocked(): boolean {
    return this.isPointerLocked;
  }

  public clear(): void {
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.dragVelX = 0;
    this.dragVelY = 0;
    this.attackQueued = false;
    this.attackHeld = false;
    this.attackReleaseQueued = false;
    this.attackCancelQueued = false;
    this.isDraggingLook = false;
  }

  public consumeFrame(
    sensitivity: number,
    invertY: boolean,
    dt = 1 / 60,
  ): MouseFrame {
    const scale = 0.0022 * sensitivity;
    let totalX = this.lookDeltaX;
    let totalY = this.lookDeltaY;

    // Apply lingering drag coast momentum after mouse drag movement / release
    if (!this.isPointerLocked && !this.isDraggingLook) {
      const coastX = this.dragVelX * dt;
      const coastY = this.dragVelY * dt;
      totalX += coastX;
      totalY += coastY;
      const decay = Math.exp(-this.dragCoastDecay * dt);
      this.dragVelX *= decay;
      this.dragVelY *= decay;
      if (Math.hypot(this.dragVelX, this.dragVelY) < 0.5) {
        this.dragVelX = 0;
        this.dragVelY = 0;
      }
    } else if (this.isDraggingLook && performance.now() - this.lastDragMoveTime > 45) {
      const decay = Math.exp(-this.dragCoastDecay * 1.4 * dt);
      this.dragVelX *= decay;
      this.dragVelY *= decay;
    }

    const frame: MouseFrame = {
      lookX: totalX * scale,
      lookY: totalY * scale * (invertY ? -1 : 1),
      attack: this.attackQueued,
      attackHeld: this.attackHeld,
      attackReleased: this.attackReleaseQueued,
      attackCancel: this.attackCancelQueued,
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.attackQueued = false;
    this.attackReleaseQueued = false;
    this.attackCancelQueued = false;
    return frame;
  }

  private handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.targetElement;
    this.isPointerLocked = locked;
    if (locked) {
      this.dragVelX = 0;
      this.dragVelY = 0;
    } else if (this.attackHeld) {
      this.attackHeld = false;
      this.attackReleaseQueued = false;
      this.attackCancelQueued = true;
    }
    this.onPointerLockChange(locked);
  };

  private handlePointerLockError = (): void => {
    this.isPointerLocked = false;
    this.onPointerLockChange(false);
  };

  private handleContextMenu = (event: MouseEvent): void => {
    if (this.active) {
      event.preventDefault();
    }
  };

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.active) return;
    // Ignore touch pointers (handled by MobileInputManager)
    if (event.pointerType === 'touch') return;

    if (event.button === 2) {
      if (this.attackHeld) {
        this.attackHeld = false;
        this.attackReleaseQueued = false;
      }
      this.attackCancelQueued = true;
      return;
    }

    if (event.button === 0) {
      if (this.isPointerLocked) {
        this.attackQueued = true;
        this.attackHeld = true;
        this.attackReleaseQueued = false;
        this.attackCancelQueued = false;
        return;
      }
      if (this.rangedMode) {
        this.attackQueued = true;
        this.attackHeld = true;
        this.attackReleaseQueued = false;
        this.attackCancelQueued = false;
      }
      this.isDraggingLook = true;
      this.dragVelX = 0;
      this.dragVelY = 0;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.lastDragMoveTime = performance.now();
      if (!this.touchActive) {
        this.requestPointerLock();
      }
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    if (event.button === 0 && this.attackHeld) {
      this.attackHeld = false;
      this.attackReleaseQueued = true;
    }
    this.isDraggingLook = false;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.active || event.pointerType === 'touch') return;

    if (this.isPointerLocked) {
      const mx = Math.max(-180, Math.min(180, event.movementX));
      const my = Math.max(-180, Math.min(180, event.movementY));
      this.lookDeltaX += mx;
      this.lookDeltaY += my;
    } else if (this.isDraggingLook) {
      const now = performance.now();
      const elapsedSec = Math.max(0.008, (now - this.lastDragMoveTime) / 1000);
      const dx = event.clientX - this.lastPointerX;
      const dy = event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.lastDragMoveTime = now;

      const scaledX = dx * this.dragRatio;
      const scaledY = dy * this.dragRatio;
      this.lookDeltaX += scaledX;
      this.lookDeltaY += scaledY;

      // Blend instantaneous drag velocity so releasing a drag coasts smoothly
      const instVx = Math.max(-2200, Math.min(2200, scaledX / elapsedSec));
      const instVy = Math.max(-1600, Math.min(1600, scaledY / elapsedSec));
      this.dragVelX = this.dragVelX * 0.35 + instVx * 0.65;
      this.dragVelY = this.dragVelY * 0.35 + instVy * 0.65;
    }
  };

  private handleBlur = (): void => {
    this.clear();
  };

  public dispose(): void {
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    this.targetElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.targetElement.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('blur', this.handleBlur);
  }
}
