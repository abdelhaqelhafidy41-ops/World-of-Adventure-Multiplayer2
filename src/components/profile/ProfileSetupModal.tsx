import React, { useMemo, useState } from 'react';
import { Lock, ShieldCheck, UserPlus, X } from 'lucide-react';
import {
  sanitizeBio,
  sanitizeCountryRegion,
  validatePlayerName,
  validatePlayerTag,
  type AvatarConfig,
  type FavoriteGameMode,
  type OwnPlayerProfile,
} from '../../../shared/profileTypes';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import {
  generateSecureLocalPlayerTag,
  generateSecureLocalPublicProfileId,
} from '../../game/profile/AuthService';
import { ProfileManager } from '../../game/profile/ProfileManager';
import { AvatarBadge } from './AvatarBadge';
import { AvatarPickerModal } from './AvatarPickerModal';

interface ProfileSetupModalProps {
  lang: Language;
  onComplete: (profile: OwnPlayerProfile) => void;
  onCancel?: () => void;
}

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({
  lang,
  onComplete,
  onCancel,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const previewId = useMemo(() => generateSecureLocalPublicProfileId(), []);
  const [displayName, setDisplayName] = useState('');
  const [playerTag, setPlayerTag] = useState(() => generateSecureLocalPlayerTag());
  const [avatar, setAvatar] = useState<AvatarConfig>({
    kind: 'preset',
    value: 'ranger',
  });
  const [bio, setBio] = useState('');
  const [country, setCountry] = useState('');
  const [favoriteGameMode, setFavoriteGameMode] =
    useState<FavoriteGameMode>('normal');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nameValidation = useMemo(
    () => validatePlayerName(displayName),
    [displayName],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!nameValidation.ok) {
      setErrorMsg(nameValidation.reason ?? t.profilePlayerNameHint);
      return;
    }
    const cleanTag = playerTag.trim();
    if (cleanTag) {
      const tagValid = validatePlayerTag(cleanTag);
      if (!tagValid.ok) {
        setErrorMsg(tagValid.reason);
        return;
      }
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const created = await ProfileManager.createProfile({
        displayName: nameValidation.name,
        avatar,
        playerTag: cleanTag || undefined,
        bio: sanitizeBio(bio),
        country: sanitizeCountryRegion(country),
        favoriteGameMode,
        manualStatus: 'online',
      });
      onComplete(created);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to create profile.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const modes: Array<{ id: FavoriteGameMode; label: string }> = [
    { id: 'normal', label: t.worldTypeNormal },
    { id: 'survival', label: t.worldTypeSurvival },
    { id: 'adventure', label: t.worldTypeAdventure },
    { id: 'creative', label: t.worldTypeCreative },
  ];

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[85] flex items-center justify-center bg-[#07100b]/82 backdrop-blur-md p-3 sm:p-6 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      data-testid="profile-setup-modal"
    >
      <div className="w-full max-w-lg max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16] border border-[#2f4b3c] text-[#f2f6ef] shadow-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 bg-[#0c1611] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-xl font-bold tracking-wide text-white">
              {t.profileCreateTitle}
            </h2>
            <p className="text-xs text-[#9db1a1] mt-0.5">
              {t.profileCreateSubtitle}
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              data-testid="profile-setup-cancel"
              onClick={onCancel}
              className="min-w-[40px] min-h-[40px] rounded-xl bg-[#182920] hover:bg-[#22392d] border border-white/10 flex items-center justify-center text-[#dce5d8] cursor-pointer shrink-0"
              aria-label={t.closeBtn}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form
          id="profile-setup-form"
          onSubmit={handleSubmit}
          className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1"
        >
          {errorMsg && (
            <div
              role="alert"
              data-testid="profile-setup-error"
              className="p-3 rounded-xl bg-[#2a1618] border border-[#e05a47]/45 text-xs text-[#f6d5d0]"
            >
              {errorMsg}
            </div>
          )}

          {/* Profile Picture */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#9db1a1] mb-2">
              {t.profilePictureLabel}
            </div>
            <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#0c1611] border border-white/10">
              <AvatarBadge
                avatar={avatar}
                seed={avatar.kind === 'generated' ? avatar.value : displayName || previewId}
                displayName={displayName || 'Explorer'}
                size="lg"
                status="online"
              />
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  data-testid="profile-setup-avatar-btn"
                  onClick={() => setAvatarPickerOpen(true)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#345443] text-xs sm:text-sm font-display font-bold text-[#f2f6ef] cursor-pointer"
                >
                  {t.profileChangeAvatarBtn}
                </button>
              </div>
            </div>
          </div>

          {/* Player Name + Tag */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="profile-setup-name"
                  className="text-xs font-bold uppercase tracking-wider text-[#e6eee4]"
                >
                  {t.profilePlayerNameLabel}
                </label>
                <span dir="ltr" className="font-mono-num text-[11px] text-[#8ea593]">
                  {displayName.trim().length}/20
                </span>
              </div>
              <input
                id="profile-setup-name"
                type="text"
                dir="auto"
                required
                maxLength={20}
                data-testid="profile-setup-name-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t.mpPlayerNamePlaceholder}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
              />
              <p className="text-[11px] text-[#8ea593] mt-1">
                {t.profilePlayerNameHint}
              </p>
            </div>

            <div>
              <label
                htmlFor="profile-setup-tag"
                className="block text-xs font-bold uppercase tracking-wider text-[#e6eee4] mb-1.5"
              >
                {t.profilePlayerTagLabel}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono-num text-sm text-[#8ea593]">
                  #
                </span>
                <input
                  id="profile-setup-tag"
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={4}
                  data-testid="profile-setup-tag-input"
                  value={playerTag}
                  onChange={(e) =>
                    setPlayerTag(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  className="w-full min-h-[44px] pl-7 pr-3 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none font-mono-num text-sm text-[#f7faf5]"
                />
              </div>
            </div>
          </div>

          {/* Permanent Server-Issued Player ID Preview */}
          <div className="p-3 rounded-xl bg-[#0c1611] border border-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#9db1a1]">
                {t.profilePlayerIdLabel}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-[#e5a93c] font-semibold">
                <Lock className="w-3 h-3" />
                {t.profilePermanentBadge}
              </span>
            </div>
            <div
              dir="ltr"
              data-testid="profile-setup-id-preview"
              className="mt-1 font-mono-num text-sm font-bold text-[#f7faf5] flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4 text-[#7fe094] shrink-0" />
              <span>{previewId}</span>
            </div>
            <p className="text-[11px] text-[#8ea593] mt-1">
              {t.profileIdImmutableNote}
            </p>
          </div>

          {/* Optional Bio + Country */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="profile-setup-country"
                className="block text-xs font-bold uppercase tracking-wider text-[#e6eee4] mb-1.5"
              >
                {t.profileCountryLabel}
              </label>
              <input
                id="profile-setup-country"
                type="text"
                dir="auto"
                maxLength={40}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder={t.profileCountryPlaceholder}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d]"
              />
            </div>

            <div>
              <label
                htmlFor="profile-setup-mode"
                className="block text-xs font-bold uppercase tracking-wider text-[#e6eee4] mb-1.5"
              >
                {t.profileFavoriteModeLabel}
              </label>
              <select
                id="profile-setup-mode"
                value={favoriteGameMode}
                onChange={(e) =>
                  setFavoriteGameMode(e.target.value as FavoriteGameMode)
                }
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5]"
              >
                {modes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="profile-setup-bio"
              className="block text-xs font-bold uppercase tracking-wider text-[#e6eee4] mb-1.5"
            >
              {t.profileBioLabel}
            </label>
            <textarea
              id="profile-setup-bio"
              dir="auto"
              rows={2}
              maxLength={160}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t.profileBioPlaceholder}
              className="w-full px-3.5 py-2 rounded-xl bg-[#0a140f] border border-[#2f493b] focus:border-[#e5a93c] focus:outline-none text-sm text-[#f7faf5] placeholder-[#687e6d] resize-none"
            />
          </div>
        </form>

        <div className="px-4 sm:px-5 py-3.5 border-t border-white/10 bg-[#0c1611] flex flex-col sm:flex-row-reverse gap-2.5 shrink-0">
          <button
            type="submit"
            form="profile-setup-form"
            disabled={submitting || !nameValidation.ok}
            data-testid="profile-setup-submit"
            className="flex-1 min-h-[48px] px-5 py-2.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] disabled:opacity-50 text-[#111914] font-display font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>
              {submitting ? t.profileSavingBtn : t.profileCreateSubmitBtn}
            </span>
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[48px] px-4 py-2.5 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-sm font-semibold text-[#e4ece1] cursor-pointer"
            >
              {t.backBtn}
            </button>
          )}
        </div>
      </div>

      {avatarPickerOpen && (
        <AvatarPickerModal
          lang={lang}
          initialAvatar={avatar}
          playerName={displayName}
          onSelect={(next) => setAvatar(next)}
          onClose={() => setAvatarPickerOpen(false)}
        />
      )}
    </div>
  );
};
