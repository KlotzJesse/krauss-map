"use client";

import { IconChartBar } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { AreaSummary } from "@/lib/types/area-types";

const AreaComparisonDialog = dynamic(
  () =>
    import("@/components/areas/area-comparison-dialog").then(
      (m) => m.AreaComparisonDialog
    ),
  { ssr: false }
);

interface CompareAreasButtonProps {
  areas: AreaSummary[];
}

export function CompareAreasButton({ areas }: CompareAreasButtonProps) {
  const [open, setOpen] = useState(false);
  const activeAreas = areas.filter((a) => a.isArchived !== "true");

  if (activeAreas.length < 2) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <IconChartBar className="h-3.5 w-3.5" />
        Vergleichen
      </Button>
      <AreaComparisonDialog open={open} onOpenChange={setOpen} areas={areas} />
    </>
  );
}
