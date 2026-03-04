import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchTransactions } from '../services/transactionService';

const paginationCache = new Map();
const paginationCacheOrder = [];
const MAX_PAGINATION_CACHE_ENTRIES = 80;

function setPaginationCache(key, value) {
  if (!paginationCache.has(key)) {
    paginationCacheOrder.push(key);
    if (paginationCacheOrder.length > MAX_PAGINATION_CACHE_ENTRIES) {
      const staleKey = paginationCacheOrder.shift();
      if (staleKey) {
        paginationCache.delete(staleKey);
      }
    }
  }
  paginationCache.set(key, value);
}

function toStableQuerySignature(query) {
  if (!query || typeof query !== 'object') return '';
  return Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${Array.isArray(value) ? value.join(',') : String(value)}`)
    .join('|');
}

export function usePaginatedTransactions(query, { pageSize = 100, onError, enabled = true } = {}) {
  const location = useLocation();
  const [transactions, setTransactions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(0);
  const requestSeqRef = useRef(0);
  const loadedOnceRef = useRef(false);
  const querySignature = useMemo(() => toStableQuerySignature(query), [query]);
  const cacheKey = useMemo(
    () => `${location.pathname}|${pageSize}|${querySignature}`,
    [location.pathname, pageSize, querySignature]
  );

  const loadPage = useCallback(
    async (page, append) => {
      const requestSeq = ++requestSeqRef.current;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetchTransactions({
          ...(query || {}),
          page,
          limit: pageSize
        });

        if (requestSeq !== requestSeqRef.current) return;

        const rows = response?.transactions || [];
        const pagination = response?.pagination || {};
        const nextPage = Number(pagination.page || page);
        const nextTotal = Number(pagination.total || rows.length);
        const nextHasMore = Boolean(pagination.has_more);

        pageRef.current = nextPage;
        loadedOnceRef.current = true;
        setTotalCount(nextTotal);
        setHasMore(nextHasMore);
        setTransactions((prev) => (append ? [...prev, ...rows] : rows));
      } catch (error) {
        if (requestSeq === requestSeqRef.current) {
          onError?.(error);
        }
      } finally {
        if (requestSeq === requestSeqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [onError, pageSize, query]
  );

  const reload = useCallback(async () => {
    pageRef.current = 0;
    await loadPage(1, false);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = pageRef.current > 0 ? pageRef.current + 1 : 2;
    await loadPage(nextPage, true);
  }, [hasMore, loadPage, loading, loadingMore]);

  useEffect(() => {
    if (!enabled) {
      setTransactions([]);
      setTotalCount(0);
      setHasMore(false);
      setLoadingMore(false);
      setLoading(false);
      pageRef.current = 0;
      loadedOnceRef.current = false;
      return;
    }

    const cached = paginationCache.get(cacheKey);
    if (cached?.loaded) {
      setTransactions(cached.transactions || []);
      setTotalCount(Number(cached.totalCount || 0));
      setHasMore(Boolean(cached.hasMore));
      setLoading(false);
      setLoadingMore(false);
      pageRef.current = Number(cached.page || 1);
      loadedOnceRef.current = true;
      return;
    }

    loadedOnceRef.current = false;
    setTransactions([]);
    setTotalCount(0);
    setHasMore(false);
    setLoadingMore(false);
    reload();
  }, [cacheKey, enabled, reload]);

  useEffect(() => {
    if (!enabled || !loadedOnceRef.current) return;
    setPaginationCache(cacheKey, {
      transactions,
      totalCount,
      hasMore,
      page: pageRef.current,
      loaded: true
    });
  }, [cacheKey, enabled, hasMore, totalCount, transactions]);

  return {
    transactions,
    totalCount,
    loading,
    loadingMore,
    hasMore,
    reload,
    loadMore
  };
}
