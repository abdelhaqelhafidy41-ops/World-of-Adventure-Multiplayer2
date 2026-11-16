import { OrientationManager } from './OrientationManager';
import {
  CONTROL_SIZE_LIMITS,
  CONTROL_SIZE_MULTIPLIER,
  DEFAULT_MOBILE_SETTINGS,
  DEFAULT_PORTRAIT_CAMERA_SETTINGS,
  createDefaultLandscapeLayout,
  createDefaultPortraitLayout,
  type MobileButtonVisibility,
  type MobileControlId,
  type MobileControlLayoutItem,
  type MobileControlSettings,
  type MobileControlSizePreset,
  type MobileOrientationLayout,
  type ScreenOrientationMode,
} from '../types';

export const MOBILE_SETTINGS_STORAGE_KEY = 'woa_mobile_controls_v2';
const LEGACY_MOBILE_SETTINGS_STORAGE_KEY = 'woa_mobile_controls_v1';

export const ALL_MOBILE_CONTROL_IDS: MobileControlId[] = [
  'joystick',
  'jump',
  'attack',
  'interact',
  'inventory',
  'map',
  'pause',
  'quests',
  'camera',
];

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SafeAreaRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  insets: SafeAreaInsets;
}

export interface ResolvedControlBox {
  centerX: number;
  centerY: number;
  left: number;
  top: number;
  width: number;
  height: number;
  clampedNormX: number;
  clampedNormY: number;
}

export function getScreenOrientation(): ScreenOrientationMode {
  return OrientationManager.getState().orientation;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clampControlSize(id: MobileControlId, rawSize: number): number {
  const limits =
    id === 'joystick' ? CONTROL_SIZE_LIMITS.joystick : CONTROL_SIZE_LIMITS.button;
  return Math.round(clampNumber(rawSize, limits.min, limits.max));
}

let cachedProbeEl: HTMLDivElement | null = null;

function ensureSafeAreaProbe(): HTMLDivElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  if (cachedProbeEl && cachedProbeEl.isConnected) return cachedProbeEl;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.position = 'fixed';
  el.style.left = '0';
  el.style.top = '0';
  el.style.width = '0';
  el.style.height = '0';
  el.style.visibility = 'hidden';
  el.style.pointerEvents = 'none';
  el.style.paddingTop = 'env(safe-area-inset-top, 0px)';
  el.style.paddingRight = 'env(safe-area-inset-right, 0px)';
  el.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
  el.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
  document.body.appendChild(el);
  cachedProbeEl = el;
  return el;
}

export function measureSafeAreaRect(): SafeAreaRect {
  if (typeof window === 'undefined') {
    return {
      left: 8,
      top: 8,
      right: 1272,
      bottom: 712,
      width: 1264,
      height: 704,
      viewportWidth: 1280,
      viewportHeight: 720,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    };
  }

  const vw = Math.max(
    240,
    Math.min(
      window.innerWidth,
      window.visualViewport?.width ?? window.innerWidth,
    ),
  );
  const vh = Math.max(
    240,
    Math.min(
      window.innerHeight,
      window.visualViewport?.height ?? window.innerHeight,
    ),
  );

  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;

  const probe = ensureSafeAreaProbe();
  if (probe) {
    const cs = window.getComputedStyle(probe);
    top = parseFloat(cs.paddingTop) || 0;
    right = parseFloat(cs.paddingRight) || 0;
    bottom = parseFloat(cs.paddingBottom) || 0;
    left = parseFloat(cs.paddingLeft) || 0;
  }

  const margin = 8;
  const safeLeft = Math.round(left + margin);
  const safeTop = Math.round(top + margin);
  const safeRight = Math.round(Math.max(safeLeft + 160, vw - right - margin));
  const safeBottom = Math.round(Math.max(safeTop + 160, vh - bottom - margin));

  return {
    left: safeLeft,
    top: safeTop,
    right: safeRight,
    bottom: safeBottom,
    width: Math.max(160, safeRight - safeLeft),
    height: Math.max(160, safeBottom - safeTop),
    viewportWidth: vw,
    viewportHeight: vh,
    insets: { top, right, bottom, left },
  };
}

