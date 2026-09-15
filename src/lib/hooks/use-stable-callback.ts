import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * Creates a stable callback reference that doesn't change between renders
 * Useful for preventing unnecessary re-renders in child components
 * while still allowing the callback to access the latest values
 *
 * This is the standard "useEvent" pattern recommended by React team
 *
 * The latest callback is stored in an insertion effect rather than during
 * render. Writing a ref during render is a side effect the React Compiler may
 * skip, and a plain `useEffect` is too late: child effects run before the
 * parent's, so a child calling this callback from its own effect would get the
 * previous render's closure. Insertion effects run before every layout and
 * passive effect in the commit.
 *
 * @param callback - The callback function to stabilize
 * @returns A stable callback reference that won't cause re-renders
 */
export function useStableCallback<
  TCallback extends (...args: never[]) => unknown,
>(callback: TCallback): TCallback {
  const callbackRef = useRef<TCallback>(callback);
  useInsertionEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback(
    ((...args) => callbackRef.current(...args)) as TCallback,
    []
  );
}
