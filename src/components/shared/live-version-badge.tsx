"use client";

import { IconEye, IconHistory } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { getVersionIndicatorInfoAction } from "@/app/actions/version-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLiveSidebarData } from "@/lib/sync/sidebar-data";

type VersionInfo =
  Awaited<ReturnType<typeof getVersionIndicatorInfoAction>> extends {
    data?: infer D;
  }
    ? D
    : never;

/**
 * The header's version badge, kept current after edits.
 *
 * It starts from the server's answer. Creating or restoring a version no longer
 * re-renders the route, so whenever the app reports an edit (the same signal
 * that refreshes the sidebar) this re-reads the version info.
 */
export function LiveVersionBadge({
  areaId,
  initial,
}: {
  areaId: number;
  initial: VersionInfo;
}) {
  const [info, setInfo] = useState(initial);
  const live = useLiveSidebarData();

  useEffect(() => {
    if (!live) {
      return;
    }
    let cancelled = false;
    void getVersionIndicatorInfoAction(areaId).then((result) => {
      if (!cancelled && result.success && result.data) {
        setInfo(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [live, areaId]);

  if (!info?.hasVersions || !info.versionInfo) {
    return null;
  }
  const { versionInfo } = info;

  return (
    <div
      className="flex items-center gap-2"
      data-version-badge={versionInfo.versionNumber}
    >
      <Badge
        variant={versionInfo.isLatest ? "default" : "secondary"}
        className="flex items-center gap-1"
      >
        <IconHistory className="h-3 w-3" />
        {versionInfo.isLatest ? "Aktuell " : ""}v{versionInfo.versionNumber}
        {versionInfo.name && ` (${versionInfo.name})`}
      </Badge>
      {!versionInfo.isLatest && (
        <Button variant="outline" size="sm" className="h-6 text-xs">
          <IconEye className="h-3 w-3 mr-1" />
          Aktuelle Version
        </Button>
      )}
      {!versionInfo.isLatest && (
        <span className="text-xs text-muted-foreground">
          Änderungen → neue Version
        </span>
      )}
    </div>
  );
}
