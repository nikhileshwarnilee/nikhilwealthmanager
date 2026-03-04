import { useEffect } from 'react';

function getScrollableAncestor(node) {
  let parent = node?.parentElement || null;
  while (parent) {
    const styles = window.getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(styles.overflowY)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

export function useInfiniteScroll(targetRef, onLoadMore, canLoad = true) {
  useEffect(() => {
    const node = targetRef?.current;
    if (!node || !canLoad) return undefined;

    const scrollParent = getScrollableAncestor(node);
    const root = scrollParent || null;
    const scrollSource = scrollParent || window;

    let rafId = 0;
    let queued = false;

    const triggerLoadIfNearBottom = () => {
      if (!canLoad) return;

      if (scrollParent) {
        const remaining =
          scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight;
        if (remaining <= 280) {
          onLoadMore();
        }
        return;
      }

      const doc = document.documentElement;
      const remaining = doc.scrollHeight - (window.scrollY + window.innerHeight);
      if (remaining <= 280) {
        onLoadMore();
      }
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      rafId = window.requestAnimationFrame(() => {
        queued = false;
        triggerLoadIfNearBottom();
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { root, rootMargin: '220px 0px' }
    );

    observer.observe(node);
    scrollSource.addEventListener('scroll', onScroll, { passive: true });
    triggerLoadIfNearBottom();

    return () => {
      observer.disconnect();
      scrollSource.removeEventListener('scroll', onScroll);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [targetRef, onLoadMore, canLoad]);
}
