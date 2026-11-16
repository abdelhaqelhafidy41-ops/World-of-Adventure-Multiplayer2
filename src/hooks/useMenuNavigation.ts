import { useEffect, useRef, useState } from 'react';

interface UseMenuNavigationOptions {
  enabled: boolean;
  itemCount: number;
  initialIndex?: number;
  orientation?: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
  onActivate?: (index: number) => void;
  onBack?: () => void;
}

function isEditableElementFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName;
  if (tag === 'INPUT') {
    const inputType = (active as HTMLInputElement).type;
    // Allow navigation keys if a button-like input isn't text/range,
    // but never hijack typing or range slider adjustments.
    return inputType !== 'button' && inputType !== 'submit';
  }
  return tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable;
}

/**
 * Provides unified keyboard (Arrow keys / Enter / Escape) and HTML5 Gamepad
 * (D-Pad / Left Stick / A select / B back) navigation across menus & modals.
 */
export function useMenuNavigation({
  enabled,
  itemCount,
  initialIndex = 0,
  orientation = 'vertical',
  columns = 1,
  onActivate,
  onBack,
}: UseMenuNavigationOptions) {
  const [focusedIndex, setFocusedIndex] = useState<number>(initialIndex);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const onActivateRef = useRef(onActivate);
  const onBackRef = useRef(onBack);

  onActivateRef.current = onActivate;
  onBackRef.current = onBack;

  useEffect(() => {
    setFocusedIndex((prev) => {
      if (itemCount <= 0) return 0;
      return Math.max(0, Math.min(itemCount - 1, prev));
    });
  }, [itemCount]);

  useEffect(() => {
    if (!enabled || itemCount <= 0) return;

    const moveFocus = (delta: number) => {
      setFocusedIndex((prev) => {
        const next = (prev + delta + itemCount) % itemCount;
        const target = itemRefs.current[next];
        if (target && typeof target.focus === 'function') {
          target.focus({ preventScroll: true });
        }
        return next;
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onBackRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onBackRef.current();
        }
        return;
      }

      if (isEditableElementFocused()) return;

      if (orientation === 'vertical') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveFocus(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveFocus(-1);
          return;
        }
      } else if (orientation === 'horizontal') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveFocus(1);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveFocus(-1);
          return;
        }
      } else {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          moveFocus(1);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          moveFocus(-1);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveFocus(columns);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveFocus(-columns);
          return;
        }
      }

      if (e.key === 'Enter') {
        const active = document.activeElement as HTMLElement | null;
        // Let native focused buttons trigger their own click unless no menu item is focused
        const activeIdx = active ? itemRefs.current.indexOf(active) : -1;
        if (activeIdx >= 0) {
          return;
        }
        if (!active || active === document.body) {
          e.preventDefault();
          const target = itemRefs.current[focusedIndex];
          if (onActivateRef.current) {
            onActivateRef.current(focusedIndex);
          } else if (target) {
            target.click();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, itemCount, orientation, columns, focusedIndex]);

  // Lightweight HTML5 Gamepad menu polling (only active while menu is open)
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) {
      return;
    }

    let rafId = 0;
    let lastMoveTime = 0;
    let prevA = false;
    let prevB = false;

    const poll = (now: number) => {
      const pads = navigator.getGamepads();
      const pad = pads.find((p) => p && p.connected);

      if (pad) {
        const dUp = Boolean(pad.buttons[12]?.pressed);
        const dDown = Boolean(pad.buttons[13]?.pressed);
        const dLeft = Boolean(pad.buttons[14]?.pressed);
        const dRight = Boolean(pad.buttons[15]?.pressed);
        const axY = pad.axes[1] ?? 0;
        const axX = pad.axes[0] ?? 0;

        const moveNext =
          dDown || axY > 0.55 || (orientation !== 'vertical' && (dRight || axX > 0.55));
        const movePrev =
          dUp || axY < -0.55 || (orientation !== 'vertical' && (dLeft || axX < -0.55));

        if ((moveNext || movePrev) && itemCount > 0 && now - lastMoveTime > 190) {
          lastMoveTime = now;
          const delta = moveNext ? 1 : -1;
          setFocusedIndex((prev) => {
            const next = (prev + delta + itemCount) % itemCount;
            const target = itemRefs.current[next];
            if (target && typeof target.focus === 'function') {
              target.focus({ preventScroll: true });
            }
            return next;
          });
        }

        const aPressed = Boolean(pad.buttons[0]?.pressed);
        if (aPressed && !prevA) {
          const target = itemRefs.current[focusedIndex];
          if (onActivateRef.current) {
            onActivateRef.current(focusedIndex);
          } else if (target) {
            target.click();
          }
        }
        prevA = aPressed;

        const bPressed = Boolean(pad.buttons[1]?.pressed);
        if (bPressed && !prevB && onBackRef.current) {
          onBackRef.current();
        }
        prevB = bPressed;
      }

      rafId = requestAnimationFrame(poll);
    };

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, itemCount, orientation, focusedIndex]);

  const registerItem = (index: number) => (el: HTMLElement | null) => {
    itemRefs.current[index] = el;
  };

  return {
    focusedIndex,
    setFocusedIndex,
    registerItem,
  };
}

/**
 * Listens for Gamepad Start button (button 9) during gameplay/pause to toggle pause.
 */
export function useGamepadPauseButton(
  enabled: boolean,
  onTogglePause: () => void,
) {
  const cbRef = useRef(onTogglePause);
  cbRef.current = onTogglePause;

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) {
      return;
    }
    let rafId = 0;
    let prevStart = false;

    const poll = () => {
      const pads = navigator.getGamepads();
      const pad = pads.find((p) => p && p.connected);
      const startPressed = Boolean(pad?.buttons[9]?.pressed);
      if (startPressed && !prevStart) {
        cbRef.current();
      }
      prevStart = startPressed;
      rafId = requestAnimationFrame(poll);
    };

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);
}
