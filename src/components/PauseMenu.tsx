import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  FolderOpen,
  Home,
  Languages,
  LogOut,
  Map as MapIcon,
  Moon,
  Play,
  RotateCcw,
  Save,
  Settings,
  Sliders,
  Smartphone,
  Sun,
  Sunrise,
  Sunset,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { GameSettings } from '../game/types';
import type { TimePreset, TimeSnapshot } from '../game/world/TimeManager';
import {
  WEATHER_LABELS,
  WEATHER_STATES,
  type WeatherQuality,
  type WeatherSnapshot,
  type WeatherState,
} from '../game/world/WeatherManager';
import { UI_TEXT, type Language } from '../game/i18n/translations';
import { useMenuNavigation } from '../hooks/useMenuNavigation';
import { ExitConfirmationDialog } from './menu/ExitConfirmationDialog';

interface PauseMenuProps {
  settings: GameSettings;
  showMobileControls: boolean;
  lang: Language;
  activeWorldName: string;
  hasUnsavedProgress: boolean;
  timeSnapshot?: TimeSnapshot;
  weatherSnapshot?: WeatherSnapshot;
  onToggleLanguage: () => void;
  onResume: () => void;
  onOpenMap?: () => void;
  onSaveWorld: () => void;
  onOpenSettings: () => void;
  onReturnToMainMenu: (saveFirst: boolean) => void;
  onResetPosition: () => void;
  onOpenSaveSlots: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onOpenGraphicsSettings: () => void;
  graphicsSummaryLabel?: string;
  onOpenMobileSettings: () => void;
  onJumpToTimePreset?: (preset: TimePreset) => void;
  onSetDayDuration?: (seconds: number) => void;
  onSetWeatherState?: (state: WeatherState) => void;
  onSetWeatherDynamic?: (enabled: boolean) => void;
  onSetWeatherTransitionDuration?: (seconds: number) => void;
  onSetWeatherQuality?: (quality: WeatherQuality) => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  settings,
  showMobileControls,
  lang,
  activeWorldName,
  hasUnsavedProgress,
  timeSnapshot,
  weatherSnapshot,
  onToggleLanguage,
  onResume,
  onOpenMap,
  onSaveWorld,
  onOpenSettings,
  onReturnToMainMenu,
  onResetPosition,
  onOpenSaveSlots,
  onUpdateSettings,
  onOpenGraphicsSettings,
  graphicsSummaryLabel,
  onOpenMobileSettings,
  onJumpToTimePreset,
  onSetDayDuration,
  onSetWeatherState,
  onSetWeatherDynamic,
  onSetWeatherTransitionDuration,
  onSetWeatherQuality,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [unsavedPromptOpen, setUnsavedPromptOpen] = useState(false);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);

  const dayDurationSec = timeSnapshot?.fullDayDurationSeconds ?? 360;
  const weatherTarget = weatherSnapshot?.targetState ?? 'clear';
  const weatherDynamic = weatherSnapshot?.dynamicEnabled ?? true;
  const weatherTransitionSec = weatherSnapshot?.transitionDurationSeconds ?? 14;
  const weatherQuality = weatherSnapshot?.quality ?? 'medium';

  const handleMainMenuClick = () => {
    if (hasUnsavedProgress) {
      setUnsavedPromptOpen(true);
    } else {
      onReturnToMainMenu(false);
    }
  };

  const pauseActions = [
    onResume,
    () => onOpenMap?.(),
    onSaveWorld,
    onOpenSettings,
    handleMainMenuClick,
    () => setExitPromptOpen(true),
  ];

  const { focusedIndex, setFocusedIndex, registerItem } = useMenuNavigation({
    enabled: !unsavedPromptOpen && !exitPromptOpen,
    itemCount: pauseActions.length,
    orientation: 'vertical',
    onActivate: (idx) => pauseActions[idx]?.(),
    onBack: onResume,
  });

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#09110d]/72 backdrop-blur-sm p-3 sm:p-4 mobile-hud-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      data-testid="pause-menu"
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="woa-surface w-full max-w-md max-h-[90dvh] overflow-y-auto overflow-x-hidden rounded-2xl bg-[#101c16]/95 border border-[#2a3f33] p-5 sm:p-7 text-[#f1f5ee] shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="min-w-0">
            <h2
              id="pause-title"
              className="font-display text-2xl font-bold tracking-tight"
            >
              {t.gamePaused}
            </h2>
            <p className="woa-muted-text text-xs text-[#9cb0a0] mt-0.5 truncate">
              {activeWorldName || t.gameTitle}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="pause-language-toggle"
              onClick={onToggleLanguage}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#192b22] hover:bg-[#22392d] border border-[#2f493b] text-xs font-medium transition-colors cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5 text-[#e5a93c]" />
              <span>{lang === 'en' ? 'العربية' : 'English'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ muted: !settings.muted })}
              aria-label={settings.muted ? t.muted : t.audioOn}
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center px-2.5 py-1.5 rounded-xl bg-[#192b22] hover:bg-[#22392d] border border-[#2f493b] text-xs font-medium transition-colors cursor-pointer"
            >
              {settings.muted ? (
                <VolumeX className="w-4 h-4 text-[#f28b7d]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#7ec879]" />
              )}
            </button>
          </div>
        </div>

        {/* Primary Pause Menu Buttons */}
        <div className="flex flex-col gap-2.5 mb-5">
          <button
            ref={registerItem(0)}
            type="button"
            data-testid="pause-btn-resume"
            onClick={() => {
              setFocusedIndex(0);
              onResume();
            }}
            className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-sm tracking-wide transition-all cursor-pointer active:scale-[0.985] ${
              focusedIndex === 0 ? 'ring-2 ring-white/80' : ''
            }`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{t.pauseResume}</span>
          </button>

          {onOpenMap && (
            <button
              ref={registerItem(1)}
              type="button"
              data-testid="pause-btn-map"
              onClick={() => {
                setFocusedIndex(1);
                onOpenMap();
              }}
              className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#162a20] hover:bg-[#1f3b2c] border border-[#355c47] text-[#eef5ec] font-display font-bold text-sm tracking-wide transition-all cursor-pointer active:scale-[0.985] ${
                focusedIndex === 1 ? 'ring-2 ring-[#e5a93c]' : ''
              }`}
            >
              <MapIcon className="w-4 h-4 text-[#38bdf8]" />
              <span>{t.pauseMap}</span>
            </button>
          )}

          <button
            ref={registerItem(2)}
            type="button"
            data-testid="pause-btn-save-world"
            onClick={() => {
              setFocusedIndex(2);
              onSaveWorld();
            }}
            className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#1a3124] hover:bg-[#234131] border border-[#355c47] text-[#eef5ec] font-display font-bold text-sm tracking-wide transition-all cursor-pointer active:scale-[0.985] ${
              focusedIndex === 2 ? 'ring-2 ring-[#e5a93c]' : ''
            }`}
          >
            <Save className="w-4 h-4 text-[#7fe094]" />
            <span>{t.pauseSaveWorld}</span>
          </button>

          <button
            ref={registerItem(3)}
            type="button"
            data-testid="pause-btn-settings"
            onClick={() => {
              setFocusedIndex(3);
              onOpenSettings();
            }}
            className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#16271e] hover:bg-[#1e3529] border border-[#2f493b] text-[#e4ece1] font-display font-bold text-sm tracking-wide transition-all cursor-pointer active:scale-[0.985] ${
              focusedIndex === 3 ? 'ring-2 ring-[#e5a93c]' : ''
            }`}
          >
            <Settings className="w-4 h-4 text-[#e5a93c]" />
            <span>{t.pauseSettings}</span>
          </button>

          <button
            ref={registerItem(4)}
            type="button"
            data-testid="pause-btn-main-menu"
            onClick={() => {
              setFocusedIndex(4);
              handleMainMenuClick();
            }}
            className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#16271e] hover:bg-[#1e3529] border border-[#2f493b] text-[#e4ece1] font-display font-bold text-sm tracking-wide transition-all cursor-pointer active:scale-[0.985] ${
              focusedIndex === 4 ? 'ring-2 ring-[#e5a93c]' : ''
            }`}
          >
            <Home className="w-4 h-4 text-[#9cc6e8]" />
            <span>{t.pauseMainMenu}</span>
          </button>

          <button
            ref={registerItem(5)}
            type="button"
            data-testid="pause-btn-exit"
            onClick={() => {
              setFocusedIndex(5);
              setExitPromptOpen(true);
            }}
            className={`w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#271516] hover:bg-[#381d1f] border border-[#e05a47]/40 text-[#f5ddd9] font-display font-bold text-sm tracking-wide transition-all cursor-pointer active:scale-[0.985] ${
              focusedIndex === 5 ? 'ring-2 ring-[#e5a93c]' : ''
            }`}
          >
            <LogOut className="w-4 h-4 text-[#f28b7d]" />
            <span>{t.pauseExitGame}</span>
          </button>
        </div>

        {/* Collapsible World, Time & Weather Tools */}
        <div className="pt-3 border-t border-[#24382d]">
          <button
            type="button"
            data-testid="pause-tools-toggle"
            onClick={() => setToolsExpanded((o) => !o)}
            className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#13221a] hover:bg-[#192d22] border border-white/10 text-xs font-semibold text-[#cde0ce] flex items-center justify-between cursor-pointer"
          >
            <span>{t.worldAndTimeTools}</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                toolsExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          {toolsExpanded && (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onResetPosition}
                  className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#192a21] hover:bg-[#21362b] border border-[#2f493b] text-xs font-medium text-[#e4ece1] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="truncate">{t.returnToSpawn}</span>
                </button>

                <button
                  type="button"
                  data-testid="open-save-slots-btn"
                  onClick={onOpenSaveSlots}
                  className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#192a21] hover:bg-[#21362b] border border-[#2f493b] text-xs font-medium text-[#e4ece1] cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#e5a93c]" />
                  <span className="truncate">{t.saveLoadTitle}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="open-graphics-settings-btn"
                  onClick={onOpenGraphicsSettings}
                  className="min-h-[40px] inline-flex items-center justify-between px-3 py-2 rounded-xl bg-[#16261d] hover:bg-[#1e3328] border border-[#2c4637] text-xs font-medium text-[#e4ece1] cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Sliders className="w-3.5 h-3.5 text-[#7fe094] shrink-0" />
                    <span className="truncate">{t.graphicsSettingsTitle}</span>
                  </span>
                  {graphicsSummaryLabel && (
                    <span className="text-[11px] text-[#f5d282] font-medium shrink-0 ms-1">
                      {graphicsSummaryLabel}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  data-testid="open-mobile-settings-btn"
                  onClick={onOpenMobileSettings}
                  className="min-h-[40px] inline-flex items-center justify-between px-3 py-2 rounded-xl bg-[#16261d] hover:bg-[#1e3328] border border-[#2c4637] text-xs font-medium text-[#e4ece1] cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <Smartphone className="w-3.5 h-3.5 text-[#e5a93c] shrink-0" />
                    <span className="truncate">{t.mobileTouchSettings}</span>
                  </span>
                  <span className="text-[11px] text-[#9cb0a0] shrink-0 ms-1">
                    {showMobileControls ? t.activeStatus : t.desktopStatus}
                  </span>
                </button>
              </div>

              {/* Day & Night Cycle Settings */}
              {timeSnapshot && (
                <div className="pt-3 border-t border-[#24382d] space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#f1f5ee]">
                    <span>{t.timeControlsTitle}</span>
                    <span className="font-mono-num text-[#e5a93c]" dir="ltr">
                      {timeSnapshot.formattedTime} · {t.dayLabel} {timeSnapshot.dayCount}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-[#cddacb] mb-1">
                      <label htmlFor="day-length-slider">{t.dayLengthLabel}</label>
                      <span className="font-mono-num text-[#f1f5ee]" dir="ltr">
                        {dayDurationSec >= 120
                          ? `${Math.round(dayDurationSec / 60)}${t.minutesShort} (${dayDurationSec}${t.secondsShort})`
                          : `${dayDurationSec}${t.secondsShort}`}
                      </span>
                    </div>
                    <input
                      id="day-length-slider"
                      type="range"
                      min={60}
                      max={1200}
                      step={30}
                      value={dayDurationSec}
                      onChange={(e) =>
                        onSetDayDuration?.(parseInt(e.target.value, 10))
                      }
                      className="w-full accent-[#e5a93c] cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onJumpToTimePreset?.('sunrise')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#16261d] hover:bg-[#1e3328] border border-[#2c4637] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sunrise className="w-3.5 h-3.5 text-[#f29f66] shrink-0" />
                      <span className="truncate">{t.presetSunrise}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onJumpToTimePreset?.('noon')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#16261d] hover:bg-[#1e3328] border border-[#2c4637] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sun className="w-3.5 h-3.5 text-[#f2c464] shrink-0" />
                      <span className="truncate">{t.presetNoon}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onJumpToTimePreset?.('sunset')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#16261d] hover:bg-[#1e3328] border border-[#2c4637] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sunset className="w-3.5 h-3.5 text-[#eb7844] shrink-0" />
                      <span className="truncate">{t.presetSunset}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onJumpToTimePreset?.('midnight')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#16261d] hover:bg-[#1e3328] border border-[#2c4637] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Moon className="w-3.5 h-3.5 text-[#92b4ed] shrink-0" />
                      <span className="truncate">{t.presetMidnight}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Dynamic Weather Settings */}
              {weatherSnapshot && (
                <div className="pt-3 border-t border-[#24382d] space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#f1f5ee]">
                    <span>{t.weatherControlsTitle}</span>
                    <button
                      type="button"
                      onClick={() => onSetWeatherDynamic?.(!weatherDynamic)}
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium cursor-pointer ${
                        weatherDynamic
                          ? 'bg-[#1c3226] border-[#7fe094]/45 text-[#9ee8ae]'
                          : 'bg-[#18281f] border-[#2c4637] text-[#e5a93c]'
                      }`}
                    >
                      {weatherDynamic ? t.weatherAutoOn : t.weatherAutoOff}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {WEATHER_STATES.map((state) => {
                      const active = weatherTarget === state;
                      return (
                        <button
                          key={state}
                          type="button"
                          onClick={() => onSetWeatherState?.(state)}
                          className={`px-2 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                            active
                              ? 'bg-[#22392c] border-[#e5a93c]/85 text-[#ffffff]'
                              : 'bg-[#16261d] hover:bg-[#1e3328] border-[#2c4637] text-[#cddacb]'
                          }`}
                        >
                          <PauseWeatherIcon state={state} />
                          <span className="truncate">
                            {WEATHER_LABELS[lang][state]}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-[#cddacb] mb-1">
                      <label htmlFor="weather-transition-slider">
                        {t.weatherTransitionLabel}
                      </label>
                      <span className="font-mono-num text-[#f1f5ee]" dir="ltr">
                        {weatherTransitionSec}
                        {t.secondsShort}
                      </span>
                    </div>
                    <input
                      id="weather-transition-slider"
                      type="range"
                      min={2}
                      max={40}
                      step={2}
                      value={weatherTransitionSec}
                      onChange={(e) =>
                        onSetWeatherTransitionDuration?.(
                          parseInt(e.target.value, 10),
                        )
                      }
                      className="w-full accent-[#e5a93c] cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {(['low', 'medium', 'high'] as WeatherQuality[]).map((q) => {
                      const label =
                        q === 'low'
                          ? t.weatherQualityLow
                          : q === 'high'
                            ? t.weatherQualityHigh
                            : t.weatherQualityMedium;
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => onSetWeatherQuality?.(q)}
                          className={`py-1 rounded-md border text-xs font-medium cursor-pointer ${
                            weatherQuality === q
                              ? 'bg-[#22392c] border-[#e5a93c]/80 text-[#ffffff]'
                              : 'bg-[#16261d] border-[#2c4637] text-[#b7c8b8] hover:bg-[#1e3328]'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Controls Reference */}
              <div className="pt-3 border-t border-[#24382d] grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs text-[#9cb0a0]">
                <div className="flex justify-between">
                  <span>{t.controlsMove}</span>
                  <span className="font-mono-num text-[#dce5d8]" dir="ltr">
                    WASD
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t.controlsCamera}</span>
                  <span className="font-mono-num text-[#dce5d8]">
                    {t.mouseWord}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t.controlsJump}</span>
                  <span className="font-mono-num text-[#dce5d8]" dir="ltr">
                    Space
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t.controlsSprint}</span>
                  <span className="font-mono-num text-[#dce5d8]" dir="ltr">
                    Shift
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t.controlsInteract}</span>
                  <span className="font-mono-num text-[#dce5d8]" dir="ltr">
                    E
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t.controlsAttack}</span>
                  <span className="font-mono-num text-[#dce5d8]">
                    {t.clickWord}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t.controlsPackMap}</span>
                  <span className="font-mono-num text-[#dce5d8]" dir="ltr">
                    I / J / M
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t.controlsPause}</span>
                  <span className="font-mono-num text-[#dce5d8]" dir="ltr">
                    Esc / P
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t.btnCameraLabel}</span>
                  <span className="font-mono-num text-[#dce5d8]" dir="ltr">
                    V
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unsaved Progress Confirmation Dialog before returning to Main Menu */}
      {unsavedPromptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#060d09]/80 backdrop-blur-sm p-4 mobile-hud-safe"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="unsaved-main-menu-title"
          data-testid="unsaved-main-menu-dialog"
        >
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="woa-surface w-full max-w-sm rounded-2xl bg-[#101c16] border border-[#2d4638] p-6 text-[#f1f5ee] shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#e5a93c]/15 text-[#e5a93c] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="unsaved-main-menu-title"
                  className="font-display text-lg font-bold text-[#f7faf5]"
                >
                  {t.unsavedMainMenuTitle}
                </h3>
                <p className="woa-muted-text text-xs sm:text-sm text-[#a8bba9] mt-1 leading-relaxed">
                  {t.unsavedMainMenuDesc}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-5">
              <button
                type="button"
                data-testid="save-and-exit-menu-btn"
                onClick={() => {
                  setUnsavedPromptOpen(false);
                  onReturnToMainMenu(true);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-sm cursor-pointer"
              >
                {t.saveAndExitBtn}
              </button>
              <button
                type="button"
                data-testid="discard-and-exit-menu-btn"
                onClick={() => {
                  setUnsavedPromptOpen(false);
                  onReturnToMainMenu(false);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#291718] hover:bg-[#3a1d20] border border-[#e05a47]/40 text-[#f4b1a7] font-display font-semibold text-sm cursor-pointer"
              >
                {t.discardAndExitBtn}
              </button>
              <button
                type="button"
                data-testid="cancel-main-menu-btn"
                onClick={() => setUnsavedPromptOpen(false)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#192b22] hover:bg-[#233a2e] border border-[#2f493b] text-sm font-medium text-[#e4ece1] cursor-pointer"
              >
                {t.cancelBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Confirmation Dialog from Pause Menu */}
      {exitPromptOpen && (
        <ExitConfirmationDialog
          lang={lang}
          onClose={() => setExitPromptOpen(false)}
        />
      )}
    </div>
  );
};

const PauseWeatherIcon: React.FC<{ state: WeatherState }> = ({ state }) => {
  switch (state) {
    case 'cloudy':
      return <Cloud className="w-3.5 h-3.5 text-[#c5d4e2] shrink-0" />;
    case 'rain':
      return <CloudRain className="w-3.5 h-3.5 text-[#7fb7eb] shrink-0" />;
    case 'storm':
      return <CloudLightning className="w-3.5 h-3.5 text-[#92b4ed] shrink-0" />;
    case 'fog':
      return <CloudFog className="w-3.5 h-3.5 text-[#b7c8ce] shrink-0" />;
    case 'clear':
    default:
      return <Sun className="w-3.5 h-3.5 text-[#f2c464] shrink-0" />;
  }
};
