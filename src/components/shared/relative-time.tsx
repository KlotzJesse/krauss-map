"use client";

import { useEffect, useReducer } from "react";

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days > 1 ? "en" : ""}`;
}

export function RelativeTime({ date }: { date: string }) {
  const [, rerender] = useReducer(() => ({}), {});

  useEffect(() => {
    const id = setInterval(rerender, 60_000);
    return () => clearInterval(id);
  }, []);

  return <>{formatRelative(date)}</>;
}