/**
 * Computes final clamped pixel rectangle for a control inside the safe screen area,
 * respecting both individual custom dimensions and the global Control Size preset.
 */
export function computeControlBox(
  id: MobileControlId,
  item: MobileControlLayoutItem,
  safeRect: SafeAreaRect,
  sizePreset: MobileControlSizePreset,
  joystickSizeMult?: number,
  buttonSizeMult?: number,
): ResolvedControlBox {
  const presetMult = CONTROL_SIZE_MULTIPLIER[sizePreset] ?? 1.0;
  const globalMult =
    id === 'joystick'
      ? (joystickSizeMult ?? presetMult)
      : (buttonSizeMult ?? presetMult);
  const baseW = clampControlSize(id, item.width);
  const baseH = clampControlSize(id, item.height);

  // Subtle responsive cap so oversized controls never exceed half the safe screen dimension
  const maxDim = Math.max(
    id === 'joystick' ? 110 : 44,
    Math.min(safeRect.width * 0.62, safeRect.height * 0.48),
  );
  const effW = Math.round(Math.min(maxDim, Math.max(38, baseW * globalMult)));
  const effH = Math.round(Math.min(maxDim, Math.max(38, baseH * globalMult)));

  const halfW = effW * 0.5;
  const halfH = effH * 0.5;

  const rawCenterX = safeRect.left + clampNumber(item.x, 0, 1) * safeRect.width;
  const rawCenterY = safeRect.top + clampNumber(item.y, 0, 1) * safeRect.height;

  const minCenterX = safeRect.left + halfW;
  const maxCenterX = Math.max(minCenterX, safeRect.right - halfW);
  const minCenterY = safeRect.top + halfH;
  const maxCenterY = Math.max(minCenterY, safeRect.bottom - halfH);

  const centerX = clampNumber(rawCenterX, minCenterX, maxCenterX);
  const centerY = clampNumber(rawCenterY, minCenterY, maxCenterY);

  return {
    centerX,
    centerY,
    left: Math.round(centerX - halfW),
    top: Math.round(centerY - halfH),
    width: effW,
    height: effH,
    clampedNormX:
      safeRect.width > 0 ? clampNumber((centerX - safeRect.left) / safeRect.width, 0, 1) : item.x,
    clampedNormY:
      safeRect.height > 0 ? clampNumber((centerY - safeRect.top) / safeRect.height, 0, 1) : item.y,
  };
}

export function normalizeControlCenter(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  safeRect: SafeAreaRect,
): { x: number; y: number } {
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const clampedX = clampNumber(
    centerX,
    safeRect.left + halfW,
    Math.max(safeRect.left + halfW, safeRect.right - halfW),
  );
  const clampedY = clampNumber(
    centerY,
    safeRect.top + halfH,
    Math.max(safeRect.top + halfH, safeRect.bottom - halfH),
  );
  return {
    x: Number(clampNumber((clampedX - safeRect.left) / safeRect.width, 0, 1).toFixed(4)),
    y: Number(clampNumber((clampedY - safeRect.top) / safeRect.height, 0, 1).toFixed(4)),
  };
}

function sanitizeLayout(
  raw: Partial<MobileOrientationLayout> | undefined,
  fallback: MobileOrientationLayout,
): MobileOrientationLayout {
  const out = {} as MobileOrientationLayout;
  for (const id of ALL_MOBILE_CONTROL_IDS) {
    const def = fallback[id];
    const src = raw?.[id];
    const limits =
      id === 'joystick' ? CONTROL_SIZE_LIMITS.joystick : CONTROL_SIZE_LIMITS.button;
    const width = clampControlSize(id, src?.width ?? def.width);
    const height = clampControlSize(id, src?.height ?? src?.width ?? def.height);
    out[id] = {
      x: clampNumber(src?.x ?? def.x, 0, 1),
      y: clampNumber(src?.y ?? def.y, 0, 1),
      width,
      height,
      scale: Number((width / limits.default).toFixed(3)),
      opacity: clampNumber(src?.opacity ?? def.opacity, 0.2, 1.0),
      visible: typeof src?.visible === 'boolean' ? src.visible : def.visible,
    };
  }
  return out;
}

