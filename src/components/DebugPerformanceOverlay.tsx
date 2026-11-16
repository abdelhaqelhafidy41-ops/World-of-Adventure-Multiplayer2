import React from 'react';
import { X } from 'lucide-react';
import type { DebugPerformanceSnapshot } from '../game/engine/GraphicsQualityManager';
import { UI_TEXT, type Language } from '../game/i18n/translations';

interface DebugPerformanceOverlayProps {
  snapshot: DebugPerformanceSnapshot;
  lang: Language;
  onClose: () => void;
}

export const DebugPerformanceOverlay: React.FC<DebugPerformanceOverlayProps> = ({
  snapshot,
  lang,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const fpsColor =
    snapshot.fps >= 48
      ? 'text-[#7fe094]'
      : snapshot.fps >= 26
        ? 'text-[#e5a93c]'
        : 'text-[#f07167]';

  const formatNumber = (n: number): string =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(2)}M`
      : n >= 10_000
        ? `${(n / 1000).toFixed(1)}k`
        : String(n);

  const presetSuffix =
    snapshot.preset === 'auto'
      ? `auto → ${snapshot.effectiveTier}${
          snapshot.dynamicLevelOffset !== 0 ? ` (${snapshot.dynamicLevelOffset})` : ''
        }`
      : snapshot.effectiveTier;

  return (
    <aside
      dir={isRtl ? 'rtl' : 'ltr'}
      data-testid="debug-performance-overlay"
      className="fixed z-50 w-[238px] sm:w-[264px] rounded-xl bg-[#0b1510]/88 border border-[#2f493b] text-[#e6efe4] shadow-2xl p-2.5 sm:p-3 pointer-events-none select-none"
      style={{
        top: 'max(0.75rem, env(safe-area-inset-top))',
        left: 'max(0.75rem, env(safe-area-inset-left))',
      }}
    >
      <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-[#24382d]">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-wide text-[#e5a93c] uppercase truncate">
            {t.debugPerfTitle}
          </div>
          <div className="text-[10px] text-[#9cb0a0] truncate">
            {t.debugPerfCloseHint}
          </div>
        </div>
        <button
          type="button"
          data-testid="close-debug-overlay-btn"
          onClick={onClose}
          className="pointer-events-auto p-1 rounded bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-[#cddacb] cursor-pointer"
          aria-label={t.closeBtn}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 text-[11px] font-mono-num" dir="ltr">
        <div className="flex items-center justify-between col-span-2 bg-[#122019] rounded px-2 py-1">
          <span className="text-[#a8bca9]">{t.debugFps}</span>
          <span className={`font-bold ${fpsColor}`} data-testid="debug-fps-value">
            {Math.round(snapshot.fps)} (min {Math.round(snapshot.minFps)})
          </span>
        </div>

        <MetricRow
          label={t.debugFrameTime}
          value={`${snapshot.frameTimeMs.toFixed(1)} ms`}
        />
        <MetricRow
          label={t.debugRenderScale}
          value={`${Math.round(snapshot.renderScale * 100)}% (${snapshot.pixelRatio.toFixed(2)}x)`}
        />

        <MetricRow
          label={t.debugDrawCalls}
          value={String(snapshot.drawCalls)}
          testId="debug-draw-calls"
        />
        <MetricRow
          label={t.debugTriangles}
          value={formatNumber(snapshot.triangles)}
          testId="debug-triangles"
        />

        <MetricRow label={t.debugGeometries} value={String(snapshot.geometries)} />
        <MetricRow label={t.debugTextures} value={String(snapshot.textures)} />

        <MetricRow
          label={t.debugHeap}
          value={snapshot.jsHeapMb !== null ? `${snapshot.jsHeapMb} MB` : 'N/A'}
        />
        <MetricRow label={t.debugObjects} value={String(snapshot.activeObjects)} />

        <MetricRow label={t.debugNpcs} value={String(snapshot.activeNpcs)} />
        <MetricRow label={t.debugAnimals} value={String(snapshot.activeAnimals)} />

        <MetricRow
          label={t.debugChunks}
          value={`${snapshot.activeChunks}/${snapshot.loadedChunks}`}
        />
        <MetricRow
          label={t.debugMode}
          value={snapshot.graphicsMode}
        />

        <div className="col-span-2 flex items-center justify-between pt-1 mt-0.5 border-t border-[#24382d] text-[10px]">
          <span className="text-[#9cb0a0]">{t.debugQuality}</span>
          <span className="text-[#f5d282] font-semibold truncate max-w-[165px]">
            {presetSuffix}
          </span>
        </div>

        <div className="col-span-2 flex items-center justify-between text-[10px] text-[#9cb0a0]">
          <span>{snapshot.deviceClass}</span>
          <span className="truncate max-w-[175px]" title={snapshot.gpuName}>
            {snapshot.gpuName}
          </span>
        </div>
      </div>
    </aside>
  );
};

const MetricRow: React.FC<{
  label: string;
  value: string;
  testId?: string;
}> = ({ label, value, testId }) => (
  <div className="flex items-center justify-between gap-1 min-w-0">
    <span className="text-[#9cb0a0] truncate">{label}</span>
    <span className="text-[#eef5ec] font-medium shrink-0" data-testid={testId}>
      {value}
    </span>
  </div>
);
