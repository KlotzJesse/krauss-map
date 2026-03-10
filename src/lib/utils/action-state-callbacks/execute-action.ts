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
                (messages.error as string) ||
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
                (messages.error as string) ||
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
  } catch (error: any) {
    // If it's a Next.js framework error containing NEXT_REDIRECT or NEXT_NOT_FOUND,
    // unstable_rethrow prevents it from being swallowed by our try/catch
    // and correctly propagates it to Next.js internals framework catchers.
    if (
      error &&
      typeof error === "object" &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")
    ) {
      // It's a redirect, meaning the action completed and ordered navigation.
      toast.success(
        typeof messages.success === "function"
          ? messages.success({} as T)
          : messages.success || "Erfolgreich",
        { id: toastId }
      );
    }

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
