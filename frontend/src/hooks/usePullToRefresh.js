import { useEffect, useRef, useState } from 'react';

const MAX_PULL_DISTANCE = 120;
const REFRESH_THRESHOLD = 70;

function isVerticallyScrollable(node) {
  if (!(node instanceof HTMLElement)) return false;
  const styles = window.getComputedStyle(node);
  return /(auto|scroll|overlay)/.test(styles.overflowY) && node.scrollHeight > node.clientHeight;
}

function getScrollableTarget(target, container) {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== container) {
    if (isVerticallyScrollable(node)) {
      return node;
    }
    node = node.parentElement;
  }
  return container;
}

export function usePullToRefresh(onRefresh, enabled = true, containerRef = null) {
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const pullingRef = useRef(false);
  const activeScrollTargetRef = useRef(null);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (enabled) return undefined;

    pullDistanceRef.current = 0;
    pullingRef.current = false;
    activeScrollTargetRef.current = null;
    setPullDistance(0);
    setRefreshing(false);
    return undefined;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const container = containerRef?.current;
    if (!container) return undefined;

    const setPullDistanceValue = (value) => {
      pullDistanceRef.current = value;
      setPullDistance(value);
    };

    const clearPullGesture = () => {
      pullingRef.current = false;
      activeScrollTargetRef.current = null;
      setPullDistanceValue(0);
    };

    const onTouchStart = (event) => {
      if (refreshingRef.current) return;
      if (event.touches?.length !== 1) {
        clearPullGesture();
        return;
      }
      if (container.scrollTop > 0) {
        clearPullGesture();
        return;
      }

      const touch = event.touches[0];
      const scrollTarget = getScrollableTarget(event.target, container);
      if (scrollTarget && scrollTarget !== container && scrollTarget.scrollTop > 0) {
        clearPullGesture();
        return;
      }

      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      activeScrollTargetRef.current = scrollTarget || container;
      pullingRef.current = true;
      setPullDistanceValue(0);
    };

    const onTouchMove = (event) => {
      if (!pullingRef.current) return;
      const touch = event.touches?.[0];
      if (!touch) {
        clearPullGesture();
        return;
      }

      const activeScrollTarget = activeScrollTargetRef.current || container;
      if (container.scrollTop > 0 || (activeScrollTarget !== container && activeScrollTarget.scrollTop > 0)) {
        clearPullGesture();
        return;
      }

      const deltaX = touch.clientX - startXRef.current;
      const deltaY = touch.clientY - startYRef.current;

      if (deltaY <= 0) {
        setPullDistanceValue(0);
        return;
      }
      if (Math.abs(deltaX) > deltaY) {
        setPullDistanceValue(0);
        return;
      }

      setPullDistanceValue(Math.min(deltaY, MAX_PULL_DISTANCE));
    };

    const onTouchEnd = async () => {
      if (!pullingRef.current) return;

      const shouldRefresh = pullDistanceRef.current > REFRESH_THRESHOLD;
      clearPullGesture();

      if (shouldRefresh && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        try {
          await onRefreshRef.current?.();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
        }
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', clearPullGesture, { passive: true });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', clearPullGesture);
    };
  }, [containerRef, enabled]);

  return { pullDistance, refreshing };
}

