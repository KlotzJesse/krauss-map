import { toast } from "sonner";

export interface CreateToastCallbacksOptions {
  loadingMessage?: string;
  successMessage?: string | ((result: unknown) => string);
  errorMessage?: string | ((result: unknown) => string);
  showFieldErrors?: boolean;
}

export const createToastCallbacks = (
  options: CreateToastCallbacksOptions = {}
) => ({
  onStart: () => toast.loading(options.loadingMessage ?? "Wird gespeichert..."),

  onEnd: (reference: string | number) => {
    toast.dismiss(reference);
  },

  onSuccess: (result: unknown) => {
    const r = result as Record<string, unknown> | null | undefined;
    const message =
      typeof options.successMessage === "function"
        ? options.successMessage(result)
        : (options.successMessage ??
          (typeof r?.message === "string" ? r.message : undefined) ??
          "Erfolgreich gespeichert");

    toast.success(message);
  },

  onError: (result: unknown) => {
    const r = result as Record<string, unknown> | null | undefined;
    const message =
      typeof options.errorMessage === "function"
        ? options.errorMessage(result)
        : (options.errorMessage ??
          (typeof r?.error === "string" ? r.error : undefined) ??
          (typeof r?.message === "string" ? r.message : undefined) ??
          "Ein Fehler ist aufgetreten");

    toast.error(message);

    if (
      options.showFieldErrors !== false &&
      r?.errors &&
      typeof r.errors === "object"
    ) {
      Object.entries(r.errors as Record<string, unknown>).forEach(
        ([field, fieldMessages]) => {
          if (fieldMessages && Array.isArray(fieldMessages)) {
            fieldMessages.forEach((msg: unknown) => {
              toast.error(`${field}: ${msg}`);
            });
          }
        }
      );
    }
  },
});
