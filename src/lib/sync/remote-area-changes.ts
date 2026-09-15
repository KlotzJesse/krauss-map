import { useEffect } from "react";

import { getAreaChangeTokenAction } from "@/app/actions/layer-actions";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { onRemoteAreasChanged } from "@/lib/sync/sidebar-data";

/** How often an open area checks whether someone else changed it. */
const POLL_MS = 15_000;

/**
 * Call `onChange` when the open area was changed from somewhere other than
 * this page's own edits: another tab, or another person.
 *
 * Checks a cheap fingerprint of the area (see getAreaChangeTokenAction) every
 * {@link POLL_MS} while the tab is visible, immediately when the tab comes back
 * into view, and immediately when another tab reports an edit. Only a changed
 * fingerprint triggers `onChange`, which re-reads the layers.
 *
 * This page's own edits change the fingerprint too, so one of them can cost a
 * redundant re-read on the next check. That is deliberate: suppressing checks
 * around local edits would also hide a colleague's edit made in the same few
 * seconds, and nothing else would ever bring it in.
 */
export function useRemoteAreaChanges(
  areaId: number | null | undefined,
  onChange: () => void
): void {
  const handleChange = useStableCallback(onChange);

  useEffect(() => {
    if (!areaId) {
      return undefined;
    }
    let lastToken: string | null = null;
    let inFlight = false;
    let disposed = false;

    const check = async () => {
      if (inFlight || document.visibilityState !== "visible") {
        return;
      }
      inFlight = true;
      try {
        const result = await getAreaChangeTokenAction(areaId);
        if (disposed || !result.success) {
          return;
        }
        if (lastToken !== null && result.data !== lastToken) {
          handleChange();
        }
        lastToken = result.data;
      } finally {
        inFlight = false;
      }
    };

    void check();
    const timer = window.setInterval(() => {
      void check();
    }, POLL_MS);
    const onReturn = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    const offRemote = onRemoteAreasChanged(() => {
      // Give the other tab's write a moment to commit before fingerprinting.
      window.setTimeout(() => {
        void check();
      }, 800);
    });

    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      offRemote();
    };
  }, [areaId, handleChange]);
}
