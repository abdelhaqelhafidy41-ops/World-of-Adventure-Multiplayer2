import React, { useEffect, useState } from 'react';
import { Check, RefreshCw, Sparkles, Upload, X } from 'lucide-react';
import {
  PRESET_AVATAR_IDS,
  type AvatarConfig,
} from '../../../shared/profileTypes';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import {
  PRESET_AVATARS,
  processCustomAvatarFile,
} from '../../game/profile/avatarUtils';
import { AvatarBadge } from './AvatarBadge';

const GENERATED_PALETTES = [
  '#38bdf8',
  '#22c55e',
  '#e5a93c',
  '#f43f5e',
  '#a855f7',
  '#14b8a6',
];

interface AvatarPickerModalProps {
  lang: Language;
  initialAvatar: AvatarConfig;
  playerName: string;
  onSelect: (avatar: AvatarConfig) => void;
  onClose: () => void;
}

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  lang,
  initialAvatar,
  playerName,
  onSelect,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const [tab, setTab] = useState<'presets' | 'generated' | 'upload'>(
    initialAvatar.kind === 'uploaded'
      ? 'upload'
      : initialAvatar.kind === 'generated'
        ? 'generated'
        : 'presets',
  );
  const [draft, setDraft] = useState<AvatarConfig>(initialAvatar);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [processingUpload, setProcessingUpload] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleRollGeneratedSeeds = () => {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    const nextSeed = `WA-${buf[0].toString(36).toUpperCase()}${buf[1].toString(36).toUpperCase()}`.slice(0, 12);
    setDraft({
      kind: 'generated',
      value: nextSeed,
      color: draft.color ?? '#38bdf8',
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setProcessingUpload(true);
    try {
      const processed = await processCustomAvatarFile(file);
      if (!processed.ok) {
        setUploadError(
          processed.code === 'FILE_TOO_LARGE'
            ? t.profileUploadTooLargeErr
            : processed.code === 'UNSUPPORTED_IMAGE_FORMAT'
              ? t.profileUploadInvalidFormatErr
              : t.profileUploadDecodeErr,
        );
      } else {
        setDraft(processed.avatar);
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : t.profileUploadDecodeErr,
      );
    } finally {
      setProcessingUpload(false);
    }
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      data-testid="avatar-picker-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16] border border-[#2f4b3c] text-[#f2f6ef] shadow-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-white/10 bg-[#0c1611] flex items-center justify-between gap-2 shrink-0">
          <h3 className="font-display text-base font-bold tracking-wide text-white">
            {t.profileSelectAvatarTitle}
          </h3>
          <button
            type="button"
            data-testid="avatar-picker-close"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] rounded-xl bg-[#182920] hover:bg-[#22392d] border border-white/10 flex items-center justify-center text-[#dce5d8] cursor-pointer"
            aria-label={t.closeBtn}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Live Preview */}
          <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#0c1611] border border-white/10">
            <AvatarBadge
              avatar={draft}
              seed={draft.kind === 'generated' ? draft.value : playerName || 'Explorer'}
              displayName={playerName || 'Explorer'}
              size="lg"
            />
            <div className="min-w-0">
              <div
                dir="auto"
                className="font-display font-bold text-sm sm:text-base text-white truncate"
              >
                {playerName.trim() || t.mpPlayerNamePlaceholder}
              </div>
              <div className="text-xs text-[#9db1a1] mt-0.5">
                {draft.kind === 'preset'
                  ? PRESET_AVATARS.find((p) => p.id === draft.value)?.[
                      lang === 'ar' ? 'labelAr' : 'labelEn'
                    ] ?? t.profilePresetsTab
                  : draft.kind === 'generated'
                    ? t.profileGeneratedTab
                    : t.profileUploadTab}
              </div>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#0a140f] border border-[#294034]">
            {(
              [
                { id: 'presets', label: t.profilePresetsTab },
                { id: 'generated', label: t.profileGeneratedTab },
                { id: 'upload', label: t.profileUploadTab },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`avatar-tab-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-display font-bold cursor-pointer transition-colors ${
                  tab === item.id
                    ? 'bg-[#20382b] text-white'
                    : 'text-[#9db1a1] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'presets' && (
            <div className="grid grid-cols-4 gap-2.5">
              {PRESET_AVATAR_IDS.map((presetId) => {
                const presetMeta = PRESET_AVATARS.find((p) => p.id === presetId);
                const selected =
                  draft.kind === 'preset' && draft.value === presetId;
                return (
                  <button
                    key={presetId}
                    type="button"
                    data-testid={`avatar-preset-${presetId}`}
                    onClick={() =>
                      setDraft({
                        kind: 'preset',
                        value: presetId,
                        color: presetMeta?.color ?? '#10b981',
                      })
                    }
                    className={`relative p-1.5 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                      selected
                        ? 'bg-[#20382b] border-[#e5a93c]'
                        : 'bg-[#0b1510] hover:bg-[#16261d] border-white/10'
                    }`}
                  >
                    <AvatarBadge
                      avatar={{ kind: 'preset', value: presetId, color: presetMeta?.color }}
                      size="md"
                      displayName={
                        lang === 'ar'
                          ? presetMeta?.labelAr ?? presetId
                          : presetMeta?.labelEn ?? presetId
                      }
                    />
                    <span className="text-[10px] text-[#cddacb] truncate w-full text-center">
                      {lang === 'ar'
                        ? presetMeta?.labelAr ?? presetId
                        : presetMeta?.labelEn ?? presetId}
                    </span>
                    {selected && (
                      <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#e5a93c] text-[#111914] flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'generated' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {GENERATED_PALETTES.map((color) => {
                  const selected =
                    draft.kind === 'generated' &&
                    (draft.color ?? '#38bdf8') === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        setDraft({
                          kind: 'generated',
                          value: (draft.kind === 'generated' ? draft.value : '') || playerName || 'Explorer',
                          color,
                        })
                      }
                      style={{ backgroundColor: color }}
                      className={`w-10 h-10 rounded-xl border-2 cursor-pointer ${
                        selected ? 'border-white scale-105' : 'border-white/25'
                      }`}
                      aria-label={color}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                data-testid="avatar-roll-generated-btn"
                onClick={handleRollGeneratedSeeds}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#16261d] hover:bg-[#1e3428] border border-[#2f4b3c] text-xs sm:text-sm font-display font-bold text-[#f2f6ef] inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#e5a93c]" />
                <RefreshCw className="w-3.5 h-3.5 text-[#7fe094]" />
                <span>{t.profileGeneratedTab}</span>
              </button>
            </div>
          )}

          {tab === 'upload' && (
            <div className="space-y-3">
              <label
                data-testid="avatar-upload-label"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#16261d] hover:bg-[#1e3428] border border-dashed border-[#3d634f] text-xs sm:text-sm font-display font-bold text-[#f2f6ef] flex items-center justify-center gap-2 cursor-pointer text-center"
              >
                <Upload className="w-4 h-4 text-[#e5a93c] shrink-0" />
                <span>
                  {processingUpload
                    ? t.profileSavingBtn
                    : t.profileChooseFileBtn}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  data-testid="avatar-upload-input"
                  className="hidden"
                  onChange={(e) => void handleFileChange(e)}
                />
              </label>

              <p className="text-[11px] leading-relaxed text-[#9db1a1]">
                {t.profileUploadHint}
              </p>

              {uploadError && (
                <div
                  role="alert"
                  className="p-2.5 rounded-xl bg-[#2a1618] border border-[#e05a47]/45 text-xs text-[#f6d5d0]"
                >
                  {uploadError}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3.5 border-t border-white/10 bg-[#0c1611] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-[#2f493b] text-xs sm:text-sm font-semibold text-[#e4ece1] cursor-pointer"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            data-testid="avatar-picker-confirm"
            onClick={() => {
              onSelect(draft);
              onClose();
            }}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs sm:text-sm cursor-pointer"
          >
            {t.profileAvatarSavedBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
