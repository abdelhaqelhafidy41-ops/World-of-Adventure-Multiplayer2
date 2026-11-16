import React, { useEffect, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import type {
  IMultiplayerService,
  MultiplayerPlayer,
  MultiplayerRoomState,
} from '../../game/multiplayer/multiplayerTypes';
import { PlayerInteractionModal } from './PlayerInteractionModal';
import { RoomChatPanel } from './RoomChatPanel';

interface InGameMultiplayerChatModalProps {
  lang: Language;
  service: IMultiplayerService;
  room: MultiplayerRoomState | null;
  onClose: () => void;
  onNotice?: (message: string) => void;
}

export const InGameMultiplayerChatModal: React.FC<
  InGameMultiplayerChatModalProps
> = ({ lang, service, room, onClose, onNotice }) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const [inspectedPlayer, setInspectedPlayer] =
    useState<MultiplayerPlayer | null>(null);
  const [viewportStyle, setViewportStyle] = useState<{
    top: number;
    height: number | null;
  }>({ top: 0, height: null });

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const syncViewport = () => {
      setViewportStyle({
        top: Math.max(0, Math.round(vv.offsetTop)),
        height: Math.max(220, Math.round(vv.height)),
      });
    };
    syncViewport();
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
    return () => {
      vv.removeEventListener('resize', syncViewport);
      vv.removeEventListener('scroll', syncViewport);
    };
  }, []);

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={
        viewportStyle.height !== null
          ? {
              top: `${viewportStyle.top}px`,
              height: `${viewportStyle.height}px`,
              bottom: 'auto',
            }
          : undefined
      }
      className="fixed inset-x-0 top-0 bottom-0 z-40 flex items-center justify-center bg-[#060d09]/65 backdrop-blur-sm p-2.5 sm:p-5 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      data-testid="ingame-chat-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !inspectedPlayer) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg max-h-full flex flex-col rounded-2xl bg-[#101c16]/96 border border-[#2b4436] text-[#f2f6ef] shadow-2xl overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2 bg-[#0c1611]">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-[#e5a93c] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-bold text-[#f7faf5] truncate">
                {t.mpRoomChatTitle}
              </h2>
              {room && (
                <div className="text-[11px] text-[#9db1a1] truncate">
                  {room.roomName} ·{' '}
                  <span dir="ltr" className="font-mono-num text-[#e5a93c]">
                    {room.roomCode}
                  </span>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            data-testid="ingame-chat-close"
            onClick={onClose}
            className="p-2 rounded-lg bg-[#182920] hover:bg-[#22392d] border border-white/10 text-[#dce5d8] cursor-pointer shrink-0"
            aria-label={t.closeBtn}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-4">
          <RoomChatPanel
            lang={lang}
            service={service}
            currentRoom={room}
            showPlayersTab
            autoFocusInput
            onInspectPlayer={(player) => setInspectedPlayer(player)}
          />
        </div>
      </div>

      {inspectedPlayer && (
        <PlayerInteractionModal
          lang={lang}
          service={service}
          targetPlayer={inspectedPlayer}
          currentRoom={room}
          onClose={() => setInspectedPlayer(null)}
          onNotice={onNotice}
        />
      )}
    </div>
  );
};
