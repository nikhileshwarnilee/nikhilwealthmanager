import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

function resolveInitialValue(initialValue) {
  return typeof initialValue === 'function' ? initialValue() : initialValue;
}

export function useRouteState(stateKey, initialValue) {
  const location = useLocation();
  const initialFactoryRef = useRef(null);
  const routeKey = `${location.pathname}:${stateKey}`;

  if (!initialFactoryRef.current) {
    initialFactoryRef.current = () => resolveInitialValue(initialValue);
  }

  const [state, setState] = useState(() => initialFactoryRef.current());

  useEffect(() => {
    setState(initialFactoryRef.current());
  }, [routeKey]);

  return [state, setState];
}
