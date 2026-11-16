import React from 'react';
import { DoorOpen, RefreshCw, WifiOff } from 'lucide-react';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import type { MultiplayerConnectionState } from '../../game/multiplayer/multiplayerTypes';

interface ConnectionStatusBannerProps {
  lang: Language;
  connectionState: MultiplayerConnectionState;
  attempt: number;
  maxAttempts: number;
  variant?: 'hud' | 'lobby';
  onRetry?: () => void;
  onReturnToMenu?: () => void;
}

export const ConnectionStatusBanner: React.FC<ConnectionStatusBannerProps> = ({
  lang,
  connectionState,
  attempt,
  maxAttempts,
  variant = 'hud',
  onRetry,
  onReturnToMenu,
}) => {
  if (connectionState !== 'reconnecting' && connectionState !== 'error') {
    return null;
  }

  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const isError = connectionState === 'error';

  const containerClasses =
    variant === 'hud'
      ? 'fixed top-4 left-1/2 -translate-x-1/2 z-[65] w-[min(92vw,440px)] pointer-events-auto'
      : 'w-full';

  return (
    <div
      role="status"
      aria-live="assertive"
      dir={isRtl ? 'rtl' : 'ltr'}
      data-testid="mp-connection-banner"
      className={containerClasses}
    >
      <div
        className={`rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md flex flex-col gap-2.5 ${
          isError
            ? 'bg-[#251316]/96 border-[#e05a47]/65 text-[#fae5e2]'
            : 'bg-[#1a1810]/96 border-[#e5a93c]/65 text-[#faf4e4]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                isError
                  ? 'bg-[#3b1c20] border-[#e05a47]/45 text-[#f49486]'
                  : 'bg-[#2b2312] border-[#e5a93c]/45 text-[#f3c66c]'
              }`}
            >
              {isError ? (
                <WifiOff className="w-4 h-4" />
              ) : (
                <RefreshCw className="w-4 h-4 animate-spin" />
              )}
            </div>
            <div className="min-w-0">
              <div
                data-testid="mp-connection-lost-title"
                className="font-display text-sm sm:text-base font-bold tracking-wide leading-tight"
              >
                {isError
                  ? `${t.mpStatusServerUnavailable} · ${t.mpReconnectFailedTitle}`
                  : `${t.mpStatusReconnecting} · ${t.mpConnectionLostTitle}`}
              </div>
              <div
                data-testid="mp-reconnecting-subtitle"
                className={`text-xs sm:text-sm font-medium mt-0.5 leading-snug ${
                  isError ? 'text-[#eab8b0]' : 'text-[#e5cf9b]'
                }`}
              >
                {isError ? t.mpReconnectFailedDesc : t.mpReconnectingSubtitle}
              </div>
            </div>
          </div>

          {!isError && attempt > 0 && (
            <span
              data-testid="mp-reconnect-attempt-badge"
              className="px-2 py-0.5 rounded-lg bg-[#2b2312] border border-[#e5a93c]/40 font-mono-num text-[11px] font-semibold text-[#f3c66c] whitespace-nowrap shrink-0"
            >
              {t.mpReconnectAttemptLabel(attempt, maxAttempts)}
            </span>
          )}
        </div>

        {isError && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
            {onRetry && (
              <button
                type="button"
                data-testid="mp-reconnect-retry-btn"
                onClick={onRetry}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t.mpRetryConnectionBtn}</span>
              </button>
            )}
            {onReturnToMenu && (
              <button
                type="button"
                data-testid="mp-reconnect-menu-btn"
                onClick={onReturnToMenu}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-[#e4ece1] font-display font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <DoorOpen className="w-3.5 h-3.5" />
                <span>{t.mpReturnToMenuBtn}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
