import React, { useEffect, useMemo, useRef } from 'react';
import { UI_TEXT, type Language } from '../game/i18n/translations';
import {
  MapManager,
  type MapWaypoint,
  type MapWorldData,
} from '../game/world/MapManager';

interface MiniMapWidgetProps {
  playerX: number;
  playerZ: number;
  headingDeg: number;
  mapManager: MapManager | null;
  mapData: MapWorldData | null;
  waypoint?: MapWaypoint | null;
  rotateWithPlayer: boolean;
  lang: Language;
  sizePx: number;
  radiusMeters?: number;
  circular?: boolean;
  showWaypointPill?: boolean;
  testId?: string;
  onOpenMap: () => void;
}

export const MiniMapWidget: React.FC<MiniMapWidgetProps> = ({
  playerX,
  playerZ,
  headingDeg,
  mapManager: externalMapManager,
  mapData,
  waypoint = null,
  rotateWithPlayer,
  lang,
  sizePx,
  radiusMeters = 200,
  circular = false,
  showWaypointPill = true,
  testId = 'hud-minimap',
  onOpenMap,
}) => {
  const t = UI_TEXT[lang];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackManagerRef = useRef<MapManager | null>(null);
  if (!externalMapManager && !fallbackManagerRef.current) {
    fallbackManagerRef.current = new MapManager();
  }
  const mapManager = externalMapManager ?? fallbackManagerRef.current!;

  const activeWaypoint = waypoint ?? mapData?.waypoint ?? null;

  const markers = useMemo(() => {
    if (!mapData) return [];
    return mapManager.buildMarkers({
      ...mapData,
      waypoint: activeWaypoint,
      lang,
    });
  }, [mapManager, mapData, activeWaypoint, lang]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapData) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(sizePx * dpr);
    const targetH = Math.round(sizePx * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    mapManager.renderMiniMap(
      ctx,
      sizePx,
      dpr,
      mapData.seed,
      mapData.villageSite,
      {
        playerX,
        playerZ,
        headingDeg,
        markers,
        npcs: mapData.npcs,
        animals: mapData.animals,
        villages: mapData.villages,
        waypoint: activeWaypoint,
        rotateWithPlayer,
        circular,
        radiusMeters,
        lang,
        elapsedSec: performance.now() * 0.001,
      },
    );
  }, [
    mapManager,
    mapData,
    markers,
    playerX,
    playerZ,
    headingDeg,
    activeWaypoint,
    rotateWithPlayer,
    circular,
    radiusMeters,
    sizePx,
    lang,
  ]);

  const waypointDistance = activeWaypoint
    ? Math.round(Math.hypot(activeWaypoint.x - playerX, activeWaypoint.z - playerZ))
    : null;

  const stopProp = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="pointer-events-auto relative inline-flex flex-col items-center shrink-0"
      onPointerDown={stopProp}
      onPointerUp={stopProp}
      onMouseDown={stopProp}
      onTouchStart={stopProp}
    >
      <button
        type="button"
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          onOpenMap();
        }}
        onPointerDown={stopProp}
        onTouchStart={stopProp}
        aria-label={t.worldMap}
        title={t.miniMapTitle}
        style={{ width: sizePx, height: sizePx }}
        className={`relative block overflow-hidden bg-[#07110d] border border-[#e5a93c]/50 hover:border-[#e5a93c] shadow-lg transition-colors cursor-pointer ${
          circular ? 'rounded-full' : 'rounded-xl'
        }`}
      >
        <canvas
          ref={canvasRef}
          style={{ width: sizePx, height: sizePx }}
          className="block w-full h-full pointer-events-none"
        />
      </button>

      {showWaypointPill && waypointDistance !== null && (
        <div
          data-testid="minimap-waypoint-distance"
          dir="ltr"
          className="mt-1 px-1.5 py-0.5 rounded-md bg-[#0a1820]/92 border border-[#38bdf8]/45 text-[9px] font-mono-num font-semibold text-[#bae6fd] leading-none flex items-center gap-1 pointer-events-none"
        >
          <span className="inline-block w-1.5 h-1.5 rotate-45 bg-[#38bdf8]" />
          <span>{waypointDistance}m</span>
        </div>
      )}
    </div>
  );
};
