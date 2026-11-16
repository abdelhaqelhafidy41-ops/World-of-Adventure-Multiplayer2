import type { ScreenOrientationMode } from '../types';

export interface ViewportOrientationState {
  orientation: ScreenOrientationMode;
  isPortrait: boolean;
  isLandscape: boolean;
  width: number;
  height: number;
  aspect: number;
  dpr: number;
}

type OrientationListener = (state: ViewportOrientationState) => void;

function readViewportDimensions(): { width: number; height: number; dpr: number } {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 720, dpr: 1 };
  }
  const vv = window.visualViewport;
  const rawW = vv?.width ? Math.min(window.innerWidth, vv.width) : window.innerWidth;
  const rawH = vv?.height ? Math.min(window.innerHeight, vv.height) : window.innerHeight;
  const width = Math.max(1, Math.round(rawW || window.innerWidth || 1280));
  const height = Math.max(1, Math.round(rawH || window.innerHeight || 720));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  return { width, height, dpr };
}

export function computeOrientationState(): ViewportOrientationState {
  const { width, height, dpr } = readViewportDimensions();
  const isPortrait = height > width;
  const isLandscape = width >= height;
  return {
    orientation: isPortrait ? 'portrait' : 'landscape',
    isPortrait,
    isLandscape,
    width,
    height,
    aspect: width / height,
    dpr,
  };
}

function statesEqual(a: ViewportOrientationState, b: ViewportOrientationState): boolean {
  return (
    a.orientation === b.orientation &&
    a.width === b.width &&
    a.height === b.height &&
    Math.abs(a.dpr - b.dpr) < 0.01
  );
}

/**
 * Centralized singleton orientation & viewport manager.
 * Guarantees a single shared set of window / visualViewport / screen.orientation
 * listeners across the 3D engine, HUD, mobile controls, and UI modals.
 */
class OrientationManagerImpl {
  private current: ViewportOrientationState = computeOrientationState();
  private listeners = new Set<OrientationListener>();
  private attached = false;
  private settleRafId = 0;
  private settleTimeoutId = 0;

  public getState(): ViewportOrientationState {
    const fresh = computeOrientationState();
    if (!statesEqual(this.current, fresh)) {
      this.current = fresh;
    }
    return this.current;
  }

  public isPortrait(): boolean {
    return this.getState().isPortrait;
  }

  public isLandscape(): boolean {
    return this.getState().isLandscape;
  }

  public subscribe(listener: OrientationListener): () => void {
    this.listeners.add(listener);
    this.attachListeners();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.detachListeners();
      }
    };
  }

  private notifyIfChanged = (): void => {
    const next = computeOrientationState();
    if (statesEqual(this.current, next)) return;
    this.current = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  };

  private handleOrientationEvent = (): void => {
    this.notifyIfChanged();
    if (typeof window === 'undefined') return;
    cancelAnimationFrame(this.settleRafId);
    window.clearTimeout(this.settleTimeoutId);
    // Android WebView / mobile browsers often finish updating innerWidth/innerHeight 1–2 frames after orientationchange
    this.settleRafId = requestAnimationFrame(() => {
      this.notifyIfChanged();
    });
    this.settleTimeoutId = window.setTimeout(() => {
      this.notifyIfChanged();
    }, 140);
  };

  private attachListeners(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    window.addEventListener('resize', this.notifyIfChanged);
    window.addEventListener('orientationchange', this.handleOrientationEvent);
    window.screen?.orientation?.addEventListener?.('change', this.handleOrientationEvent);
    window.visualViewport?.addEventListener?.('resize', this.notifyIfChanged);
    document.addEventListener('fullscreenchange', this.handleOrientationEvent);
  }

  private detachListeners(): void {
    if (!this.attached || typeof window === 'undefined') return;
    this.attached = false;
    cancelAnimationFrame(this.settleRafId);
    window.clearTimeout(this.settleTimeoutId);
    window.removeEventListener('resize', this.notifyIfChanged);
    window.removeEventListener('orientationchange', this.handleOrientationEvent);
    window.screen?.orientation?.removeEventListener?.('change', this.handleOrientationEvent);
    window.visualViewport?.removeEventListener?.('resize', this.notifyIfChanged);
    document.removeEventListener('fullscreenchange', this.handleOrientationEvent);
  }
}

export const OrientationManager = new OrientationManagerImpl();
