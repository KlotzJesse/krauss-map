"use client";

import {
  IconActivity,
  IconChevronDown,
  IconChevronRight,
  IconLayersIntersect,
  IconMapPin,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import type { RecentActivityItem } from "@/lib/db/data-functions";
import { cn } from "@/lib/utils";

const CHANGE_TYPE_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  add_postal_codes: {
    label: "PLZ hinzugefügt",
    icon: IconPlus,
    color: "text-green-500",
  },
  remove_postal_codes: {
    label: "PLZ entfernt",
    icon: IconTrash,
    color: "text-red-500",
  },
  create_layer: {
    label: "Layer erstellt",
    icon: IconLayersIntersect,
    color: "text-blue-500",
  },
  delete_layer: {
    label: "Layer gelöscht",
    icon: IconTrash,
    color: "text-red-500",
  },
  update_layer: {
    label: "Layer geändert",
    icon: IconPencil,
    color: "text-amber-500",
  },
  update_area: {
    label: "Gebiet geändert",
    icon: IconPencil,
    color: "text-amber-500",
  },
  move_postal_codes: {
    label: "PLZ verschoben",
    icon: IconMapPin,
    color: "text-purple-500",
  },
};

function getChangeMeta(changeType: string) {
  return (
    CHANGE_TYPE_META[changeType] ?? {
      label: changeType.replaceAll("_", " "),
      icon: IconActivity,
      color: "text-muted-foreground",
    }
  );
}

function formatRelativeTime(dateStr: string): string {
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

function getChangeDetail(item: RecentActivityItem): string | null {
  const d = item.changeData;
  if (!d) return null;
  if (item.changeType === "add_postal_codes" || item.changeType === "remove_postal_codes") {
    const codes = Array.isArray(d.codes) ? (d.codes as string[]) : [];
    if (codes.length === 0) return null;
    if (codes.length <= 3) return codes.join(", ");
    return `${codes.slice(0, 2).join(", ")} +${codes.length - 2}`;
  }
  if (item.changeType === "create_layer" || item.changeType === "update_layer") {
    return typeof d.name === "string" ? d.name : null;
  }
  if (item.changeType === "delete_layer") {
    return typeof d.name === "string" ? d.name : null;
  }
  return null;
}

interface RecentActivityFeedProps {
  items: RecentActivityItem[];
}

export function RecentActivityFeed({ items }: RecentActivityFeedProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="group-data-[collapsible=icon]:hidden px-2 pb-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 w-full py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconActivity className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">Letzte Aktivität</span>
        <span className="ml-auto">
          {expanded ? (
            <IconChevronDown className="h-3 w-3" />
          ) : (
            <IconChevronRight className="h-3 w-3" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 space-y-0.5">
          {items.map((item, i) => {
            const meta = getChangeMeta(item.changeType);
            const Icon = meta.icon;
            const detail = getChangeDetail(item);

            return (
              <Link
                // biome-ignore lint/suspicious/noArrayIndexKey: items don't have stable IDs
                key={i}
                href={`/postal-codes/${item.areaId}`}
                className="flex items-start gap-2 px-1.5 py-1 rounded hover:bg-accent/60 transition-colors group/item"
              >
                <Icon
                  className={cn("h-3 w-3 mt-0.5 shrink-0", meta.color)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="text-[10px] font-medium text-foreground truncate">
                      {item.areaName}
                    </span>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {meta.label}
                    {detail && (
                      <span className="text-foreground/60"> · {detail}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
