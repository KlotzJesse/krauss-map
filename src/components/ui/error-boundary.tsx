"use client";

import * as React from "react";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

import { AlertError } from "./alert";

// --- ErrorBoundary component ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?:
    | React.ComponentType<{ error: unknown; resetErrorBoundary: () => void }>
    | React.ReactNode;
  onError?: (error: unknown, errorInfo: React.ErrorInfo) => void;
}

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: unknown;
  resetErrorBoundary: () => void;
}) {
  const errorMessage =
    error instanceof Error ? error.message : "Ein Fehler ist aufgetreten";
  return (
    <AlertError message={errorMessage}>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="mt-2 underline text-primary hover:text-primary/80 transition-colors"
      >
        Erneut versuchen
      </button>
    </AlertError>
  );
}

export function ErrorBoundary({
  children,
  fallback,
  onError,
}: ErrorBoundaryProps) {
  // If fallback is a React element, use the fallback prop
  if (fallback && React.isValidElement(fallback)) {
    return (
      <ReactErrorBoundary
        fallback={fallback}
        onError={onError}
        onReset={() => {
          // Optional: Add any cleanup logic here
        }}
      >
        {children}
      </ReactErrorBoundary>
    );
  }

  // Otherwise use FallbackComponent
  return (
    <ReactErrorBoundary
      FallbackComponent={
        fallback
          ? (fallback as React.ComponentType<{
              error: unknown;
              resetErrorBoundary: () => void;
            }>)
          : ErrorFallback
      }
      onError={onError}
      onReset={() => {
        // Optional: Add any cleanup logic here
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
