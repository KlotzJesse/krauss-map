import { connection } from "next/server";

import { getVersionIndicatorInfo } from "@/lib/db/data-functions";

import { LiveVersionBadge } from "./live-version-badge";

interface VersionIndicatorProps {
  areaId?: number | null;
}

export async function VersionIndicator({ areaId }: VersionIndicatorProps) {
  if (!areaId) {
    return null;
  }

  await connection();
  const versionInfo = await getVersionIndicatorInfo(areaId);

  return <LiveVersionBadge areaId={areaId} initial={versionInfo} />;
}
