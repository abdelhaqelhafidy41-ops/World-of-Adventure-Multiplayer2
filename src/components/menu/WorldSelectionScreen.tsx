import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  FolderOpen,
  Play,
  PlusCircle,
  Trash2,
} from 'lucide-react';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import type { SaveGameMeta, SaveSlotId } from '../../game/save/saveTypes';
import { WorldCard } from './WorldCard';

interface WorldSelectionScreenProps {
  lang: Language;
  worlds: SaveGameMeta[];
  onPlayWorld: (slotId: SaveSlotId) => void;
  onDeleteWorld: (slotId: SaveSlotId) => void;
  onCreateNewWorld: () => void;
  onBack: () => void;
}

export const WorldSelectionScreen: React.FC<WorldSelectionScreenProps> = ({
  lang,
  worlds,
  onPlayWorld,
  onDeleteWorld,
  onCreateNewWorld,
  onBack,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';

  const [selectedId, setSelectedId] = useState<SaveSlotId | null>(
    () => worlds[0]?.slotId ?? null,
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<SaveSlotId | null>(null);

  useEffect(() => {
    if (worlds.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !worlds.some((w) => w.slotId === selectedId)) {
      setSelectedId(worlds[0].slotId);
    }
  }, [worlds, selectedId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmDeleteId) {
          setConfirmDeleteId(null);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDeleteId, onBack]);

  const selectedWorld = worlds.find((w) => w.slotId === selectedId) ?? null;
  const deletingWorld = worlds.find((w) => w.slotId === confirmDeleteId) ?? null;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#08110c]/74 backdrop-blur-md p-3 sm:p-6 mobile-hud-safe pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-world-title"
      data-testid="world-selection-screen"
    >
      <div className="woa-surface w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#101c16]/94 border border-[#2b4436] text-[#f2f6ef] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2
              id="load-world-title"
              className="font-display text-xl sm:text-2xl font-bold tracking-tight"
            >
              {t.loadWorldTitle}
            </h2>
            <p className="woa-muted-text text-xs sm:text-sm text-[#9db1a1] mt-0.5">
              {t.loadWorldSubtitle}
            </p>
          </div>
          <button
            type="button"
            data-testid="load-world-back-top"
            onClick={onBack}
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#182920] hover:bg-[#22392d] border border-white/12 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#dce5d8] cursor-pointer shrink-0"
          >
            <ArrowLeft className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
            <span className="hidden sm:inline">{t.backBtn}</span>
          </button>
        </div>

        {/* World List */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-2.5">
          {worlds.length === 0 ? (
            <div
              data-testid="no-worlds-empty-state"
              className="py-10 px-4 text-center rounded-2xl bg-[#0c1611] border border-dashed border-[#2b4436]"
            >
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#192b22] text-[#e5a93c] flex items-center justify-center mb-3">
                <FolderOpen className="w-6 h-6" />
              </div>
              <h3 className="font-display text-base sm:text-lg font-bold text-[#f7faf5]">
                {t.noWorldsFoundTitle}
              </h3>
              <p className="woa-muted-text text-xs sm:text-sm text-[#9db1a1] mt-1 max-w-sm mx-auto">
                {t.noWorldsFoundDesc}
              </p>
              <button
                type="button"
                data-testid="empty-create-world-btn"
                onClick={onCreateNewWorld}
                className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{t.createNewWorldCta}</span>
              </button>
            </div>
          ) : (
            worlds.map((world) => (
              <WorldCard
                key={world.slotId}
                world={world}
                selected={selectedId === world.slotId}
                lang={lang}
                onSelect={() => setSelectedId(world.slotId)}
                onDeleteRequest={() => setConfirmDeleteId(world.slotId)}
              />
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-white/10 bg-[#0c1611]/90 flex flex-col sm:flex-row-reverse items-stretch sm:items-center gap-2.5 shrink-0">
          {selectedWorld && (
            <>
              <button
                type="button"
                data-testid="play-world-btn"
                onClick={() => onPlayWorld(selectedWorld.slotId)}
                className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-sm sm:text-base inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t.playWorldBtn}</span>
              </button>

              <button
                type="button"
                data-testid="delete-world-btn"
                onClick={() => setConfirmDeleteId(selectedWorld.slotId)}
                className="min-h-[48px] px-4 py-3 rounded-xl bg-[#291718] hover:bg-[#3a1d20] border border-[#e05a47]/40 text-[#f4b1a7] font-display font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t.deleteWorldBtn}</span>
              </button>
            </>
          )}

          <button
            type="button"
            data-testid="load-world-back-btn"
            onClick={onBack}
            className="sm:min-w-[110px] min-h-[48px] px-4 py-3 rounded-xl bg-[#182920] hover:bg-[#22382c] border border-[#2f493b] text-sm font-semibold text-[#e4ece1] transition-colors cursor-pointer"
          >
            {t.backBtn}
          </button>
        </div>
      </div>

      {/* Delete World Confirmation Dialog */}
      {deletingWorld && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#060d09]/80 backdrop-blur-sm p-4 mobile-hud-safe"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-world-confirm-title"
          data-testid="delete-world-confirm-dialog"
        >
          <div className="woa-surface w-full max-w-sm rounded-2xl bg-[#101c16] border border-[#e05a47]/45 p-6 text-[#f1f5ee] shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#e05a47]/15 text-[#f28b7d] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="delete-world-confirm-title"
                  className="font-display text-lg font-bold text-[#f7faf5]"
                >
                  {t.deleteWorldConfirmTitle}
                </h3>
                <p className="text-xs font-semibold text-[#e5a93c] mt-0.5">
                  {deletingWorld.worldName}
                </p>
                <p className="woa-muted-text text-xs sm:text-sm text-[#a8bba9] mt-1 leading-relaxed">
                  {t.deleteWorldConfirmDesc}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
              <button
                type="button"
                data-testid="confirm-delete-world-btn"
                onClick={() => {
                  const id = deletingWorld.slotId;
                  setConfirmDeleteId(null);
                  onDeleteWorld(id);
                }}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#d64c3b] hover:bg-[#e35b4a] text-white font-display font-bold text-sm transition-colors cursor-pointer"
              >
                {t.deleteBtn}
              </button>
              <button
                type="button"
                data-testid="cancel-delete-world-btn"
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#192b22] hover:bg-[#233a2e] border border-[#2f493b] text-sm font-medium text-[#e4ece1] transition-colors cursor-pointer"
              >
                {t.cancelBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