export function loadMobileSettings(): MobileControlSettings {
  try {
    const rawV2 = localStorage.getItem(MOBILE_SETTINGS_STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<MobileControlSettings>;
      const controlOpacity = clampNumber(
        parsed.controlOpacity ?? DEFAULT_MOBILE_SETTINGS.controlOpacity,
        0.2,
        1.0,
      );
      const visibleButtons: MobileButtonVisibility = {
        ...DEFAULT_MOBILE_SETTINGS.visibleButtons,
        ...(parsed.visibleButtons ?? {}),
      };
      const portrait = sanitizeLayout(
        parsed.layouts?.portrait,
        createDefaultPortraitLayout(controlOpacity),
      );
      const landscape = sanitizeLayout(
        parsed.layouts?.landscape,
        createDefaultLandscapeLayout(controlOpacity),
      );

      return {
        version: 2,
        touchControlsEnabled:
          typeof parsed.touchControlsEnabled === 'boolean'
            ? parsed.touchControlsEnabled
            : null,
        forceMobileControls: Boolean(parsed.forceMobileControls),
        controlSize:
          parsed.controlSize === 'small' ||
          parsed.controlSize === 'medium' ||
          parsed.controlSize === 'large'
            ? parsed.controlSize
            : 'medium',
        joystickSize: clampNumber(parsed.joystickSize ?? 1.0, 0.65, 1.7),
        buttonSize: clampNumber(parsed.buttonSize ?? 1.0, 0.65, 1.7),
        controlOpacity,
        cameraSensitivity: clampNumber(parsed.cameraSensitivity ?? 1.0, 0.4, 2.4),
        invertY: Boolean(parsed.invertY),
        portraitCamera: {
          autoAdapt:
            typeof parsed.portraitCamera?.autoAdapt === 'boolean'
              ? parsed.portraitCamera.autoAdapt
              : DEFAULT_PORTRAIT_CAMERA_SETTINGS.autoAdapt,
          fovBoost: clampNumber(
            parsed.portraitCamera?.fovBoost ?? DEFAULT_PORTRAIT_CAMERA_SETTINGS.fovBoost,
            0,
            22,
          ),
          distanceMultiplier: clampNumber(
            parsed.portraitCamera?.distanceMultiplier ??
              DEFAULT_PORTRAIT_CAMERA_SETTINGS.distanceMultiplier,
            0.9,
            1.45,
          ),
          shoulderOffsetY: clampNumber(
            parsed.portraitCamera?.shoulderOffsetY ??
              DEFAULT_PORTRAIT_CAMERA_SETTINGS.shoulderOffsetY,
            -0.1,
            0.4,
          ),
        },
        visibleButtons,
        layouts: { portrait, landscape },
      };
    }

    // Migrate v1 settings cleanly if present
    const rawV1 = localStorage.getItem(LEGACY_MOBILE_SETTINGS_STORAGE_KEY);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as Partial<MobileControlSettings>;
      const controlOpacity = clampNumber(
        parsed.controlOpacity ?? DEFAULT_MOBILE_SETTINGS.controlOpacity,
        0.2,
        1.0,
      );
      const joyMult = clampNumber(parsed.joystickSize ?? 1.0, 0.7, 1.5);
      const btnMult = clampNumber(parsed.buttonSize ?? 1.0, 0.7, 1.5);
      const portrait = createDefaultPortraitLayout(controlOpacity);
      const landscape = createDefaultLandscapeLayout(controlOpacity);
      portrait.joystick.width = clampControlSize('joystick', 150 * joyMult);
      portrait.joystick.height = portrait.joystick.width;
      landscape.joystick.width = clampControlSize('joystick', 145 * joyMult);
      landscape.joystick.height = landscape.joystick.width;

      const controlSize: MobileControlSizePreset =
        btnMult <= 0.9 ? 'small' : btnMult >= 1.15 ? 'large' : 'medium';

      return {
        ...DEFAULT_MOBILE_SETTINGS,
        touchControlsEnabled: parsed.forceMobileControls ? true : null,
        forceMobileControls: Boolean(parsed.forceMobileControls),
        controlSize,
        joystickSize: joyMult,
        buttonSize: CONTROL_SIZE_MULTIPLIER[controlSize],
        controlOpacity,
        cameraSensitivity: clampNumber(parsed.cameraSensitivity ?? 1.0, 0.4, 2.4),
        invertY: Boolean(parsed.invertY),
        visibleButtons: {
          ...DEFAULT_MOBILE_SETTINGS.visibleButtons,
          ...(parsed.visibleButtons ?? {}),
        },
        layouts: { portrait, landscape },
      };
    }
  } catch {
    // Ignore storage parse issues
  }

  return cloneDefaultMobileSettings();
}

