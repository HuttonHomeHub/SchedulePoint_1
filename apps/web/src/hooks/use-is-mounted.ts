import { useCallback, useEffect, useRef } from 'react';

/**
 * A function that answers "is this component still mounted?" — for a promise that settles after the
 * component that began it may have gone (an Escape while a save is in flight), so it can skip the one
 * thing that must not happen to a LATER opening: closing it. The ref stays inside this hook, which is
 * also what keeps a settle handler from reading a ref in the component's body.
 */
export function useIsMounted(): () => boolean {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}
