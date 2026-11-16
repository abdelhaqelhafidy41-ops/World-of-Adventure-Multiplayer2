import React, { useEffect, useState } from 'react';
import { Info, LogOut } from 'lucide-react';
import { UI_TEXT, type Language } from '../../game/i18n/translations';
import { performPlatformExit } from '../../utils/platformExit';

interface ExitConfirmationDialogProps {
  lang: Language;
  onClose: () => void;
}

export const ExitConfirmationDialog: React.FC<ExitConfirmationDialogProps> = ({
  lang,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const [step, setStep] = useState<'confirm' | 'webNotice'>('confirm');

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

  const handleConfirmExit = async () => {
    const res = await performPlatformExit();
    if (!res.exited) {
      setStep('webNotice');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#070f0b]/78 backdrop-blur-sm p-4 mobile-hud-safe pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-dialog-title"
      data-testid="exit-confirmation-dialog"
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="woa-surface w-full max-w-sm rounded-2xl bg-[#101c16] border border-[#2d4638] p-6 text-[#f1f5ee] shadow-2xl"
      >
        {step === 'confirm' ? (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#e05a47]/15 border border-[#e05a47]/35 flex items-center justify-center shrink-0 text-[#f28b7d]">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="exit-dialog-title"
                  className="font-display text-lg font-bold text-[#f7faf5]"
                >
                  {t.exitConfirmTitle}
                </h2>
                <p className="woa-muted-text text-xs sm:text-sm text-[#a8bba9] mt-1 leading-relaxed">
                  {t.exitConfirmDesc}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
              <button
                type="button"
                data-testid="exit-confirm-btn"
                onClick={handleConfirmExit}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#d64c3b] hover:bg-[#e35b4a] text-white font-display font-bold text-sm transition-colors cursor-pointer"
              >
                {t.menuExitGame}
              </button>
              <button
                type="button"
                data-testid="exit-cancel-btn"
                onClick={onClose}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#192b22] hover:bg-[#233a2e] border border-[#2f493b] text-sm font-medium text-[#e4ece1] transition-colors cursor-pointer"
              >
                {t.cancelBtn}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#e5a93c]/15 border border-[#e5a93c]/35 flex items-center justify-center shrink-0 text-[#e5a93c]">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="exit-dialog-title"
                  className="font-display text-lg font-bold text-[#f7faf5]"
                >
                  {t.menuExitGame}
                </h2>
                <p
                  data-testid="web-exit-notice-text"
                  className="woa-muted-text text-xs sm:text-sm text-[#dce5d8] mt-1 leading-relaxed"
                >
                  {t.webExitNoticeDesc}
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="web-exit-ok-btn"
              onClick={onClose}
              className="w-full min-h-[44px] mt-4 px-4 py-2.5 rounded-xl bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-sm transition-colors cursor-pointer"
            >
              {t.okBtn}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
