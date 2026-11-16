import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Backpack,
  Camera,
  Eye,
  EyeOff,
  Hand,
  Map as MapIcon,
  Pause,
  RotateCcw,
  ScrollText,
  Swords,
} from 'lucide-react';
import type { MobileInputManager } from '../game/input/MobileInputManager';
import {
  ALL_MOBILE_CONTROL_IDS,
  clampControlSize,
  computeControlBox,
  measureSafeAreaRect,
  normalizeControlCenter,
  resetAllControlsToDefaults,
  resetOrientationControlsToDefaults,
  type ResolvedControlBox,
} from '../game/input/MobileLayoutStore';
import { useOrientation } from '../hooks/useOrientation';
import {
  CONTROL_SIZE_LIMITS,
  type CameraPerspective,
  type InteractableInfo,
  type MobileButtonVisibility,
  type MobileControlId,
  type MobileControlSettings,
} from '../game/types';
import {
  UI_TEXT,
  type Language,
  translateInteractableVerb,
} from '../game/i18n/translations';

interface MobileControlsOverlayProps {
  mobileInput: MobileInputManager | null;
  settings: MobileControlSettings;
  grounded: boolean;
  nearbyInteractable: InteractableInfo | null;
  lang: Language;
  customizeMode: boolean;
  equippedWeaponIsRanged?: boolean;
  bowChargeProgress?: number;
  cameraPerspective?: CameraPerspective;
  onUpdateSettings: (next: MobileControlSettings) => void;
  onExitCustomize: () => void;
  onPause: () => void;
  onOpenInventory: () => void;
  onOpenMap: () => void;
  onOpenQuestJournal: () => void;
  onCycleCameraPerspective?: () => void;
}

interface ActiveDragState {
  mode: 'move' | 'resize';
  id: MobileControlId;
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
  startBaseSize: number;
  origCenterX: number;
  origCenterY: number;
  currentLeft: number;
  currentTop: number;
  currentWidth: number;
  currentHeight: number;
  currentBaseSize: number;
  currentNormX: number;
  currentNormY: number;
  el: HTMLElement | null;
}

