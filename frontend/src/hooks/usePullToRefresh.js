import { useEffect, useRef, useState } from 'react';

export function usePullToRefresh(onRefresh, enabled = true) {
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;

    const onTouchStart = (event) => {
      if (window.scrollY > 0) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (event) => {
      if (!pullingRef.current) return;
      const touch = event.touches?.[0];
      if (!touch) return;

      const distance = Math.max(0, touch.clientY - startYRef.current);
      setPullDistance(Math.min(distance, 120));
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const shouldRefresh = pullDistance > 70;
      setPullDistance(0);

      if (shouldRefresh && !refreshing) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, onRefresh, pullDistance, refreshing]);

  return { pullDistance, refreshing };
}

