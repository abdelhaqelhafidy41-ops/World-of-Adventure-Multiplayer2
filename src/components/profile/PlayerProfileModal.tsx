import React, { useEffect, useState } from 'react';
import {
  Ban,
  Check,
  Copy,
  Edit3,
  Flag,
  Lock,
  MessageSquare,
  Send,
  Shield,
  UserCheck,
  UserPlus,
  UserX,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  ALLOWED_REPORT_REASONS,
  PLAYER_REPORT_DETAILS_MAX_LENGTH,
  type PlayerReportReason,
} from '../../../shared/multiplayerProtocol';
import {
  sanitizeBio,
  sanitizeCountryRegion,
  validatePlayerName,
  validatePlayerTag,
  type AvatarConfig,
  type DirectMessageRecord,
  type EditablePresenceStatus,
  type FavoriteGameMode,
  type MessagePrivacyOption,
  type OwnPlayerProfile,
  type PlayerPrivacySettings,
  type PlayerProfileStats,
  type PublicPlayerProfile,
} from '../../../shared/profileTypes';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import { copyTextToClipboard } from '../../game/multiplayer/inviteUtils';
import type { IMultiplayerService } from '../../game/multiplayer/multiplayerTypes';
import { ProfileManager } from '../../game/profile/ProfileManager';
import { AvatarBadge } from './AvatarBadge';
import { AvatarPickerModal } from './AvatarPickerModal';

