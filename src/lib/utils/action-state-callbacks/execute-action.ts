import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";

interface ActionMessages<T> {
  loading?: string;
  success?: string | ((data: T) => string);
  error?: string | ((err: unknown) => string);
}

/**
 * A safe wrapper for executing Server Actions directly (e.g. inside startTransition)
 * instead of using generic toast.promise(), which swallows Next.js redirects and notFound errors.
 */
export async function executeAction<T>(
  actionPromise: Promise<T>,
  messages: ActionMessages<T>
): Promise<T> {
  const toastId = toast.loading(messages.loading || "Wird ausgeführt...");

  try {
    const result = await actionPromise;

    // Check common action state result shapes indicating an application error
    if (result && typeof result === "object") {
      if ("success" in result && result.success === false) {
        toast.error(
          typeof messages.error === "function"
            ? (messages.error(result) as string)
            : (Reflect.get(result, "error") as string) ||
                messages.error! ||
                "Aktion fehlgeschlagen",
          { id: toastId }
        );
        return result;
      }
      if (
        "error" in result &&
        typeof Reflect.get(result, "error") === "string" &&
        !("success" in result)
      ) {
        toast.error(
          typeof messages.error === "function"
            ? (messages.error(result) as string)
            : (Reflect.get(result, "error") as string) ||
                messages.error! ||
                "Aktion fehlgeschlagen",
          { id: toastId }
        );
        return result;
      }
    }

    toast.success(
      typeof messages.success === "function"
        ? messages.success(result)
        : messages.success || "Erfolgreich",
      { id: toastId }
    );

    return result;
  } catch (error: unknown) {
    // Detect Next.js redirect (server action returned HTTP 303).
    // The router already handles navigation at the transport layer,
    // so we just show the success toast and return — no need to rethrow.
    const isRedirect =
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT");

    if (isRedirect) {
      toast.success(
        typeof messages.success === "function"
          ? messages.success({} as T)
          : messages.success || "Erfolgreich",
        { id: toastId }
      );
      return undefined as T;
    }

    // Re-throw other Next.js internal errors (e.g. NEXT_NOT_FOUND)
    unstable_rethrow(error);

    let errorMsg: string;
    if (typeof messages.error === "function") {
      errorMsg = messages.error(error);
    } else {
      errorMsg =
        messages.error ||
        (error instanceof Error
          ? error.message
          : "Ein unerwarteter Fehler ist aufgetreten");
    }

    toast.error(errorMsg, { id: toastId });
    throw error;
  }
}
