import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import HeaderBar from './HeaderBar';
import BottomTabs from './BottomTabs';
import FabAddButton from './FabAddButton';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

export default function AppShell({
  title,
  subtitle,
  children,
  onRefresh = null,
  showFab = false,
  contentScrollable = true,
  contentClassName = '',
  searchEnabled = false,
  searchOpen = false,
  searchValue = '',
  onToggleSearch = null,
  onSearchChange = null,
  searchPlaceholder = 'Search',
  onExport = null,
  filterEnabled = false,
  onFilter = null,
  filterActive = false,
  intervalSwipeEnabled = false,
  onIntervalSwipePrev = null,
  onIntervalSwipeNext = null
}) {
  const location = useLocation();
  const swipeStartRef = useRef(null);
  const mainRef = useRef(null);
  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    }
  }, [onRefresh]);
  const { pullDistance, refreshing } = usePullToRefresh(
    handleRefresh,
    Boolean(onRefresh),
    mainRef
  );

  const shouldIgnoreSwipeTarget = (target) => {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(
      target.closest(
        'input, textarea, select, button, a, [data-no-page-swipe], .touch-pan-x'
      )
    );
  };

  const handleTouchStart = (event) => {
    if (!intervalSwipeEnabled) {
      swipeStartRef.current = null;
      return;
    }
    if (event.touches.length !== 1) {
      swipeStartRef.current = null;
      return;
    }
    if (shouldIgnoreSwipeTarget(event.target)) {
      swipeStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY
    };
  };

  const handleTouchEnd = (event) => {
    if (!intervalSwipeEnabled || !swipeStartRef.current) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;

    const deltaX = touch.clientX - swipeStartRef.current.x;
    const deltaY = touch.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX < 56) return;
    if (absX <= absY * 1.2) return;

    if (deltaX < 0) {
      onIntervalSwipePrev?.();
    } else {
      onIntervalSwipeNext?.();
    }
  };

  const handleTouchCancel = () => {
    swipeStartRef.current = null;
  };

  useEffect(() => {
    const node = mainRef.current;
    if (!node || !contentScrollable) return;
    node.scrollTop = 0;
  }, [contentScrollable, location.pathname, location.search]);

  return (
    <div className="app-container">
      <HeaderBar
        title={title}
        subtitle={subtitle}
        searchEnabled={searchEnabled}
        searchOpen={searchOpen}
        searchValue={searchValue}
        onToggleSearch={onToggleSearch}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        onExport={onExport}
        filterEnabled={filterEnabled}
        onFilter={onFilter}
        filterActive={filterActive}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {(pullDistance > 0 || refreshing) && (
          <div className="absolute left-0 right-0 top-1 z-20 flex justify-center">
            <div className="rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold text-white">
              {refreshing ? 'Refreshing...' : `Pull ${Math.round((pullDistance / 80) * 100)}%`}
            </div>
          </div>
        )}
        <main
          ref={mainRef}
          className={`flex min-h-0 flex-1 flex-col px-2 pb-2 pt-2 ${
            contentScrollable ? 'overflow-y-auto' : 'overflow-hidden'
          } ${contentClassName}`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        >
          {children}
        </main>
      </div>
      <BottomTabs />
      {showFab ? <FabAddButton /> : null}
    </div>
  );
}
