"use client";

import { useEffect, useState } from "react";

/**
 * True from the first time `open` is true, and true forever after.
 *
 * Used to gate lazily imported dialogs. A `dynamic()` import only defers
 * anything if the component is not rendered — mounting it with `open={false}`
 * pulls its chunk on page load and the split buys nothing, which is how
 * date-fns ended up in the initial bundle for a dialog nobody had opened.
 *
 * Latching rather than mirroring `open` keeps the dialog mounted once it has
 * been used, so the second open is instant and the close transition still has
 * something to animate.
 *
 * The latch runs in an effect rather than during render. Adjusting state during
 * render is a documented React pattern, but under the React Compiler it did not
 * re-fire here — the same shape silently stopped the drawing engine from ever
 * loading, so this stays in an effect where the behaviour is unambiguous.
 */
export function useMountOnce(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
    }
  }, [open]);

  return mounted;
}
