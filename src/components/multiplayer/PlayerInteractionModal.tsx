import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Crown,
  Flag,
  Heart,
  Shield,
  UserCheck,
  UserPlus,
  UserX,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  ALLOWED_REPORT_REASONS,
  PLAYER_REPORT_DETAILS_MAX_LENGTH,
  getConnectionQuality,
  type PlayerReportReason,
} from '../../../shared/multiplayerProtocol';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import {
  MultiplayerServiceUnavailableError,
  type IMultiplayerService,
  type MultiplayerPlayer,
  type MultiplayerRoomState,
} from '../../game/multiplayer/multiplayerTypes';
import { AvatarBadge } from '../profile/AvatarBadge';
import { PlayerProfileModal } from '../profile/PlayerProfileModal';

type InteractionSubView = 'menu' | 'profile' | 'report';

interface PlayerInteractionModalProps {
  lang: Language;
  service: IMultiplayerService;
  targetPlayer: MultiplayerPlayer;
  currentRoom: MultiplayerRoomState | null;
  onClose: () => void;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
}

export const PlayerInteractionModal: React.FC<PlayerInteractionModalProps> = ({
  lang,
  service,
  targetPlayer,
  currentRoom,
  onClose,
  onNotice,
  onError,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const [subView, setSubView] = useState<InteractionSubView>('menu');
  const [isMuted, setIsMuted] = useState<boolean>(() =>
    service.isPlayerMuted(targetPlayer.id, targetPlayer.displayName),
  );
  const [isBlocked, setIsBlocked] = useState<boolean>(() =>
    service.isPlayerBlocked(targetPlayer.id, targetPlayer.displayName),
  );
  const [isFriend, setIsFriend] = useState<boolean>(() =>
    service.getSocialAdapter().isFriendName(targetPlayer.displayName),
  );
  const [inviting, setInviting] = useState(false);

  const [reportReason, setReportReason] = useState<PlayerReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fullProfileOpen, setFullProfileOpen] = useState(false);

  const isLocal = Boolean(
    targetPlayer.isLocal || targetPlayer.id === service.getLocalPlayerId(),
  );

  useEffect(() => {
    setIsMuted(service.isPlayerMuted(targetPlayer.id, targetPlayer.displayName));
    setIsBlocked(service.isPlayerBlocked(targetPlayer.id, targetPlayer.displayName));
    setIsFriend(service.getSocialAdapter().isFriendName(targetPlayer.displayName));
  }, [service, targetPlayer.displayName, targetPlayer.id]);

  useEffect(() => {
    const unsub = service.subscribe((ev) => {
      if (ev.type === 'social-updated') {
        setIsMuted(service.isPlayerMuted(targetPlayer.id, targetPlayer.displayName));
        setIsBlocked(service.isPlayerBlocked(targetPlayer.id, targetPlayer.displayName));
      } else if (ev.type === 'report-submitted' && ev.ack.targetPlayerId === targetPlayer.id) {
        setSubmittingReport(false);
        const msg = t.mpReportSubmittedNotice(targetPlayer.displayName);
        setLocalFeedback(msg);
        setLocalError(null);
        onNotice?.(msg);
        setSubView('menu');
      } else if (
        ev.type === 'error' &&
        (ev.code === 'REPORT_ALREADY_SUBMITTED' ||
          ev.code === 'CANNOT_REPORT_SELF' ||
          ev.code === 'INVALID_TARGET_PLAYER')
      ) {
        setSubmittingReport(false);
        const msg =
          ev.code === 'REPORT_ALREADY_SUBMITTED'
            ? t.mpReportDuplicateNotice
            : ev.message;
        setLocalError(msg);
        onError?.(msg);
      }
    });
    return unsub;
  }, [onError, onNotice, service, t, targetPlayer.displayName, targetPlayer.id]);

  const handleToggleMute = () => {
    setLocalError(null);
    if (isMuted) {
      service.unmutePlayer(targetPlayer.id, targetPlayer.displayName);
      setIsMuted(false);
      const msg = t.mpPlayerUnmutedNotice(targetPlayer.displayName);
      setLocalFeedback(msg);
      onNotice?.(msg);
    } else {
      service.mutePlayer(targetPlayer.id, targetPlayer.displayName);
      setIsMuted(true);
      const msg = t.mpPlayerMutedNotice(targetPlayer.displayName);
      setLocalFeedback(msg);
      onNotice?.(msg);
    }
  };

  const handleToggleBlock = () => {
    setLocalError(null);
    if (isBlocked) {
      service.unblockPlayer(targetPlayer.id, targetPlayer.displayName);
      setIsBlocked(false);
      const msg = t.mpPlayerUnblockedNotice(targetPlayer.displayName);
      setLocalFeedback(msg);
      onNotice?.(msg);
    } else {
      service.blockPlayer(targetPlayer.id, targetPlayer.displayName);
      setIsBlocked(true);
      const msg = t.mpPlayerBlockedNotice(targetPlayer.displayName);
      setLocalFeedback(msg);
      onNotice?.(msg);
    }
  };

  const handleInvite = async () => {
    if (inviting) return;
    setLocalError(null);
    setLocalFeedback(null);
    setInviting(true);
    try {
      await service.sendInvite(targetPlayer.displayName);
      const msg = t.mpInviteSentNotice(targetPlayer.displayName);
      setLocalFeedback(msg);
      onNotice?.(msg);
    } catch (err) {
      const msg =
        err instanceof MultiplayerServiceUnavailableError
          ? service.isConfigured()
            ? t.mpStatusServerUnavailable
            : `${t.mpNotConfiguredTitle} ${t.mpNotConfiguredHint}`
          : err instanceof Error
            ? err.message
            : t.mpStatusServerUnavailable;
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setInviting(false);
    }
  };

  const handleToggleFriend = async () => {
    setLocalError(null);
    const list = await service.getFriends();
    const existing = list.find(
      (f) => f.displayName.toLowerCase() === targetPlayer.displayName.toLowerCase(),
    );
    if (existing) {
      await service.removeFriend(existing.id);
      setIsFriend(false);
    } else {
      await service.addFriend(targetPlayer.displayName);
      setIsFriend(true);
      const msg = t.mpFriendAddedNotice(targetPlayer.displayName);
      setLocalFeedback(msg);
      onNotice?.(msg);
    }
  };

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingReport || isLocal) return;
    setLocalError(null);
    setLocalFeedback(null);
    setSubmittingReport(true);
    const sent = service.reportPlayer(
      targetPlayer.id,
      reportReason,
      reportDetails.trim() || undefined,
    );
    if (!sent) {
      setSubmittingReport(false);
      setLocalError(t.mpRoomChatDisconnectedNotice);
    }
  };

  const profile = service.getPlayerProfileSummary(targetPlayer.id);
  const quality = getConnectionQuality(
    profile?.pingMs ?? targetPlayer.pingMs,
    (profile?.connectionQuality ?? targetPlayer.connectionQuality) !== 'disconnected',
  );
  const qualityLabel =
    quality === 'excellent'
      ? t.mpQualityExcellent
      : quality === 'good'
        ? t.mpQualityGood
        : quality === 'poor'
          ? t.mpQualityPoor
          : t.mpQualityDisconnected;

  const reasonLabels: Record<PlayerReportReason, string> = {
    spam: t.mpReportReasonSpam,
    harassment: t.mpReportReasonHarassment,
    cheating: t.mpReportReasonCheating,
    inappropriate_name: t.mpReportReasonInappropriateName,
    inappropriate_profile: t.mpReportReasonInappropriateProfile,
    other: t.mpReportReasonOther,
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-5 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      data-testid="player-interaction-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[#101c16] border border-[#2f4b3c] text-[#f2f6ef] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between gap-2 bg-[#0c1611]">
          <div className="flex items-center gap-2.5 min-w-0">
            {subView !== 'menu' && (
              <button
                type="button"
                data-testid="player-interaction-back"
                onClick={() => {
                  setLocalError(null);
                  setSubView('menu');
                }}
                className="p-1.5 rounded-lg bg-[#182920] hover:bg-[#22392d] border border-white/10 text-[#dce5d8] cursor-pointer shrink-0"
                aria-label={t.backBtn}
              >
                <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
              </button>
            )}
            <AvatarBadge
              avatar={targetPlayer.avatar}
              seed={targetPlayer.publicProfileId ?? targetPlayer.id}
              displayName={targetPlayer.displayName}
              size="sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3
                  dir="auto"
                  data-testid="player-interaction-name"
                  className="font-display font-bold text-sm sm:text-base text-[#ffffff] truncate"
                >
                  {targetPlayer.displayName}
                </h3>
                {targetPlayer.playerTag && (
                  <span dir="ltr" className="font-mono-num text-xs text-[#9db1a1]">
                    #{targetPlayer.playerTag}
                  </span>
                )}
                {targetPlayer.isHost && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2d2312] border border-[#e5a93c]/40 text-[10px] font-semibold text-[#f3c66c]">
                    <Crown className="w-2.5 h-2.5" />
                    {t.mpHostLabel}
                  </span>
                )}
              </div>
              {targetPlayer.publicProfileId && (
                <div dir="ltr" className="font-mono-num text-[10px] text-[#e5a93c]">
                  {targetPlayer.publicProfileId}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                {isFriend && (
                  <span className="px-1.5 py-0.5 rounded bg-[#183124] border border-[#7fe094]/35 text-[10px] font-semibold text-[#9ef0b0]">
                    {t.mpBadgeFriend}
                  </span>
                )}
                {isMuted && (
                  <span className="px-1.5 py-0.5 rounded bg-[#2b2514] border border-[#e5a93c]/40 text-[10px] font-semibold text-[#f3c66c]">
                    {t.mpBadgeMuted}
                  </span>
                )}
                {isBlocked && (
                  <span className="px-1.5 py-0.5 rounded bg-[#2a1618] border border-[#e05a47]/45 text-[10px] font-semibold text-[#f4b1a7]">
                    {t.mpBadgeBlocked}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="player-interaction-close"
            onClick={onClose}
            className="p-2 rounded-lg bg-[#182920] hover:bg-[#22392d] border border-white/10 text-[#dce5d8] cursor-pointer shrink-0"
            aria-label={t.closeBtn}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(localFeedback || localError) && (
          <div
            role="status"
            className={`px-4 py-2 text-xs border-b ${
              localError
                ? 'bg-[#2a1618] border-[#e05a47]/35 text-[#f6d5d0]'
                : 'bg-[#13241c] border-[#e5a93c]/30 text-[#e8efe5]'
            }`}
          >
            {localError ?? localFeedback}
          </div>
        )}

        <div className="p-4 space-y-2.5">
          {subView === 'menu' && (
            <div className="space-y-2" data-testid="player-interaction-menu">
              <button
                type="button"
                data-testid="mp-action-view-profile"
                onClick={() => {
                  if (targetPlayer.publicProfileId) {
                    setFullProfileOpen(true);
                  } else {
                    setSubView('profile');
                  }
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#16261d] hover:bg-[#1e3428] border border-[#2f4b3c] text-sm font-display font-bold text-[#f2f6ef] flex items-center gap-2.5 cursor-pointer"
              >
                <Shield className="w-4 h-4 text-[#e5a93c] shrink-0" />
                <span>{t.mpActionViewProfile}</span>
              </button>

              {!isLocal && (
                <>
                  <button
                    type="button"
                    disabled={inviting || !currentRoom}
                    data-testid="mp-action-invite"
                    onClick={() => void handleInvite()}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#16261d] hover:bg-[#1e3428] disabled:opacity-50 border border-[#2f4b3c] text-sm font-display font-bold text-[#f2f6ef] flex items-center gap-2.5 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 text-[#7fe094] shrink-0" />
                    <span>{t.mpActionInvite}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="mp-action-toggle-friend"
                    onClick={() => void handleToggleFriend()}
                    className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0e1a14] hover:bg-[#17281f] border border-white/10 text-xs font-semibold text-[#c7d6c8] flex items-center gap-2.5 cursor-pointer"
                  >
                    {isFriend ? (
                      <UserX className="w-4 h-4 text-[#e5a93c] shrink-0" />
                    ) : (
                      <UserCheck className="w-4 h-4 text-[#7fe094] shrink-0" />
                    )}
                    <span>{isFriend ? t.mpActionRemoveFriend : t.mpActionAddFriend}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="mp-action-mute"
                    onClick={handleToggleMute}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-sm font-display font-bold flex items-center gap-2.5 cursor-pointer ${
                      isMuted
                        ? 'bg-[#2b2514] hover:bg-[#383019] border-[#e5a93c]/50 text-[#f7d488]'
                        : 'bg-[#16261d] hover:bg-[#1e3428] border-[#2f4b3c] text-[#f2f6ef]'
                    }`}
                  >
                    {isMuted ? (
                      <Volume2 className="w-4 h-4 text-[#f3c66c] shrink-0" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-[#e5a93c] shrink-0" />
                    )}
                    <span>{isMuted ? t.mpActionUnmute : t.mpActionMute}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="mp-action-block"
                    onClick={handleToggleBlock}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border text-sm font-display font-bold flex items-center gap-2.5 cursor-pointer ${
                      isBlocked
                        ? 'bg-[#2a1618] hover:bg-[#381d20] border-[#e05a47]/55 text-[#f4b1a7]'
                        : 'bg-[#16261d] hover:bg-[#2a1618] border-[#2f4b3c] hover:border-[#e05a47]/45 text-[#f2f6ef]'
                    }`}
                  >
                    <Ban className="w-4 h-4 text-[#e05a47] shrink-0" />
                    <span>{isBlocked ? t.mpActionUnblock : t.mpActionBlock}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="mp-action-report"
                    onClick={() => {
                      setLocalError(null);
                      setLocalFeedback(null);
                      setSubView('report');
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#241416] hover:bg-[#341a1d] border border-[#e05a47]/45 text-sm font-display font-bold text-[#f4b1a7] flex items-center gap-2.5 cursor-pointer"
                  >
                    <Flag className="w-4 h-4 text-[#e05a47] shrink-0" />
                    <span>{t.mpActionReport}</span>
                  </button>
                </>
              )}
            </div>
          )}

          {subView === 'profile' && (
            <div className="space-y-3" data-testid="mp-player-profile-view">
              <div className="text-xs font-bold uppercase tracking-wider text-[#9db1a1]">
                {t.mpProfileTitle}
              </div>

              <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0b1510] text-xs sm:text-sm">
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[#9db1a1]">{t.mpProfileRoleLabel}</span>
                  <span className="font-semibold text-[#f3c66c] inline-flex items-center gap-1">
                    {targetPlayer.isHost && <Crown className="w-3.5 h-3.5" />}
                    {targetPlayer.isHost ? t.mpProfileRoleHost : t.mpProfileRolePlayer}
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[#9db1a1]">{t.mpConnectionQualityLabel}</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#e6eee4]">
                    {quality === 'disconnected' ? (
                      <WifiOff className="w-3.5 h-3.5 text-[#e05a47]" />
                    ) : (
                      <Wifi className="w-3.5 h-3.5 text-[#7fe094]" />
                    )}
                    <span>
                      {qualityLabel}
                      {typeof (profile?.pingMs ?? targetPlayer.pingMs) === 'number' &&
                      quality !== 'disconnected'
                        ? ` (${profile?.pingMs ?? targetPlayer.pingMs} ${t.mpPingUnit})`
                        : ''}
                    </span>
                  </span>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[#9db1a1]">{t.mpProfileStatusLabel}</span>
                  <span className="inline-flex items-center gap-1 text-[#9ef0b0] font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {targetPlayer.isReady ? t.mpReady : t.mpNotReady}
                  </span>
                </div>

                {typeof targetPlayer.health === 'number' && (
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-[#9db1a1]">{t.mpProfileHealthLabel}</span>
                    <span dir="ltr" className="font-mono-num inline-flex items-center gap-1 text-[#f2f6ef]">
                      <Heart className="w-3.5 h-3.5 text-[#e05a47]" />
                      {Math.round(targetPlayer.health)} / {Math.round(targetPlayer.maxHealth ?? 100)}
                    </span>
                  </div>
                )}

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[#9db1a1]">{t.mpProfileJoinedAtLabel}</span>
                  <span dir="ltr" className="font-mono-num text-[#cddacb]">
                    {new Date(targetPlayer.joinedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-[#8ea593] bg-[#0b1510] border border-white/8 rounded-xl p-2.5">
                {t.mpProfileLocalSocialNote}
              </p>
            </div>
          )}

          {subView === 'report' && !isLocal && (
            <form
              onSubmit={handleSubmitReport}
              className="space-y-3"
              data-testid="mp-player-report-form"
            >
              <div>
                <div className="font-display font-bold text-sm text-[#ffffff]">
                  {t.mpReportTitle}
                </div>
                <p className="text-xs text-[#9db1a1] mt-0.5">
                  {t.mpReportSubtitle(targetPlayer.displayName)}
                </p>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#dce5d8] mb-1.5">
                  {t.mpReportReasonLabel}
                </div>
                <div className="space-y-1.5">
                  {ALLOWED_REPORT_REASONS.map((reason) => {
                    const selected = reportReason === reason;
                    return (
                      <button
                        key={reason}
                        type="button"
                        data-testid={`mp-report-reason-${reason}`}
                        onClick={() => setReportReason(reason)}
                        className={`w-full px-3 py-2 rounded-xl border text-xs sm:text-sm text-start font-medium cursor-pointer transition-colors ${
                          selected
                            ? 'bg-[#2c191b] border-[#e05a47] text-[#ffffff]'
                            : 'bg-[#0b1510] hover:bg-[#16261d] border-white/10 text-[#cddacb]'
                        }`}
                      >
                        {reasonLabels[reason]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="mp-report-details"
                  className="block text-xs font-semibold text-[#dce5d8] mb-1"
                >
                  {t.mpReportDetailsLabel}
                </label>
                <textarea
                  id="mp-report-details"
                  data-testid="mp-report-details-input"
                  dir="auto"
                  rows={2}
                  maxLength={PLAYER_REPORT_DETAILS_MAX_LENGTH}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder={t.mpReportDetailsPlaceholder}
                  className="w-full px-3 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-xs sm:text-sm text-[#f7faf5] placeholder-[#687e6d] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submittingReport}
                data-testid="mp-report-submit-btn"
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#e05a47] hover:bg-[#ec6c59] disabled:opacity-60 text-[#ffffff] font-display font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Flag className="w-4 h-4" />
                <span>{t.mpReportSubmitBtn}</span>
              </button>
            </form>
          )}
        </div>
      </div>
      {fullProfileOpen && (
        <PlayerProfileModal
          lang={lang}
          targetPublicProfileId={targetPlayer.publicProfileId}
          multiplayerService={service}
          targetRoomPlayerId={targetPlayer.id}
          targetFallbackName={targetPlayer.displayName}
          targetFallbackAvatar={targetPlayer.avatar}
          onClose={() => setFullProfileOpen(false)}
          onNotice={onNotice}
        />
      )}
    </div>
  );
};
