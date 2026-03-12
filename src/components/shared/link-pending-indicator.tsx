"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

interface LinkPendingIndicatorProps {
  className?: string;
}

/**
 * Shows a subtle pulsing dot during link navigation.
 * Must be rendered as a descendant of a Next.js <Link> component.
 *
 * Delays appearance by 100ms to avoid flashing on instant navigations.
 */
export function LinkPendingIndicator({ className }: LinkPendingIndicatorProps) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-auto inline-block size-1.5 rounded-full bg-current opacity-0 invisible transition-opacity duration-200",
        pending && "opacity-35 visible animate-pulse [animation-delay:100ms]",
        className
      )}
    />
  );
}
