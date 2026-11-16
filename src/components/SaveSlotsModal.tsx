import React, { useState } from 'react';
import {
  Clock,
  FolderOpen,
  HardDriveDownload,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  BIOME_LABELS,
  UI_TEXT,
  type Language,
} from '../game/i18n/translations';
import { WEATHER_LABELS } from '../game/world/WeatherManager';
import type { SaveSlotId, SaveSlotSummary } from '../game/save/saveTypes';

interface SaveSlotsModalProps {
  slots: SaveSlotSummary[];
  allowSave: boolean;
  lang: Language;
  onSaveSlot: (slotId: SaveSlotId) => void;
  onLoadSlot: (slotId: SaveSlotId) => void;
  onDeleteSlot: (slotId: SaveSlotId) => void;
  onClose: () => void;
}

function formatPlayTime(totalSeconds: number, lang: Language): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (lang === 'ar') {
    if (hrs > 0) return `${hrs}س ${remMins}د`;
    if (mins > 0) return `${mins}د ${secs}ث`;
    return `${secs}ث`;
  }
  if (hrs > 0) return `${hrs}h ${remMins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatSavedDate(ms: number, lang: Language): string {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleTimeString();
  }
}

export const SaveSlotsModal: React.FC<SaveSlotsModalProps> = ({
  slots,
  allowSave,
  lang,
  onSaveSlot,
  onLoadSlot,
  onDeleteSlot,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const [confirmDeleteId, setConfirmDeleteId] = useState<SaveSlotId | null>(null);

  const getSlotTitle = (slotId: SaveSlotId): string => {
    if (slotId === 'autosave') return t.saveSlotAutosave;
    const idx = slotId === 'slot-1' ? 1 : slotId === 'slot-2' ? 2 : 3;
    return t.saveSlotManual(idx);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#08100c]/80 p-3 sm:p-4 mobile-hud-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-slots-title"
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full max-w-xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16] border border-[#2b4235] text-[#f1f5ee] shadow-2xl overflow-hidden overflow-x-hidden"
      >
        <div className="px-5 py-4 border-b border-[#24382d] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#192c22] border border-[#314b3c] flex items-center justify-center">
              <Save className="w-4 h-4 text-[#e5a93c]" />
            </div>
            <div>
              <h2
                id="save-slots-title"
                className="font-display text-lg font-bold tracking-tight"
              >
                {t.saveLoadTitle}
              </h2>
              <p className="text-[11px] text-[#9ab09f]">
                {t.saveSlotsFooterHint}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-[#192a21] hover:bg-[#233b2e] border border-[#2f493b] flex items-center justify-center cursor-pointer shrink-0"
            aria-label={t.closeBtn}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {slots.map((slot) => {
            const meta = slot.meta;
            const slotTitle = getSlotTitle(slot.slotId);
            const isConfirmingDelete = confirmDeleteId === slot.slotId;

            return (
              <div
                key={slot.slotId}
                className={`rounded-xl border p-3.5 sm:p-4 transition-colors ${
                  slot.exists
                    ? 'bg-[#14231b] border-[#2c4537]'
                    : 'bg-[#0d1812] border-[#213329]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-semibold text-sm text-[#f4f7f1]">
                        {slotTitle}
                      </span>
                      {slot.isAutosave && (
                        <span className="px-2 py-0.5 rounded bg-[#1b3024] border border-[#335241] text-[10px] font-medium text-[#a3d9b1]">
                          v{meta?.version ?? 2}
                        </span>
                      )}
                      {meta && (
                        <span className="text-[11px] font-mono-num text-[#98ae9d]">
                          {formatSavedDate(meta.savedAtMs, lang)}
                        </span>
                      )}
                    </div>

                    {meta ? (
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs text-[#c8d8c7]">
                        <div>
                          <span className="text-[#8ea594]">
                            {BIOME_LABELS[lang][meta.biome]}
                          </span>{' '}
                          ·{' '}
                          <span className="font-mono-num text-[#e5a93c] font-semibold">
                            {t.levelShort}
                            {meta.level}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 font-mono-num">
                          <Clock className="w-3 h-3 text-[#8ea594]" />
                          <span>{meta.timeLabel}</span>
                        </div>
                        <div>{WEATHER_LABELS[lang][meta.weatherState]}</div>
                        <div className="text-[11px] text-[#9eb4a2]">
                          {t.questsCountLabel(
                            meta.completedQuestsCount,
                            meta.activeQuestsCount,
                          )}
                        </div>
                        <div className="text-[11px] font-mono-num text-[#9eb4a2]">
                          {t.playTimeLabel}: {formatPlayTime(meta.playTimeSeconds, lang)}
                        </div>
                        <div
                          className="text-[11px] font-mono-num text-[#879d8c]"
                          dir="ltr"
                        >
                          {t.seedLabel} #{meta.worldSeed}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-xs text-[#7c9281]">
                        {t.emptySlotLabel}
                      </p>
                    )}
                  </div>

                  {/* Slot Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {allowSave && !slot.isAutosave && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          onSaveSlot(slot.slotId);
                        }}
                        className="h-8 px-3 rounded-lg bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <HardDriveDownload className="w-3.5 h-3.5" />
                        <span>{slot.exists ? t.overwriteBtn : t.saveBtn}</span>
                      </button>
                    )}

                    {slot.exists && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          onLoadSlot(slot.slotId);
                        }}
                        className="h-8 px-3 rounded-lg bg-[#1d3428] hover:bg-[#274636] border border-[#355c47] text-xs font-semibold text-[#eef5ec] flex items-center gap-1.5 cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-[#7fe094]" />
                        <span>{t.loadBtn}</span>
                      </button>
                    )}

                    {slot.exists && !isConfirmingDelete && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(slot.slotId)}
                        className="h-8 w-8 rounded-lg bg-[#1c2620] hover:bg-[#3a2020] border border-[#324238] hover:border-[#7c3b3b] text-[#b4c4b5] hover:text-[#f5a3a3] flex items-center justify-center cursor-pointer"
                        title={t.deleteSaveBtn}
                        aria-label={t.deleteSaveBtn}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {slot.exists && isConfirmingDelete && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(null);
                            onDeleteSlot(slot.slotId);
                          }}
                          className="h-8 px-2.5 rounded-lg bg-[#8c2d2d] hover:bg-[#a63737] text-xs font-semibold text-white cursor-pointer"
                        >
                          {t.confirmDeleteSave}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="h-8 px-2 rounded-lg bg-[#192820] hover:bg-[#23372c] border border-[#2f493b] text-xs text-[#c7d6c6] cursor-pointer"
                        >
                          {t.cancelBtn}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
