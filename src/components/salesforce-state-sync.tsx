"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef } from "react";

function detectIframed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin top access throws → definitely iframed
  }
}

export function SalesforceStateSync() {
  const searchParams = useSearchParams();
  const iframed = useRef<boolean>(detectIframed());

  // Non-reactive action: reads latest iframed + searchParams without being
  // a reactive dependency — exactly the useEffectEvent use case.
  const sendStateChange = useEffectEvent(() => {
    if (!iframed.current) return;
    window.parent.postMessage(
      { type: "area-path-change", search: `?${searchParams.toString()}` },
      "*"
    );
  });

  useEffect(() => {
    sendStateChange();
  }, [searchParams]);

  return null;
}