import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const routeStateCache = new Map();
const cacheOrder = [];
const MAX_CACHE_ENTRIES = 240;

function resolveInitialValue(initialValue) {
  return typeof initialValue === 'function' ? initialValue() : initialValue;
}

function setCacheValue(key, value) {
  if (!routeStateCache.has(key)) {
    cacheOrder.push(key);
    if (cacheOrder.length > MAX_CACHE_ENTRIES) {
      const staleKey = cacheOrder.shift();
      if (staleKey) {
        routeStateCache.delete(staleKey);
      }
    }
  }
  routeStateCache.set(key, value);
}

export function useRouteState(stateKey, initialValue) {
  const location = useLocation();
  const initialFactoryRef = useRef(null);
  const cacheId = `${location.pathname}:${stateKey}`;

  if (!initialFactoryRef.current) {
    initialFactoryRef.current = () => resolveInitialValue(initialValue);
  }

  const [state, setState] = useState(() => {
    if (routeStateCache.has(cacheId)) {
      return routeStateCache.get(cacheId);
    }
    return initialFactoryRef.current();
  });

  useEffect(() => {
    if (routeStateCache.has(cacheId)) {
      setState(routeStateCache.get(cacheId));
      return;
    }
    setState(initialFactoryRef.current());
  }, [cacheId]);

  useEffect(() => {
    setCacheValue(cacheId, state);
  }, [cacheId, state]);

  return [state, setState];
}
