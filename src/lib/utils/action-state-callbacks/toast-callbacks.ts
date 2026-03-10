import { toast } from "sonner";

import type { GenericActionState } from "./with-callbacks";

export interface CreateToastCallbacksOptions {
  loadingMessage?: string;
  successMessage?: string | ((result: any) => string);
  errorMessage?: string | ((result: any) => string);
  showFieldErrors?: boolean;
}

export const createToastCallbacks = (
  options: CreateToastCallbacksOptions = {}
) => ({
  onStart: () => toast.loading(options.loadingMessage ?? "Wird gespeichert..."),

  onEnd: (reference: string | number) => {
    toast.dismiss(reference);
  },

  onSuccess: (result: any) => {
    const message =
      typeof options.successMessage === "function"
        ? options.successMessage(result)
        : (options.successMessage ??
          result?.message ??
          "Erfolgreich gespeichert");

    toast.success(message);
  },

  onError: (result: any) => {
    const message =
      typeof options.errorMessage === "function"
        ? options.errorMessage(result)
        : (options.errorMessage ??
          result?.error ??
          result?.message ??
          "Ein Fehler ist aufgetreten");

    toast.error(message);

    if (options.showFieldErrors !== false && result?.errors) {
      Object.entries(result.errors).forEach(([field, messages]) => {
        if (messages && Array.isArray(messages)) {
          messages.forEach((message) => {
            toast.error(`${field}: ${message}`);
          });
        }
      });
    }
  },
});