function formatPlayTime(totalSeconds: number, lang: Language): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (lang === 'ar') {
    return hrs > 0 ? `${hrs}س ${mins}د` : mins > 0 ? `${mins}د ${secs}ث` : `${secs}ث`;
  }
  return hrs > 0 ? `${hrs}h ${mins}m` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatDistance(meters: number, lang: Language): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} ${lang === 'ar' ? 'كم' : 'km'}`;
  }
  return `${Math.round(meters)} ${lang === 'ar' ? 'م' : 'm'}`;
}

interface PlayerProfileModalProps {
  lang: Language;
  /** Pass null/undefined or own publicProfileId to view & edit own profile */
  targetPublicProfileId?: string | null;
  /** Optional multiplayer room context for mute/invite/kick actions */
  multiplayerService?: IMultiplayerService | null;
  targetRoomPlayerId?: string | null;
  targetFallbackName?: string;
  targetFallbackAvatar?: AvatarConfig;
  onClose: () => void;
  onNotice?: (message: string) => void;
  onShowPlayerNamesChanged?: (enabled: boolean) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  lang,
  targetPublicProfileId,
  multiplayerService,
  targetRoomPlayerId,
  targetFallbackName,
  targetFallbackAvatar,
  onClose,
  onNotice,
  onShowPlayerNamesChanged,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const [storeSnap, setStoreSnap] = useState(() => ProfileManager.getSnapshot());
  const ownProfile = storeSnap.profile;
  const isSelf =
    !targetPublicProfileId ||
    (ownProfile && targetPublicProfileId === ownProfile.publicProfileId);

  const [remoteProfile, setRemoteProfile] = useState<PublicPlayerProfile | null>(null);
  const [relationship, setRelationship] = useState<{
    isSelf: boolean;
    isFriend: boolean;
    isBlockedByViewer: boolean;
  }>({
    isSelf: Boolean(isSelf),
    isFriend: false,
    isBlockedByViewer: false,
  });
  const [loadingRemote, setLoadingRemote] = useState(!isSelf);

  const [editing, setEditing] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [draftName, setDraftName] = useState(ownProfile?.displayName ?? '');
  const [draftTag, setDraftTag] = useState(ownProfile?.playerTag ?? '');
  const [draftAvatar, setDraftAvatar] = useState<AvatarConfig>(
    ownProfile?.avatar ?? { kind: 'preset', value: 'ranger' },
  );
  const [draftBio, setDraftBio] = useState(ownProfile?.bio ?? '');
  const [draftCountry, setDraftCountry] = useState(ownProfile?.country ?? '');
  const [draftMode, setDraftMode] = useState<FavoriteGameMode>(
    ownProfile?.favoriteGameMode ?? 'normal',
  );
  const [draftStatus, setDraftStatus] = useState<EditablePresenceStatus>(
    ownProfile?.manualStatus ?? 'online',
  );
  const [draftPrivacy, setDraftPrivacy] = useState<PlayerPrivacySettings>(
    ownProfile?.privacy ?? {
      showOnlineStatus: true,
      showPlayerName: true,
      allowFriendRequests: true,
      allowGameInvites: true,
      allowMessages: 'everyone',
    },
  );
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Direct Messages & Report sub-panels for remote players
  const [subPanel, setSubPanel] = useState<'overview' | 'messages' | 'report'>(
    'overview',
  );
  const [dmMessages, setDmMessages] = useState<DirectMessageRecord[]>([]);
  const [dmDraft, setDmDraft] = useState('');
  const [dmLoading, setDmLoading] = useState(false);
  const [reportReason, setReportReason] = useState<PlayerReportReason>(
    'inappropriate_profile',
  );
  const [reportDetails, setReportDetails] = useState('');

  useEffect(() => {
    return ProfileManager.subscribe((next) => setStoreSnap(next));
  }, []);

  useEffect(() => {
    if (isSelf || !targetPublicProfileId) {
      setLoadingRemote(false);
      return;
    }
    let cancelled = false;
    setLoadingRemote(true);
    void ProfileManager.getPublicProfile(targetPublicProfileId).then((res) => {
      if (cancelled) return;
      if (res) {
        setRemoteProfile(res.profile);
        setRelationship(res.relationship);
      }
      setLoadingRemote(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isSelf, targetPublicProfileId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !avatarPickerOpen) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [avatarPickerOpen, onClose]);

  const activeProfile: OwnPlayerProfile | PublicPlayerProfile | null = isSelf
    ? ownProfile
    : remoteProfile;

  const displayName =
    activeProfile?.displayName ?? targetFallbackName ?? 'Explorer';
  const displayTag = activeProfile?.playerTag ?? '';
  const displayId =
    activeProfile?.publicProfileId ?? targetPublicProfileId ?? '';
  const displayAvatar: AvatarConfig =
    activeProfile?.avatar ?? targetFallbackAvatar ?? { kind: 'preset', value: 'ranger' };
  const displayStatus = activeProfile?.presenceStatus ?? 'offline';
  const stats: PlayerProfileStats | undefined = activeProfile?.stats;

  const statusLabel =
    displayStatus === 'in-game'
      ? t.profileStatusInGame
      : displayStatus === 'away'
        ? t.profileStatusAway
        : displayStatus === 'offline'
          ? t.profileStatusOffline
          : t.profileStatusOnline;

  const modeLabel = (m: FavoriteGameMode) =>
    m === 'survival'
      ? t.worldTypeSurvival
      : m === 'adventure'
        ? t.worldTypeAdventure
        : m === 'creative'
          ? t.worldTypeCreative
          : t.worldTypeNormal;

  const handleEnterEdit = () => {
    if (!ownProfile) return;
    setDraftName(ownProfile.displayName);
    setDraftTag(ownProfile.playerTag);
    setDraftAvatar(ownProfile.avatar);
    setDraftBio(ownProfile.bio);
    setDraftCountry(ownProfile.country);
    setDraftMode(ownProfile.favoriteGameMode);
    setDraftStatus(ownProfile.manualStatus);
    setDraftPrivacy(ownProfile.privacy);
    setErrorMsg(null);
    setFeedback(null);
    setEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !ownProfile) return;
    const valid = validatePlayerName(draftName);
    if (!valid.ok) {
      setErrorMsg(valid.reason ?? t.profilePlayerNameHint);
      return;
    }
    if (draftTag) {
      const tagCheck = validatePlayerTag(draftTag);
      if (!tagCheck.ok) {
        setErrorMsg(tagCheck.reason);
        return;
      }
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const updated = await ProfileManager.updateProfile({
        displayName: valid.name,
        avatar: draftAvatar,
        playerTag: draftTag || ownProfile.playerTag,
        bio: sanitizeBio(draftBio),
        country: sanitizeCountryRegion(draftCountry),
        favoriteGameMode: draftMode,
        manualStatus: draftStatus,
        privacy: draftPrivacy,
      });
      if (updated) {
        onShowPlayerNamesChanged?.(updated.privacy.showPlayerName);
      }
      setEditing(false);
      setFeedback(t.settingsAppliedNotice);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrivacyToggle = async (patch: Partial<PlayerPrivacySettings>) => {
    if (!ownProfile) return;
    const nextPrivacy = { ...ownProfile.privacy, ...patch };
    try {
      const updated = await ProfileManager.updateProfile({ privacy: nextPrivacy });
      if (updated && typeof patch.showPlayerName === 'boolean') {
        onShowPlayerNamesChanged?.(updated.privacy.showPlayerName);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleOpenMessages = async () => {
    if (!displayId) return;
    setSubPanel('messages');
    setDmLoading(true);
    const msgs = await ProfileManager.getDirectMessages(displayId);
    setDmMessages(msgs);
    setDmLoading(false);
  };

  const handleSendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayId || !dmDraft.trim()) return;
    setErrorMsg(null);
    try {
      const sent = await ProfileManager.sendDirectMessage(displayId, dmDraft);
      setDmMessages((prev) => [...prev, sent]);
      setDmDraft('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.profileDmUnavailable);
    }
  };

  const handleSendProfileReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayId) return;
    setErrorMsg(null);
    try {
      await ProfileManager.submitProfileReport(
        displayId,
        reportReason,
        reportDetails.trim() || undefined,
      );
      const msg = t.mpReportSubmittedNotice(displayName);
      setFeedback(msg);
      onNotice?.(msg);
      setSubPanel('overview');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Report failed.');
    }
  };

  const isOutgoingPending = storeSnap.outgoingRequests.some(
    (r) => r.toPublicProfileId === displayId,
  );
  const incomingReq = storeSnap.incomingRequests.find(
    (r) => r.fromPublicProfileId === displayId,
  );
  const isFriend =
    relationship.isFriend ||
    storeSnap.friends.some((f) => f.publicProfileId === displayId);
  const isBlocked =
    relationship.isBlockedByViewer ||
    storeSnap.blockedPlayers.some((b) => b.publicProfileId === displayId);
  const isMuted =
    Boolean(targetRoomPlayerId) &&
    Boolean(
      multiplayerService?.isPlayerMuted(targetRoomPlayerId!, displayName),
    );
  const activeRoom = multiplayerService?.getRoomState() ?? null;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[85] flex items-center justify-center bg-[#07100b]/80 backdrop-blur-md p-3 sm:p-5 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      data-testid="player-profile-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16] border border-[#2f4b3c] text-[#f2f6ef] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 bg-[#0c1611] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-[#e5a93c] shrink-0" />
            <h2 className="font-display text-base sm:text-lg font-bold tracking-wide text-white truncate">
              {t.mpProfileTitle}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSelf && ownProfile && !editing && (
              <button
                type="button"
                data-testid="profile-edit-btn"
                onClick={handleEnterEdit}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#345443] text-xs font-display font-bold text-[#f2f6ef] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#e5a93c]" />
                <span>{t.profileEditBtn}</span>
              </button>
            )}
            <button
              type="button"
              data-testid="player-profile-close"
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] rounded-xl bg-[#182920] hover:bg-[#22392d] border border-white/10 flex items-center justify-center text-[#dce5d8] cursor-pointer"
              aria-label={t.closeBtn}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(feedback || errorMsg) && (
          <div
            role="status"
            className={`px-4 py-2 text-xs border-b shrink-0 ${
              errorMsg
                ? 'bg-[#2a1618] border-[#e05a47]/35 text-[#f6d5d0]'
                : 'bg-[#13241c] border-[#e5a93c]/30 text-[#e8efe5]'
            }`}
          >
            {errorMsg ?? feedback}
          </div>
        )}

        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {loadingRemote ? (
            <div className="py-10 text-center text-sm text-[#9db1a1]">
              {t.loadingDefault}
            </div>
          ) : editing && isSelf && ownProfile ? (
            <form
              id="profile-edit-form"
              onSubmit={handleSaveEdit}
              className="space-y-4"
            >
              <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#0c1611] border border-white/10">
                <AvatarBadge
                  avatar={draftAvatar}
                  seed={draftAvatar.kind === 'generated' ? draftAvatar.value : draftName}
                  displayName={draftName}
                  size="lg"
                  status={draftStatus}
                />
                <button
                  type="button"
                  data-testid="profile-edit-avatar-btn"
                  onClick={() => setAvatarPickerOpen(true)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#345443] text-xs sm:text-sm font-display font-bold text-[#f2f6ef] cursor-pointer"
                >
                  {t.profileChangeAvatarBtn}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase text-[#e6eee4] mb-1">
                    {t.profilePlayerNameLabel}
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    maxLength={20}
                    data-testid="profile-edit-name-input"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-[#e6eee4] mb-1">
                    {t.profilePlayerTagLabel}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={4}
                    data-testid="profile-edit-tag-input"
                    value={draftTag}
                    onChange={(e) =>
                      setDraftTag(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none font-mono-num text-sm text-[#f7faf5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-[#e6eee4] mb-1">
                    {t.profileStatusLabel}
                  </label>
                  <select
                    value={draftStatus}
                    onChange={(e) =>
                      setDraftStatus(e.target.value as EditablePresenceStatus)
                    }
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] text-sm text-[#f7faf5]"
                  >
                    <option value="online">{t.profileStatusOnline}</option>
                    <option value="away">{t.profileStatusAway}</option>
                    <option value="offline">{t.profileStatusOffline}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#e6eee4] mb-1">
                    {t.profileCountryLabel}
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    maxLength={40}
                    value={draftCountry}
                    onChange={(e) => setDraftCountry(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] text-sm text-[#f7faf5]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#e6eee4] mb-1">
                    {t.profileFavoriteModeLabel}
                  </label>
                  <select
                    value={draftMode}
                    onChange={(e) =>
                      setDraftMode(e.target.value as FavoriteGameMode)
                    }
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] text-sm text-[#f7faf5]"
                  >
                    <option value="normal">{t.worldTypeNormal}</option>
                    <option value="survival">{t.worldTypeSurvival}</option>
                    <option value="adventure">{t.worldTypeAdventure}</option>
                    <option value="creative">{t.worldTypeCreative}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-[#e6eee4] mb-1">
                  {t.profileBioLabel}
                </label>
                <textarea
                  dir="auto"
                  rows={2}
                  maxLength={160}
                  value={draftBio}
                  onChange={(e) => setDraftBio(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] text-sm text-[#f7faf5] resize-none"
                />
              </div>

              {/* Permanent Non-Editable ID */}
              <div className="p-3 rounded-xl bg-[#0b1510] border border-white/10 flex items-center justify-between gap-2 text-xs">
                <span className="text-[#9db1a1] inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#e5a93c]" />
                  {t.profilePlayerIdLabel} ({t.profilePermanentBadge})
                </span>
                <span dir="ltr" className="font-mono-num font-bold text-white">
                  {ownProfile.publicProfileId}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row-reverse gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  data-testid="profile-save-btn"
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-sm cursor-pointer"
                >
                  {saving ? t.profileSavingBtn : t.profileSaveBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-sm font-semibold text-[#e4ece1] cursor-pointer"
                >
                  {t.profileCancelEditBtn}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Identity Banner */}
              <div className="p-4 rounded-xl bg-[#0c1611] border border-[#2b4436] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <AvatarBadge
                    avatar={displayAvatar}
                    seed={displayAvatar.kind === 'generated' ? displayAvatar.value : displayId || displayName}
                    displayName={displayName}
                    size="xl"
                    status={displayStatus}
                  />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <h3
                        dir="auto"
                        data-testid="profile-modal-display-name"
                        className="font-display text-lg sm:text-xl font-bold text-white truncate"
                      >
                        {displayName}
                      </h3>
                      {displayTag && (
                        <span
                          dir="ltr"
                          className="font-mono-num text-sm font-semibold text-[#9db1a1]"
                        >
                          #{displayTag}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#9db1a1]">
                      <span
                        className={
                          displayStatus === 'online'
                            ? 'text-[#7fe094] font-semibold'
                            : displayStatus === 'in-game'
                              ? 'text-[#38bdf8] font-semibold'
                              : displayStatus === 'away'
                                ? 'text-[#e5a93c] font-semibold'
                                : 'text-[#94a3b8]'
                        }
                      >
                        {statusLabel}
                      </span>
                      {activeProfile?.currentRoomName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[180px]">
                            {activeProfile.currentRoomName}
                          </span>
                        </>
                      )}
                      {activeProfile?.country && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span dir="auto">{activeProfile.country}</span>
                        </>
                      )}
                      {activeProfile?.favoriteGameMode && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{modeLabel(activeProfile.favoriteGameMode)}</span>
                        </>
                      )}
                    </div>

                    {displayId && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          dir="ltr"
                          data-testid="profile-modal-player-id"
                          className="font-mono-num text-xs text-[#e5a93c]"
                        >
                          {displayId}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (await copyTextToClipboard(displayId)) {
                              setCopiedId(true);
                              setTimeout(() => setCopiedId(false), 1600);
                            }
                          }}
                          className="text-[11px] text-[#b7cab9] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId ? (
                            <Check className="w-3 h-3 text-[#7fe094]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>
                            {copiedId ? t.profileIdCopiedNotice : t.profileCopyIdBtn}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isSelf && ownProfile && (
                  <div className="shrink-0">
                    <select
                      aria-label={t.profileStatusLabel}
                      value={ownProfile.manualStatus}
                      onChange={(e) =>
                        void ProfileManager.updatePresence({
                          manualStatus: e.target.value as EditablePresenceStatus,
                        })
                      }
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#182920] border border-[#2f493b] text-xs font-semibold text-[#f2f6ef]"
                    >
                      <option value="online">{t.profileStatusOnline}</option>
                      <option value="away">{t.profileStatusAway}</option>
                      <option value="offline">{t.profileStatusOffline}</option>
                    </select>
                  </div>
                )}
              </div>

              {activeProfile?.bio && (
                <p
                  dir="auto"
                  className="p-3 rounded-xl bg-[#0c1611] border border-white/10 text-xs sm:text-sm text-[#dbe5d7] leading-relaxed"
                >
                  {activeProfile.bio}
                </p>
              )}

              {/* Other Player Actions */}
              {!isSelf && (
                <div className="flex flex-wrap gap-2">
                  {activeRoom && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!multiplayerService) return;
                        try {
                          await multiplayerService.sendInvite(
                            displayName,
                            displayId || undefined,
                          );
                          const msg = t.mpInviteSentNotice(displayName);
                          setFeedback(msg);
                          onNotice?.(msg);
                        } catch (err) {
                          setErrorMsg(
                            err instanceof Error
                              ? err.message
                              : t.mpFriendActionRequiresBackend,
                          );
                        }
                      }}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{t.mpActionInvite}</span>
                    </button>
                  )}

                  {displayId && (
                    <>
                      {incomingReq ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await ProfileManager.respondFriendRequest(
                              incomingReq.requestId,
                              'accept',
                            );
                            setRelationship((r) => ({ ...r, isFriend: true }));
                          }}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#1b3a29] hover:bg-[#234d36] border border-[#7fe094]/45 text-xs font-display font-bold text-[#9ef0b0] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{t.mpAcceptBtn}</span>
                        </button>
                      ) : isFriend ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await ProfileManager.removeFriend(displayId);
                            setRelationship((r) => ({ ...r, isFriend: false }));
                          }}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserX className="w-3.5 h-3.5 text-[#e5a93c]" />
                          <span>{t.mpActionRemoveFriend}</span>
                        </button>
                      ) : isOutgoingPending ? (
                        <span className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#14221b] border border-white/10 text-xs font-semibold text-[#9db1a1] inline-flex items-center">
                          {t.profilePendingRequestBadge}
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid="profile-add-friend-btn"
                          onClick={async () => {
                            try {
                              await ProfileManager.sendFriendRequest(displayId);
                              setFeedback(t.mpFriendAddedNotice(displayName));
                            } catch (err) {
                              setErrorMsg(
                                err instanceof Error
                                  ? err.message
                                  : t.mpFriendActionRequiresBackend,
                              );
                            }
                          }}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#345443] text-xs font-display font-bold text-[#f2f6ef] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5 text-[#7fe094]" />
                          <span>{t.profileSendFriendRequestBtn}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        data-testid="profile-open-dm-btn"
                        onClick={() => void handleOpenMessages()}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#e5a93c]" />
                        <span>{t.profileDirectMessageBtn}</span>
                      </button>

                      {targetRoomPlayerId && multiplayerService && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isMuted) {
                              multiplayerService.unmutePlayer(
                                targetRoomPlayerId,
                                displayName,
                              );
                            } else {
                              multiplayerService.mutePlayer(
                                targetRoomPlayerId,
                                displayName,
                              );
                            }
                          }}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs font-semibold text-[#e4ece1] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {isMuted ? (
                            <Volume2 className="w-3.5 h-3.5 text-[#7fe094]" />
                          ) : (
                            <VolumeX className="w-3.5 h-3.5 text-[#e5a93c]" />
                          )}
                          <span>
                            {isMuted ? t.mpActionUnmute : t.mpActionMute}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={async () => {
                          if (isBlocked) {
                            await ProfileManager.unblockProfile(displayId);
                            if (targetRoomPlayerId) {
                              multiplayerService?.unblockPlayer(
                                targetRoomPlayerId,
                                displayName,
                              );
                            }
                            setRelationship((r) => ({
                              ...r,
                              isBlockedByViewer: false,
                            }));
                          } else {
                            await ProfileManager.blockProfile(displayId);
                            if (targetRoomPlayerId) {
                              multiplayerService?.blockPlayer(
                                targetRoomPlayerId,
                                displayName,
                              );
                            }
                            setRelationship((r) => ({
                              ...r,
                              isBlockedByViewer: true,
                              isFriend: false,
                            }));
                          }
                        }}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#241416] hover:bg-[#341a1d] border border-[#e05a47]/45 text-xs font-semibold text-[#f4b1a7] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>
                          {isBlocked ? t.mpActionUnblock : t.mpActionBlock}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSubPanel((p) => (p === 'report' ? 'overview' : 'report'))
                        }
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#241416] hover:bg-[#341a1d] border border-[#e05a47]/45 text-xs font-semibold text-[#f4b1a7] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        <span>{t.mpActionReport}</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Direct Messages Subpanel */}
              {!isSelf && subPanel === 'messages' && (
                <div className="p-3.5 rounded-xl bg-[#0c1611] border border-[#2b4436] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display text-xs font-bold uppercase tracking-wider text-[#e5a93c]">
                      {t.profileDirectMessagesTitle}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSubPanel('overview')}
                      className="text-xs text-[#9db1a1] hover:text-white cursor-pointer"
                    >
                      {t.closeBtn}
                    </button>
                  </div>

                  <div className="max-h-44 overflow-y-auto space-y-2">
                    {dmLoading ? (
                      <div className="text-xs text-[#9db1a1]">
                        {t.loadingDefault}
                      </div>
                    ) : dmMessages.length === 0 ? (
                      <div className="text-xs text-[#7c9482]">
                        {t.profileDmEmpty}
                      </div>
                    ) : (
                      dmMessages.map((m) => {
                        const mine =
                          m.fromPublicProfileId === ownProfile?.publicProfileId;
                        return (
                          <div
                            key={m.id}
                            className={`p-2 rounded-lg text-xs ${
                              mine
                                ? 'bg-[#172c21] border border-[#e5a93c]/25'
                                : 'bg-[#0a130e] border border-white/10'
                            }`}
                          >
                            <div
                              dir="auto"
                              className="text-[#eef3ed] leading-relaxed"
                            >
                              {m.message}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form onSubmit={handleSendDm} className="flex gap-2">
                    <input
                      type="text"
                      dir="auto"
                      maxLength={320}
                      data-testid="profile-dm-input"
                      value={dmDraft}
                      onChange={(e) => setDmDraft(e.target.value)}
                      placeholder={t.profileDmPlaceholder}
                      className="flex-1 min-w-0 min-h-[40px] px-3 py-1.5 rounded-xl bg-[#08100c] border border-[#2f493b] text-xs text-white"
                    />
                    <button
                      type="submit"
                      disabled={!dmDraft.trim()}
                      data-testid="profile-dm-send"
                      className="min-h-[40px] px-3.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-50 text-[#111914] font-display font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {/* Report Profile Subpanel */}
              {!isSelf && subPanel === 'report' && (
                <form
                  onSubmit={handleSendProfileReport}
                  className="p-3.5 rounded-xl bg-[#0c1611] border border-[#e05a47]/35 space-y-3"
                >
                  <div className="font-display text-xs font-bold uppercase text-[#f4b1a7]">
                    {t.mpReportTitle}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {ALLOWED_REPORT_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setReportReason(r)}
                        className={`px-3 py-2 rounded-xl border text-xs text-start cursor-pointer ${
                          reportReason === r
                            ? 'bg-[#2c191b] border-[#e05a47] text-white'
                            : 'bg-[#0b1510] border-white/10 text-[#cddacb]'
                        }`}
                      >
                        {r === 'spam'
                          ? t.mpReportReasonSpam
                          : r === 'harassment'
                            ? t.mpReportReasonHarassment
                            : r === 'cheating'
                              ? t.mpReportReasonCheating
                              : r === 'inappropriate_name'
                                ? t.mpReportReasonInappropriateName
                                : r === 'inappropriate_profile'
                                  ? t.mpReportReasonInappropriateProfile
                                  : t.mpReportReasonOther}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    dir="auto"
                    maxLength={PLAYER_REPORT_DETAILS_MAX_LENGTH}
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder={t.mpReportDetailsPlaceholder}
                    className="w-full px-3 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] text-xs text-white resize-none"
                  />
                  <button
                    type="submit"
                    className="w-full min-h-[40px] rounded-xl bg-[#e05a47] hover:bg-[#ec6c59] text-white font-display font-bold text-xs cursor-pointer"
                  >
                    {t.mpReportSubmitBtn}
                  </button>
                </form>
              )}

              {/* Real Tracked Statistics */}
              {stats && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#9db1a1] mb-2">
                    {t.profileStatisticsTitle}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { label: t.profileStatLevel, val: String(stats.level) },
                        {
                          label: t.profileStatExperience,
                          val: `${stats.xp} / ${stats.xpToNextLevel}`,
                        },
                        {
                          label: t.profileStatPlayTime,
                          val: formatPlayTime(stats.playTimeSeconds, lang),
                        },
                        {
                          label: t.profileStatWorldsCreated,
                          val: String(stats.worldsCreated),
                        },
                        {
                          label: t.profileStatWorldsJoined,
                          val: String(stats.worldsJoined),
                        },
                        {
                          label: t.profileStatQuestsCompleted,
                          val: String(stats.questsCompleted),
                        },
                        {
                          label: t.profileStatEnemiesDefeated,
                          val: String(stats.enemiesDefeated),
                        },
                        {
                          label: t.profileStatAnimalsDefeated,
                          val: String(stats.animalsDefeated),
                        },
                        {
                          label: t.profileStatVillagesDiscovered,
                          val: String(stats.villagesDiscovered),
                        },
                        {
                          label: t.profileStatResourcesCollected,
                          val: String(stats.resourcesCollected),
                        },
                        {
                          label: t.profileStatDistanceTraveled,
                          val: formatDistance(stats.distanceTraveledMeters, lang),
                        },
                      ] as const
                    ).map((item) => (
                      <div
                        key={item.label}
                        className="p-2.5 rounded-xl bg-[#0c1611] border border-white/10"
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8ea593]">
                          {item.label}
                        </div>
                        <div
                          dir="ltr"
                          className="font-mono-num text-sm sm:text-base font-bold text-[#f7faf5] mt-0.5"
                        >
                          {item.val}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Self Privacy Controls & Blocked List */}
              {isSelf && ownProfile && (
                <div className="space-y-2.5 pt-2 border-t border-white/10">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#9db1a1]">
                    {t.profilePrivacyTitle}
                  </h4>

                  <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0c1611] text-xs sm:text-sm">
                    {(
                      [
                        {
                          key: 'showOnlineStatus',
                          label: t.profilePrivacyShowOnline,
                          val: ownProfile.privacy.showOnlineStatus,
                        },
                        {
                          key: 'showPlayerName',
                          label: t.profilePrivacyShowNames,
                          val: ownProfile.privacy.showPlayerName,
                        },
                        {
                          key: 'allowFriendRequests',
                          label: t.profilePrivacyAllowFriends,
                          val: ownProfile.privacy.allowFriendRequests,
                        },
                        {
                          key: 'allowGameInvites',
                          label: t.profilePrivacyAllowInvites,
                          val: ownProfile.privacy.allowGameInvites,
                        },
                      ] as const
                    ).map((row) => (
                      <div
                        key={row.key}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2"
                      >
                        <span className="text-[#dce5d8]">{row.label}</span>
                        <button
                          type="button"
                          data-testid={`privacy-toggle-${row.key}`}
                          onClick={() =>
                            void handlePrivacyToggle({ [row.key]: !row.val })
                          }
                          className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-display font-bold cursor-pointer ${
                            row.val
                              ? 'bg-[#20382b] border-[#e5a93c] text-white'
                              : 'bg-[#0a140f] border-white/15 text-[#9db1a1]'
                          }`}
                        >
                          {row.val ? t.mpToggleOn : t.mpToggleOff}
                        </button>
                      </div>
                    ))}

                    <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-[#dce5d8]">
                        {t.profilePrivacyAllowMessages}
                      </span>
                      <select
                        value={ownProfile.privacy.allowMessages}
                        onChange={(e) =>
                          void handlePrivacyToggle({
                            allowMessages: e.target.value as MessagePrivacyOption,
                          })
                        }
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#0a140f] border border-[#2f493b] text-xs font-semibold text-[#f2f6ef]"
                      >
                        <option value="everyone">
                          {t.profileMsgPrivacyEveryone}
                        </option>
                        <option value="friends">
                          {t.profileMsgPrivacyFriends}
                        </option>
                        <option value="nobody">
                          {t.profileMsgPrivacyNobody}
                        </option>
                      </select>
                    </div>
                  </div>

                  {storeSnap.blockedPlayers.length > 0 && (
                    <div className="pt-2">
                      <h5 className="text-xs font-bold uppercase text-[#9db1a1] mb-1.5">
                        {t.profileBlockedPlayersTitle}
                      </h5>
                      <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#0c1611]">
                        {storeSnap.blockedPlayers.map((b) => (
                          <div
                            key={b.publicProfileId}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <AvatarBadge
                                avatar={b.avatar}
                                seed={b.publicProfileId}
                                displayName={b.displayName}
                                size="xs"
                              />
                              <span dir="auto" className="truncate font-semibold">
                                {b.displayName}
                              </span>
                              <span className="font-mono-num text-[#8ea593]">
                                #{b.playerTag}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void ProfileManager.unblockProfile(
                                  b.publicProfileId,
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-[#182920] border border-[#2f493b] text-xs text-[#e4ece1] cursor-pointer"
                            >
                              {t.mpActionUnblock}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {avatarPickerOpen && (
        <AvatarPickerModal
          lang={lang}
          initialAvatar={draftAvatar}
          playerName={draftName}
          onSelect={(next) => setDraftAvatar(next)}
          onClose={() => setAvatarPickerOpen(false)}
        />
      )}
    </div>
  );
};
