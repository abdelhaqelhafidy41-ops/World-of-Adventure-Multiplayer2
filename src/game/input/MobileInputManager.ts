export interface MobileInputFrame {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  sprint: boolean;
  jump: boolean;
  attack: boolean;
  attackHeld: boolean;
  attackReleased: boolean;
  attackCancel: boolean;
  interact: boolean;
}

/**
 * Automatically detects touch-capable devices without misidentifying standard desktops.
 */
export function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const hasTouch =
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0;
  const coarsePointer =
    typeof window.matchMedia === 'function' &&
    (window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(any-pointer: coarse)').matches ||
      window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  const mobileUa =
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      navigator.userAgent ?? '',
    );
  return hasTouch || coarsePointer || mobileUa;
}

/**
 * Dedicated multi-touch input manager handling simultaneous left virtual joystick,
 * right-side camera rotation, and independent action buttons with zero per-frame React re-renders.
 */
export class MobileInputManager {
  private active = false;

  // Joystick state (tracked by pointerId so multi-touch never conflicts)
  private joystickPointerId: number | null = null;
  private joystickCenterX = 0;
  private joystickCenterY = 0;
  private joystickMaxRadius = 48;
  private moveX = 0;
  private moveY = 0;
  private sprint = false;
  private thumbElement: HTMLElement | null = null;

  // Camera drag state (tracked by independent pointerId)
  private cameraPointerId: number | null = null;
  private lastCameraX = 0;
  private lastCameraY = 0;
  private lookDeltaX = 0;
  private lookDeltaY = 0;

  // Edge-triggered & holdable actions
  private jumpQueued = false;
  private attackQueued = false;
  private attackHeld = false;
  private attackReleaseQueued = false;
  private attackCancelQueued = false;
  private attackPointerId: number | null = null;
  private interactQueued = false;

