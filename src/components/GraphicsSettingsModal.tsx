import React from 'react';
import { Activity, Cpu, RotateCcw, Sliders, X } from 'lucide-react';
import type {
  AntiAliasingMode,
  ConcreteQualityTier,
  EffectsQualityTier,
  FpsLimitOption,
  GraphicsMode,
  GraphicsSettings,
  HardwareCapabilityProfile,
  PostProcessingTier,
  QualityPreset,
  RenderScaleSetting,
  ResolvedGraphicsProfile,
  SettingAutoOr,
  ShadowQualityTier,
  TextureQualityTier,
  VegetationDensityTier,
  ViewDistanceTier,
  WaterQualityTier,
} from '../game/engine/GraphicsQualityManager';
import { UI_TEXT, type Language } from '../game/i18n/translations';

interface GraphicsSettingsModalProps {
  settings: GraphicsSettings;
  profile: ResolvedGraphicsProfile;
  hardware: HardwareCapabilityProfile | null;
  debugOverlayOpen: boolean;
  lang: Language;
  onUpdate: (partial: Partial<GraphicsSettings>) => void;
  onResetAuto: () => void;
  onToggleDebugOverlay: () => void;
  onClose: () => void;
}

export const GraphicsSettingsModal: React.FC<GraphicsSettingsModalProps> = ({
  settings,
  profile,
  hardware,
  debugOverlayOpen,
  lang,
  onUpdate,
  onResetAuto,
  onToggleDebugOverlay,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const tierLabel = (tier: ConcreteQualityTier | 'auto' | 'off'): string => {
    switch (tier) {
      case 'auto':
        return t.tierAuto;
      case 'very-low':
        return t.tierVeryLow;
      case 'low':
        return t.tierLow;
      case 'medium':
        return t.tierMedium;
      case 'high':
        return t.tierHigh;
      case 'ultra':
        return t.tierUltra;
      case 'off':
        return t.tierOff;
    }
  };

  const deviceLabel = (cls: 'desktop' | 'mobile' | 'tablet') => {
    if (cls === 'mobile') return t.deviceMobile;
    if (cls === 'tablet') return t.deviceTablet;
    return t.deviceDesktop;
  };

  const modeOptions: Array<{ value: GraphicsMode; label: string }> = [
    { value: 'balanced', label: t.modeBalanced },
    { value: 'performance', label: t.modePerformance },
    { value: 'quality', label: t.modeQuality },
  ];

  const presetOptions: QualityPreset[] = [
    'auto',
    'very-low',
    'low',
    'medium',
    'high',
    'ultra',
  ];

  const renderScaleOptions: RenderScaleSetting[] = [
    'auto',
    0.5,
    0.6,
    0.7,
    0.8,
    0.9,
    1.0,
  ];

  const viewDistanceOptions: Array<SettingAutoOr<ViewDistanceTier>> = [
    'auto',
    'very-low',
    'low',
    'medium',
    'high',
    'ultra',
  ];

  const shadowOptions: Array<SettingAutoOr<ShadowQualityTier>> = [
    'auto',
    'off',
    'low',
    'medium',
    'high',
  ];

  const textureOptions: Array<SettingAutoOr<TextureQualityTier>> = [
    'auto',
    'low',
    'medium',
    'high',
  ];

  const vegetationOptions: Array<SettingAutoOr<VegetationDensityTier>> = [
    'auto',
    'very-low',
    'low',
    'medium',
    'high',
    'ultra',
  ];

  const effectsOptions: Array<SettingAutoOr<EffectsQualityTier>> = [
    'auto',
    'very-low',
    'low',
    'medium',
    'high',
  ];

  const waterOptions: Array<SettingAutoOr<WaterQualityTier>> = [
    'auto',
    'low',
    'medium',
    'high',
  ];

  const postOptions: Array<SettingAutoOr<PostProcessingTier>> = [
    'auto',
    'off',
    'low',
    'medium',
    'high',
  ];

  const aaOptions: Array<{ value: SettingAutoOr<AntiAliasingMode>; label: string }> = [
    { value: 'auto', label: t.tierAuto },
    { value: 'off', label: t.aaOff },
    { value: 'fxaa', label: t.aaFxaa },
    { value: 'msaa', label: t.aaMsaa },
  ];

  const fpsOptions: Array<{ value: FpsLimitOption; label: string }> = [
    { value: 30, label: '30' },
    { value: 40, label: '40' },
    { value: 60, label: '60' },
    { value: 90, label: '90' },
    { value: 120, label: '120' },
    { value: 0, label: t.fpsUncapped },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09110d]/78 p-3 sm:p-5 mobile-hud-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="graphics-settings-title"
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        data-testid="graphics-settings-modal"
        className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16] border border-[#2a3f33] text-[#f1f5ee] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#24382d] shrink-0">
          <div className="flex items-start gap-2.5">
            <Sliders className="w-5 h-5 text-[#e5a93c] mt-0.5 shrink-0" />
            <div>
              <h2
                id="graphics-settings-title"
                className="font-display text-lg sm:text-xl font-bold tracking-tight"
              >
                {t.graphicsSettingsTitle}
              </h2>
              <p className="text-xs text-[#9cb0a0] mt-0.5">
                {t.graphicsSettingsSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="close-graphics-settings-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#192b22] hover:bg-[#22392d] border border-[#2f493b] text-[#cddacb] transition-colors cursor-pointer"
            aria-label={t.closeBtn}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Hardware & Active Tier Summary */}
          <div className="rounded-xl bg-[#14231b] border border-[#273d31] px-3.5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Cpu className="w-4 h-4 text-[#7fe094] shrink-0" />
              <div className="min-w-0">
                <div className="text-[#9cb0a0] text-[11px]">{t.hardwareProfileLabel}</div>
                <div className="font-medium text-[#eef5ec] truncate">
                  {deviceLabel(profile.deviceClass)}
                  {hardware?.gpuName ? ` · ${hardware.gpuName}` : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[#9cb0a0]">{t.effectiveTierLabel}:</span>
              <span
                data-testid="effective-tier-badge"
                className="px-2.5 py-0.5 rounded-md bg-[#22392c] border border-[#e5a93c]/60 text-[#f5d282] font-semibold"
              >
                {tierLabel(profile.effectiveTier)}
              </span>
            </div>
          </div>

          {/* Quality Preset */}
          <OptionGroup
            label={t.graphicsPresetLabel}
            options={presetOptions.map((v) => ({
              value: v,
              label: tierLabel(v),
            }))}
            selected={settings.preset}
            onSelect={(preset) => onUpdate({ preset })}
            columnsClass="grid-cols-3 sm:grid-cols-6"
            testIdPrefix="preset"
          />

          {/* Graphics Mode */}
          <OptionGroup
            label={t.graphicsModeLabel}
            options={modeOptions}
            selected={settings.graphicsMode}
            onSelect={(graphicsMode) => onUpdate({ graphicsMode })}
            columnsClass="grid-cols-3"
            testIdPrefix="mode"
          />

          {/* Render Scale */}
          <OptionGroup
            label={t.renderScaleLabel}
            sublabel={`${Math.round(profile.renderScale * 100)}% · DPR ${profile.pixelRatio.toFixed(2)}`}
            options={renderScaleOptions.map((v) => ({
              value: String(v),
              label: v === 'auto' ? t.tierAuto : `${Math.round(v * 100)}%`,
            }))}
            selected={String(settings.renderScale)}
            onSelect={(val) =>
              onUpdate({
                renderScale:
                  val === 'auto' ? 'auto' : (parseFloat(val) as RenderScaleSetting),
              })
            }
            columnsClass="grid-cols-3 min-[380px]:grid-cols-4 sm:grid-cols-7"
            testIdPrefix="renderscale"
          />

          {/* View Distance & Vegetation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OptionGroup
              label={t.viewDistanceLabel}
              options={viewDistanceOptions.map((v) => ({
                value: v,
                label: tierLabel(v),
              }))}
              selected={settings.viewDistance}
              onSelect={(viewDistance) => onUpdate({ viewDistance })}
              columnsClass="grid-cols-3"
              testIdPrefix="viewdist"
            />
            <OptionGroup
              label={t.vegetationDensityLabel}
              options={vegetationOptions.map((v) => ({
                value: v,
                label: tierLabel(v),
              }))}
              selected={settings.vegetationDensity}
              onSelect={(vegetationDensity) => onUpdate({ vegetationDensity })}
              columnsClass="grid-cols-3"
              testIdPrefix="vegetation"
            />
          </div>

          {/* Shadows & Textures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OptionGroup
              label={t.shadowQualityLabel}
              options={shadowOptions.map((v) => ({
                value: v,
                label: tierLabel(v),
              }))}
              selected={settings.shadowQuality}
              onSelect={(shadowQuality) => onUpdate({ shadowQuality })}
              columnsClass="grid-cols-3 sm:grid-cols-5"
              testIdPrefix="shadows"
            />
            <OptionGroup
              label={t.textureQualityLabel}
              options={textureOptions.map((v) => ({
                value: v,
                label: tierLabel(v),
              }))}
              selected={settings.textureQuality}
              onSelect={(textureQuality) => onUpdate({ textureQuality })}
              columnsClass="grid-cols-2 sm:grid-cols-4"
              testIdPrefix="textures"
            />
          </div>

          {/* Effects & Water */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OptionGroup
              label={t.effectsQualityLabel}
              options={effectsOptions.map((v) => ({
                value: v,
                label: tierLabel(v),
              }))}
              selected={settings.effectsQuality}
              onSelect={(effectsQuality) => onUpdate({ effectsQuality })}
              columnsClass="grid-cols-3"
              testIdPrefix="effects"
            />
            <OptionGroup
              label={t.waterQualityLabel}
              options={waterOptions.map((v) => ({
                value: v,
                label: tierLabel(v),
              }))}
              selected={settings.waterQuality}
              onSelect={(waterQuality) => onUpdate({ waterQuality })}
              columnsClass="grid-cols-2 sm:grid-cols-4"
              testIdPrefix="water"
            />
          </div>

          {/* Post Processing & Anti-Aliasing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OptionGroup
              label={t.postProcessingLabel}
              options={postOptions.map((v) => ({
                value: v,
                label: tierLabel(v),
              }))}
              selected={settings.postProcessing}
              onSelect={(postProcessing) => onUpdate({ postProcessing })}
              columnsClass="grid-cols-3 sm:grid-cols-5"
              testIdPrefix="post"
            />
            <OptionGroup
              label={t.antiAliasingLabel}
              options={aaOptions}
              selected={settings.antiAliasing}
              onSelect={(antiAliasing) => onUpdate({ antiAliasing })}
              columnsClass="grid-cols-2 sm:grid-cols-4"
              testIdPrefix="aa"
            />
          </div>

          {/* FPS Limit */}
          <OptionGroup
            label={t.fpsLimitLabel}
            options={fpsOptions.map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
            selected={String(settings.fpsLimit)}
            onSelect={(val) =>
              onUpdate({ fpsLimit: parseInt(val, 10) as FpsLimitOption })
            }
            columnsClass="grid-cols-3 sm:grid-cols-6"
            testIdPrefix="fpslimit"
          />

          {/* Performance Debug Overlay Toggle (great for mobile without F3 key) */}
          <div className="rounded-xl bg-[#14231b] border border-[#273d31] px-3.5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Activity className="w-4 h-4 text-[#e5a93c] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#eef5ec]">
                  {t.showDebugOverlayLabel}
                </div>
                <div className="text-[11px] text-[#9cb0a0] mt-0.5">
                  {t.showDebugOverlayDesc}
                </div>
              </div>
            </div>
            <button
              type="button"
              data-testid="toggle-debug-overlay-btn"
              onClick={onToggleDebugOverlay}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                debugOverlayOpen
                  ? 'bg-[#22392c] border-[#7fe094] text-[#7fe094]'
                  : 'bg-[#192b22] border-[#2f493b] text-[#cddacb] hover:bg-[#22392d]'
              }`}
            >
              {debugOverlayOpen ? t.touchOn : t.touchOff}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#24382d] bg-[#0e1813] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            data-testid="reset-graphics-auto-btn"
            onClick={onResetAuto}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#192b22] hover:bg-[#22392d] border border-[#2f493b] text-xs font-medium text-[#e4ece1] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#e5a93c]" />
            <span>{t.resetGraphicsAutoBtn}</span>
          </button>

          <button
            type="button"
            data-testid="done-graphics-settings-btn"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
};

interface OptionGroupProps<T extends string> {
  label: string;
  sublabel?: string;
  options: Array<{ value: T; label: string }>;
  selected: T;
  onSelect: (val: T) => void;
  columnsClass: string;
  testIdPrefix: string;
}

function OptionGroup<T extends string>({
  label,
  sublabel,
  options,
  selected,
  onSelect,
  columnsClass,
  testIdPrefix,
}: OptionGroupProps<T>) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-semibold text-[#dce6d8]">{label}</span>
        {sublabel && (
          <span className="text-[11px] font-mono-num text-[#9cb0a0]" dir="ltr">
            {sublabel}
          </span>
        )}
      </div>
      <div className={`grid ${columnsClass} gap-1.5`}>
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <button
              key={opt.value}
              type="button"
              data-testid={`gfx-${testIdPrefix}-${opt.value}`}
              onClick={() => onSelect(opt.value)}
              className={`px-2 py-1.5 rounded-lg border text-[11px] sm:text-xs font-medium transition-colors cursor-pointer truncate ${
                active
                  ? 'bg-[#22392c] border-[#e5a93c]/85 text-[#ffffff]'
                  : 'bg-[#16261d] hover:bg-[#1e3328] border-[#2c4637] text-[#b9cab9]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
