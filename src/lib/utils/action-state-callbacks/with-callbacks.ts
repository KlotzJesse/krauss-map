import { unstable_rethrow } from "next/navigation";

/**
 * Higher-order function to add callbacks to Server Actions
 * Based on: https://www.robinwieruch.de/react-server-actions-toast-useactionstate/
 */

export interface GenericActionState {
  status?: string;
  success?: boolean;
  message?: string;
  error?: string;
  errors?: Record<string, string[] | undefined>;
}

export interface Callbacks<T, R = unknown> {
  onStart?: () => R;
  onEnd?: (reference: R) => void;
  onSuccess?: (result: T) => void;
  onError?: (result: T) => void;
}

export const withCallbacks =
  <
    Args extends unknown[],
    T extends GenericActionState | undefined,
    R = unknown,
  >(
    fn: (...args: Args) => Promise<T>,
    callbacks: Callbacks<T, R>
  ): ((...args: Args) => Promise<T>) =>
  async (...args: Args) => {
    let reference: R | undefined;
    try {
      reference = callbacks.onStart?.();
      const result = await fn(...args);

      if (result?.status === "success" || result?.success === true) {
        callbacks.onSuccess?.(result);
      }

      if (
        result?.status === "error" ||
        result?.success === false ||
        result?.error ||
        result?.errors
      ) {
        callbacks.onError?.(result);
      }

      return result;
    } catch (error: unknown) {
      // Detect Next.js redirect — already handled by the router via HTTP 303.
      // Return early so it doesn't propagate to error boundaries.
      if (
        error &&
        typeof error === "object" &&
        "digest" in error &&
        typeof (error as { digest?: unknown }).digest === "string" &&
        (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        return undefined as T;
      }

      // Re-throw other Next.js internal errors (NEXT_NOT_FOUND, etc.)
      unstable_rethrow(error);

      callbacks.onError?.({
        error:
          error instanceof Error ? error.message : "Ein Fehler ist aufgetreten",
        success: false,
      } as unknown as T);
      throw error;
    } finally {
      if (reference) {
        callbacks.onEnd?.(reference);
      }
    }
  };
