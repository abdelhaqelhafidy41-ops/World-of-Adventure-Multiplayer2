import React from 'react';
import { UI_TEXT, type Language } from '../game/i18n/translations';

interface LoadingScreenProps {
  progress: number;
  statusLabel: string;
  lang: Language;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  progress,
  statusLabel,
  lang,
}) => {
  const t = UI_TEXT[lang];
  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0d1712] text-[#eff4ec] px-6"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mb-6"
          aria-hidden="true"
        >
          <circle cx="32" cy="32" r="29" stroke="#3c5e4b" strokeWidth="2" />
          <path
            d="M14 44L26.5 23L34.5 35.5L40 27L50 44H14Z"
            fill="#2c6e58"
            stroke="#8cc084"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="44" cy="18" r="3.5" fill="#e6b85c" />
        </svg>

        <h1 className="font-display text-3xl font-bold tracking-tight text-[#f4f7f1] mb-2">
          {t.gameTitle}
        </h1>
        <p className="text-sm text-[#9db3a2] mb-8">{statusLabel}</p>

        <div className="w-full h-2 rounded-full bg-[#192921] overflow-hidden border border-[#2a4236]">
          <div
            className="h-full bg-[#6ab06e] transition-[width] duration-200 ease-out"
            style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
          />
        </div>

        <div className="mt-3 text-xs font-mono-num text-[#87a08e]" dir="ltr">
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
};
