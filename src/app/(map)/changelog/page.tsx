import {
  IconActivity,
  IconFilter,
  IconLayersIntersect,
  IconMapPin,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getAreas, getGlobalChangelog } from "@/lib/db/data-functions";
import { cn } from "@/lib/utils";
import { AreaSelect } from "./area-select";

const PAGE_SIZE = 50;

const CHANGE_TYPE_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  add_postal_codes: {
    label: "PLZ hinzugefügt",
    icon: IconPlus,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-500/10",
  },
  remove_postal_codes: {
    label: "PLZ entfernt",
    icon: IconTrash,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
  },
  create_layer: {
    label: "Ebene erstellt",
    icon: IconLayersIntersect,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
  delete_layer: {
    label: "Ebene gelöscht",
    icon: IconTrash,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
  },
  update_layer: {
    label: "Ebene geändert",
    icon: IconPencil,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  update_area: {
    label: "Gebiet geändert",
    icon: IconPencil,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  move_postal_codes: {
    label: "PLZ verschoben",
    icon: IconMapPin,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/10",
  },
};

function getChangeMeta(changeType: string) {
  return (
    CHANGE_TYPE_META[changeType] ?? {
      label: changeType.replaceAll("_", " "),
      icon: IconActivity,
      color: "text-muted-foreground",
      bg: "bg-muted",
    }
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getChangeDescription(item: {
  changeType: string;
  layerName: string | null;
  previousLayerName: string | null;
  postalCodeCount: number;
}): string {
  const { changeType, layerName, previousLayerName, postalCodeCount } = item;
  if (
    changeType === "add_postal_codes" ||
    changeType === "remove_postal_codes"
  ) {
    const name = layerName ? ` → ${layerName}` : "";
    return postalCodeCount > 0
      ? `${postalCodeCount} PLZ${name}`
      : (layerName ?? "");
  }
  if (changeType === "update_layer" && previousLayerName && layerName) {
    return `${previousLayerName} → ${layerName}`;
  }
  return layerName ?? previousLayerName ?? "";
}

interface ChangelogPageProps {
  searchParams: Promise<{ page?: string; area?: string; type?: string }>;
}

export default async function ChangelogPage({
  searchParams,
}: ChangelogPageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const areaId = params.area ? Number(params.area) : undefined;
  const changeType = params.type ?? undefined;

  const [{ items, total }, areas] = await Promise.all([
    getGlobalChangelog({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      areaId: areaId && !Number.isNaN(areaId) ? areaId : undefined,
      changeType,
    }),
    getAreas(),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildUrl(overrides: {
    page?: number;
    area?: string;
    type?: string;
  }) {
    const p = new URLSearchParams();
    const nextPage = overrides.page ?? page;
    const nextArea = "area" in overrides ? overrides.area : params.area;
    const nextType = "type" in overrides ? overrides.type : params.type;
    if (nextPage > 1) p.set("page", String(nextPage));
    if (nextArea) p.set("area", nextArea);
    if (nextType) p.set("type", nextType);
    const qs = p.toString();
    return `/changelog${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 pt-4 pb-3 border-b bg-background">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold">Änderungsprotokoll</h1>
            <p className="text-xs text-muted-foreground">
              {total.toLocaleString("de-DE")} Einträge gesamt
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <IconFilter className="h-4 w-4 text-muted-foreground shrink-0" />

            {/* Area filter */}
            <AreaSelect
              areas={areas}
              currentArea={params.area}
              currentType={changeType}
            />

            {/* Type filter as links */}
            <div className="flex gap-1 flex-wrap">
              {[
                { value: "", label: "Alle Typen" },
                { value: "add_postal_codes", label: "+ PLZ" },
                { value: "remove_postal_codes", label: "- PLZ" },
                { value: "create_layer", label: "Erstellt" },
                { value: "update_layer", label: "Geändert" },
                { value: "delete_layer", label: "Gelöscht" },
              ].map(({ value, label }) => (
                <Link
                  key={value}
                  href={
                    buildUrl({ type: value || undefined, page: 1 }) as Route
                  }
                  className={cn(
                    "text-xs px-2 py-1 rounded-md border transition-colors",
                    (changeType ?? "") === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input hover:bg-accent"
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Keine Einträge gefunden
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <tr className="border-b">
                <th className="text-left font-medium px-4 py-2">Zeitpunkt</th>
                <th className="text-left font-medium px-4 py-2">Gebiet</th>
                <th className="text-left font-medium px-4 py-2">Aktion</th>
                <th className="text-left font-medium px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const meta = getChangeMeta(item.changeType);
                const Icon = meta.icon;
                const description = getChangeDescription(item);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered list
                  <tr
                    key={i}
                    className="border-b border-border/50 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-4 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/postal-codes/${item.areaId}` as Route}
                        className="font-medium hover:underline text-foreground"
                      >
                        {item.areaName}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium",
                          meta.color,
                          meta.bg
                        )}
                      >
                        <Icon className="h-3 w-3 shrink-0" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground max-w-48 truncate">
                      {description}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex-none flex items-center justify-between px-4 py-3 border-t bg-background text-xs">
          <span className="text-muted-foreground">
            Seite {page} von {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={buildUrl({ page: page - 1 }) as Route} />}
              >
                ← Zurück
              </Button>
            )}
            {page < totalPages && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={buildUrl({ page: page + 1 }) as Route} />}
              >
                Weiter →
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
