
import React from 'react';
import { cn } from '@/lib/utils';

interface WaterPodProps {
  label: string;
  value: string;
  subtitle?: string;
  /** 0–100 fill percentage */
  fillPercent: number;
  color?: 'blue' | 'red' | 'amber' | 'green' | 'purple';
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const colorMap = {
  blue: {
    water: '#3b82f6',
    waterLight: '#60a5fa',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    valueText: 'text-blue-900 dark:text-blue-100',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
  },
  red: {
    water: '#ef4444',
    waterLight: '#f87171',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    valueText: 'text-red-900 dark:text-red-100',
    iconBg: 'bg-red-100 dark:bg-red-900/50',
  },
  amber: {
    water: '#f59e0b',
    waterLight: '#fbbf24',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    valueText: 'text-amber-900 dark:text-amber-100',
    iconBg: 'bg-amber-100 dark:bg-amber-900/50',
  },
  green: {
    water: '#22c55e',
    waterLight: '#4ade80',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    valueText: 'text-green-900 dark:text-green-100',
    iconBg: 'bg-green-100 dark:bg-green-900/50',
  },
  purple: {
    water: '#a855f7',
    waterLight: '#c084fc',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-300',
    valueText: 'text-purple-900 dark:text-purple-100',
    iconBg: 'bg-purple-100 dark:bg-purple-900/50',
  },
};

const sizeMap = {
  sm: { container: 'h-28 w-28', pod: 96, text: 'text-sm', value: 'text-base' },
  md: { container: 'h-36 w-36', pod: 128, text: 'text-sm', value: 'text-lg' },
  lg: { container: 'h-44 w-44', pod: 160, text: 'text-sm', value: 'text-xl' },
};

export function WaterPod({
  label,
  value,
  subtitle,
  fillPercent,
  color = 'blue',
  icon,
  size = 'md',
}: WaterPodProps) {
  const c = colorMap[color];
  const s = sizeMap[size];
  const clampedFill = Math.max(0, Math.min(100, fillPercent));
  // Water starts from bottom; translate the wave layer
  // At 0% fill the water is fully below; at 100% it's at the top
  const waterOffset = 100 - clampedFill;

  const uniqueId = React.useId();

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Pod */}
      <div
        className={cn(
          'relative rounded-full border-2 overflow-hidden flex items-center justify-center',
          c.border,
          c.bg,
          s.container,
        )}
      >
        {/* Water fill with wave animation */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 200 200"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={`pod-clip-${uniqueId}`}>
              <circle cx="100" cy="100" r="98" />
            </clipPath>
          </defs>

          <g clipPath={`url(#pod-clip-${uniqueId})`}>
            {/* Back wave (slower, lighter) */}
            <g style={{ transform: `translateY(${waterOffset}%)`, transition: 'transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}>
              <path
                d="M0,20 Q25,0 50,20 T100,20 T150,20 T200,20 T250,20 T300,20 T350,20 T400,20 V200 H0 Z"
                fill={c.waterLight}
                opacity="0.45"
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="0,0; -200,0; 0,0"
                  dur="7s"
                  repeatCount="indefinite"
                />
              </path>

              {/* Front wave (faster, main color) */}
              <path
                d="M0,25 Q30,10 60,25 T120,25 T180,25 T240,25 T300,25 T360,25 T420,25 V200 H0 Z"
                fill={c.water}
                opacity="0.55"
              >
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values="-200,0; 0,0; -200,0"
                  dur="5s"
                  repeatCount="indefinite"
                />
              </path>

              {/* Solid fill below waves */}
              <rect x="0" y="30" width="400" height="200" fill={c.water} opacity="0.45" />
            </g>
          </g>
        </svg>

        {/* Center content over water */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-2">
          {icon && (
            <div className={cn('mb-1 rounded-full p-1.5', c.iconBg)}>
              {icon}
            </div>
          )}
          <span className={cn('font-bold leading-tight', s.value, c.valueText)}>{value}</span>
          <span className={cn('font-medium opacity-80 leading-tight mt-0.5', 'text-[10px]', c.text)}>
            {Math.round(clampedFill)}%
          </span>
        </div>
      </div>

      {/* Label below pod */}
      <div className="text-center">
        <p className={cn('font-semibold', s.text, c.valueText)}>{label}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Horizontal water bar variant for inline use */
export function WaterBar({
  label,
  value,
  fillPercent,
  color = 'blue',
}: {
  label: string;
  value: string;
  fillPercent: number;
  color?: 'blue' | 'red' | 'amber' | 'green' | 'purple';
}) {
  const c = colorMap[color];
  const clampedFill = Math.max(0, Math.min(100, fillPercent));
  const uniqueId = React.useId();

  return (
    <div className={cn('relative overflow-hidden rounded-2xl border-2 p-4', c.border, c.bg)}>
      {/* Animated water background */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={`bar-clip-${uniqueId}`}>
            <rect x="0" y="0" width="400" height="100" rx="14" />
          </clipPath>
        </defs>
        <g clipPath={`url(#bar-clip-${uniqueId})`}>
          <g style={{ transform: `translateX(${-(100 - clampedFill)}%)`, transition: 'transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}>
            {/* Wave on the right edge */}
            <path
              d={`M0,0 H400 V30 Q390,20 380,30 T360,30 T340,30 T320,30 T300,30 T280,30 T260,30 T240,30 V0 Z`}
              fill={c.water}
              opacity="0.2"
            />
            <rect x="0" y="0" width="400" height="100" fill={c.water} opacity="0.12" />
          </g>
        </g>
      </svg>

      <div className="relative z-10 flex items-center justify-between">
        <span className={cn('text-sm font-medium', c.text)}>{label}</span>
        <span className={cn('text-lg font-bold', c.valueText)}>{value}</span>
      </div>
    </div>
  );
}