export function cloneDefaultMobileSettings(): MobileControlSettings {
  return {
    ...DEFAULT_MOBILE_SETTINGS,
    portraitCamera: { ...DEFAULT_PORTRAIT_CAMERA_SETTINGS },
    visibleButtons: { ...DEFAULT_MOBILE_SETTINGS.visibleButtons },
    layouts: {
      portrait: createDefaultPortraitLayout(DEFAULT_MOBILE_SETTINGS.controlOpacity),
      landscape: createDefaultLandscapeLayout(DEFAULT_MOBILE_SETTINGS.controlOpacity),
    },
  };
}

export function saveMobileSettings(settings: MobileControlSettings): void {
  try {
    localStorage.setItem(MOBILE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota issues
  }
}

export function resetOrientationControlsToDefaults(
  current: MobileControlSettings,
  targetOrientation: ScreenOrientationMode,
): MobileControlSettings {
  const freshLayout =
    targetOrientation === 'portrait'
      ? createDefaultPortraitLayout(current.controlOpacity)
      : createDefaultLandscapeLayout(current.controlOpacity);

  // Preserve individual button visibility toggles while resetting positions & sizes
  const keys: Array<keyof MobileButtonVisibility> = [
    'jump',
    'attack',
    'interact',
    'inventory',
    'map',
    'pause',
    'quests',
    'camera',
  ];
  for (const key of keys) {
    freshLayout[key] = {
      ...freshLayout[key],
      visible: current.visibleButtons[key],
    };
  }

  return {
    ...current,
    layouts: {
      ...current.layouts,
      [targetOrientation]: freshLayout,
    },
  };
}

export function resetAllControlsToDefaults(
  current: MobileControlSettings,
): MobileControlSettings {
  const def = cloneDefaultMobileSettings();
  return {
    ...def,
    // Keep hardware/touch enablement state while restoring positions, sizes, opacity, visibility
    touchControlsEnabled: current.touchControlsEnabled,
    forceMobileControls: current.forceMobileControls,
    cameraSensitivity: current.cameraSensitivity,
    invertY: current.invertY,
    portraitCamera: { ...current.portraitCamera },
  };
}

export function shouldShowMobileControls(
  settings: MobileControlSettings,
  isTouchHardware: boolean,
): boolean {
  if (settings.touchControlsEnabled !== null) {
    return settings.touchControlsEnabled;
  }
  return isTouchHardware || settings.forceMobileControls;
}

export function syncLayoutVisibilityFromButtons(
  settings: MobileControlSettings,
  visibleButtons: MobileButtonVisibility,
): MobileControlSettings {
  const portrait = { ...settings.layouts.portrait };
  const landscape = { ...settings.layouts.landscape };
  const keys: Array<keyof MobileButtonVisibility> = [
    'jump',
    'attack',
    'interact',
    'inventory',
    'map',
    'pause',
    'quests',
    'camera',
  ];
  for (const key of keys) {
    portrait[key] = { ...portrait[key], visible: visibleButtons[key] };
    landscape[key] = { ...landscape[key], visible: visibleButtons[key] };
  }
  return {
    ...settings,
    visibleButtons: { ...visibleButtons },
    layouts: { portrait, landscape },
  };
}
