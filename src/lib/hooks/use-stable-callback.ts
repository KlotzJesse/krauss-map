import { useCallback, useRef } from "react";

/**
 * Creates a stable callback reference that doesn't change between renders
 * Useful for preventing unnecessary re-renders in child components
 * while still allowing the callback to access the latest values
 *
 * This is the standard "useEvent" pattern recommended by React team
 *
 * @param callback - The callback function to stabilize
 * @returns A stable callback reference that won't cause re-renders
 */
export function useStableCallback<
  TCallback extends (...args: never[]) => unknown,
>(callback: TCallback): TCallback {
  const callbackRef = useRef<TCallback>(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args) => callbackRef.current(...args)) as TCallback,
    []
  );
}
