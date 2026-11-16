import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  Map as MapIcon,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { getBiomeAt } from '../game/math/noise';
import type { BiomeType } from '../game/types';
import {
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MapManager,
  type MapMarker,
  type MapMarkerCategory,
  type MapWaypoint,
  type MapWorldData,
} from '../game/world/MapManager';
import {
  BIOME_LABELS,
  CARDINAL_LABELS,
  UI_TEXT,
  type Language,
} from '../game/i18n/translations';

interface WorldMapModalProps {
  playerX: number;
  playerZ: number;
  headingDeg: number;
  biome: BiomeType;
  mapManager: MapManager | null;
  mapData: MapWorldData | null;
  waypoint?: MapWaypoint | null;
  miniMapRotate?: boolean;
  lang: Language;
  onSetWaypoint?: (wp: MapWaypoint) => void;
  onClearWaypoint?: () => void;
  onToggleMiniMapRotate?: () => void;
  onClose: () => void;
}

interface HoverInfo {
  marker: MapMarker;
  sx: number;
  sy: number;
}

function getCardinal(deg: number, lang: Language): string {
  const dirs = CARDINAL_LABELS[lang];
  const idx = Math.round(((deg % 360) / 45)) % 8;
  return dirs[idx];
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  playerX,
  playerZ,
  headingDeg,
  biome,
  mapManager: externalMapManager,
  mapData,
  waypoint = null,
  miniMapRotate = false,
  lang,
  onSetWaypoint,
  onClearWaypoint,
  onToggleMiniMapRotate,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const fallbackManagerRef = useRef<MapManager | null>(null);
  if (!externalMapManager && !fallbackManagerRef.current) {
    fallbackManagerRef.current = new MapManager();
  }
  const mapManager = externalMapManager ?? fallbackManagerRef.current!;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewSizeRef = useRef<{ width: number; height: number; dpr: number }>({
    width: 960,
    height: 600,
    dpr: 1,
  });

  const [zoomDisplay, setZoomDisplay] = useState(() => mapManager.getZoom());
  const [cursorCoords, setCursorCoords] = useState<{ x: number; z: number } | null>(
    null,
  );
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [pendingWaypoint, setPendingWaypoint] = useState<{
    x: number;
    z: number;
    sx: number;
    sy: number;
  } | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<MapMarkerCategory>>(
    () => new Set(),
  );
  const [legendOpen, setLegendOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true,
  );
  const [isDragging, setIsDragging] = useState(false);

  const activeWaypoint = waypoint ?? mapData?.waypoint ?? null;

  // Center gently on player when first opened if zoom is default
  const initializedCenterRef = useRef(false);
  useEffect(() => {
    if (!initializedCenterRef.current) {
      initializedCenterRef.current = true;
      mapManager.centerOn(playerX * 0.35, playerZ * 0.35);
      setZoomDisplay(mapManager.getZoom());
    }
  }, [mapManager, playerX, playerZ]);

  const markers = useMemo(() => {
    if (!mapData) return [];
    return mapManager.buildMarkers({
      ...mapData,
      waypoint: activeWaypoint,
      lang,
    });
  }, [mapManager, mapData, activeWaypoint, lang]);

  // Keep latest render props in a ref so animation loop stays smooth at 60fps
  const renderStateRef = useRef({
    playerX,
    playerZ,
    headingDeg,
    markers,
    hoverId: null as string | null,
    selectedId: null as string | null,
    hiddenCategories,
    lang,
    mapData,
    waypoint: activeWaypoint,
  });

  renderStateRef.current = {
    playerX,
    playerZ,
    headingDeg,
    markers,
    hoverId: hoverInfo?.marker.id ?? null,
    selectedId: selectedMarker?.id ?? null,
    hiddenCategories,
    lang,
    mapData,
    waypoint: activeWaypoint,
  };

  // Drag & multi-touch state
  const pointerStateRef = useRef<{
    activePointers: Map<number, { x: number; y: number }>;
    isPanning: boolean;
    lastX: number;
    lastY: number;
    dragDist: number;
    pinchStartDist: number;
    pinchLastDist: number;
  }>({
    activePointers: new Map(),
    isPanning: false,
    lastX: 0,
    lastY: 0,
    dragDist: 0,
    pinchStartDist: 0,
    pinchLastDist: 0,
  });

  const heldKeysRef = useRef<Set<string>>(new Set());

  const syncZoomDisplay = useCallback(() => {
    setZoomDisplay(mapManager.getZoom());
  }, [mapManager]);

  const handleZoomIn = useCallback(() => {
    mapManager.setZoomCentered(mapManager.getZoom() * 1.32);
    syncZoomDisplay();
  }, [mapManager, syncZoomDisplay]);

  const handleZoomOut = useCallback(() => {
    mapManager.setZoomCentered(mapManager.getZoom() / 1.32);
    syncZoomDisplay();
  }, [mapManager, syncZoomDisplay]);

  const handleCenterPlayer = useCallback(() => {
    mapManager.centerOn(playerX, playerZ, Math.max(mapManager.getZoom(), 1.8));
    syncZoomDisplay();
  }, [mapManager, playerX, playerZ, syncZoomDisplay]);

  const handleResetView = useCallback(() => {
    mapManager.resetView();
    setSelectedMarker(null);
    setPendingWaypoint(null);
    syncZoomDisplay();
  }, [mapManager, syncZoomDisplay]);

  const toggleCategory = useCallback((cat: MapMarkerCategory) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  // ResizeObserver for crisp full-screen DPR canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      viewSizeRef.current = { width, height, dpr };
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Keyboard pan/zoom while map is open (never swallows KeyM or Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM' || e.code === 'Escape') {
        return;
      }
      if (
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        e.preventDefault();
        heldKeysRef.current.add(e.code);
        return;
      }
      if (!e.repeat) {
        if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          handleZoomOut();
        } else if (e.code === 'KeyC') {
          e.preventDefault();
          handleCenterPlayer();
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          handleResetView();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.code);
    };

    const onBlur = () => {
      heldKeysRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleCenterPlayer, handleResetView, handleZoomIn, handleZoomOut]);

  // Continuous 60fps map render + smooth keyboard pan loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Keyboard pan scaled inversely by zoom
      const keys = heldKeysRef.current;
      const panX =
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const panZ =
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);

      if (panX !== 0 || panZ !== 0) {
        const panSpeedMeters = 280 / Math.max(0.6, mapManager.getZoom());
        const len = Math.hypot(panX, panZ) || 1;
        mapManager.panByMeters(
          (panX / len) * panSpeedMeters * dt,
          (panZ / len) * panSpeedMeters * dt,
        );
      }

      const canvas = canvasRef.current;
      const state = renderStateRef.current;
      if (canvas && state.mapData) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const { width, height, dpr } = viewSizeRef.current;
          mapManager.render(
            ctx,
            width,
            height,
            dpr,
            state.mapData.seed,
            state.mapData.villageSite,
            {
              playerX: state.playerX,
              playerZ: state.playerZ,
              headingDeg: state.headingDeg,
              markers: state.markers,
              hoveredMarkerId: state.hoverId,
              selectedMarkerId: state.selectedId,
              hiddenCategories: state.hiddenCategories,
              villages: state.mapData.villages,
              waypoint: state.waypoint,
              lang: state.lang,
              elapsedSec: now / 1000,
            },
          );
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [mapManager]);

  const getLocalCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 0, sy: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      sx: clientX - rect.left,
      sy: clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = getLocalCoords(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);

    const ps = pointerStateRef.current;
    ps.activePointers.set(e.pointerId, { x: sx, y: sy });

    if (ps.activePointers.size === 1) {
      ps.isPanning = true;
      ps.lastX = sx;
      ps.lastY = sy;
      ps.dragDist = 0;
      setIsDragging(true);
    } else if (ps.activePointers.size === 2) {
      ps.isPanning = false;
      const pts = Array.from(ps.activePointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      ps.pinchStartDist = dist;
      ps.pinchLastDist = dist;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = getLocalCoords(e.clientX, e.clientY);
    const { width, height } = viewSizeRef.current;
    const ps = pointerStateRef.current;

    const worldPt = mapManager.screenToWorld(sx, sy, width, height);
    setCursorCoords({ x: worldPt.wx, z: worldPt.wz });

    if (ps.activePointers.has(e.pointerId)) {
      ps.activePointers.set(e.pointerId, { x: sx, y: sy });
    }

    if (ps.activePointers.size === 2) {
      const pts = Array.from(ps.activePointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (ps.pinchLastDist > 0 && dist > 0) {
        const midX = (pts[0].x + pts[1].x) * 0.5;
        const midY = (pts[0].y + pts[1].y) * 0.5;
        const factor = dist / ps.pinchLastDist;
        mapManager.zoomAtScreenPoint(factor, midX, midY, width, height);
        syncZoomDisplay();
      }
      ps.pinchLastDist = dist;
      return;
    }

    if (ps.isPanning) {
      const dx = sx - ps.lastX;
      const dy = sy - ps.lastY;
      ps.dragDist += Math.hypot(dx, dy);
      ps.lastX = sx;
      ps.lastY = sy;
      mapManager.panByScreenDelta(dx, dy, width, height);
      setHoverInfo(null);
      return;
    }

    // Hover hit test
    const hit = mapManager.hitTestMarker(
      sx,
      sy,
      width,
      height,
      markers,
      hiddenCategories,
    );
    if (hit) {
      setHoverInfo({ marker: hit, sx, sy });
    } else if (hoverInfo !== null) {
      setHoverInfo(null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = getLocalCoords(e.clientX, e.clientY);
    const { width, height } = viewSizeRef.current;
    const ps = pointerStateRef.current;

    const wasClick = ps.isPanning && ps.dragDist < 6;
    ps.activePointers.delete(e.pointerId);

    if (ps.activePointers.size === 0) {
      ps.isPanning = false;
      setIsDragging(false);
    }

    if (wasClick) {
      const hit = mapManager.hitTestMarker(
        sx,
        sy,
        width,
        height,
        markers,
        hiddenCategories,
      );
      if (hit) {
        setPendingWaypoint(null);
        setSelectedMarker(hit);
      } else if (onSetWaypoint) {
        const pt = mapManager.screenToWorld(sx, sy, width, height);
        const clampedX = Math.max(-1800, Math.min(1800, Math.round(pt.wx)));
        const clampedZ = Math.max(-1800, Math.min(1800, Math.round(pt.wz)));
        setSelectedMarker(null);
        setPendingWaypoint({ x: clampedX, z: clampedZ, sx, sy });
      } else {
        setSelectedMarker(null);
      }
    }
  };

  const handlePointerLeave = () => {
    setCursorCoords(null);
    setHoverInfo(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { sx, sy } = getLocalCoords(e.clientX, e.clientY);
    const { width, height } = viewSizeRef.current;
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    mapManager.zoomAtScreenPoint(factor, sx, sy, width, height);
    syncZoomDisplay();
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { sx, sy } = getLocalCoords(e.clientX, e.clientY);
    const { width, height } = viewSizeRef.current;
    mapManager.zoomAtScreenPoint(1.55, sx, sy, width, height);
    syncZoomDisplay();
  };

  const zoomPct = Math.round(zoomDisplay * 100);
  const cardinal = getCardinal(headingDeg, lang);
  const biomeLabel = BIOME_LABELS[lang][biome];
  const cursorBiome = cursorCoords
    ? BIOME_LABELS[lang][getBiomeAt(cursorCoords.x, cursorCoords.z)]
    : null;

  const selectedDistance = selectedMarker
    ? Math.round(
        Math.hypot(selectedMarker.x - playerX, selectedMarker.z - playerZ),
      )
    : 0;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-[#07110d] text-[#f1f5ee] mobile-hud-safe overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="world-map-title"
      data-testid="world-map-modal"
    >
      {/* Top Cartography Header */}
      <header
        dir={isRtl ? 'rtl' : 'ltr'}
        className="shrink-0 min-h-14 py-1.5 px-2.5 sm:px-5 bg-[#0e1b14] border-b border-[#263c30] flex items-center justify-between gap-2 sm:gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#182c21] border border-[#2f493b] flex items-center justify-center shrink-0">
            <MapIcon className="w-4 h-4 text-[#e5a93c]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                id="world-map-title"
                className="font-display text-base sm:text-lg font-bold tracking-tight truncate"
              >
                {t.worldMap}
              </h2>
              <span className="hidden md:inline-block px-2 py-0.5 rounded bg-[#182a20] border border-[#2c4437] text-[11px] font-medium text-[#b9cebd]">
                {biomeLabel}
              </span>
            </div>
            <p className="text-[11px] font-mono-num text-[#9cb2a2] truncate" dir="ltr">
              {t.positionLabel}: X {playerX.toFixed(0)} · Z {playerZ.toFixed(0)} ·{' '}
              {cardinal} ({Math.round(headingDeg)}°)
            </p>
          </div>
        </div>

        {/* Center / Reset / Waypoint / Orientation / Legend / Close */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {activeWaypoint && onClearWaypoint && (
            <button
              type="button"
              data-testid="map-remove-waypoint-btn"
              onClick={() => {
                onClearWaypoint();
                if (selectedMarker?.kind === 'waypoint') {
                  setSelectedMarker(null);
                }
              }}
              className="min-h-[38px] px-2 sm:px-3 rounded-lg bg-[#0d2430] hover:bg-[#143446] border border-[#38bdf8]/45 text-xs font-medium text-[#bae6fd] flex items-center gap-1.5 cursor-pointer"
              title={t.removeWaypointBtn}
            >
              <span className="inline-block w-2 h-2 rotate-45 bg-[#38bdf8] shrink-0" />
              <span className="hidden md:inline">{t.removeWaypointBtn}</span>
            </button>
          )}

          {onToggleMiniMapRotate && (
            <button
              type="button"
              data-testid="map-toggle-orientation-btn"
              onClick={onToggleMiniMapRotate}
              className="min-h-[38px] px-2 sm:px-2.5 rounded-lg bg-[#16271e] hover:bg-[#1f362a] border border-[#2c4437] text-xs font-medium text-[#d4e2d2] flex items-center gap-1 cursor-pointer"
              title={t.miniMapOrientationLabel}
            >
              <Compass className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="hidden lg:inline">
                {miniMapRotate ? t.miniMapRotating : t.miniMapNorthUp}
              </span>
            </button>
          )}

          <button
            type="button"
            data-testid="map-center-player-btn"
            onClick={handleCenterPlayer}
            className="min-h-[38px] px-2 sm:px-3 rounded-lg bg-[#16271e] hover:bg-[#1f362a] border border-[#2c4437] text-xs font-medium text-[#e5efe2] flex items-center gap-1.5 cursor-pointer"
            title={t.mapCenterPlayer}
          >
            <Crosshair className="w-3.5 h-3.5 text-[#e5a93c]" />
            <span className="hidden sm:inline">{t.mapCenterPlayer}</span>
          </button>

          <button
            type="button"
            data-testid="map-reset-view-btn"
            onClick={handleResetView}
            className="min-h-[38px] px-2 sm:px-3 rounded-lg bg-[#16271e] hover:bg-[#1f362a] border border-[#2c4437] text-xs font-medium text-[#d4e2d2] flex items-center gap-1.5 cursor-pointer"
            title={t.mapResetView}
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#9cb2a2]" />
            <span className="hidden md:inline">{t.mapResetView}</span>
          </button>

          <button
            type="button"
            onClick={() => setLegendOpen((o) => !o)}
            className={`min-h-[38px] px-2 sm:px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
              legendOpen
                ? 'bg-[#213a2d] border-[#3d614e] text-[#f5f8f2]'
                : 'bg-[#16271e] hover:bg-[#1f362a] border-[#2c4437] text-[#cfe0cf]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#e5a93c]" />
            <span className="hidden sm:inline">
              {legendOpen ? t.mapHideLegend : t.mapShowLegend}
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            data-testid="world-map-close-btn"
            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] px-2.5 sm:px-3 rounded-lg bg-[#1c2e24] hover:bg-[#274032] border border-[#355142] text-xs font-semibold text-[#f3f6f1] flex items-center justify-center gap-1.5 cursor-pointer"
            aria-label={t.closeBtn}
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">M / Esc</span>
          </button>
        </div>
      </header>

      {/* Main Interactive Map Viewport */}
      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden bg-[#07110d]">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          className={`w-full h-full block touch-none ${
            isDragging
              ? 'cursor-grabbing'
              : hoverInfo
                ? 'cursor-pointer'
                : 'cursor-grab'
          }`}
        />

        {/* Cardinal Compass Badges */}
        <div className="pointer-events-none absolute top-2.5 left-3 sm:left-1/2 sm:-translate-x-1/2 px-2.5 py-1 rounded-md bg-[#0c1812]/90 border border-[#273d31] text-[10px] sm:text-[11px] font-semibold tracking-wider text-[#dbe6d8]">
          {t.northMountains}
        </div>
        <div
          className={`pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-[#0c1812]/90 border border-[#273d31] text-[10px] sm:text-[11px] font-semibold tracking-wider text-[#dbe6d8] ${
            legendOpen ? 'max-sm:hidden' : ''
          }`}
        >
          {t.southCoastline}
        </div>

        {/* Cursor World Readout (Top-Right) */}
        <div
          dir="ltr"
          className="pointer-events-none absolute top-2.5 right-3 px-2.5 py-1 rounded-lg bg-[#0d1a13]/92 border border-[#273d31] text-[10px] sm:text-[11px] font-mono-num text-[#b8ccb9] flex items-center gap-1.5"
        >
          <Compass className="w-3.5 h-3.5 text-[#e5a93c]" />
          {cursorCoords ? (
            <span>
              X {cursorCoords.x.toFixed(0)} · Z {cursorCoords.z.toFixed(0)}
              {cursorBiome ? ` · ${cursorBiome}` : ''}
            </span>
          ) : (
            <span>{zoomPct}%</span>
          )}
        </div>

        {/* Hover Marker Tooltip */}
        {hoverInfo && !isDragging && (
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            style={{
              left: Math.min(
                Math.max(12, hoverInfo.sx + 14),
                Math.max(12, viewSizeRef.current.width - 230),
              ),
              top: Math.min(
                Math.max(12, hoverInfo.sy - 18),
                Math.max(12, viewSizeRef.current.height - 84),
              ),
            }}
            className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg bg-[#0c1812]/96 border border-[#345040] px-3 py-2 shadow-xl"
          >
            <div className="text-xs font-semibold text-[#f4f7f1] leading-snug">
              {hoverInfo.marker.label}
            </div>
            {hoverInfo.marker.subtitle && (
              <div className="text-[11px] text-[#a7bda9] mt-0.5 leading-snug">
                {hoverInfo.marker.subtitle}
              </div>
            )}
            <div className="text-[10px] font-mono-num text-[#e5a93c] mt-1">
              {t.mapDistanceAway(
                Math.round(
                  Math.hypot(
                    hoverInfo.marker.x - playerX,
                    hoverInfo.marker.z - playerZ,
                  ),
                ),
              )}
            </div>
          </div>
        )}

        {/* Map Legend Panel (Bottom-Left) */}
        {legendOpen && (
          <aside
            dir={isRtl ? 'rtl' : 'ltr'}
            className="absolute bottom-3 left-3 z-10 w-[min(240px,calc(100%-70px))] sm:w-64 max-h-[55vh] overflow-y-auto rounded-xl bg-[#0e1b14]/95 border border-[#284033] p-3 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-display font-semibold uppercase tracking-wider text-[#dce6d8]">
                {t.mapLegendTitle}
              </span>
              <span className="text-[10px] font-mono-num text-[#97ad9c]">
                {zoomPct}%
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              {/* Player Row (always visible) */}
              <div className="flex items-center justify-between px-2 py-1 rounded-md bg-[#14241c] border border-[#22372c]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5">
                      <polygon
                        points="8,1 14,14 8,10.5 2,14"
                        fill="#ffffff"
                        stroke="#09140e"
                        strokeWidth="1.4"
                      />
                    </svg>
                  </span>
                  <span className="truncate text-[#eef4eb] font-medium">
                    {t.mapLegendPlayer}
                  </span>
                </div>
              </div>

              {/* Village Toggle */}
              <LegendToggleRow
                active={!hiddenCategories.has('village')}
                onClick={() => toggleCategory('village')}
                label={t.mapLegendVillage}
                swatch={
                  <span className="w-3.5 h-3.5 rounded-sm bg-[#e79e4f] border border-[#0c1611] inline-block" />
                }
              />

              {/* Quest Active / Turn-in / Available Toggle */}
              <LegendToggleRow
                active={!hiddenCategories.has('quest')}
                onClick={() => toggleCategory('quest')}
                label={t.mapLegendQuestActive}
                swatch={
                  <span className="w-4 h-4 rounded-full bg-[#facc15] text-[#09140e] text-[10px] font-bold flex items-center justify-center">
                    ★
                  </span>
                }
              />
              <LegendToggleRow
                active={!hiddenCategories.has('quest')}
                onClick={() => toggleCategory('quest')}
                label={t.mapLegendQuestTurnin}
                swatch={
                  <span className="w-4 h-4 rounded-full bg-[#4ade80] text-[#09140e] text-[10px] font-bold flex items-center justify-center">
                    ?
                  </span>
                }
              />
              <LegendToggleRow
                active={!hiddenCategories.has('quest')}
                onClick={() => toggleCategory('quest')}
                label={t.mapLegendQuestAvailable}
                swatch={
                  <span className="w-4 h-4 rounded-full bg-[#f59e0b] text-[#09140e] text-[10px] font-bold flex items-center justify-center">
                    !
                  </span>
                }
              />

              {/* Locations Toggle */}
              <LegendToggleRow
                active={!hiddenCategories.has('location')}
                onClick={() => toggleCategory('location')}
                label={t.mapLegendLocation}
                swatch={
                  <span className="w-2.5 h-2.5 rotate-45 bg-[#7dd3fc] border border-[#09150f] inline-block" />
                }
              />

              {/* Herbs Toggle */}
              <LegendToggleRow
                active={!hiddenCategories.has('herb')}
                onClick={() => toggleCategory('herb')}
                label={t.mapLegendHerb}
                swatch={
                  <span className="w-2.5 h-2.5 rounded-full bg-[#5ee08a] border border-[#09150f] inline-block" />
                }
              />

              {/* Resource Nodes Toggle */}
              <LegendToggleRow
                active={!hiddenCategories.has('resource')}
                onClick={() => toggleCategory('resource')}
                label={t.mapLegendResource}
                swatch={
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#d4a359] border border-[#0b1610] inline-block" />
                }
              />

              {/* Personal Waypoint Toggle */}
              <LegendToggleRow
                active={!hiddenCategories.has('waypoint')}
                onClick={() => toggleCategory('waypoint')}
                label={t.mapLegendWaypoint}
                swatch={
                  <span className="w-2.5 h-2.5 rotate-45 bg-[#38bdf8] border border-[#09150f] inline-block" />
                }
              />

              {/* Fog of War Indicator */}
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#0b1510] border border-[#1b2c23] text-[#90a496]">
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  <span className="w-3 h-3 rounded-sm bg-[#060f0b] border border-white/15 inline-block" />
                </span>
                <span className="truncate">{t.mapLegendUnexplored}</span>
              </div>
            </div>

            <p className="mt-2.5 pt-2 border-t border-[#22362b] text-[10px] text-[#95ab9a] leading-relaxed">
              {t.mapSelectHint}
            </p>
          </aside>
        )}

        {/* Set Waypoint Confirmation Prompt */}
        {pendingWaypoint && onSetWaypoint && (
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            data-testid="map-waypoint-prompt"
            style={{
              left: Math.min(
                Math.max(12, pendingWaypoint.sx - 110),
                Math.max(12, viewSizeRef.current.width - 238),
              ),
              top: Math.min(
                Math.max(46, pendingWaypoint.sy - 110),
                Math.max(46, viewSizeRef.current.height - 130),
              ),
            }}
            className="absolute z-30 w-[226px] rounded-xl bg-[#0d1c16]/96 border border-[#38bdf8]/55 p-3 shadow-2xl"
          >
            <div className="text-xs font-display font-semibold text-[#f1f5ee]">
              {t.setWaypointPrompt}
            </div>
            <div className="text-[11px] font-mono-num text-[#9ed9f6] mt-0.5" dir="ltr">
              X {pendingWaypoint.x} · Z {pendingWaypoint.z} ·{' '}
              {t.mapDistanceAway(
                Math.round(
                  Math.hypot(pendingWaypoint.x - playerX, pendingWaypoint.z - playerZ),
                ),
              )}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              <button
                type="button"
                data-testid="map-set-waypoint-btn"
                onClick={() => {
                  onSetWaypoint({ x: pendingWaypoint.x, z: pendingWaypoint.z });
                  setPendingWaypoint(null);
                }}
                className="flex-1 min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[#38bdf8] hover:bg-[#5ccbfa] text-[#07151c] font-display font-bold text-[11px] tracking-wide cursor-pointer"
              >
                {t.setWaypointBtn}
              </button>
              <button
                type="button"
                data-testid="map-cancel-waypoint-btn"
                onClick={() => setPendingWaypoint(null)}
                className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[#16271e] hover:bg-[#20382b] border border-[#2c4437] text-[11px] font-medium text-[#d8e4d4] cursor-pointer"
              >
                {t.cancelBtn}
              </button>
            </div>
          </div>
        )}

        {/* Selected Marker Inspector Card (Top-Left below North badge) */}
        {selectedMarker && (
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="absolute top-12 left-3 z-20 w-[min(256px,calc(100%-24px))] sm:w-64 rounded-xl bg-[#0e1b14]/96 border border-[#324f3f] p-3 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-display font-semibold text-[#f3f7f0] leading-tight">
                  {selectedMarker.label}
                </h3>
                {selectedMarker.subtitle && (
                  <p className="text-xs text-[#a9bfa9] mt-1 leading-snug">
                    {selectedMarker.subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedMarker(null)}
                className="w-6 h-6 rounded bg-[#182920] hover:bg-[#233b2e] flex items-center justify-center text-[#b7cab9] shrink-0 cursor-pointer"
                aria-label={t.closeBtn}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-[#21352a]">
              <div className="text-[11px] font-mono-num text-[#d8e4d4]" dir="ltr">
                X {selectedMarker.x.toFixed(0)} · Z {selectedMarker.z.toFixed(0)} ·{' '}
                <span className="text-[#e5a93c]">
                  {t.mapDistanceAway(selectedDistance)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedMarker.kind === 'waypoint' && onClearWaypoint && (
                  <button
                    type="button"
                    onClick={() => {
                      onClearWaypoint();
                      setSelectedMarker(null);
                    }}
                    className="px-2 py-1 rounded bg-[#2d181a] hover:bg-[#3f2023] border border-[#e05a47]/45 text-[11px] font-semibold text-[#f5b4aa] cursor-pointer"
                  >
                    {t.removeWaypointBtn}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    mapManager.centerOn(
                      selectedMarker.x,
                      selectedMarker.z,
                      Math.max(mapManager.getZoom(), 2.2),
                    );
                    syncZoomDisplay();
                  }}
                  className="px-2 py-1 rounded bg-[#213a2d] hover:bg-[#2c4d3c] border border-[#3a604c] text-[11px] font-semibold text-[#f2f6ef] cursor-pointer"
                >
                  {t.mapFocusMarker}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Zoom Controls (Bottom-Right above canvas scale bar) */}
        <div className="absolute bottom-14 right-3 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            data-testid="map-zoom-in-btn"
            onClick={handleZoomIn}
            disabled={zoomDisplay >= MAP_MAX_ZOOM - 0.01}
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-lg bg-[#0f1d16]/95 hover:bg-[#1a3025] disabled:opacity-40 border border-[#2c4437] flex items-center justify-center text-[#edf4ea] shadow-lg cursor-pointer"
            title={t.mapZoomIn}
            aria-label={t.mapZoomIn}
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="w-11 sm:w-10 py-1 rounded-md bg-[#0d1913]/95 border border-[#263c30] text-center text-[10px] font-mono-num font-semibold text-[#d7e5d4]">
            {zoomDisplay.toFixed(1)}x
          </div>
          <button
            type="button"
            data-testid="map-zoom-out-btn"
            onClick={handleZoomOut}
            disabled={zoomDisplay <= MAP_MIN_ZOOM + 0.01}
            className="w-11 h-11 sm:w-10 sm:h-10 rounded-lg bg-[#0f1d16]/95 hover:bg-[#1a3025] disabled:opacity-40 border border-[#2c4437] flex items-center justify-center text-[#edf4ea] shadow-lg cursor-pointer"
            title={t.mapZoomOut}
            aria-label={t.mapZoomOut}
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slim Bottom Controls Hint Strip */}
      <footer
        dir={isRtl ? 'rtl' : 'ltr'}
        className="shrink-0 h-8 px-4 bg-[#0d1812] border-t border-[#22362b] flex items-center justify-between text-[11px] text-[#98ae9d]"
      >
        <span className="truncate">{t.mapHintControls}</span>
        <span className="hidden sm:inline font-mono-num text-[#7f9685]" dir="ltr">
          {markers.length} {lang === 'ar' ? 'علامة' : 'markers'}
        </span>
      </footer>
    </div>
  );
};

interface LegendToggleRowProps {
  active: boolean;
  onClick: () => void;
  label: string;
  swatch: React.ReactNode;
}

const LegendToggleRow: React.FC<LegendToggleRowProps> = ({
  active,
  onClick,
  label,
  swatch,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center justify-between px-2 py-1 rounded-md border transition-colors cursor-pointer ${
      active
        ? 'bg-[#14241c] hover:bg-[#1a2f25] border-[#263d31] text-[#e7efe3]'
        : 'bg-[#0b1510] hover:bg-[#111f18] border-[#1b2c23] text-[#708575]'
    }`}
  >
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-4 h-4 flex items-center justify-center shrink-0">
        {swatch}
      </span>
      <span className="truncate">{label}</span>
    </div>
    {active ? (
      <Eye className="w-3.5 h-3.5 text-[#87a890] shrink-0" />
    ) : (
      <EyeOff className="w-3.5 h-3.5 text-[#5b7061] shrink-0" />
    )}
  </button>
);
