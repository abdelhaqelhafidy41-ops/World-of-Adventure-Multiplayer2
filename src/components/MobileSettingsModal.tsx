import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  Save,
} from 'lucide-react';
import {
  ALL_MOBILE_CONTROL_IDS,
  resetAllControlsToDefaults,
  resetOrientationControlsToDefaults,
  shouldShowMobileControls,
  syncLayoutVisibilityFromButtons,
} from '../game/input/MobileLayoutStore';
import { useOrientation } from '../hooks/useOrientation';
import {
  CONTROL_SIZE_MULTIPLIER,
  type MobileButtonVisibility,
  type MobileControlSettings,
  type MobileControlSizePreset,
  type MobileOrientationLayout,
} from '../game/types';
import { UI_TEXT, type Language } from '../game/i18n/translations';

interface MobileSettingsModalProps {
  settings: MobileControlSettings;
  isTouchHardware: boolean;
  lang: Language;
  onChange: (next: MobileControlSettings) => void;
  onOpenCustomize: () => void;
  onSaveAndClose: () => void;
  onClose: () => void;
}

export const MobileSettingsModal: React.FC<MobileSettingsModalProps> = ({
  settings,
  isTouchHardware,
  lang,
  onChange,
  onOpenCustomize,
  onSaveAndClose,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const { orientation } = useOrientation();
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false,
  );

  const canFullscreen =
    typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const touchActive = shouldShowMobileControls(settings, isTouchHardware);

  const setTouchEnabled = (enabled: boolean) => {
    onChange({
      ...settings,
      touchControlsEnabled: enabled,
      forceMobileControls: enabled && !isTouchHardware ? true : false,
    });
  };

  const setControlSizePreset = (preset: MobileControlSizePreset) => {
    const mult = CONTROL_SIZE_MULTIPLIER[preset];
    onChange({
      ...settings,
      controlSize: preset,
      joystickSize: mult,
      buttonSize: mult,
    });
  };

  const setControlOpacity = (opacity: number) => {
    const applyOpacity = (layout: MobileOrientationLayout) => {
      const next = { ...layout };
      for (const id of ALL_MOBILE_CONTROL_IDS) {
        next[id] = {
          ...next[id],
          opacity: id === 'interact' ? Math.max(opacity, 0.9) : opacity,
        };
      }
      return next;
    };

    onChange({
      ...settings,
      controlOpacity: opacity,
      layouts: {
        portrait: applyOpacity(settings.layouts.portrait),
        landscape: applyOpacity(settings.layouts.landscape),
      },
    });
  };

  const toggleButton = (key: keyof MobileButtonVisibility) => {
    onChange(
      syncLayoutVisibilityFromButtons(settings, {
        ...settings.visibleButtons,
        [key]: !settings.visibleButtons[key],
      }),
    );
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // Ignore fullscreen denial in restricted iframes
    }
  };

  const buttonLabels: Array<{
    key: keyof MobileButtonVisibility;
    label: string;
  }> = [
    { key: 'jump', label: t.btnJumpLabel },
    { key: 'attack', label: t.btnAttackLabel },
    { key: 'interact', label: t.btnInteractLabel },
    { key: 'inventory', label: t.btnInventoryLabel },
    { key: 'map', label: t.btnMapLabel },
    { key: 'pause', label: t.btnPauseLabel },
    { key: 'quests', label: t.btnQuestsLabel },
    { key: 'camera', label: t.btnCameraLabel },
  ];

  const sizeOptions: Array<{ id: MobileControlSizePreset; label: string }> = [
    { id: 'small', label: t.sizeSmall },
    { id: 'medium', label: t.sizeMedium },
    { id: 'large', label: t.sizeLarge },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09110d]/78 p-3 sm:p-4 mobile-hud-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-settings-title"
      data-testid="mobile-settings-modal"
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full max-w-md max-h-[88dvh] overflow-y-auto overflow-x-hidden rounded-2xl bg-[#101c16] border border-[#2a3f33] p-4 sm:p-6 text-[#f1f5ee] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              data-testid="mobile-settings-back-btn"
              onClick={onClose}
              className="p-2 rounded-lg bg-[#192a21] hover:bg-[#22392d] border border-[#2f493b] text-[#e4ece1] cursor-pointer shrink-0"
              aria-label={t.closeBtn}
            >
              {isRtl ? (
                <ArrowRight className="w-4 h-4" />
              ) : (
                <ArrowLeft className="w-4 h-4" />
              )}
            </button>
            <div className="min-w-0">
              <h2
                id="mobile-settings-title"
                className="font-display text-lg sm:text-xl font-bold truncate"
              >
                {t.mobileTouchSettings}
              </h2>
              <p className="text-[11px] text-[#9cb0a0] truncate">
                {isTouchHardware ? t.touchDetected : t.desktopPreviewHint}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="reset-controls-btn"
            onClick={() => setConfirmResetOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#192a21] hover:bg-[#22392d] border border-[#2f493b] text-xs font-medium cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.resetControlsBtn}</span>
          </button>
        </div>

        <div className="space-y-4">
          {/* Enable Touch Controls: ON / OFF (also acts as desktop debug override) */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#16261d] border border-[#284032]">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#f1f5ee]">
                {isTouchHardware ? t.enableTouchControls : t.forceMobileControls}
              </div>
              {!isTouchHardware && (
                <div className="text-[11px] text-[#9cb0a0] leading-snug mt-0.5">
                  {t.forceMobileDesc}
                </div>
              )}
            </div>
            <div
              className="inline-flex rounded-lg bg-[#0e1913] border border-[#284032] p-0.5 shrink-0"
              role="group"
              aria-label={t.enableTouchControls}
            >
              <button
                type="button"
                data-testid="touch-controls-on-btn"
                onClick={() => setTouchEnabled(true)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  touchActive
                    ? 'bg-[#e5a93c] text-[#111914]'
                    : 'text-[#9cb0a0] hover:text-[#eef3eb]'
                }`}
              >
                {t.touchOn}
              </button>
              <button
                type="button"
                data-testid="touch-controls-off-btn"
                onClick={() => setTouchEnabled(false)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  !touchActive
                    ? 'bg-[#2a4234] text-[#ffffff]'
                    : 'text-[#9cb0a0] hover:text-[#eef3eb]'
                }`}
              >
                {t.touchOff}
              </button>
            </div>
          </div>

          {/* Primary Action: Customize Controls Mode */}
          <button
            type="button"
            data-testid="customize-controls-btn"
            onClick={onOpenCustomize}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1c3326] hover:bg-[#254433] border border-[#3a664e] text-sm font-display font-bold text-[#f3faf5] transition-colors cursor-pointer"
          >
            <Move className="w-4 h-4 text-[#e5a93c]" />
            <span>{t.customizeControls}</span>
          </button>

          {/* Independent Portrait & Landscape Layout Reset Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="reset-portrait-controls-btn"
              onClick={() =>
                onChange(resetOrientationControlsToDefaults(settings, 'portrait'))
              }
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                orientation === 'portrait'
                  ? 'bg-[#20382b] border-[#e5a93c]/70 text-[#f5f8f2] hover:bg-[#294737]'
                  : 'bg-[#15241c] border-[#284032] text-[#cddacb] hover:bg-[#1c3025]'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#e5a93c] shrink-0" />
              <span className="truncate">{t.resetPortraitControls}</span>
            </button>
            <button
              type="button"
              data-testid="reset-landscape-controls-btn"
              onClick={() =>
                onChange(resetOrientationControlsToDefaults(settings, 'landscape'))
              }
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                orientation === 'landscape'
                  ? 'bg-[#20382b] border-[#e5a93c]/70 text-[#f5f8f2] hover:bg-[#294737]'
                  : 'bg-[#15241c] border-[#284032] text-[#cddacb] hover:bg-[#1c3025]'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#e5a93c] shrink-0" />
              <span className="truncate">{t.resetLandscapeControls}</span>
            </button>
          </div>

          {/* Control Size: [ Small ] [ Medium ] [ Large ] */}
          <div>
            <div className="text-xs font-medium text-[#cddacb] mb-1.5">
              {t.controlSizeLabel}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {sizeOptions.map((opt) => {
                const active = settings.controlSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`control-size-${opt.id}`}
                    onClick={() => setControlSizePreset(opt.id)}
                    className={`py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#22392c] border-[#e5a93c] text-[#ffffff]'
                        : 'bg-[#15241c] border-[#284032] text-[#a8bca9] hover:bg-[#1b2f24]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Individual Joystick Size & Button Size Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-[#cddacb] mb-1.5">
                <label htmlFor="joystick-size-slider">{t.joystickSize}</label>
                <span className="font-mono-num text-[#f1f5ee]" dir="ltr">
                  {Math.round(settings.joystickSize * 100)}%
                </span>
              </div>
              <input
                id="joystick-size-slider"
                data-testid="joystick-size-slider"
                type="range"
                min={0.7}
                max={1.5}
                step={0.05}
                value={settings.joystickSize}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    joystickSize: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-[#e5a93c] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-[#cddacb] mb-1.5">
                <label htmlFor="button-size-slider">{t.buttonSize}</label>
                <span className="font-mono-num text-[#f1f5ee]" dir="ltr">
                  {Math.round(settings.buttonSize * 100)}%
                </span>
              </div>
              <input
                id="button-size-slider"
                data-testid="button-size-slider"
                type="range"
                min={0.7}
                max={1.5}
                step={0.05}
                value={settings.buttonSize}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    buttonSize: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-[#e5a93c] cursor-pointer"
              />
            </div>
          </div>

          {/* Opacity Slider (20% - 100%) */}
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-[#cddacb] mb-1.5">
              <label htmlFor="opacity-slider">{t.controlOpacity}</label>
              <span
                className="font-mono-num text-[#f1f5ee]"
                dir="ltr"
                data-testid="opacity-value-label"
              >
                {Math.round(settings.controlOpacity * 100)}%
              </span>
            </div>
            <input
              id="opacity-slider"
              data-testid="opacity-slider"
              type="range"
              min={0.2}
              max={1.0}
              step={0.05}
              value={settings.controlOpacity}
              onChange={(e) => setControlOpacity(parseFloat(e.target.value))}
              className="w-full accent-[#e5a93c] cursor-pointer"
            />
          </div>

          {/* Camera Sensitivity */}
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-[#cddacb] mb-1.5">
              <label htmlFor="touch-sens-slider">{t.touchCamSensitivity}</label>
              <span className="font-mono-num text-[#f1f5ee]" dir="ltr">
                {settings.cameraSensitivity.toFixed(1)}x
              </span>
            </div>
            <input
              id="touch-sens-slider"
              data-testid="touch-sens-slider"
              type="range"
              min={0.4}
              max={2.4}
              step={0.1}
              value={settings.cameraSensitivity}
              onChange={(e) =>
                onChange({
                  ...settings,
                  cameraSensitivity: parseFloat(e.target.value),
                })
              }
              className="w-full accent-[#e5a93c] cursor-pointer"
            />
          </div>

          {/* Invert Camera Y */}
          <label className="flex items-center justify-between text-xs font-medium text-[#cddacb] cursor-pointer pt-0.5">
            <span>{t.invertTouchY}</span>
            <input
              type="checkbox"
              data-testid="invert-touch-y-toggle"
              checked={settings.invertY}
              onChange={(e) =>
                onChange({ ...settings, invertY: e.target.checked })
              }
              className="w-4 h-4 accent-[#e5a93c] rounded cursor-pointer"
            />
          </label>

          {/* Portrait Camera Adaptation Settings */}
          <div className="pt-3 border-t border-[#24382d] space-y-2.5">
            <div className="text-xs font-semibold text-[#dce5d8]">
              {t.portraitCameraTitle}
            </div>
            <label className="flex items-center justify-between text-xs text-[#cddacb] cursor-pointer">
              <span>{t.portraitAutoAdapt}</span>
              <input
                type="checkbox"
                data-testid="portrait-cam-auto-toggle"
                checked={settings.portraitCamera.autoAdapt}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    portraitCamera: {
                      ...settings.portraitCamera,
                      autoAdapt: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 accent-[#e5a93c] rounded cursor-pointer"
              />
            </label>
            {settings.portraitCamera.autoAdapt && (
              <div>
                <div className="flex items-center justify-between text-[11px] text-[#9cb0a0] mb-1">
                  <label htmlFor="portrait-fov-slider">
                    {t.portraitFovComfort}
                  </label>
                  <span className="font-mono-num text-[#f1f5ee]" dir="ltr">
                    +{Math.round(settings.portraitCamera.fovBoost)}°
                  </span>
                </div>
                <input
                  id="portrait-fov-slider"
                  data-testid="portrait-fov-slider"
                  type="range"
                  min={0}
                  max={20}
                  step={2}
                  value={settings.portraitCamera.fovBoost}
                  onChange={(e) => {
                    const boost = parseFloat(e.target.value);
                    const distMult = Number(
                      (1.0 + (boost / 20) * 0.34).toFixed(2),
                    );
                    onChange({
                      ...settings,
                      portraitCamera: {
                        ...settings.portraitCamera,
                        fovBoost: boost,
                        distanceMultiplier: distMult,
                      },
                    });
                  }}
                  className="w-full accent-[#e5a93c] cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Show / Hide Individual Buttons */}
          <div className="pt-3 border-t border-[#24382d]">
            <div className="text-xs font-semibold text-[#dce5d8] mb-2">
              {t.visibleTouchButtons}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {buttonLabels.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#16261d] border border-[#263c2f] text-xs text-[#d6e0d2] cursor-pointer"
                >
                  <span className="truncate">{label}</span>
                  <input
                    type="checkbox"
                    data-testid={`toggle-btn-${key}`}
                    checked={settings.visibleButtons[key]}
                    onChange={() => toggleButton(key)}
                    className="w-3.5 h-3.5 accent-[#e5a93c] rounded cursor-pointer shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Optional Fullscreen Button */}
          {canFullscreen && (
            <button
              type="button"
              data-testid="fullscreen-toggle-btn"
              onClick={handleToggleFullscreen}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#16261d] hover:bg-[#1e3328] border border-[#2c4637] text-xs font-medium text-[#dce5d8] cursor-pointer"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-[#e5a93c]" />
                  <span>{t.fullscreenExit}</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-[#e5a93c]" />
                  <span>{t.fullscreenEnter}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Save Settings Button */}
        <button
          type="button"
          data-testid="save-mobile-settings-btn"
          onClick={onSaveAndClose}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-sm transition-colors cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{t.saveSettingsBtn}</span>
        </button>
      </div>

      {/* Confirmation Dialog for Reset Controls */}
      {confirmResetOpen && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          data-testid="reset-confirm-dialog"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#070d0a]/80 p-4 mobile-hud-safe"
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
                onClick={() => {
                  onChange(
                    resetOrientationControlsToDefaults(settings, 'portrait'),
                  );
                  setConfirmResetOpen(false);
                }}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#1d3327] hover:bg-[#274434] border border-[#3a614b] text-xs font-bold text-[#f4f7f2] cursor-pointer"
              >
                {t.resetPortraitControls}
              </button>
              <button
                type="button"
                data-testid="confirm-reset-landscape"
                onClick={() => {
                  onChange(
                    resetOrientationControlsToDefaults(settings, 'landscape'),
                  );
                  setConfirmResetOpen(false);
                }}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#1d3327] hover:bg-[#274434] border border-[#3a614b] text-xs font-bold text-[#f4f7f2] cursor-pointer"
              >
                {t.resetLandscapeControls}
              </button>
              <button
                type="button"
                data-testid="confirm-reset-confirm"
                onClick={() => {
                  onChange(resetAllControlsToDefaults(settings));
                  setConfirmResetOpen(false);
                }}
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
