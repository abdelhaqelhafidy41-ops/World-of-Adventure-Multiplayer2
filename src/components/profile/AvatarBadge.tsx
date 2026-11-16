import React from 'react';
import type { AvatarConfig, OnlinePresenceStatus } from '../../../shared/profileTypes';
import { resolveAvatarSrc } from '../../game/profile/avatarUtils';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'w-6 h-6 rounded-md',
  sm: 'w-9 h-9 rounded-lg',
  md: 'w-11 h-11 rounded-xl',
  lg: 'w-16 h-16 rounded-2xl',
  xl: 'w-20 h-20 rounded-2xl',
};

const DOT_CLASSES: Record<OnlinePresenceStatus, string> = {
  online: 'bg-[#7fe094]',
  'in-game': 'bg-[#38bdf8]',
  away: 'bg-[#e5a93c]',
  offline: 'bg-[#64748b]',
};

interface AvatarBadgeProps {
  avatar?: AvatarConfig;
  seed?: string;
  displayName?: string;
  size?: AvatarSize;
  status?: OnlinePresenceStatus;
  className?: string;
}

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  avatar,
  seed = 'explorer',
  displayName = 'Explorer',
  size = 'sm',
  status,
  className = '',
}) => {
  const src = resolveAvatarSrc(avatar, seed);
  return (
    <div
      className={`relative shrink-0 bg-[#0d1912] border border-white/20 overflow-visible select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src={src}
        alt={displayName}
        className={`w-full h-full object-cover ${SIZE_CLASSES[size]} block`}
        draggable={false}
      />
      {status && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0c1611] ${DOT_CLASSES[status]}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
};