  public setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.resetAll();
    }
  }

  public registerThumbElement(el: HTMLElement | null): void {
    this.thumbElement = el;
    this.updateThumbTransform(0, 0);
  }

  public startJoystick(
    pointerId: number,
    clientX: number,
    clientY: number,
    centerX: number,
    centerY: number,
    maxRadius: number,
  ): void {
    if (!this.active) return;
    if (this.joystickPointerId !== null && this.joystickPointerId !== pointerId) return;

    this.joystickPointerId = pointerId;
    this.joystickCenterX = centerX;
    this.joystickCenterY = centerY;
    this.joystickMaxRadius = Math.max(24, maxRadius);
    this.updateJoystickVector(clientX, clientY);
  }

  public moveJoystick(pointerId: number, clientX: number, clientY: number): void {
    if (!this.active || this.joystickPointerId !== pointerId) return;
    this.updateJoystickVector(clientX, clientY);
  }

  public endJoystick(pointerId: number): void {
    if (this.joystickPointerId !== pointerId) return;
    this.joystickPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.sprint = false;
    this.updateThumbTransform(0, 0);
  }

  private updateJoystickVector(clientX: number, clientY: number): void {
    let dx = clientX - this.joystickCenterX;
    let dy = clientY - this.joystickCenterY;
    const dist = Math.hypot(dx, dy);

    if (dist > this.joystickMaxRadius && dist > 0.0001) {
      const clampRatio = this.joystickMaxRadius / dist;
      dx *= clampRatio;
      dy *= clampRatio;
    }

    this.updateThumbTransform(dx, dy);

    const norm = Math.min(1, dist / this.joystickMaxRadius);
    const deadzone = 0.09;
    if (norm < deadzone) {
      this.moveX = 0;
      this.moveY = 0;
      this.sprint = false;
      return;
    }

    // Rescale analog magnitude smoothly from deadzone..1
    const scaledMag = (norm - deadzone) / (1 - deadzone);
    const angle = Math.atan2(dy, dx);
    this.moveX = Math.cos(angle) * scaledMag;
    // Screen Y down is negative forward; invert so dragging up (+forward) = +1 moveY
    this.moveY = -Math.sin(angle) * scaledMag;
    this.sprint = norm > 0.9;
    this.thumbElement?.setAttribute(
      'data-sprinting',
      this.sprint ? 'true' : 'false',
    );
  }

  private updateThumbTransform(dx: number, dy: number): void {
    if (!this.thumbElement) return;
    this.thumbElement.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    if (!this.sprint) {
      this.thumbElement.setAttribute('data-sprinting', 'false');
    }
  }

  public startCamera(pointerId: number, clientX: number, clientY: number): void {
    if (!this.active) return;
    if (this.cameraPointerId !== null && this.cameraPointerId !== pointerId) return;
    this.cameraPointerId = pointerId;
    this.lastCameraX = clientX;
    this.lastCameraY = clientY;
  }

  public moveCamera(pointerId: number, clientX: number, clientY: number): void {
    if (!this.active || this.cameraPointerId !== pointerId) return;
    const dx = Math.max(-160, Math.min(160, clientX - this.lastCameraX));
    const dy = Math.max(-160, Math.min(160, clientY - this.lastCameraY));
    this.lastCameraX = clientX;
    this.lastCameraY = clientY;
    this.lookDeltaX += dx;
    this.lookDeltaY += dy;
  }

  public endCamera(pointerId: number): void {
    if (this.cameraPointerId !== pointerId) return;
    this.cameraPointerId = null;
  }

  public triggerJump(): void {
    if (this.active) this.jumpQueued = true;
  }

  public triggerAttack(): void {
    if (this.active) this.attackQueued = true;
  }

  public startAttackHold(pointerId?: number): void {
    if (!this.active) return;
    if (
      this.attackPointerId !== null &&
      pointerId !== undefined &&
      this.attackPointerId !== pointerId
    ) {
      return;
    }
    this.attackPointerId = pointerId ?? null;
    this.attackQueued = true;
    this.attackHeld = true;
    this.attackReleaseQueued = false;
    this.attackCancelQueued = false;
  }

  public endAttackHold(pointerId?: number): void {
    if (
      pointerId !== undefined &&
      this.attackPointerId !== null &&
      this.attackPointerId !== pointerId
    ) {
      return;
    }
    if (this.attackHeld) {
      this.attackHeld = false;
      this.attackReleaseQueued = true;
    }
    this.attackPointerId = null;
  }

  public cancelAttackHold(pointerId?: number): void {
    if (pointerId !== undefined && this.attackPointerId !== pointerId) {
      return;
    }
    if (this.attackHeld) {
      this.attackCancelQueued = true;
    }
    this.attackPointerId = null;
    this.attackHeld = false;
    this.attackReleaseQueued = false;
    this.attackQueued = false;
  }

  public triggerInteract(): void {
    if (this.active) this.interactQueued = true;
  }

  public resetAll(): void {
    this.joystickPointerId = null;
    this.cameraPointerId = null;
    this.attackPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.sprint = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.jumpQueued = false;
    this.attackQueued = false;
    this.attackHeld = false;
    this.attackReleaseQueued = false;
    this.attackCancelQueued = false;
    this.interactQueued = false;
    this.updateThumbTransform(0, 0);
  }

  public consumeFrame(cameraSensitivity: number, invertY: boolean): MobileInputFrame {
    const scale = 0.0042 * cameraSensitivity;
    const frame: MobileInputFrame = {
      moveX: this.moveX,
      moveY: this.moveY,
      lookX: this.lookDeltaX * scale,
      lookY: this.lookDeltaY * scale * (invertY ? -1 : 1),
      sprint: this.sprint,
      jump: this.jumpQueued,
      attack: this.attackQueued,
      attackHeld: this.attackHeld,
      attackReleased: this.attackReleaseQueued,
      attackCancel: this.attackCancelQueued,
      interact: this.interactQueued,
    };

    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.jumpQueued = false;
    this.attackQueued = false;
    this.attackReleaseQueued = false;
    this.attackCancelQueued = false;
    this.interactQueued = false;
    return frame;
  }
}
