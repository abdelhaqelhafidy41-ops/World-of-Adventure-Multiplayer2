import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  Crown,
  MessageSquare,
  MoreHorizontal,
  Send,
  Users,
  VolumeX,
} from 'lucide-react';
import {
  MAX_CHAT_MESSAGE_LENGTH,
  type RoomChatMessage,
} from '../../../shared/multiplayerProtocol';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import type {
  IMultiplayerService,
  MultiplayerPlayer,
  MultiplayerRoomState,
} from '../../game/multiplayer/multiplayerTypes';
import { AvatarBadge } from '../profile/AvatarBadge';

interface RoomChatPanelProps {
  lang: Language;
  service: IMultiplayerService;
  currentRoom: MultiplayerRoomState | null;
  compact?: boolean;
  showPlayersTab?: boolean;
  autoFocusInput?: boolean;
  onInspectPlayer?: (player: MultiplayerPlayer) => void;
}

export const RoomChatPanel: React.FC<RoomChatPanelProps> = ({
  lang,
  service,
  currentRoom,
  compact = false,
  showPlayersTab = false,
  autoFocusInput = false,
  onInspectPlayer,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const [activeTab, setActiveTab] = useState<'chat' | 'players'>('chat');
  const [messages, setMessages] = useState<RoomChatMessage[]>(() =>
    service.getChatMessages(),
  );
  const [socialRevision, setSocialRevision] = useState(0);
  const [draft, setDraft] = useState('');
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [unreadWhileScrolledUp, setUnreadWhileScrolledUp] = useState(0);

  const listRef = useRef<HTMLDivElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    setMessages(service.getChatMessages());
    const unsub = service.subscribe((ev) => {
      if (ev.type === 'chat-message') {
        setMessages((prev) => {
          if (prev.some((m) => m.id === ev.message.id)) return prev;
          return [...prev, ev.message].slice(-100);
        });
        if (!isNearBottomRef.current && ev.message.playerId !== service.getLocalPlayerId()) {
          setUnreadWhileScrolledUp((n) => n + 1);
        }
      } else if (ev.type === 'chat-history') {
        setMessages(ev.messages);
        setUnreadWhileScrolledUp(0);
      } else if (ev.type === 'social-updated') {
        setSocialRevision((r) => r + 1);
      } else if (
        ev.type === 'error' &&
        (ev.code === 'CHAT_SPAM_LIMITED' ||
          ev.code === 'CHAT_DUPLICATE_SPAM' ||
          ev.code === 'CHAT_TOO_LONG' ||
          ev.code === 'EMPTY_CHAT_MESSAGE' ||
          ev.code === 'RATE_LIMITED')
      ) {
        if (ev.code === 'CHAT_DUPLICATE_SPAM') {
          setFeedbackNotice(t.mpRoomChatDuplicateNotice);
        } else if (ev.code === 'CHAT_TOO_LONG') {
          setFeedbackNotice(t.mpRoomChatTooLongNotice(MAX_CHAT_MESSAGE_LENGTH));
        } else {
          setFeedbackNotice(t.mpRoomChatSpamNotice);
        }
      }
    });
    return unsub;
  }, [service, t]);

  useEffect(() => {
    if (autoFocusInput && activeTab === 'chat') {
      inputRef.current?.focus();
    }
  }, [activeTab, autoFocusInput]);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const onViewportResize = () => {
      if (activeTab === 'chat' && document.activeElement === inputRef.current) {
        window.setTimeout(() => {
          listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 80);
      }
    };
    vv.addEventListener('resize', onViewportResize);
    return () => vv.removeEventListener('resize', onViewportResize);
  }, [activeTab]);

  const { visibleMessages, hiddenCount } = useMemo(() => {
    void socialRevision;
    const visible: RoomChatMessage[] = [];
    let hidden = 0;
    for (const msg of messages) {
      if (
        !msg.isSystem &&
        (service.isPlayerMuted(msg.playerId, msg.playerName) ||
          service.isPlayerBlocked(msg.playerId, msg.playerName))
      ) {
        hidden += 1;
        continue;
      }
      visible.push(msg);
    }
    return { visibleMessages: visible, hiddenCount: hidden };
  }, [messages, service, socialRevision]);

  useEffect(() => {
    if (activeTab === 'chat' && isNearBottomRef.current) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      setUnreadWhileScrolledUp(0);
    }
  }, [visibleMessages.length, activeTab]);

  const localPlayerId = service.getLocalPlayerId();
  const isConnected = service.getConnectionState() === 'connected';

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackNotice(null);

    if (draft.trim().length > MAX_CHAT_MESSAGE_LENGTH) {
      setFeedbackNotice(t.mpRoomChatTooLongNotice(MAX_CHAT_MESSAGE_LENGTH));
      return;
    }

    const res = service.sendChatMessage(draft);
    if (!res.ok) {
      if (res.code === 'CHAT_SPAM_LIMITED') {
        setFeedbackNotice(t.mpRoomChatSpamNotice);
      } else if (res.code === 'CHAT_DUPLICATE_SPAM') {
        setFeedbackNotice(t.mpRoomChatDuplicateNotice);
      } else if (res.code === 'CHAT_TOO_LONG') {
        setFeedbackNotice(t.mpRoomChatTooLongNotice(MAX_CHAT_MESSAGE_LENGTH));
      } else if (res.code === 'NOT_CONNECTED') {
        setFeedbackNotice(t.mpRoomChatDisconnectedNotice);
      }
      return;
    }

    setDraft('');
  };

  const resolvePlayerForMessage = (msg: RoomChatMessage): MultiplayerPlayer => {
    const match = currentRoom?.players.find((p) => p.id === msg.playerId);
    if (match) return match;
    return {
      id: msg.playerId,
      publicProfileId: msg.publicProfileId,
      playerTag: msg.playerTag,
      avatar: msg.avatar,
      displayName: msg.playerName,
      isHost: currentRoom?.hostId === msg.playerId,
      isReady: true,
      isLocal: localPlayerId === msg.playerId,
      joinedAt: msg.timestamp,
      avatarColor: '#38bdf8',
      pingMs: null,
      connectionQuality: 'good',
    };
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      data-testid="room-chat-panel"
      className="rounded-xl border border-white/10 bg-[#0c1611] overflow-hidden flex flex-col flex-1 min-h-0 max-h-full"
    >
      {/* Header / Optional Tabs */}
      <div className="shrink-0 px-3.5 py-2.5 border-b border-white/10 bg-[#101c16] flex items-center justify-between gap-2">
        {showPlayersTab ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="room-chat-tab-chat"
              onClick={() => setActiveTab('chat')}
              className={`px-2.5 py-1 rounded-lg text-xs font-display font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'chat'
                  ? 'bg-[#20382b] border border-[#e5a93c]/60 text-[#ffffff]'
                  : 'text-[#9db1a1] hover:text-[#ffffff]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#e5a93c]" />
              <span>{t.mpRoomChatTabsChat}</span>
            </button>
            <button
              type="button"
              data-testid="room-chat-tab-players"
              onClick={() => setActiveTab('players')}
              className={`px-2.5 py-1 rounded-lg text-xs font-display font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'players'
                  ? 'bg-[#20382b] border border-[#e5a93c]/60 text-[#ffffff]'
                  : 'text-[#9db1a1] hover:text-[#ffffff]'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#e5a93c]" />
              <span>
                {t.mpRoomChatTabsPlayers} ({currentRoom?.players.length ?? 0})
              </span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#e5a93c]" />
            <h3 className="font-display text-xs sm:text-sm font-bold tracking-wide text-[#f7faf5]">
              {t.mpRoomChatTitle}
            </h3>
          </div>
        )}

        <span dir="ltr" className="font-mono-num text-[10px] text-[#8ea593]">
          {draft.length}/{MAX_CHAT_MESSAGE_LENGTH}
        </span>
      </div>

      {activeTab === 'chat' ? (
        <>
          {/* Chat Messages Stream */}
          <div
            ref={listRef}
            data-testid="room-chat-messages"
            onScroll={() => {
              const el = listRef.current;
              if (!el) return;
              const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              isNearBottomRef.current = nearBottom;
              if (nearBottom && unreadWhileScrolledUp > 0) {
                setUnreadWhileScrolledUp(0);
              }
            }}
            className={`relative px-3 py-2.5 overflow-y-auto flex-1 min-h-[120px] space-y-2 ${
              compact ? 'max-h-48 sm:max-h-52' : 'max-h-[46dvh] sm:h-72'
            }`}
          >
            {hiddenCount > 0 && (
              <div
                data-testid="room-chat-suppressed-notice"
                className="text-[11px] text-[#9db1a1] bg-[#122018] border border-white/8 rounded-lg px-2.5 py-1.5"
              >
                {t.mpRoomChatMutedSuppressed(hiddenCount)}
              </div>
            )}

            {visibleMessages.length === 0 ? (
              <div
                data-testid="room-chat-empty"
                className="h-full flex items-center justify-center text-center text-xs text-[#7c9482] px-4"
              >
                {t.mpRoomChatEmpty}
              </div>
            ) : (
              visibleMessages.map((msg) => {
                const isMine = localPlayerId !== null && msg.playerId === localPlayerId;
                const isHostSender = currentRoom?.hostId === msg.playerId;
                const timeText = new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={msg.id}
                    data-testid={`room-chat-msg-${msg.id}`}
                    className={`rounded-xl px-2.5 py-2 border text-xs sm:text-sm ${
                      isMine
                        ? 'bg-[#15281f] border-[#e5a93c]/25'
                        : 'bg-[#0a130e] border-white/8'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <button
                        type="button"
                        data-testid={`room-chat-author-${msg.playerId}`}
                        onClick={() => onInspectPlayer?.(resolvePlayerForMessage(msg))}
                        dir="auto"
                        className={`font-display font-bold text-xs inline-flex items-center gap-1.5 truncate cursor-pointer hover:underline ${
                          isMine
                            ? 'text-[#9ef0b0]'
                            : isHostSender
                              ? 'text-[#f3c66c]'
                              : 'text-[#93c5fd]'
                        }`}
                      >
                        <AvatarBadge
                          avatar={msg.avatar ?? resolvePlayerForMessage(msg).avatar}
                          seed={msg.publicProfileId ?? msg.playerId}
                          displayName={msg.playerName}
                          size="xs"
                        />
                        {isHostSender && <Crown className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{msg.playerName}</span>
                        {msg.playerTag && (
                          <span dir="ltr" className="font-mono-num text-[10px] text-[#8ea593]">
                            #{msg.playerTag}
                          </span>
                        )}
                      </button>

                      <span
                        dir="ltr"
                        className="font-mono-num text-[10px] text-[#7c9482] shrink-0"
                      >
                        {timeText}
                      </span>
                    </div>

                    <p
                      dir="auto"
                      className="text-xs sm:text-sm text-[#eef3ed] leading-relaxed break-words [unicode-bidi:plaintext]"
                    >
                      {msg.message}
                    </p>
                  </div>
                );
              })
            )}
            <div ref={listEndRef} />
          </div>

          {unreadWhileScrolledUp > 0 && (
            <div className="shrink-0 px-3 py-1 bg-[#122018] border-t border-[#e5a93c]/25 flex justify-center">
              <button
                type="button"
                data-testid="room-chat-scroll-bottom-btn"
                onClick={() => {
                  isNearBottomRef.current = true;
                  setUnreadWhileScrolledUp(0);
                  listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }}
                className="text-[11px] font-semibold text-[#e5a93c] hover:text-[#f7d07a] cursor-pointer"
              >
                ↓ {unreadWhileScrolledUp}
              </button>
            </div>
          )}

          {feedbackNotice && (
            <div
              role="status"
              data-testid="room-chat-feedback"
              className="shrink-0 px-3 py-1.5 border-t border-[#e5a93c]/25 bg-[#231d11] text-[11px] text-[#f3c66c]"
            >
              {feedbackNotice}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={handleSend}
            className="shrink-0 p-2.5 border-t border-white/10 bg-[#0e1913] flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              enterKeyHint="send"
              dir="auto"
              data-testid="room-chat-input"
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
              value={draft}
              onFocus={() => {
                window.setTimeout(() => {
                  listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }, 140);
              }}
              onChange={(e) => {
                setDraft(e.target.value);
                if (feedbackNotice) setFeedbackNotice(null);
              }}
              placeholder={
                isConnected ? t.mpRoomChatPlaceholder : t.mpRoomChatDisconnectedNotice
              }
              disabled={!isConnected}
              className="flex-1 min-w-0 min-h-[42px] px-3 py-1.5 rounded-xl bg-[#08100c] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-xs sm:text-sm text-[#f7faf5] placeholder-[#687e6d] disabled:opacity-55 [unicode-bidi:plaintext]"
            />
            <button
              type="submit"
              data-testid="room-chat-send-btn"
              disabled={!isConnected || !draft.trim()}
              className="min-h-[42px] px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-45 disabled:cursor-not-allowed text-[#111914] font-display font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t.mpRoomChatSendBtn}</span>
            </button>
          </form>
        </>
      ) : (
        <div
          data-testid="room-chat-players-list"
          className={`divide-y divide-white/10 overflow-y-auto ${
            compact ? 'h-[246px] sm:h-[262px]' : 'h-[294px] sm:h-[342px]'
          }`}
        >
          {(currentRoom?.players ?? []).map((player) => {
            const muted = service.isPlayerMuted(player.id, player.displayName);
            const blocked = service.isPlayerBlocked(player.id, player.displayName);
            return (
              <div
                key={player.id}
                className="px-3.5 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <AvatarBadge
                    avatar={player.avatar}
                    seed={player.publicProfileId ?? player.id}
                    displayName={player.displayName}
                    size="xs"
                  />
                  <span
                    dir="auto"
                    className="font-display font-bold text-xs sm:text-sm text-[#f7faf5] truncate"
                  >
                    {player.displayName}
                  </span>
                  {player.playerTag && (
                    <span dir="ltr" className="font-mono-num text-[11px] text-[#8ea593]">
                      #{player.playerTag}
                    </span>
                  )}
                  {player.isLocal && (
                    <span className="px-1.5 py-0.5 rounded bg-[#1b2e24] text-[10px] font-semibold text-[#c7d6c8]">
                      {t.mpYouLabel}
                    </span>
                  )}
                  {player.isHost && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2d2312] border border-[#e5a93c]/40 text-[10px] font-semibold text-[#f3c66c]">
                      <Crown className="w-2.5 h-2.5" />
                      {t.mpHostLabel}
                    </span>
                  )}
                  {muted && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2b2514] border border-[#e5a93c]/40 text-[10px] font-semibold text-[#f3c66c]">
                      <VolumeX className="w-2.5 h-2.5" />
                      {t.mpBadgeMuted}
                    </span>
                  )}
                  {blocked && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2a1618] border border-[#e05a47]/45 text-[10px] font-semibold text-[#f4b1a7]">
                      <Ban className="w-2.5 h-2.5" />
                      {t.mpBadgeBlocked}
                    </span>
                  )}
                </div>

                {onInspectPlayer && (
                  <button
                    type="button"
                    data-testid={`room-chat-player-menu-${player.id}`}
                    onClick={() => onInspectPlayer(player)}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#16261d] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#dce5d8] inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5 text-[#e5a93c]" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
