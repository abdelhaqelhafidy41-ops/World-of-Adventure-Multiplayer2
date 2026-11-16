import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MainMenuButtonProps {
  label: string;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  focused?: boolean;
  isRtl?: boolean;
  testId?: string;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
}

export const MainMenuButton: React.FC<MainMenuButtonProps> = ({
  label,
  subtitle,
  icon,
  variant = 'secondary',
  focused = false,
  isRtl = false,
  testId,
  buttonRef,
  onClick,
}) => {
  const baseClasses =
    'woa-surface pointer-events-auto group relative w-full min-h-[52px] sm:min-h-[56px] px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl border backdrop-blur-md transition-[transform,background-color,border-color,box-shadow] duration-200 flex items-center justify-between gap-3 text-start cursor-pointer select-none active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-[#e5a93c]';

  const variantClasses =
    variant === 'primary'
      ? 'bg-gradient-to-r from-[#e5a93c]/95 to-[#d49228]/95 hover:from-[#efb64e] hover:to-[#e09e33] border-[#ffd88a]/50 text-[#0f1913] shadow-[0_12px_32px_rgba(229,169,60,0.24)] md:hover:translate-x-1 rtl:md:hover:-translate-x-1'
      : variant === 'danger'
        ? 'bg-[#1a1314]/78 hover:bg-[#2a191b]/88 border-[#e05a47]/28 hover:border-[#e05a47]/65 text-[#f6ecea] shadow-[0_8px_24px_rgba(0,0,0,0.32)] md:hover:translate-x-1 rtl:md:hover:-translate-x-1'
        : 'bg-[#0e1a14]/76 hover:bg-[#162920]/88 border-white/14 hover:border-[#e5a93c]/55 text-[#f2f6ef] shadow-[0_8px_24px_rgba(0,0,0,0.32)] md:hover:translate-x-1 rtl:md:hover:-translate-x-1';

  const focusRingClass = focused
    ? 'ring-2 ring-[#e5a93c]/85 border-[#e5a93c]/80'
    : '';

  const iconContainerClass =
    variant === 'primary'
      ? 'bg-[#111914]/15 text-[#111914]'
      : variant === 'danger'
        ? 'bg-[#e05a47]/15 text-[#f28b7d]'
        : 'bg-white/8 text-[#e5a93c] group-hover:bg-[#e5a93c]/18';

  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`${baseClasses} ${variantClasses} ${focusRingClass}`}
    >
      <span className="flex items-center gap-3.5 min-w-0">
        <span
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${iconContainerClass}`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex flex-col">
          <span className="font-display font-bold text-sm sm:text-base tracking-wide leading-tight truncate">
            {label}
          </span>
          {subtitle && (
            <span
              className={`text-[11px] sm:text-xs leading-tight truncate mt-0.5 ${
                variant === 'primary'
                  ? 'text-[#16221b]/80 font-medium'
                  : 'woa-muted-text text-[#b2c4b4]'
              }`}
            >
              {subtitle}
            </span>
          )}
        </span>
      </span>

      <span
        className={`shrink-0 opacity-65 group-hover:opacity-100 transition-transform duration-200 ${
          isRtl
            ? 'group-hover:-translate-x-0.5'
            : 'group-hover:translate-x-0.5'
        } ${variant === 'primary' ? 'text-[#111914]' : 'text-[#dce5d8]'}`}
      >
        {isRtl ? (
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        ) : (
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        )}
      </span>
    </button>
  );
};
