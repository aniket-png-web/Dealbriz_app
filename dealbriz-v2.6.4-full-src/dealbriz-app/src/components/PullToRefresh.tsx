import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

const TRIGGER_DISTANCE = 70;
const MAX_PULL = 110;

/**
 * Pull down while already scrolled to the top to reload.
 *
 * The indicator fades and rotates in as the finger travels, so the gesture is
 * discoverable before it fires. Touch move is only intercepted once the
 * container is genuinely at scrollTop 0 and the drag is downward, which keeps
 * normal scrolling untouched.
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  className = '',
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || refreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) {
      startYRef.current = null;
      return;
    }
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null || refreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) {
      startYRef.current = null;
      setPull(0);
      return;
    }

    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }

    // Resistance, so the sheet feels attached rather than free-sliding.
    setPull(Math.min(MAX_PULL, delta * 0.5));
  };

  const finishPull = async () => {
    const shouldRefresh = pull >= TRIGGER_DISTANCE;
    startYRef.current = null;

    if (!shouldRefresh) {
      setPull(0);
      return;
    }

    setRefreshing(true);
    setPull(TRIGGER_DISTANCE);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  };

  const progress = Math.min(1, pull / TRIGGER_DISTANCE);
  const armed = pull >= TRIGGER_DISTANCE;

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      {/* Indicator sits behind the content and is revealed as it moves down */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none z-10"
        style={{
          height: `${Math.max(pull, refreshing ? TRIGGER_DISTANCE : 0)}px`,
          opacity: pull > 4 || refreshing ? 1 : 0,
          transition: startYRef.current === null ? 'height 200ms ease, opacity 200ms ease' : 'none',
        }}
      >
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg border ${
            armed || refreshing
              ? 'bg-blue-600 border-blue-400 text-white'
              : 'bg-white border-slate-300 text-slate-600'
          }`}
        >
          <RefreshCw
            className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
          />
        </div>
      </div>

      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={finishPull}
        onTouchCancel={finishPull}
        className={`h-full overflow-y-auto overscroll-contain ${className}`}
        style={{
          transform: `translateY(${refreshing ? TRIGGER_DISTANCE : pull}px)`,
          transition: startYRef.current === null ? 'transform 200ms ease' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
};
