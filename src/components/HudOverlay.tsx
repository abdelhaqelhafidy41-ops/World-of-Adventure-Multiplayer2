import React, { useState } from 'react';
import {
  Backpack,
  Camera,
  CheckCircle2,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Coins,
  Map as MapIcon,
  MessageSquare,
  Moon,
  Pause,
  Play,
  ScrollText,
  Sun,
  Sunrise,
  Sunset,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import type { PlayerHudSnapshot, WeaponSlotHudView } from '../game/types';
import {
  DAY_PHASE_LABELS,
  type TimePreset,
} from '../game/world/TimeManager';
import {
  WEATHER_LABELS,
  WEATHER_STATES,
  type WeatherQuality,
  type WeatherState,
} from '../game/world/WeatherManager';
import {
  MapManager,
  type MapWaypoint,
  type MapWorldData,
} from '../game/world/MapManager';
import { MiniMapWidget } from './MiniMapWidget';
import { useOrientation } from '../hooks/useOrientation';
import {
  BIOME_LABELS,
  CARDINAL_LABELS,
  MOVEMENT_LABELS,
  UI_TEXT,
  type Language,
  translateInteractableVerb,
} from '../game/i18n/translations';

interface HudOverlayProps {
  hud: PlayerHudSnapshot;
  pointerLocked: boolean;
  muted: boolean;
  showMobileControls: boolean;
  customizeMode?: boolean;
  worldNotice: string | null;
  lang: Language;
  showHud?: boolean;
  showFps?: boolean;
  showBiomeDebug?: boolean;
  fps?: number;
  mapManager?: MapManager | null;
  mapData?: MapWorldData | null;
  waypoint?: MapWaypoint | null;
  miniMapRotate?: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onOpenInventory: () => void;
  onOpenMap: () => void;
  onOpenQuestJournal: () => void;
  onSelectWeaponSlot?: (slotIndex: number) => void;
  onUnequipWeapon?: () => void;
  onJumpToTimePreset?: (preset: TimePreset) => void;
  onSetDayDuration?: (seconds: number) => void;
  onSetTimeScale?: (scale: number) => void;
  onToggleTimePaused?: (paused: boolean) => void;
  onSetWeatherState?: (state: WeatherState) => void;
  onSetWeatherDynamic?: (enabled: boolean) => void;
  onSetWeatherTransitionDuration?: (seconds: number) => void;
  onSetWeatherQuality?: (quality: WeatherQuality) => void;
  onTriggerLightning?: () => void;
  onCycleCameraPerspective?: () => void;
  isMultiplayer?: boolean;
  unreadChatCount?: number;
  onOpenChat?: () => void;
}

function getCardinalDirection(deg: number, lang: Language): string {
  const dirs = CARDINAL_LABELS[lang];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return dirs[idx];
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  pointerLocked,
  muted,
  showMobileControls,
  customizeMode = false,
  worldNotice,
  lang,
  showHud = true,
  showFps = false,
  showBiomeDebug = false,
  fps = 60,
  mapManager = null,
  mapData = null,
  waypoint = null,
  miniMapRotate = false,
  onToggleMute,
  onPause,
  onOpenInventory,
  onOpenMap,
  onOpenQuestJournal,
  onSelectWeaponSlot,
  onUnequipWeapon,
  onJumpToTimePreset,
  onSetDayDuration,
  onSetTimeScale,
  onToggleTimePaused,
  onSetWeatherState,
  onSetWeatherDynamic,
  onSetWeatherTransitionDuration,
  onSetWeatherQuality,
  onTriggerLightning,
  onCycleCameraPerspective,
  isMultiplayer = false,
  unreadChatCount = 0,
  onOpenChat,
}) => {
  const { isPortrait } = useOrientation();
  const isPortraitMobile = showMobileControls && isPortrait;
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const [weatherMenuOpen, setWeatherMenuOpen] = useState(false);
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const healthPct = Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100));
  const isInfiniteStamina =
    !Number.isFinite(hud.maxStamina) ||
    !Number.isFinite(hud.stamina) ||
    hud.worldType === 'creative';
  const staminaPct = isInfiniteStamina
    ? 100
    : Math.max(0, Math.min(100, (hud.stamina / Math.max(1, hud.maxStamina)) * 100));
  const cardinal = getCardinalDirection(hud.headingDeg, lang);
  const moveLabel = MOVEMENT_LABELS[lang][hud.movementState];
  const biomeLabel = BIOME_LABELS[lang][hud.biome];
  const ts = hud.timeSnapshot;
  const formattedClock = ts?.formattedTime ?? hud.timeOfDayLabel.split(' · ')[0] ?? '08:30';
  const phaseText = ts
    ? DAY_PHASE_LABELS[lang][ts.phase]
    : hud.timeOfDayLabel.split(' · ')[1] ?? '';
  const isNightClock = ts ? ts.sunElevation < 0 : false;
  const dayCount = ts?.dayCount ?? 1;
  const dayDurationSec = ts?.fullDayDurationSeconds ?? 360;
  const timeScale = ts?.timeScale ?? 1;
  const timePaused = ts?.paused ?? false;

  const ws = hud.weatherSnapshot;
  const weatherState: WeatherState = ws?.currentState ?? 'clear';
  const weatherTarget: WeatherState = ws?.targetState ?? weatherState;
  const weatherTransitioning = ws ? ws.transitionProgress < 0.99 : false;
  const weatherLabel = WEATHER_LABELS[lang][weatherState];
  const weatherTargetLabel = WEATHER_LABELS[lang][weatherTarget];
  const windSpeedKmh = ws?.windSpeedKmh ?? 14;
  const weatherDynamic = ws?.dynamicEnabled ?? true;
  const weatherTransitionSec = ws?.transitionDurationSeconds ?? 14;
  const weatherQuality: WeatherQuality = ws?.quality ?? 'medium';

  if (!showHud) {
    return (
      <div className="fixed inset-0 z-20 pointer-events-none mobile-hud-safe">
        {showFps && (
          <div
            data-testid="hud-fps-counter"
            dir="ltr"
            className="absolute px-2.5 py-1 rounded-lg bg-[#0d1712]/80 border border-white/12 font-mono-num text-[11px] font-semibold text-[#9ee8ae]"
            style={{
              top: 'max(12px, env(safe-area-inset-top, 0px))',
              left: 'max(12px, env(safe-area-inset-left, 0px))',
            }}
          >
            {Math.round(fps)} FPS
          </div>
        )}
        {showBiomeDebug && (
          <div
            data-testid="hud-biome-debug"
            dir={isRtl ? 'rtl' : 'ltr'}
            className="absolute px-3 py-1 rounded-lg bg-[#0d1712]/88 border border-[#e5a93c]/45 font-mono-num text-[11px] font-semibold text-[#f5ecd3] whitespace-nowrap"
            style={{
              top: 'max(12px, env(safe-area-inset-top, 0px))',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          >
            {t.biomeDebugPrefix}: {biomeLabel.toUpperCase()} · {hud.biomeMaterialId ?? 'unknown'}
          </div>
        )}
        {!showMobileControls && (
          <button
            type="button"
            onClick={onPause}
            aria-label={t.controlsPause}
            className="pointer-events-auto absolute p-2.5 rounded-xl bg-[#0d1712]/78 border border-white/12 text-[#e8efe5] hover:bg-[#192a21] cursor-pointer"
            style={{
              top: 'max(14px, env(safe-area-inset-top, 0px))',
              right: 'max(14px, env(safe-area-inset-right, 0px))',
            }}
          >
            <Pause className="w-4 h-4" />
          </button>
        )}
        {worldNotice && (
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="absolute left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-[#0d1712]/90 border border-[#e5a93c]/45 text-xs sm:text-sm font-medium text-[#f6f3e8] text-center max-w-[84vw] shadow-lg"
            style={{ top: 'max(68px, calc(env(safe-area-inset-top, 0px) + 8.5vh))' }}
            role="status"
          >
            {worldNotice}
          </div>
        )}
        {hud.isSleeping && (
          <div
            data-testid="sleep-transition-overlay"
            className="fixed inset-0 z-50 bg-[#040705] flex items-center justify-center pointer-events-auto"
            style={{
              opacity: Math.min(
                1,
                Math.sin(Math.max(0, Math.min(1, hud.sleepProgress ?? 0)) * Math.PI) * 1.45,
              ),
            }}
          >
            <div dir={isRtl ? 'rtl' : 'ltr'} className="px-6 py-3 text-center select-none">
              <Moon className="w-8 h-8 text-[#92b4ed] mx-auto mb-3 animate-pulse" />
              <p className="font-display text-xl sm:text-2xl font-bold tracking-wide text-[#eef3ed]">
                {t.sleepTransitionLabel}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-20 pointer-events-none mobile-hud-safe transition-opacity duration-150 ${
        customizeMode ? 'opacity-30 [&_*]:!pointer-events-none' : 'opacity-100'
      }`}
    >
      {showFps && (
        <div
          data-testid="hud-fps-counter"
          dir="ltr"
          className="absolute px-2.5 py-1 rounded-lg bg-[#0d1712]/80 border border-white/12 font-mono-num text-[11px] font-semibold text-[#9ee8ae]"
          style={{
            top: 'max(12px, env(safe-area-inset-top, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {Math.round(fps)} FPS
        </div>
      )}
      {showBiomeDebug && (
        <div
          data-testid="hud-biome-debug"
          dir={isRtl ? 'rtl' : 'ltr'}
          className="absolute px-3 py-1 rounded-lg bg-[#0d1712]/88 border border-[#e5a93c]/45 font-mono-num text-[11px] font-semibold text-[#f5ecd3] whitespace-nowrap"
          style={{
            top: showFps
              ? 'max(42px, calc(env(safe-area-inset-top, 0px) + 30px))'
              : 'max(12px, env(safe-area-inset-top, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {t.biomeDebugPrefix}: {biomeLabel.toUpperCase()} · {hud.biomeMaterialId ?? 'unknown'}
        </div>
      )}
      {/* Top-Left: Health & Stamina Cluster (+ Compact Quest & Level) */}
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        data-testid="hud-vitals-card"
        className={`mobile-top-hud-card absolute flex flex-col ${
          isPortraitMobile
            ? 'gap-1 p-2 w-[min(176px,49vw)]'
            : showMobileControls
              ? 'gap-1.5 sm:gap-2 p-2.5 sm:p-3.5 w-[144px] sm:w-56'
              : 'gap-1.5 sm:gap-2 p-2.5 sm:p-3.5 w-40 sm:w-60'
        } rounded-xl bg-[#0d1712]/82 border border-white/12`}
        style={{
          top: isPortraitMobile
            ? 'max(10px, env(safe-area-inset-top, 0px))'
            : 'max(12px, calc(env(safe-area-inset-top, 0px) + 1.5vh))',
          left: isPortraitMobile
            ? 'max(10px, env(safe-area-inset-left, 0px))'
            : showMobileControls
              ? 'max(10px, calc(env(safe-area-inset-left, 0px) + 1.5vw))'
              : 'max(12px, calc(env(safe-area-inset-left, 0px) + 2vw))',
        }}
      >
        {/* Health */}
        <div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-[#e9efe6] mb-0.5 sm:mb-1">
            <span className="inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 14s-5.5-3.4-5.5-7.4C2.5 4.4 4.1 3 5.9 3c1 0 1.7.5 2.1 1.1C8.4 3.5 9.1 3 10.1 3c1.8 0 3.4 1.4 3.4 3.6C13.5 10.6 8 14 8 14Z"
                  fill="#e05a47"
                />
              </svg>
              {t.health}
            </span>
            <span className="font-mono-num text-[#f5f8f2]">
              {hud.health}/{hud.maxHealth}
            </span>
          </div>
          <div className="h-1.5 sm:h-2 rounded-full bg-[#1a2a21] overflow-hidden">
            <div
              className="h-full bg-[#df5c48] transition-[width] duration-150 ease-out"
              style={{ width: `${healthPct}%` }}
            />
          </div>
        </div>

        {/* Stamina */}
        <div>
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-[#e9efe6] mb-0.5 sm:mb-1">
            <span className="inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M9.2 1.5L3.5 9h4.2l-.9 5.5L12.5 7H8.3l.9-5.5Z"
                  fill={isInfiniteStamina ? '#38bdf8' : '#e6b34d'}
                />
              </svg>
              {t.stamina}
            </span>
            <span
              data-testid="hud-stamina-value"
              className={`font-mono-num ${
                isInfiniteStamina ? 'text-[#7dd3fc] font-bold text-xs sm:text-sm leading-none' : 'text-[#f5f8f2]'
              }`}
              dir="ltr"
            >
              {isInfiniteStamina ? '∞' : `${hud.stamina} / ${hud.maxStamina}`}
            </span>
          </div>
          <div className="h-1.5 sm:h-2 rounded-full bg-[#1a2a21] overflow-hidden">
            <div
              className={`h-full transition-[width] duration-75 ease-out ${
                isInfiniteStamina
                  ? 'bg-gradient-to-r from-[#e6b34d] via-[#7fe094] to-[#38bdf8]'
                  : 'bg-[#e6b34d]'
              }`}
              style={{ width: `${staminaPct}%` }}
            />
          </div>
        </div>

        {/* Movement state indicator (Landscape / Desktop; Portrait keeps top-left compact for Mini-Map space) */}
        {!isPortraitMobile && (
          <div className="pt-1 border-t border-white/10 text-[10px] sm:text-[11px] text-[#c5d4c1] flex items-center justify-between gap-2">
            <span className="capitalize font-medium text-[#e9efe6]">
              {hud.inWater ? `${moveLabel} · ${t.waterSuffix}` : moveLabel}
            </span>
            {showMobileControls ? (
              <span className="font-mono-num" dir="ltr">
                {hud.x.toFixed(0)}, {hud.y.toFixed(0)}, {hud.z.toFixed(0)}
              </span>
            ) : (
              <span className="font-mono-num text-[#a3b7a7]" dir="ltr">
                {hud.speed.toFixed(1)} m/s
              </span>
            )}
          </div>
        )}

        {/* Landscape Mobile Biome, Clock & Weather Strip (Portrait shows these cleanly inside Top-Right Mini-Map card) */}
        {showMobileControls && !isPortrait && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              data-testid="clock-hud-mobile"
              onClick={() => {
                setWeatherMenuOpen(false);
                setTimeMenuOpen((o) => !o);
              }}
              className="pointer-events-auto text-start text-[10px] text-[#dce7dd] leading-tight truncate flex items-center gap-1 cursor-pointer"
            >
              {isNightClock ? (
                <Moon className="w-3 h-3 text-[#92b4ed] shrink-0" />
              ) : (
                <Sun className="w-3 h-3 text-[#f2c464] shrink-0" />
              )}
              <span className="font-mono-num font-semibold">{formattedClock}</span>
              <span className="text-[#a3b7a7] truncate">
                · {t.dayLabel} {dayCount} · {biomeLabel}
              </span>
            </button>

            <button
              type="button"
              data-testid="weather-hud-mobile"
              onClick={() => {
                setTimeMenuOpen(false);
                setWeatherMenuOpen((o) => !o);
              }}
              className="pointer-events-auto text-start text-[10px] text-[#dce7dd] leading-tight truncate flex items-center gap-1 cursor-pointer"
            >
              <WeatherGlyph state={weatherState} className="w-3 h-3 shrink-0" />
              <span className="font-semibold">{weatherLabel}</span>
              <span className="text-[#a3b7a7] font-mono-num truncate">
                · {windSpeedKmh} km/h
              </span>
            </button>
          </div>
        )}

        {/* Compact Level / Coins Strip */}
        <div className="pt-1 border-t border-white/10 text-[10px] sm:text-[11px] text-[#dce7dd] flex items-center justify-between gap-2">
          <span className="font-semibold truncate">
            {t.levelShort}
            {hud.level}{' '}
            {!isPortraitMobile && (
              <span className="font-mono-num text-[#a3b7a7]">
                ({hud.xp}/{hud.xpToNextLevel} {t.xpShort})
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 font-mono-num text-[#f2c464] shrink-0">
            <Coins className="w-3 h-3" />
            {hud.coins}
          </span>
        </div>

        {/* Tracked Quest HUD */}
        {hud.trackedQuest && (
          <button
            type="button"
            onClick={onOpenQuestJournal}
            data-testid="quest-tracker-hud"
            className="pointer-events-auto mt-0.5 pt-1 border-t border-white/12 text-start hover:opacity-95 cursor-pointer"
            title={t.questJournal}
          >
            <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-semibold text-[#e5a93c]">
              <span className="inline-flex items-center gap-1 truncate">
                <ScrollText className="w-3 h-3 shrink-0" />
                <span className="truncate">{hud.trackedQuest.title}</span>
              </span>
              {hud.trackedQuest.status === 'ready' && (
                <CheckCircle2 className="w-3 h-3 text-[#7fe094] shrink-0" />
              )}
            </div>
            <p
              className={`mobile-quest-objective text-[10px] sm:text-[11px] text-[#dde7dd] mt-0.5 leading-snug ${
                isPortraitMobile ? 'line-clamp-1' : ''
              }`}
            >
              {hud.trackedQuest.currentObjectiveText}
            </p>
          </button>
        )}
      </div>

      {/* Top-Right Portrait Mini-Map + Biome/Clock/Weather Card */}
      {isPortraitMobile && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          data-testid="portrait-minimap-card"
          className="absolute w-[min(156px,43vw)] p-2 rounded-xl bg-[#0d1712]/84 border border-white/14 shadow-lg flex flex-col gap-1.5"
          style={{
            top: 'max(10px, env(safe-area-inset-top, 0px))',
            right: 'max(10px, env(safe-area-inset-right, 0px))',
          }}
        >
          <div className="flex items-center gap-2">
            <MiniMapWidget
              playerX={hud.x}
              playerZ={hud.z}
              headingDeg={hud.headingDeg}
              mapManager={mapManager}
              mapData={mapData}
              waypoint={waypoint}
              rotateWithPlayer={miniMapRotate}
              lang={lang}
              sizePx={52}
              radiusMeters={190}
              circular
              showWaypointPill={false}
              testId="portrait-minimap"
              onOpenMap={onOpenMap}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold text-[#f3f7f0] truncate">
                {cardinal} · {biomeLabel}
              </div>
              <div
                dir="ltr"
                className="font-mono-num text-[9px] text-[#a3b7a7] truncate"
              >
                {hud.x.toFixed(0)}, {hud.z.toFixed(0)}
              </div>
              <div className="text-[9px] font-medium text-[#e5a93c] capitalize truncate">
                {hud.inWater ? `${moveLabel} · ${t.waterSuffix}` : moveLabel}
              </div>
              {waypoint && (
                <div
                  dir="ltr"
                  className="text-[9px] font-mono-num text-[#7dd3fc] truncate"
                >
                  ◆ {Math.round(Math.hypot(waypoint.x - hud.x, waypoint.z - hud.z))}m
                </div>
              )}
            </div>
          </div>

          <div className="pt-1 border-t border-white/10 flex items-center justify-between gap-1 text-[10px]">
            <button
              type="button"
              data-testid="clock-hud-mobile"
              onClick={() => {
                setWeatherMenuOpen(false);
                setTimeMenuOpen((o) => !o);
              }}
              className="pointer-events-auto inline-flex items-center gap-1 text-[#dce7dd] truncate cursor-pointer"
            >
              {isNightClock ? (
                <Moon className="w-3 h-3 text-[#92b4ed] shrink-0" />
              ) : (
                <Sun className="w-3 h-3 text-[#f2c464] shrink-0" />
              )}
              <span className="font-mono-num font-semibold">{formattedClock}</span>
            </button>

            <button
              type="button"
              data-testid="weather-hud-mobile"
              onClick={() => {
                setTimeMenuOpen(false);
                setWeatherMenuOpen((o) => !o);
              }}
              className="pointer-events-auto inline-flex items-center gap-1 text-[#dce7dd] truncate cursor-pointer"
            >
              <WeatherGlyph state={weatherState} className="w-3 h-3 shrink-0" />
              <span className="truncate">{weatherLabel}</span>
            </button>
          </div>
        </div>
      )}

      {/* Landscape Mobile Mini-Map (Below top-right utility buttons, safely above Interact/Action cluster) */}
      {showMobileControls && !isPortrait && (
        <div
          className="absolute"
          style={{
            top: 'max(58px, calc(env(safe-area-inset-top, 0px) + 54px))',
            right: 'max(10px, env(safe-area-inset-right, 0px))',
          }}
        >
          <MiniMapWidget
            playerX={hud.x}
            playerZ={hud.z}
            headingDeg={hud.headingDeg}
            mapManager={mapManager}
            mapData={mapData}
            waypoint={waypoint}
            rotateWithPlayer={miniMapRotate}
            lang={lang}
            sizePx={80}
            radiusMeters={195}
            testId="landscape-minimap"
            onOpenMap={onOpenMap}
          />
        </div>
      )}

      {/* Top-Right Desktop Clock, Coordinates & Quick Controls */}
      {!showMobileControls && (
        <div
          className="absolute flex flex-col items-end gap-2"
          style={{
            top: 'max(14px, env(safe-area-inset-top, 0px))',
            right: 'max(14px, env(safe-area-inset-right, 0px))',
          }}
        >
          <div className="flex items-start gap-2">
            {/* Weather UI Button */}
            <button
              type="button"
              data-testid="weather-hud"
              onClick={() => {
                setTimeMenuOpen(false);
                setWeatherMenuOpen((o) => !o);
              }}
              dir={isRtl ? 'rtl' : 'ltr'}
              className="pointer-events-auto px-3 py-2 rounded-xl bg-[#0d1712]/84 hover:bg-[#15241c] border border-white/14 text-start transition-colors cursor-pointer"
              title={t.weatherControlsTitle}
            >
              <div className="flex items-center gap-2">
                <WeatherGlyph state={weatherState} className="w-4 h-4 shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-[#f3f7f0] leading-none whitespace-nowrap">
                  {weatherLabel}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-[#a3b7a7] whitespace-nowrap flex items-center gap-1">
                <Wind className="w-2.5 h-2.5 shrink-0" />
                <span className="font-mono-num" dir="ltr">
                  {windSpeedKmh} km/h
                </span>
                {weatherTransitioning && weatherTarget !== weatherState && (
                  <span className="text-[#e5a93c]">→ {weatherTargetLabel}</span>
                )}
              </div>
            </button>

            {/* Clock UI Button */}
            <button
              type="button"
              data-testid="clock-hud"
              onClick={() => {
                setWeatherMenuOpen(false);
                setTimeMenuOpen((o) => !o);
              }}
              dir={isRtl ? 'rtl' : 'ltr'}
              className="pointer-events-auto px-3 py-2 rounded-xl bg-[#0d1712]/84 hover:bg-[#15241c] border border-white/14 text-start transition-colors cursor-pointer"
              title={t.timeControlsTitle}
            >
              <div className="flex items-center gap-2">
                {isNightClock ? (
                  <Moon className="w-4 h-4 text-[#92b4ed] shrink-0" />
                ) : (
                  <Sun className="w-4 h-4 text-[#f2c464] shrink-0" />
                )}
                <span className="font-mono-num text-sm font-bold text-[#f3f7f0] leading-none">
                  {formattedClock}
                </span>
                {timePaused && (
                  <span className="text-[10px] font-medium text-[#e5a93c]">
                    {t.pausedTag}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[10px] text-[#a3b7a7] whitespace-nowrap">
                {t.dayLabel} {dayCount} · {phaseText}
              </div>
            </button>

            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="px-3.5 py-2 rounded-xl bg-[#0d1712]/82 border border-white/12 text-end"
            >
              <div className="text-[11px] font-medium text-[#a3b7a7] mb-0.5">
                {biomeLabel} · {cardinal} ({hud.headingDeg}°)
              </div>
              <div
                dir="ltr"
                className="font-mono-num text-xs sm:text-sm font-semibold text-[#f3f7f0] flex items-center justify-end gap-2.5"
              >
                <span>X {hud.x.toFixed(1)}</span>
                <span className="text-white/25">/</span>
                <span>Y {hud.y.toFixed(1)}</span>
                <span className="text-white/25">/</span>
                <span>Z {hud.z.toFixed(1)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenQuestJournal}
              className="pointer-events-auto p-2.5 rounded-xl bg-[#0d1712]/82 border border-white/12 text-[#e8efe5] hover:bg-[#192a21] transition-colors cursor-pointer"
              aria-label={t.questJournal}
              title={t.questJournal}
              data-testid="desktop-btn-quests"
            >
              <ScrollText className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenInventory}
              className="pointer-events-auto p-2.5 rounded-xl bg-[#0d1712]/82 border border-white/12 text-[#e8efe5] hover:bg-[#192a21] transition-colors cursor-pointer"
              aria-label={t.explorerPack}
              title={t.explorerPack}
            >
              <Backpack className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenMap}
              className="pointer-events-auto p-2.5 rounded-xl bg-[#0d1712]/82 border border-white/12 text-[#e8efe5] hover:bg-[#192a21] transition-colors cursor-pointer"
              aria-label={t.worldMap}
              title={t.worldMap}
            >
              <MapIcon className="w-4 h-4" />
            </button>

            {isMultiplayer && onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                data-testid="desktop-btn-chat"
                className="relative pointer-events-auto p-2.5 rounded-xl bg-[#0d1712]/82 border border-[#e5a93c]/35 text-[#e8efe5] hover:bg-[#192a21] transition-colors cursor-pointer"
                aria-label={t.mpRoomChatOpenBtn}
                title={t.mpRoomChatOpenBtn}
              >
                <MessageSquare className="w-4 h-4 text-[#e5a93c]" />
                {unreadChatCount > 0 && (
                  <span
                    data-testid="hud-chat-unread-badge"
                    dir="ltr"
                    className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#e5a93c] text-[#111914] font-mono-num text-[10px] font-bold flex items-center justify-center"
                  >
                    {unreadChatCount > 99 ? '99+' : unreadChatCount}
                  </span>
                )}
              </button>
            )}

            {onCycleCameraPerspective && (
              <button
                type="button"
                onClick={onCycleCameraPerspective}
                className="pointer-events-auto px-2.5 py-2.5 rounded-xl bg-[#0d1712]/82 border border-white/12 text-[#e8efe5] hover:bg-[#192a21] transition-colors cursor-pointer inline-flex items-center gap-1"
                aria-label={t.btnCameraLabel}
                title={`${t.btnCameraLabel} (V)`}
                data-testid="desktop-btn-camera"
              >
                <Camera className="w-4 h-4 text-[#e5a93c]" />
                <span className="font-mono-num text-[11px] font-bold leading-none">
                  {hud.cameraPerspective === 'first-person'
                    ? t.perspectiveShort1p
                    : hud.cameraPerspective === 'second-person'
                      ? t.perspectiveShort2p
                      : t.perspectiveShort3p}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleMute}
              className="pointer-events-auto p-2.5 rounded-xl bg-[#0d1712]/82 border border-white/12 text-[#e8efe5] hover:bg-[#192a21] transition-colors cursor-pointer"
              aria-label={muted ? t.soundOff : t.soundOn}
              title={muted ? t.soundOff : t.soundOn}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onPause}
              className="pointer-events-auto p-2.5 rounded-xl bg-[#0d1712]/82 border border-white/12 text-[#e8efe5] hover:bg-[#192a21] transition-colors cursor-pointer"
              aria-label={t.controlsPause}
              title={t.controlsPause}
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>

          {/* Desktop Interactive Mini-Map */}
          <MiniMapWidget
            playerX={hud.x}
            playerZ={hud.z}
            headingDeg={hud.headingDeg}
            mapManager={mapManager}
            mapData={mapData}
            waypoint={waypoint}
            rotateWithPlayer={miniMapRotate}
            lang={lang}
            sizePx={116}
            radiusMeters={210}
            testId="desktop-minimap"
            onOpenMap={onOpenMap}
          />
        </div>
      )}

      {/* Configurable Day/Night Cycle Time Popover */}
      {timeMenuOpen && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          data-testid="time-controls-popover"
          className="pointer-events-auto z-30 absolute w-72 max-w-[calc(100vw-24px)] p-3.5 rounded-xl bg-[#0d1712]/94 border border-white/16 shadow-2xl text-[#f1f5ee]"
          style={
            isPortraitMobile
              ? {
                  top: 'max(116px, calc(env(safe-area-inset-top, 0px) + 108px))',
                  right: 'max(10px, env(safe-area-inset-right, 0px))',
                }
              : showMobileControls
                ? {
                    top: 'max(96px, calc(env(safe-area-inset-top, 0px) + 12vh))',
                    left: 'max(12px, env(safe-area-inset-left, 0px))',
                  }
                : {
                    top: 'max(74px, calc(env(safe-area-inset-top, 0px) + 64px))',
                    right: 'max(14px, env(safe-area-inset-right, 0px))',
                  }
          }
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-semibold text-[#f3f7f0]">
              {t.timeControlsTitle}
            </span>
            <button
              type="button"
              data-testid="time-pause-toggle"
              onClick={() => onToggleTimePaused?.(!timePaused)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#18281f] hover:bg-[#21362a] border border-white/12 text-[11px] font-medium text-[#e5a93c] cursor-pointer"
            >
              {timePaused ? (
                <>
                  <Play className="w-3 h-3" />
                  <span>{t.resumeTimeLabel}</span>
                </>
              ) : (
                <>
                  <Pause className="w-3 h-3" />
                  <span>{t.pauseTimeLabel}</span>
                </>
              )}
            </button>
          </div>

          {/* Key Time Presets */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <button
              type="button"
              data-testid="time-preset-sunrise"
              onClick={() => onJumpToTimePreset?.('sunrise')}
              className="px-2 py-1.5 rounded-lg bg-[#15241c] hover:bg-[#1f3429] border border-white/10 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Sunrise className="w-3.5 h-3.5 text-[#f29f66] shrink-0" />
              <span className="truncate">{t.presetSunrise}</span>
            </button>
            <button
              type="button"
              data-testid="time-preset-noon"
              onClick={() => onJumpToTimePreset?.('noon')}
              className="px-2 py-1.5 rounded-lg bg-[#15241c] hover:bg-[#1f3429] border border-white/10 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Sun className="w-3.5 h-3.5 text-[#f2c464] shrink-0" />
              <span className="truncate">{t.presetNoon}</span>
            </button>
            <button
              type="button"
              data-testid="time-preset-sunset"
              onClick={() => onJumpToTimePreset?.('sunset')}
              className="px-2 py-1.5 rounded-lg bg-[#15241c] hover:bg-[#1f3429] border border-white/10 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Sunset className="w-3.5 h-3.5 text-[#eb7844] shrink-0" />
              <span className="truncate">{t.presetSunset}</span>
            </button>
            <button
              type="button"
              data-testid="time-preset-midnight"
              onClick={() => onJumpToTimePreset?.('midnight')}
              className="px-2 py-1.5 rounded-lg bg-[#15241c] hover:bg-[#1f3429] border border-white/10 text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Moon className="w-3.5 h-3.5 text-[#92b4ed] shrink-0" />
              <span className="truncate">{t.presetMidnight}</span>
            </button>
          </div>

          {/* Time Speed */}
          <div className="mb-3">
            <div className="text-[11px] text-[#a3b7a7] mb-1">{t.timeSpeedLabel}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 5, 20].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => onSetTimeScale?.(spd)}
                  className={`py-1 rounded-md border text-[11px] font-mono-num font-semibold cursor-pointer ${
                    timeScale === spd
                      ? 'bg-[#22392c] border-[#e5a93c]/80 text-[#ffffff]'
                      : 'bg-[#14221a] border-white/10 text-[#b7c8b8] hover:bg-[#1b2e23]'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Configurable Full Day Duration */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-[#cddacb] mb-1">
              <span>{t.dayLengthLabel}</span>
              <span className="font-mono-num text-[#f3f7f0]" dir="ltr">
                {dayDurationSec >= 120
                  ? `${Math.round(dayDurationSec / 60)}${t.minutesShort}`
                  : `${dayDurationSec}${t.secondsShort}`}
              </span>
            </div>
            <input
              type="range"
              min={60}
              max={1200}
              step={30}
              value={dayDurationSec}
              onChange={(e) => onSetDayDuration?.(parseInt(e.target.value, 10))}
              className="w-full accent-[#e5a93c] cursor-pointer"
              data-testid="hud-day-duration-slider"
            />
          </div>
        </div>
      )}

      {/* Configurable Dynamic Weather Popover */}
      {weatherMenuOpen && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          data-testid="weather-controls-popover"
          className="pointer-events-auto z-30 absolute w-76 max-w-[calc(100vw-24px)] p-3.5 rounded-xl bg-[#0d1712]/94 border border-white/16 shadow-2xl text-[#f1f5ee]"
          style={
            isPortraitMobile
              ? {
                  top: 'max(116px, calc(env(safe-area-inset-top, 0px) + 108px))',
                  right: 'max(10px, env(safe-area-inset-right, 0px))',
                }
              : showMobileControls
                ? {
                    top: 'max(116px, calc(env(safe-area-inset-top, 0px) + 14vh))',
                    left: 'max(12px, env(safe-area-inset-left, 0px))',
                  }
                : {
                    top: 'max(74px, calc(env(safe-area-inset-top, 0px) + 64px))',
                    right: 'max(14px, env(safe-area-inset-right, 0px))',
                  }
          }
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-semibold text-[#f3f7f0]">
              {t.weatherControlsTitle}
            </span>
            <button
              type="button"
              data-testid="weather-auto-toggle"
              onClick={() => onSetWeatherDynamic?.(!weatherDynamic)}
              className={`px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer ${
                weatherDynamic
                  ? 'bg-[#1c3226] border-[#7fe094]/45 text-[#9ee8ae]'
                  : 'bg-[#18281f] border-white/12 text-[#e5a93c]'
              }`}
            >
              {weatherDynamic ? t.weatherAutoOn : t.weatherAutoOff}
            </button>
          </div>

          {/* 5 Weather States */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {WEATHER_STATES.map((state) => {
              const active = weatherTarget === state;
              return (
                <button
                  key={state}
                  type="button"
                  data-testid={`weather-btn-${state}`}
                  onClick={() => onSetWeatherState?.(state)}
                  className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#22392c] border-[#e5a93c]/85 text-[#ffffff]'
                      : 'bg-[#15241c] hover:bg-[#1f3429] border-white/10 text-[#cddacb]'
                  }`}
                >
                  <WeatherGlyph state={state} className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{WEATHER_LABELS[lang][state]}</span>
                </button>
              );
            })}
          </div>

          {weatherTransitioning && (
            <div className="mb-2.5 text-[10px] text-[#e5a93c]">
              {t.weatherTransitioningTo(weatherTargetLabel)}
            </div>
          )}

          {/* Rain Density / Performance Quality */}
          <div className="mb-3">
            <div className="text-[11px] text-[#a3b7a7] mb-1">
              {t.weatherQualityLabel}
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
                    data-testid={`weather-quality-${q}`}
                    onClick={() => onSetWeatherQuality?.(q)}
                    className={`py-1 rounded-md border text-[11px] font-medium cursor-pointer ${
                      weatherQuality === q
                        ? 'bg-[#22392c] border-[#e5a93c]/80 text-[#ffffff]'
                        : 'bg-[#14221a] border-white/10 text-[#b7c8b8] hover:bg-[#1b2e23]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configurable Weather Transition Speed */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[11px] text-[#cddacb] mb-1">
              <span>{t.weatherTransitionLabel}</span>
              <span className="font-mono-num text-[#f3f7f0]" dir="ltr">
                {weatherTransitionSec}
                {t.secondsShort}
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={40}
              step={2}
              value={weatherTransitionSec}
              onChange={(e) =>
                onSetWeatherTransitionDuration?.(parseInt(e.target.value, 10))
              }
              className="w-full accent-[#e5a93c] cursor-pointer"
              data-testid="hud-weather-transition-slider"
            />
          </div>

          {/* Manual Lightning & Thunder Trigger */}
          <button
            type="button"
            data-testid="weather-lightning-btn"
            onClick={() => onTriggerLightning?.()}
            className="w-full px-2.5 py-1.5 rounded-lg bg-[#192b22] hover:bg-[#22392c] border border-[#92b4ed]/35 text-[11px] font-medium text-[#dce8fa] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-[#92b4ed]" />
            <span>{t.weatherLightningBtn}</span>
          </button>
        </div>
      )}

      {/* Active Combat Enemy Target Bar */}
      {hud.combatTarget && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="absolute left-1/2 -translate-x-1/2 w-48 sm:w-64 px-3 py-2 rounded-xl bg-[#0d1712]/88 border border-[#e05a47]/45 shadow-lg"
          style={
            isPortraitMobile
              ? { top: 'max(138px, calc(env(safe-area-inset-top, 0px) + 132px))' }
              : { top: 'max(14px, env(safe-area-inset-top, 0px))' }
          }
          data-testid="combat-target-hud"
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold text-[#f5f0ec] mb-1">
            <span className="truncate">
              {isRtl ? hud.combatTarget.nameAr : hud.combatTarget.name}
            </span>
            <span className="font-mono-num text-[10px] sm:text-[11px] text-[#f3b6ad]">
              {hud.combatTarget.health}/{hud.combatTarget.maxHealth}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[#241616] overflow-hidden">
            <div
              className="h-full bg-[#e05a47] transition-[width] duration-100 ease-out"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, (hud.combatTarget.health / hud.combatTarget.maxHealth) * 100),
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* World Notice Toast */}
      {worldNotice && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="absolute left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-[#0d1712]/90 border border-[#e5a93c]/45 text-xs sm:text-sm font-medium text-[#f6f3e8] text-center max-w-[84vw] shadow-lg"
          style={{
            top: isPortraitMobile
              ? 'max(140px, calc(env(safe-area-inset-top, 0px) + 134px))'
              : 'max(68px, calc(env(safe-area-inset-top, 0px) + 8.5vh))',
          }}
          role="status"
        >
          {worldNotice}
        </div>
      )}

      {/* Dynamic Perspective-Aware Crosshair / Interaction Indicator + Compact BOW POWER Meter */}
      <div
        data-testid="hud-crosshair-indicator"
        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-[left,top] duration-75 ease-out"
        style={{
          left: `${hud.indicatorX ?? 50}%`,
          top: `${hud.indicatorY ?? 50}%`,
        }}
        aria-hidden="true"
      >
        {(() => {
          const charging = Boolean(hud.isChargingBow);
          const pct = Math.max(0, Math.min(1, hud.bowChargeProgress ?? 0));
          const maxCharge = Boolean(hud.bowMaxCharge);
          const targetKind = hud.bowTargetType ?? 'none';
          const isHostileOrPrey = targetKind === 'enemy' || targetKind === 'animal';
          const isNpcTarget = targetKind === 'npc';

          // Crosshair arms tighten from spread=3.4 down to 1.4 as charge approaches 1.0
          const outerPos = charging ? 3.5 + (1 - pct) * 2.2 : 4;
          const innerPos = outerPos + 3.4;
          const strokeColor = !charging
            ? 'rgba(255,255,255,0.78)'
            : isHostileOrPrey
              ? 'rgba(248,113,113,0.96)'
              : isNpcTarget
                ? 'rgba(125,211,252,0.94)'
                : maxCharge
                  ? 'rgba(245,193,78,0.98)'
                  : 'rgba(134,239,172,0.92)';
          const dotColor = !charging
            ? 'rgba(255,255,255,0.92)'
            : isHostileOrPrey
              ? 'rgba(248,113,113,1)'
              : isNpcTarget
                ? 'rgba(125,211,252,0.98)'
                : maxCharge
                  ? 'rgba(245,193,78,1)'
                  : 'rgba(255,255,255,0.96)';

          return (
            <svg
              width={charging ? '28' : '24'}
              height={charging ? '28' : '24'}
              viewBox="0 0 24 24"
              fill="none"
            >
              {charging && isHostileOrPrey && (
                <circle
                  cx="12"
                  cy="12"
                  r="8.5"
                  stroke="rgba(248,113,113,0.45)"
                  strokeWidth="1"
                  strokeDasharray="3 2"
                />
              )}
              <circle
                cx="12"
                cy="12"
                r={charging ? (maxCharge ? '2.4' : '2.1') : '2'}
                fill={dotColor}
              />
              <path
                d={`M12 ${outerPos}V${innerPos}M12 ${24 - innerPos}V${24 - outerPos}M${outerPos} 12H${innerPos}M${24 - innerPos} 12H${24 - outerPos}`}
                stroke={strokeColor}
                strokeWidth={charging ? '1.75' : '1.5'}
                strokeLinecap="round"
              />
              <circle
                cx="12"
                cy="12"
                r="2.1"
                stroke="rgba(13,23,18,0.68)"
                strokeWidth="0.75"
              />
            </svg>
          );
        })()}

        {hud.isChargingBow && (() => {
          const pctNum = Math.max(
            0,
            Math.min(100, Math.round((hud.bowChargeProgress ?? 0) * 100)),
          );
          const tierLabel =
            pctNum >= 75
              ? t.bowTierMaximum
              : pctNum >= 50
                ? t.bowTierStrong
                : pctNum >= 25
                  ? t.bowTierLow
                  : t.bowTierWeak;
          const isCreative = hud.worldType === 'creative';
          const arrowText = isCreative ? '∞' : `${hud.arrowCount ?? 0}`;

          return (
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              data-testid="bow-charge-hud"
              className={`mt-2 w-36 sm:w-44 px-2.5 py-1.5 rounded-xl bg-[#0d1712]/90 border shadow-lg ${
                hud.bowMaxCharge
                  ? 'border-[#e5a93c]/95 shadow-[0_0_14px_rgba(229,169,60,0.42)]'
                  : 'border-[#7ee0a0]/55'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold leading-none mb-1">
                <span
                  className={
                    hud.bowMaxCharge ? 'text-[#f6d37a]' : 'text-[#dceee0]'
                  }
                >
                  {t.bowPowerTitle}
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                    pctNum >= 75
                      ? 'bg-[#e5a93c]/25 text-[#f6d37a]'
                      : pctNum >= 50
                        ? 'bg-[#4ade80]/20 text-[#9bf0b8]'
                        : pctNum >= 25
                          ? 'bg-[#38bdf8]/18 text-[#93d9fa]'
                          : 'bg-white/10 text-[#b7c8b8]'
                  }`}
                >
                  {tierLabel}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-[#1a2920] overflow-hidden">
                  <div
                    className={`h-full transition-[width] duration-75 ease-out ${
                      hud.bowMaxCharge
                        ? 'bg-gradient-to-r from-[#e5a93c] to-[#ffe28a]'
                        : pctNum >= 50
                          ? 'bg-gradient-to-r from-[#3fb876] to-[#91f0b5]'
                          : 'bg-gradient-to-r from-[#5a8f7b] to-[#8fd3b8]'
                    }`}
                    style={{
                      width: `${Math.max(4, pctNum)}%`,
                    }}
                  />
                </div>
                <span
                  className="font-mono-num text-[10px] font-bold text-[#eef6ee] w-8 text-right shrink-0"
                  dir="ltr"
                >
                  {pctNum}%
                </span>
              </div>

              <div className="mt-1 flex items-center justify-between text-[9px] text-[#9fb5a3]">
                <span>
                  {t.arrowsLabel}:{' '}
                  <strong className="font-mono-num text-[#e6f0e6]" dir="ltr">
                    {arrowText}
                  </strong>
                </span>
                {!showMobileControls && (
                  <span className="truncate max-w-[100px] text-[#8aa18e]">
                    {t.bowCancelHint}
                  </span>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Desktop Contextual Interaction Prompt */}
      {!showMobileControls && hud.nearbyInteractable && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="absolute bottom-14 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-[#0d1712]/88 border border-[#e5a93c]/50 text-xs sm:text-sm font-medium text-[#f5f8f2] whitespace-nowrap shadow-md"
        >
          {t.pressEPrefix}{' '}
          <span className="font-mono-num font-bold text-[#e5a93c]">E</span>{' '}
          {t.pressEMiddle}{' '}
          {translateInteractableVerb(hud.nearbyInteractable.actionVerb, lang)}{' '}
          {hud.nearbyInteractable.label}
        </div>
      )}

      {/* Compact Mobile Multiplayer Chat Button */}
      {isMultiplayer && showMobileControls && onOpenChat && (
        <button
          type="button"
          onClick={onOpenChat}
          data-testid="mobile-btn-chat"
          className="pointer-events-auto absolute px-3 py-2 rounded-xl bg-[#0d1712]/88 border border-[#e5a93c]/45 text-[#f2f6ef] inline-flex items-center gap-1.5 shadow-lg cursor-pointer"
          style={{
            top: isPortraitMobile
              ? 'max(118px, calc(env(safe-area-inset-top, 0px) + 110px))'
              : 'max(58px, calc(env(safe-area-inset-top, 0px) + 54px))',
            left: 'max(10px, env(safe-area-inset-left, 0px))',
          }}
          aria-label={t.mpRoomChatOpenBtn}
        >
          <MessageSquare className="w-4 h-4 text-[#e5a93c]" />
          <span className="text-[11px] font-display font-bold">{t.mpRoomChatTitle}</span>
          {unreadChatCount > 0 && (
            <span
              dir="ltr"
              className="min-w-[16px] h-4 px-1 rounded-full bg-[#e5a93c] text-[#111914] font-mono-num text-[10px] font-bold flex items-center justify-center"
            >
              {unreadChatCount > 99 ? '99+' : unreadChatCount}
            </span>
          )}
        </button>
      )}

      {/* Desktop Pointer-Lock / Camera Hint */}
      {!showMobileControls && !pointerLocked && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-lg bg-[#0d1712]/78 border border-white/10 text-xs text-[#dce5d8] whitespace-nowrap"
        >
          {t.desktopHint}
        </div>
      )}

      {/* Modular Weapon Loadout & Cooldown HUD */}
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        data-testid="weapon-hud"
        className={`${
          customizeMode ? 'pointer-events-none' : 'pointer-events-auto'
        } absolute rounded-xl bg-[#0d1712]/86 border border-white/14 shadow-lg ${
          isPortraitMobile
            ? 'w-[min(164px,46vw)] px-2 py-1.5'
            : showMobileControls
              ? 'px-2.5 py-2 min-w-[180px] -translate-x-1/2'
              : 'px-3 py-2.5 min-w-[238px]'
        }`}
        style={
          isPortraitMobile
            ? {
                bottom: 'max(10px, env(safe-area-inset-bottom, 0px))',
                left: 'max(10px, env(safe-area-inset-left, 0px))',
              }
            : showMobileControls
              ? {
                  bottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
                  left: '50%',
                }
              : {
                  bottom: 'max(14px, env(safe-area-inset-bottom, 0px))',
                  right: 'max(14px, env(safe-area-inset-right, 0px))',
                }
        }
      >
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#f3f7f0] truncate">
              {hud.equippedWeapon
                ? isRtl
                  ? hud.equippedWeapon.nameAr
                  : hud.equippedWeapon.name
                : t.unarmedLabel}
            </div>
            <div className="text-[10px] font-mono-num text-[#a8bca9]">
              {hud.equippedWeapon
                ? `${hud.equippedWeapon.damage} ${t.damageShort} · ${hud.equippedWeapon.cooldown.toFixed(2)}s ${t.cooldownShort}`
                : `9 ${t.damageShort} · 0.38s ${t.cooldownShort}`}
            </div>
            {hud.equippedWeapon?.isRanged && (
              <div
                data-testid="weapon-arrow-count"
                className={`text-[10px] font-medium mt-0.5 ${
                  hud.worldType !== 'creative' && (hud.arrowCount ?? 0) <= 0
                    ? 'text-[#f87171]'
                    : 'text-[#d9e7d6]'
                }`}
              >
                {hud.worldType !== 'creative' && (hud.arrowCount ?? 0) <= 0
                  ? t.bowNoArrowsShort
                  : `${t.arrowsLabel}: ${hud.worldType === 'creative' ? '∞' : (hud.arrowCount ?? 0)}`}
              </div>
            )}
          </div>

          {hud.equippedWeapon && onUnequipWeapon && (
            <button
              type="button"
              data-testid="weapon-unequip-btn"
              onClick={onUnequipWeapon}
              className="px-2 py-1 rounded-md bg-[#1a2921] hover:bg-[#24392e] border border-white/12 text-[10px] font-medium text-[#d7e2d5] cursor-pointer shrink-0"
              title={t.unequipItem}
            >
              {t.unequipShort}
            </button>
          )}
        </div>

        {/* Attack Cooldown Bar */}
        <div className="h-1 rounded-full bg-[#1a2a21] overflow-hidden mb-1.5">
          <div
            className="h-full bg-[#e5a93c] transition-[width] duration-75 ease-linear"
            style={{
              width: `${Math.round((1 - (hud.weaponCooldownRatio ?? 0)) * 100)}%`,
            }}
          />
        </div>

        {/* Equipped Weapon Durability */}
        {hud.equippedWeapon?.maxDurability &&
          hud.equippedWeapon.durability !== undefined && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1 rounded-full bg-[#1a2a21] overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-150 ${
                    hud.equippedWeapon.durability / hud.equippedWeapon.maxDurability < 0.25
                      ? 'bg-[#e05a47]'
                      : 'bg-[#7cd6b8]'
                  }`}
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        (hud.equippedWeapon.durability / hud.equippedWeapon.maxDurability) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <span className="font-mono-num text-[9px] text-[#9fb5a3]">
                {hud.equippedWeapon.durability}/{hud.equippedWeapon.maxDurability}
              </span>
            </div>
          )}

        {/* Owned Weapon Quick-Switch Slots */}
        {hud.ownedWeapons && hud.ownedWeapons.length > 0 && (
          <div className="flex items-center gap-1 sm:gap-1.5">
            {hud.ownedWeapons.map((weapon, idx) => {
              const active = weapon.equipped;
              return (
                <button
                  key={weapon.itemId}
                  type="button"
                  data-testid={`weapon-slot-btn-${weapon.itemId}`}
                  onClick={() => {
                    if (!weapon.equipped) {
                      onSelectWeaponSlot?.(weapon.slotIndex);
                    }
                  }}
                  aria-pressed={active}
                  className={`flex-1 min-w-[38px] sm:min-w-[54px] px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#22392c] border-[#e5a93c]/85 text-[#ffffff]'
                      : 'bg-[#121f18] border-white/10 text-[#b7c8b8] hover:bg-[#192b21]'
                  }`}
                >
                  {!showMobileControls && (
                    <span className="font-mono-num text-[10px] text-[#e5a93c]">
                      {idx + 1}
                    </span>
                  )}
                  <WeaponMiniGlyph kind={weapon.kind} />
                </button>
              );
            })}
          </div>
        )}

        {!showMobileControls && (
          <div className="mt-1.5 text-[10px] text-[#8fa593] text-center">
            {t.weaponSwitchKeyHint}
          </div>
        )}
      </div>

      {/* Exact 5.0-Second Sleep Fade-To-Black Overlay */}
      {hud.isSleeping && (
        <div
          data-testid="sleep-transition-overlay"
          className="fixed inset-0 z-50 bg-[#040705] flex items-center justify-center pointer-events-auto"
          style={{
            opacity: Math.min(
              1,
              Math.sin(Math.max(0, Math.min(1, hud.sleepProgress ?? 0)) * Math.PI) * 1.45,
            ),
          }}
        >
          <div dir={isRtl ? 'rtl' : 'ltr'} className="px-6 py-3 text-center select-none">
            <Moon className="w-8 h-8 text-[#92b4ed] mx-auto mb-3 animate-pulse" />
            <p className="font-display text-xl sm:text-2xl font-bold tracking-wide text-[#eef3ed]">
              {t.sleepTransitionLabel}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const WeaponMiniGlyph: React.FC<{ kind: WeaponSlotHudView['kind'] }> = ({ kind }) => {
  if (kind === 'axe') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 19 16 8" />
        <path d="M12.5 5.5c2.8-1 5.8.2 6.8 3-.7 2.1-2.5 3.6-4.7 3.9L12.5 5.5Z" />
      </svg>
    );
  }
  if (kind === 'bow') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 18C13.5 18 18 13.5 18 6" />
        <path d="M6 18 18 6" strokeOpacity="0.6" />
        <path d="M9 15 19.5 4.5" />
      </svg>
    );
  }
  if (kind === 'spear') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4.5 19.5 17 7" />
        <path d="m14.5 5 4.5-.5-.5 4.5-2.5 1-2.5-2.5 1-2.5Z" />
      </svg>
    );
  }
  if (kind === 'crossbow') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14" />
        <path d="M14 5c3.2 2.4 3.2 11.6 0 14" />
      </svg>
    );
  }
  if (kind === 'knife') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5.5 18.5 10 14" />
        <path d="m10 14 7.5-7.5c.8 1.8.4 4.2-1.2 5.8L12 16.5 10 14Z" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19.5 4.5 9 15" />
      <path d="m6.5 12.5 5 5" />
      <path d="m4.5 19.5 3-3" />
    </svg>
  );
};


const WeatherGlyph: React.FC<{ state: WeatherState; className?: string }> = ({
  state,
  className = 'w-4 h-4',
}) => {
  switch (state) {
    case 'cloudy':
      return <Cloud className={`${className} text-[#c5d4e2]`} />;
    case 'rain':
      return <CloudRain className={`${className} text-[#7fb7eb]`} />;
    case 'storm':
      return <CloudLightning className={`${className} text-[#92b4ed]`} />;
    case 'fog':
      return <CloudFog className={`${className} text-[#b7c8ce]`} />;
    case 'clear':
    default:
      return <Sun className={`${className} text-[#f2c464]`} />;
  }
};