export const MobileControlsOverlay: React.FC<MobileControlsOverlayProps> = ({
  mobileInput,
  settings,
  grounded,
  nearbyInteractable,
  lang,
  customizeMode,
  equippedWeaponIsRanged = false,
  bowChargeProgress = 0,
  cameraPerspective = 'third-person',
  onUpdateSettings,
  onExitCustomize,
  onPause,
  onOpenInventory,
  onOpenMap,
  onOpenQuestJournal,
  onCycleCameraPerspective,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const { orientation, width: vpWidth, height: vpHeight } = useOrientation();
  const safeRect = useMemo(
    () => measureSafeAreaRect(),
    // Re-measure CSS safe-area insets whenever OrientationManager reports viewport changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vpWidth, vpHeight, orientation],
  );
  const [selectedControl, setSelectedControl] =
    useState<MobileControlId>('joystick');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const joystickZoneRef = useRef<HTMLDivElement | null>(null);
  const joystickThumbRef = useRef<HTMLDivElement | null>(null);
  const controlElementRefs = useRef<
    Partial<Record<MobileControlId, HTMLElement | null>>
  >({});
  const dragStateRef = useRef<ActiveDragState | null>(null);
  const inspectorSizeRef = useRef<HTMLSpanElement | null>(null);
  const inspectorPosRef = useRef<HTMLSpanElement | null>(null);

  const [pressedButtons, setPressedButtons] = useState<Set<string>>(
    () => new Set(),
  );
  const activeButtonPointersRef = useRef<Map<number, string>>(new Map());
  const activeJoystickPointerRef = useRef<number | null>(null);
  const activeCameraPointerRef = useRef<number | null>(null);
  const lastUtilityTapTimeRef = useRef<Record<string, number>>({});

  // Reset pressed visual state & drag state when entering/exiting customization mode
  useEffect(() => {
    setPressedButtons(new Set());
    activeButtonPointersRef.current.clear();
    activeJoystickPointerRef.current = null;
    activeCameraPointerRef.current = null;
    dragStateRef.current = null;
    if (!customizeMode) {
      setConfirmResetOpen(false);
    }
  }, [customizeMode]);

  useEffect(() => {
    if (!mobileInput) return;
    mobileInput.registerThumbElement(joystickThumbRef.current);
    return () => {
      mobileInput.registerThumbElement(null);
    };
  }, [mobileInput, customizeMode]);

  const setButtonPressed = (
    btnId: string,
    pointerId: number,
    down: boolean,
  ) => {
    if (customizeMode) return;
    if (down) {
      activeButtonPointersRef.current.set(pointerId, btnId);
      setPressedButtons((prev) => {
        if (prev.has(btnId)) return prev;
        const next = new Set(prev);
        next.add(btnId);
        return next;
      });
    } else {
      activeButtonPointersRef.current.delete(pointerId);
      setPressedButtons((prev) => {
        if (!prev.has(btnId)) return prev;
        const next = new Set(prev);
        next.delete(btnId);
        return next;
      });
    }
  };

  useEffect(() => {
    if (!mobileInput || customizeMode) return;
    const onWinPointerMove = (e: PointerEvent) => {
      if (activeJoystickPointerRef.current === e.pointerId) {
        mobileInput.moveJoystick(e.pointerId, e.clientX, e.clientY);
      } else if (activeCameraPointerRef.current === e.pointerId) {
        mobileInput.moveCamera(e.pointerId, e.clientX, e.clientY);
      }
    };
    const onWinPointerEnd = (e: PointerEvent) => {
      if (activeJoystickPointerRef.current === e.pointerId) {
        activeJoystickPointerRef.current = null;
        mobileInput.endJoystick(e.pointerId);
      }
      if (activeCameraPointerRef.current === e.pointerId) {
        activeCameraPointerRef.current = null;
        mobileInput.endCamera(e.pointerId);
      }
    };
    window.addEventListener('pointermove', onWinPointerMove);
    window.addEventListener('pointerup', onWinPointerEnd);
    window.addEventListener('pointercancel', onWinPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onWinPointerMove);
      window.removeEventListener('pointerup', onWinPointerEnd);
      window.removeEventListener('pointercancel', onWinPointerEnd);
    };
  }, [mobileInput, customizeMode]);

  const applyDragMoveCoords = (pointerId: number, clientX: number, clientY: number) => {
    const drag = dragStateRef.current;
    if (!customizeMode || !drag || drag.pointerId !== pointerId) return;

    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;

    if (drag.mode === 'move') {
      const maxLeft = Math.max(safeRect.left, safeRect.right - drag.startWidth);
      const maxTop = Math.max(safeRect.top, safeRect.bottom - drag.startHeight);
      const nextLeft = Math.round(
        Math.max(safeRect.left, Math.min(maxLeft, drag.startLeft + dx)),
      );
      const nextTop = Math.round(
        Math.max(safeRect.top, Math.min(maxTop, drag.startTop + dy)),
      );

      drag.currentLeft = nextLeft;
      drag.currentTop = nextTop;

      const nextCenterX = nextLeft + drag.startWidth * 0.5;
      const nextCenterY = nextTop + drag.startHeight * 0.5;
      const norm = normalizeControlCenter(
        nextCenterX,
        nextCenterY,
        drag.startWidth,
        drag.startHeight,
        safeRect,
      );
      drag.currentNormX = norm.x;
      drag.currentNormY = norm.y;

      if (drag.el) {
        drag.el.style.left = `${nextLeft}px`;
        drag.el.style.top = `${nextTop}px`;
      }
      if (inspectorPosRef.current) {
        inspectorPosRef.current.textContent = `${Math.round(norm.x * 100)}%, ${Math.round(norm.y * 100)}%`;
      }
    } else {
      const globalMult =
        drag.id === 'joystick' ? settings.joystickSize : settings.buttonSize;
      const rawDelta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      const nextBase = clampControlSize(
        drag.id,
        drag.startBaseSize + rawDelta / globalMult,
      );
      const baseItem = activeLayout[drag.id];
      const nextBox = computeControlBox(
        drag.id,
        {
          ...baseItem,
          width: nextBase,
          height: nextBase,
        },
        safeRect,
        settings.controlSize,
        settings.joystickSize,
        settings.buttonSize,
      );

      drag.currentBaseSize = nextBase;
      drag.currentLeft = nextBox.left;
      drag.currentTop = nextBox.top;
      drag.currentWidth = nextBox.width;
      drag.currentHeight = nextBox.height;
      drag.currentNormX = nextBox.clampedNormX;
      drag.currentNormY = nextBox.clampedNormY;

      if (drag.el) {
        drag.el.style.left = `${nextBox.left}px`;
        drag.el.style.top = `${nextBox.top}px`;
        drag.el.style.width = `${nextBox.width}px`;
        drag.el.style.height = `${nextBox.height}px`;
      }
      if (inspectorSizeRef.current) {
        inspectorSizeRef.current.textContent = `${nextBox.width}×${nextBox.height}px`;
      }
      if (inspectorPosRef.current) {
        inspectorPosRef.current.textContent = `${Math.round(nextBox.clampedNormX * 100)}%, ${Math.round(nextBox.clampedNormY * 100)}%`;
      }
    }
  };

  const commitDragEnd = (pointerId: number) => {
    const drag = dragStateRef.current;
    if (!customizeMode || !drag || drag.pointerId !== pointerId) return;

    const { id, mode, currentNormX, currentNormY, currentBaseSize } = drag;
    dragStateRef.current = null;

    const currLayout = settings.layouts[orientation];
    const currItem = currLayout[id];
    const limits =
      id === 'joystick'
        ? CONTROL_SIZE_LIMITS.joystick
        : CONTROL_SIZE_LIMITS.button;

    const updatedItem =
      mode === 'move'
        ? {
            ...currItem,
            x: currentNormX,
            y: currentNormY,
          }
        : {
            ...currItem,
            x: currentNormX,
            y: currentNormY,
            width: currentBaseSize,
            height: currentBaseSize,
            scale: Number((currentBaseSize / limits.default).toFixed(3)),
          };

    onUpdateSettings({
      ...settings,
      layouts: {
        ...settings.layouts,
        [orientation]: {
          ...currLayout,
          [id]: updatedItem,
        },
      },
    });
  };

  useEffect(() => {
    if (!customizeMode) return;
    const onWinMove = (e: PointerEvent) => {
      applyDragMoveCoords(e.pointerId, e.clientX, e.clientY);
    };
    const onWinEnd = (e: PointerEvent) => {
      commitDragEnd(e.pointerId);
    };
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinEnd);
    window.addEventListener('pointercancel', onWinEnd);
    return () => {
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerup', onWinEnd);
      window.removeEventListener('pointercancel', onWinEnd);
    };
  });

  const activeLayout = settings.layouts[orientation];

  const resolvedBoxes = useMemo(() => {
    const map = {} as Record<MobileControlId, ResolvedControlBox>;
    for (const id of ALL_MOBILE_CONTROL_IDS) {
      map[id] = computeControlBox(
        id,
        activeLayout[id],
        safeRect,
        settings.controlSize,
        settings.joystickSize,
        settings.buttonSize,
      );
    }
    return map;
  }, [
    activeLayout,
    safeRect,
    settings.controlSize,
    settings.joystickSize,
    settings.buttonSize,
  ]);

  const controlNames: Record<MobileControlId, string> = {
    joystick: t.ctrlJoystick,
    jump: t.ctrlJump,
    attack: t.ctrlAttack,
    interact: t.ctrlInteract,
    inventory: t.ctrlInventory,
    map: t.ctrlMap,
    pause: t.ctrlPause,
    quests: t.ctrlQuests,
    camera: t.ctrlCamera,
  };

  // ==================== GAMEPLAY TOUCH HANDLERS ====================

  const handleJoystickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (customizeMode || !mobileInput || !joystickZoneRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    activeJoystickPointerRef.current = e.pointerId;
    const rect = joystickZoneRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    // Thumb is 40% diameter (radius = 0.20 * width); maxRadius = 0.30 keeps thumb inside circular ring
    const maxRadius = rect.width * 0.3;
    mobileInput.startJoystick(
      e.pointerId,
      e.clientX,
      e.clientY,
      centerX,
      centerY,
      maxRadius,
    );
  };

  const handleJoystickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (customizeMode || !mobileInput) return;
    e.stopPropagation();
    mobileInput.moveJoystick(e.pointerId, e.clientX, e.clientY);
  };

  const handleJoystickPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (customizeMode || !mobileInput) return;
    e.stopPropagation();
    if (activeJoystickPointerRef.current === e.pointerId) {
      activeJoystickPointerRef.current = null;
    }
    mobileInput.endJoystick(e.pointerId);
  };

  const handleCameraPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (customizeMode || !mobileInput) return;
    // Prevent accidental camera snaps if finger lands right on the joystick safety margin
    if (activeLayout.joystick.visible) {
      const jb = resolvedBoxes.joystick;
      const guardRadius = jb.width * 0.5 + 14;
      if (Math.hypot(e.clientX - jb.centerX, e.clientY - jb.centerY) <= guardRadius) {
        return;
      }
    }
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    activeCameraPointerRef.current = e.pointerId;
    mobileInput.startCamera(e.pointerId, e.clientX, e.clientY);
  };

  const handleCameraPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (customizeMode || !mobileInput) return;
    mobileInput.moveCamera(e.pointerId, e.clientX, e.clientY);
  };

  const handleCameraPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (customizeMode || !mobileInput) return;
    if (activeCameraPointerRef.current === e.pointerId) {
      activeCameraPointerRef.current = null;
    }
    mobileInput.endCamera(e.pointerId);
  };

  const makeUtilityTouchProps = (btnId: string, onTrigger: () => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic events
      }
      setButtonPressed(btnId, e.pointerId, true);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const wasActive = activeButtonPointersRef.current.get(e.pointerId) === btnId;
      setButtonPressed(btnId, e.pointerId, false);
      if (wasActive) {
        const rect = e.currentTarget.getBoundingClientRect();
        const pad = 16;
        const inside =
          e.clientX >= rect.left - pad &&
          e.clientX <= rect.right + pad &&
          e.clientY >= rect.top - pad &&
          e.clientY <= rect.bottom + pad;
        if (inside) {
          lastUtilityTapTimeRef.current[btnId] = performance.now();
          onTrigger();
        }
      }
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) =>
      setButtonPressed(btnId, e.pointerId, false),
    onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) =>
      setButtonPressed(btnId, e.pointerId, false),
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const last = lastUtilityTapTimeRef.current[btnId] ?? 0;
      if (performance.now() - last < 450) return;
      onTrigger();
    },
  });

  // ==================== CUSTOMIZATION DRAG & RESIZE HANDLERS ====================

  const startControlMove = (
    id: MobileControlId,
    e: React.PointerEvent<HTMLElement>,
  ) => {
    if (!customizeMode) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedControl(id);
    const el = controlElementRefs.current[id] ?? null;
    const box = resolvedBoxes[id];
    const item = activeLayout[id];
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    dragStateRef.current = {
      mode: 'move',
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: box.left,
      startTop: box.top,
      startWidth: box.width,
      startHeight: box.height,
      startBaseSize: item.width,
      origCenterX: box.centerX,
      origCenterY: box.centerY,
      currentLeft: box.left,
      currentTop: box.top,
      currentWidth: box.width,
      currentHeight: box.height,
      currentBaseSize: item.width,
      currentNormX: box.clampedNormX,
      currentNormY: box.clampedNormY,
      el,
    };
  };

  const startControlResize = (
    id: MobileControlId,
    e: React.PointerEvent<HTMLElement>,
  ) => {
    if (!customizeMode) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedControl(id);
    const el = controlElementRefs.current[id] ?? null;
    const box = resolvedBoxes[id];
    const item = activeLayout[id];
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    dragStateRef.current = {
      mode: 'resize',
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: box.left,
      startTop: box.top,
      startWidth: box.width,
      startHeight: box.height,
      startBaseSize: item.width,
      origCenterX: box.centerX,
      origCenterY: box.centerY,
      currentLeft: box.left,
      currentTop: box.top,
      currentWidth: box.width,
      currentHeight: box.height,
      currentBaseSize: item.width,
      currentNormX: box.clampedNormX,
      currentNormY: box.clampedNormY,
      el,
    };
  };

  const handleControlDragMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!customizeMode || !drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    applyDragMoveCoords(e.pointerId, e.clientX, e.clientY);
  };

  const handleControlDragEnd = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!customizeMode || !drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    commitDragEnd(e.pointerId);
  };

  const toggleSelectedVisibility = () => {
    if (selectedControl === 'joystick') return;
    const key = selectedControl as keyof MobileButtonVisibility;
    const nextVisible = !activeLayout[selectedControl].visible;
    const nextLayout = {
      ...activeLayout,
      [selectedControl]: {
        ...activeLayout[selectedControl],
        visible: nextVisible,
      },
    };
    const nextVisibleButtons: MobileButtonVisibility = {
      ...settings.visibleButtons,
      [key]: nextVisible,
    };
    onUpdateSettings({
      ...settings,
      visibleButtons: nextVisibleButtons,
      layouts: {
        ...settings.layouts,
        [orientation]: nextLayout,
      },
    });
  };

  const handleConfirmResetOrientation = (
    target: 'portrait' | 'landscape' | 'all',
  ) => {
    const reset =
      target === 'all'
        ? resetAllControlsToDefaults(settings)
        : resetOrientationControlsToDefaults(settings, target);
    onUpdateSettings(reset);
    setConfirmResetOpen(false);
  };

  const isVisibleInGameplay = (id: MobileControlId): boolean => {
    const itemVisible = activeLayout[id].visible;
    if (id === 'joystick') return itemVisible;
    if (id === 'interact') {
      return (
        itemVisible &&
        settings.visibleButtons.interact &&
        nearbyInteractable !== null
      );
    }
    return itemVisible && settings.visibleButtons[id as keyof MobileButtonVisibility];
  };

  const interactVerb = nearbyInteractable
    ? translateInteractableVerb(nearbyInteractable.actionVerb, lang)
    : '';

  const selectedBox = resolvedBoxes[selectedControl];
  const selectedItem = activeLayout[selectedControl];

  const getCustomOutlineStyle = (
    id: MobileControlId,
    isVisible: boolean,
  ): string => {
    if (!customizeMode) return '';
    const isSelected = selectedControl === id;
    const opacityClass = isVisible ? '' : 'opacity-45';
    return `${opacityClass} cursor-grab active:cursor-grabbing ${
      isSelected
        ? 'ring-2 ring-[#e5a93c] ring-offset-1 ring-offset-[#09110d] border-dashed border-[#e5a93c]'
        : 'border-dashed border-white/60'
    }`;
  };

  const renderResizeHandle = (id: MobileControlId) => {
    if (!customizeMode || selectedControl !== id) return null;
    return (
      <div
        data-testid="customize-resize-handle"
        onPointerDown={(e) => startControlResize(id, e)}
        onPointerMove={handleControlDragMove}
        onPointerUp={handleControlDragEnd}
        onPointerCancel={handleControlDragEnd}
        onLostPointerCapture={handleControlDragEnd}
        className="absolute -bottom-2 -right-2 z-30 w-7 h-7 rounded-full bg-[#e5a93c] text-[#111914] border-2 border-[#0d1712] shadow-lg flex items-center justify-center text-xs font-bold cursor-nwse-resize touch-action-none select-none"
        title="Resize"
      >
        ◢
      </div>
    );
  };

  const controlOpacityFor = (id: MobileControlId): number => {
    const base = activeLayout[id]?.opacity ?? settings.controlOpacity;
    if (!customizeMode) return base;
    return isVisibleInGameplay(id) || activeLayout[id].visible
      ? Math.max(0.45, base)
      : 0.35;
  };

  const commonDragProps = (id: MobileControlId) =>
    customizeMode
      ? {
          onPointerDown: (e: React.PointerEvent<HTMLElement>) =>
            startControlMove(id, e),
          onPointerMove: handleControlDragMove,
          onPointerUp: handleControlDragEnd,
          onPointerCancel: handleControlDragEnd,
          onLostPointerCapture: handleControlDragEnd,
        }
      : {};

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-30 pointer-events-none touch-action-none overflow-hidden"
      data-testid="mobile-controls-overlay"
      data-orientation={orientation}
      data-customize-mode={customizeMode ? 'true' : 'false'}
    >
      {/* Gameplay Camera Touch Drag Surface (strictly disabled in customization mode) */}
      {!customizeMode && (
        <div
          data-testid="mobile-camera-zone"
          className="pointer-events-auto fixed inset-0 z-0 touch-action-none"
          onPointerDown={handleCameraPointerDown}
          onPointerMove={handleCameraPointerMove}
          onPointerUp={handleCameraPointerEnd}
          onPointerCancel={handleCameraPointerEnd}
          onLostPointerCapture={handleCameraPointerEnd}
        />
      )}

      {/* Visual Editing Safe-Area Boundary (Customization Mode Only) */}
      {customizeMode && (
        <div
          data-testid="customize-safe-boundary"
          className="fixed pointer-events-none z-5 rounded-2xl border-2 border-dashed border-[#7fe094]/50 bg-[#07100c]/20"
          style={{
            left: safeRect.left,
            top: safeRect.top,
            width: safeRect.width,
            height: safeRect.height,
          }}
        />
      )}

      {/* Top Banner + Inspector Strip during Customization Mode */}
      {customizeMode && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          data-testid="customize-banner"
          className="pointer-events-auto fixed left-1/2 -translate-x-1/2 z-40 rounded-2xl bg-[#0d1712]/94 border border-[#e5a93c]/55 px-3 py-2 shadow-2xl text-[#f1f5ee]"
          style={{
            width: Math.min(420, Math.max(260, safeRect.width - 16)),
            top:
              orientation === 'portrait'
                ? Math.max(
                    safeRect.top + 8,
                    Math.round(safeRect.top + safeRect.height * 0.2),
                  )
                : Math.max(
                    safeRect.top + 48,
                    Math.round(safeRect.top + safeRect.height * 0.14),
                  ),
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display text-sm sm:text-base font-bold text-[#f5f8f2] truncate">
                  {t.customizeControls}
                </h2>
                <span className="px-1.5 py-0.5 rounded bg-[#1a2c22] border border-[#324f3f] text-[10px] font-semibold text-[#e5a93c] shrink-0">
                  {orientation === 'portrait'
                    ? t.portraitModeLabel
                    : t.landscapeModeLabel}
                </span>
              </div>
              <p className="text-[10px] text-[#9cb0a0] truncate">
                {t.customizeBannerHint}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="customize-reset-btn"
                onClick={() => setConfirmResetOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#192a21] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.customizeReset}</span>
              </button>
              <button
                type="button"
                data-testid="customize-done-btn"
                onClick={() => {
                  onExitCustomize();
                }}
                className="px-3 py-1.5 rounded-lg bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs cursor-pointer"
              >
                {t.customizeDone}
              </button>
            </div>
          </div>

          {/* Selected Control Inspector Strip */}
          <div
            data-testid="customize-inspector"
            className="mt-2 pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-semibold text-[#e5a93c] truncate">
                {t.selectedControlLabel}: {controlNames[selectedControl]}
              </span>
              <span
                ref={inspectorSizeRef}
                dir="ltr"
                className="font-mono-num text-[#dce5d8]"
              >
                {selectedBox.width}×{selectedBox.height}px
              </span>
              <span
                ref={inspectorPosRef}
                dir="ltr"
                className="font-mono-num text-[#9cb0a0]"
              >
                {Math.round(selectedBox.clampedNormX * 100)}%,{' '}
                {Math.round(selectedBox.clampedNormY * 100)}%
              </span>
            </div>

            {selectedControl !== 'joystick' && (
              <button
                type="button"
                data-testid="customize-toggle-visibility-btn"
                onClick={toggleSelectedVisibility}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#16261d] hover:bg-[#20362a] border border-[#2d4839] text-[10px] font-medium text-[#e4ece1] cursor-pointer"
              >
                {selectedItem.visible ? (
                  <>
                    <Eye className="w-3 h-3 text-[#7fe094]" />
                    <span>{t.showControlBtn}</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3 h-3 text-[#e08c7a]" />
                    <span>{t.hiddenTag}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1. VIRTUAL JOYSTICK */}
      {(customizeMode || isVisibleInGameplay('joystick')) && (
        <div
          ref={(el) => {
            joystickZoneRef.current = el;
            controlElementRefs.current.joystick = el;
          }}
          data-testid="mobile-virtual-joystick"
          data-control-id="joystick"
          {...(customizeMode
            ? commonDragProps('joystick')
            : {
                onPointerDown: handleJoystickPointerDown,
                onPointerMove: handleJoystickPointerMove,
                onPointerUp: handleJoystickPointerEnd,
                onPointerCancel: handleJoystickPointerEnd,
                onLostPointerCapture: handleJoystickPointerEnd,
              })}
          style={{
            left: resolvedBoxes.joystick.left,
            top: resolvedBoxes.joystick.top,
            width: resolvedBoxes.joystick.width,
            height: resolvedBoxes.joystick.height,
            opacity: controlOpacityFor('joystick'),
          }}
          className={`pointer-events-auto fixed z-10 rounded-full bg-[#0d1712]/58 border-2 border-white/25 flex items-center justify-center touch-action-none ${getCustomOutlineStyle(
            'joystick',
            activeLayout.joystick.visible,
          )}`}
          aria-label={t.controlsMove}
        >
          <div className="w-[62%] h-[62%] rounded-full border border-dashed border-white/20 pointer-events-none relative flex items-center justify-center">
            <span className="absolute top-1 w-1 h-2 rounded-full bg-white/30" />
            <span className="absolute bottom-1 w-1 h-2 rounded-full bg-white/30" />
            <span className="absolute left-1 w-2 h-1 rounded-full bg-white/30" />
            <span className="absolute right-1 w-2 h-1 rounded-full bg-white/30" />
          </div>

          <div
            ref={joystickThumbRef}
            data-testid="mobile-joystick-thumb"
            data-sprinting="false"
            className="absolute w-[40%] h-[40%] rounded-full bg-[#eef4eb]/90 border-2 border-[#0d1712]/60 shadow-md pointer-events-none will-change-transform transition-colors duration-100 data-[sprinting=true]:bg-[#ffe6a6] data-[sprinting=true]:ring-2 data-[sprinting=true]:ring-[#e5a93c]"
          />

          {renderResizeHandle('joystick')}
        </div>
      )}

      {/* 2. JUMP BUTTON */}
      {(customizeMode || isVisibleInGameplay('jump')) && (
        <div
          ref={(el) => {
            controlElementRefs.current.jump = el;
          }}
          data-control-id="jump"
          style={{
            left: resolvedBoxes.jump.left,
            top: resolvedBoxes.jump.top,
            width: resolvedBoxes.jump.width,
            height: resolvedBoxes.jump.height,
            opacity: controlOpacityFor('jump'),
          }}
          className="pointer-events-none fixed z-10"
        >
          <button
            type="button"
            data-testid="mobile-btn-jump"
            {...(customizeMode
              ? commonDragProps('jump')
              : {
                  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    e.preventDefault();
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // Ignore synthetic events
                    }
                    setButtonPressed('jump', e.pointerId, true);
                    if (grounded) {
                      mobileInput?.triggerJump();
                    }
                  },
                  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    setButtonPressed('jump', e.pointerId, false);
                  },
                  onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) =>
                    setButtonPressed('jump', e.pointerId, false),
                  onLostPointerCapture: (
                    e: React.PointerEvent<HTMLButtonElement>,
                  ) => setButtonPressed('jump', e.pointerId, false),
                })}
            className={`pointer-events-auto w-full h-full rounded-full border-2 flex flex-col items-center justify-center shadow-lg transition-transform duration-100 touch-action-none cursor-pointer ${
              customizeMode || grounded
                ? 'bg-[#2c6e58]/90 border-[#a5dfba]/55 text-[#f3faf5]'
                : 'bg-[#192b22]/65 border-white/20 text-white/50'
            } ${pressedButtons.has('jump') ? 'scale-90' : ''} ${getCustomOutlineStyle(
              'jump',
              activeLayout.jump.visible && settings.visibleButtons.jump,
            )}`}
            aria-label={t.controlsJump}
          >
            <ArrowUp className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] pointer-events-none" />
            <span className="text-[10px] font-semibold mt-0.5 leading-none pointer-events-none">
              {t.mobJump}
            </span>
          </button>
          {renderResizeHandle('jump')}
        </div>
      )}

      {/* 3. ATTACK BUTTON */}
      {(customizeMode || isVisibleInGameplay('attack')) && (
        <div
          ref={(el) => {
            controlElementRefs.current.attack = el;
          }}
          data-control-id="attack"
          style={{
            left: resolvedBoxes.attack.left,
            top: resolvedBoxes.attack.top,
            width: resolvedBoxes.attack.width,
            height: resolvedBoxes.attack.height,
            opacity: controlOpacityFor('attack'),
          }}
          className="pointer-events-none fixed z-10"
        >
          <button
            type="button"
            data-testid="mobile-btn-attack"
            {...(customizeMode
              ? commonDragProps('attack')
              : {
                  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    e.preventDefault();
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // Ignore synthetic events
                    }
                    setButtonPressed('attack', e.pointerId, true);
                    mobileInput?.startAttackHold(e.pointerId);
                  },
                  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    setButtonPressed('attack', e.pointerId, false);
                    mobileInput?.endAttackHold(e.pointerId);
                  },
                  onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
                    setButtonPressed('attack', e.pointerId, false);
                    mobileInput?.cancelAttackHold(e.pointerId);
                  },
                  onLostPointerCapture: (
                    e: React.PointerEvent<HTMLButtonElement>,
                  ) => {
                    setButtonPressed('attack', e.pointerId, false);
                    mobileInput?.cancelAttackHold(e.pointerId);
                  },
                })}
            className={`relative pointer-events-auto w-full h-full rounded-full border-2 text-[#fdf4f2] flex flex-col items-center justify-center shadow-lg transition-transform duration-100 touch-action-none cursor-pointer ${
              equippedWeaponIsRanged && bowChargeProgress > 0
                ? bowChargeProgress >= 0.995
                  ? 'bg-[#b37b24]/92 border-[#ffe28a]'
                  : 'bg-[#2a6e4c]/92 border-[#88ebb1]'
                : 'bg-[#9e3c32]/88 border-[#f2a89f]/45'
            } ${pressedButtons.has('attack') ? 'scale-90 brightness-110' : ''} ${getCustomOutlineStyle(
              'attack',
              activeLayout.attack.visible && settings.visibleButtons.attack,
            )}`}
            aria-label={t.controlsAttack}
          >
            {equippedWeaponIsRanged && bowChargeProgress > 0 && (
              <svg
                className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                viewBox="0 0 40 40"
              >
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  fill="none"
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="2.5"
                />
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  fill="none"
                  stroke={bowChargeProgress >= 0.995 ? '#ffe28a' : '#88ebb1'}
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeDasharray={106.81}
                  strokeDashoffset={
                    106.81 * (1 - Math.max(0, Math.min(1, bowChargeProgress)))
                  }
                />
              </svg>
            )}
            <Swords className="w-5 h-5 pointer-events-none" />
            <span className="text-[10px] font-semibold mt-0.5 leading-none pointer-events-none">
              {equippedWeaponIsRanged && bowChargeProgress > 0
                ? `${Math.round(bowChargeProgress * 100)}%`
                : equippedWeaponIsRanged
                  ? t.mobShoot
                  : t.mobHit}
            </span>
          </button>
          {renderResizeHandle('attack')}
        </div>
      )}

      {/* 4. CONTEXTUAL INTERACT BUTTON */}
      {(customizeMode || isVisibleInGameplay('interact')) && (
        <div
          ref={(el) => {
            controlElementRefs.current.interact = el;
          }}
          data-control-id="interact"
          style={{
            left: resolvedBoxes.interact.left,
            top: resolvedBoxes.interact.top,
            width: resolvedBoxes.interact.width,
            height: resolvedBoxes.interact.height,
            opacity: controlOpacityFor('interact'),
          }}
          className="pointer-events-none fixed z-10"
        >
          <button
            type="button"
            data-testid="mobile-btn-interact"
            {...(customizeMode
              ? commonDragProps('interact')
              : {
                  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    e.preventDefault();
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // Ignore synthetic events
                    }
                    setButtonPressed('interact', e.pointerId, true);
                    mobileInput?.triggerInteract();
                  },
                  onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    setButtonPressed('interact', e.pointerId, false);
                  },
                  onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) =>
                    setButtonPressed('interact', e.pointerId, false),
                  onLostPointerCapture: (
                    e: React.PointerEvent<HTMLButtonElement>,
                  ) => setButtonPressed('interact', e.pointerId, false),
                })}
            className={`pointer-events-auto w-full h-full rounded-full bg-[#e5a93c] border-2 border-[#fff2cf]/60 text-[#111914] font-display font-bold flex flex-col items-center justify-center shadow-lg transition-transform duration-100 touch-action-none cursor-pointer relative ${
              pressedButtons.has('interact') ? 'scale-90 brightness-95' : ''
            } ${getCustomOutlineStyle(
              'interact',
              activeLayout.interact.visible && settings.visibleButtons.interact,
            )}`}
            aria-label={
              nearbyInteractable
                ? `${interactVerb} ${nearbyInteractable.label}`
                : t.ctrlInteract
            }
          >
            <Hand className="w-5 h-5 shrink-0 pointer-events-none" />
            <span className="text-[10px] font-bold leading-none mt-0.5 pointer-events-none">
              {customizeMode ? t.ctrlInteract : interactVerb || t.ctrlInteract}
            </span>
            {!customizeMode && nearbyInteractable && (
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#0d1712]/90 border border-[#e5a93c]/55 text-[10px] font-medium text-[#f5f8f2] whitespace-nowrap pointer-events-none shadow">
                {nearbyInteractable.label}
              </span>
            )}
          </button>
          {renderResizeHandle('interact')}
        </div>
      )}

      {/* 5. QUESTS UTILITY BUTTON */}
      {(customizeMode || isVisibleInGameplay('quests')) && (
        <div
          ref={(el) => {
            controlElementRefs.current.quests = el;
          }}
          data-control-id="quests"
          style={{
            left: resolvedBoxes.quests.left,
            top: resolvedBoxes.quests.top,
            width: resolvedBoxes.quests.width,
            height: resolvedBoxes.quests.height,
            opacity: controlOpacityFor('quests'),
          }}
          className="pointer-events-none fixed z-10"
        >
          <button
            type="button"
            data-testid="mobile-btn-quests"
            {...(customizeMode
              ? commonDragProps('quests')
              : makeUtilityTouchProps('quests', onOpenQuestJournal))}
            className={`pointer-events-auto w-full h-full rounded-xl bg-[#0d1712]/85 border border-white/18 text-[#eef3eb] flex items-center justify-center transition-transform duration-100 cursor-pointer ${
              pressedButtons.has('quests') ? 'scale-90 bg-[#1a2c22]' : ''
            } ${getCustomOutlineStyle(
              'quests',
              activeLayout.quests.visible && settings.visibleButtons.quests,
            )}`}
            aria-label={t.questJournal}
          >
            <ScrollText className="w-4 h-4 pointer-events-none" />
          </button>
          {renderResizeHandle('quests')}
        </div>
      )}

      {/* 6. INVENTORY UTILITY BUTTON */}
      {(customizeMode || isVisibleInGameplay('inventory')) && (
        <div
          ref={(el) => {
            controlElementRefs.current.inventory = el;
          }}
          data-control-id="inventory"
          style={{
            left: resolvedBoxes.inventory.left,
            top: resolvedBoxes.inventory.top,
            width: resolvedBoxes.inventory.width,
            height: resolvedBoxes.inventory.height,
            opacity: controlOpacityFor('inventory'),
          }}
          className="pointer-events-none fixed z-10"
        >
          <button
            type="button"
            data-testid="mobile-btn-inventory"
            {...(customizeMode
              ? commonDragProps('inventory')
              : makeUtilityTouchProps('inventory', onOpenInventory))}
            className={`pointer-events-auto w-full h-full rounded-xl bg-[#0d1712]/85 border border-white/18 text-[#eef3eb] flex items-center justify-center transition-transform duration-100 cursor-pointer ${
              pressedButtons.has('inventory') ? 'scale-90 bg-[#1a2c22]' : ''
            } ${getCustomOutlineStyle(
              'inventory',
              activeLayout.inventory.visible &&
                settings.visibleButtons.inventory,
            )}`}
            aria-label={t.explorerPack}
          >
            <Backpack className="w-4 h-4 pointer-events-none" />
          </button>
          {renderResizeHandle('inventory')}
        </div>
      )}

      {/* 7. MAP UTILITY BUTTON */}
      {(customizeMode || isVisibleInGameplay('map')) && (
        <div
          ref={(el) => {
            controlElementRefs.current.map = el;
          }}
          data-control-id="map"
          style={{
            left: resolvedBoxes.map.left,
            top: resolvedBoxes.map.top,
            width: resolvedBoxes.map.width,
            height: resolvedBoxes.map.height,
            opacity: controlOpacityFor('map'),
          }}
          className="pointer-events-none fixed z-10"
        >
          <button
            type="button"
            data-testid="mobile-btn-map"
            {...(customizeMode
              ? commonDragProps('map')
              : makeUtilityTouchProps('map', onOpenMap))}
            className={`pointer-events-auto w-full h-full rounded-xl bg-[#0d1712]/85 border border-white/18 text-[#eef3eb] flex items-center justify-center transition-transform duration-100 cursor-pointer ${
              pressedButtons.has('map') ? 'scale-90 bg-[#1a2c22]' : ''
            } ${getCustomOutlineStyle(
              'map',
              activeLayout.map.visible && settings.visibleButtons.map,
            )}`}
            aria-label={t.worldMap}
          >
            <MapIcon className="w-4 h-4 pointer-events-none" />
          </button>
          {renderResizeHandle('map')}
        </div>
      )}

      {/* 8. PAUSE UTILITY BUTTON */}
      {(customizeMode || isVisibleInGameplay('pause')) && (
        <div
          ref={(el) => {
            controlElementRefs.current.pause = el;
          }}
          data-control-id="pause"
          style={{
            left: resolvedBoxes.pause.left,
            top: resolvedBoxes.pause.top,
            width: resolvedBoxes.pause.width,
            height: resolvedBoxes.pause.height,
            opacity: controlOpacityFor('pause'),
          }}
          className="pointer-events-none fixed z-10"
        >
          <button
            type="button"
            data-testid="mobile-btn-pause"
            {...(customizeMode
              ? commonDragProps('pause')
              : makeUtilityTouchProps('pause', onPause))}
            className={`pointer-events-auto w-full h-full rounded-xl bg-[#0d1712]/85 border border-white/18 text-[#eef3eb] flex items-center justify-center transition-transform duration-100 cursor-pointer ${
              pressedButtons.has('pause') ? 'scale-90 bg-[#1a2c22]' : ''
            } ${getCustomOutlineStyle(
              'pause',
              activeLayout.pause.visible && settings.visibleButtons.pause,
            )}`}
            aria-label={t.controlsPause}
          >
            <Pause className="w-4 h-4 pointer-events-none" />
          </button>
          {renderResizeHandle('pause')}
        </div>
      )}

      {/* 9. CAMERA PERSPECTIVE UTILITY BUTTON */}
      {(customizeMode || isVisibleInGameplay('camera')) && (
        <div
          ref={(el) => {
            controlElementRefs.current.camera = el;
          }}
          data-control-id="camera"
          style={{
            left: resolvedBoxes.camera.left,
            top: resolvedBoxes.camera.top,
            width: resolvedBoxes.camera.width,
            height: resolvedBoxes.camera.height,
            opacity: controlOpacityFor('camera'),
          }}
          className="pointer-events-none fixed z-10"
        >
          <button
            type="button"
            data-testid="mobile-btn-camera"
            {...(customizeMode
              ? commonDragProps('camera')
              : makeUtilityTouchProps('camera', () =>
                  onCycleCameraPerspective?.(),
                ))}
            className={`pointer-events-auto w-full h-full rounded-xl bg-[#0d1712]/85 border border-white/18 text-[#eef3eb] flex flex-col items-center justify-center gap-0.5 transition-transform duration-100 cursor-pointer ${
              pressedButtons.has('camera') ? 'scale-90 bg-[#1a2c22]' : ''
            } ${getCustomOutlineStyle(
              'camera',
              activeLayout.camera.visible && settings.visibleButtons.camera,
            )}`}
            aria-label={t.btnCameraLabel}
          >
            <Camera className="w-3.5 h-3.5 text-[#e5a93c] pointer-events-none" />
            <span className="font-mono-num text-[9px] font-bold leading-none pointer-events-none">
              {cameraPerspective === 'first-person'
                ? t.perspectiveShort1p
                : cameraPerspective === 'second-person'
                  ? t.perspectiveShort2p
                  : t.perspectiveShort3p}
            </span>
          </button>
          {renderResizeHandle('camera')}
        </div>
      )}

      {/* Reset Confirmation Dialog inside Customization Mode */}
      {customizeMode && confirmResetOpen && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          data-testid="reset-confirm-dialog"
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#09110d]/78 p-4 mobile-hud-safe"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xs rounded-2xl bg-[#101c16] border border-[#2f493b] p-5 text-[#f1f5ee] shadow-2xl">
            <p className="text-sm font-medium text-[#f5f8f2] mb-3.5">
              {t.resetConfirmTitle}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                data-testid="confirm-reset-portrait"
                onClick={() => handleConfirmResetOrientation('portrait')}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#1d3327] hover:bg-[#274434] border border-[#3a614b] text-xs font-bold text-[#f4f7f2] cursor-pointer"
              >
                {t.resetPortraitControls}
              </button>
              <button
                type="button"
                data-testid="confirm-reset-landscape"
                onClick={() => handleConfirmResetOrientation('landscape')}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#1d3327] hover:bg-[#274434] border border-[#3a614b] text-xs font-bold text-[#f4f7f2] cursor-pointer"
              >
                {t.resetLandscapeControls}
              </button>
              <button
                type="button"
                data-testid="confirm-reset-confirm"
                onClick={() => handleConfirmResetOrientation('all')}
                className="w-full px-3.5 py-2 rounded-lg bg-[#c24d40] hover:bg-[#d65b4d] text-xs font-bold text-[#ffffff] cursor-pointer"
              >
                {t.resetAllControls}
              </button>
              <button
                type="button"
                data-testid="confirm-reset-cancel"
                onClick={() => setConfirmResetOpen(false)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#192a21] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] cursor-pointer"
              >
                {t.resetConfirmCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
