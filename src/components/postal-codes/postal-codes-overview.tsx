import {
  IconActivity,
  IconAlertTriangle,
  IconArchive,
  IconFolder,
  IconFolders,
  IconLayersIntersect,
  IconMap,
  IconMapPin,
  IconMapPin2,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAreas, getRecentActivity } from "@/lib/db/data-functions";
import { cn } from "@/lib/utils";

import { CompareAreasButton } from "./compare-areas-button";
import { ExportAllAreasButton } from "./export-all-areas-button";

const CHANGE_ICONS: Record<string, React.ElementType> = {
  add_postal_codes: IconPlus,
  remove_postal_codes: IconTrash,
  create_layer: IconLayersIntersect,
  delete_layer: IconTrash,
  update_layer: IconMapPin2,
  update_area: IconFolder,
  move_postal_codes: IconMapPin,
};

const CHANGE_COLORS: Record<string, string> = {
  add_postal_codes: "text-green-500 bg-green-50",
  remove_postal_codes: "text-red-500 bg-red-50",
  create_layer: "text-blue-500 bg-blue-50",
  delete_layer: "text-red-500 bg-red-50",
  update_layer: "text-amber-500 bg-amber-50",
  update_area: "text-amber-500 bg-amber-50",
  move_postal_codes: "text-purple-500 bg-purple-50",
};

const CHANGE_LABELS: Record<string, string> = {
  add_postal_codes: "PLZ hinzugefügt",
  remove_postal_codes: "PLZ entfernt",
  create_layer: "Layer erstellt",
  delete_layer: "Layer gelöscht",
  update_layer: "Layer geändert",
  update_area: "Gebiet geändert",
  move_postal_codes: "PLZ verschoben",
};

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

export async function PostalCodesOverview() {
  const [areas, recentActivity] = await Promise.all([
    getAreas(),
    getRecentActivity(8),
  ]);

  const activeAreas = areas.filter((a) => a.isArchived !== "true");
  const archivedAreas = areas.filter((a) => a.isArchived === "true");
  const totalPLZ = activeAreas.reduce(
    (s, a) => s + (a.postalCodeCount ?? 0),
    0
  );
  const totalLayers = activeAreas.reduce((s, a) => s + (a.layerCount ?? 0), 0);

  // Country breakdown
  const countryMap = new Map<string, { count: number; plz: number }>();
  for (const a of activeAreas) {
    const c = a.country ?? "?";
    const prev = countryMap.get(c) ?? { count: 0, plz: 0 };
    countryMap.set(c, {
      count: prev.count + 1,
      plz: prev.plz + (a.postalCodeCount ?? 0),
    });
  }

  // Recent (sorted by updatedAt desc)
  const recent = activeAreas.slice(0, 5);

  // Conflict areas (sorted by conflict ratio)
  const conflictAreas = activeAreas
    .filter((a) => (a.conflictCount ?? 0) > 0 && (a.postalCodeCount ?? 0) > 0)
    .map((a) => ({
      ...a,
      conflictRatio: (a.conflictCount ?? 0) / (a.postalCodeCount ?? 1),
    }))
    .sort((a, b) => b.conflictRatio - a.conflictRatio)
    .slice(0, 5);

  return (
    <div className="h-full overflow-auto p-6 pt-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">Übersicht</h1>
            <p className="text-muted-foreground text-sm">
              Gesamtüberblick aller Gebiete und PLZ-Zuordnungen
            </p>
          </div>
          {activeAreas.length > 0 && (
            <div className="flex items-center gap-2">
              <CompareAreasButton areas={areas} />
              <ExportAllAreasButton />
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <IconFolders className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Gebiete
                </span>
              </div>
              <div className="text-3xl font-bold">{activeAreas.length}</div>
              {archivedAreas.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {archivedAreas.length} archiviert
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <IconMap className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Layer
                </span>
              </div>
              <div className="text-3xl font-bold">{totalLayers}</div>
              <div className="text-xs text-muted-foreground mt-1">
                gesamt aktiv
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <IconMapPin className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  PLZ
                </span>
              </div>
              <div className="text-3xl font-bold">
                {totalPLZ.toLocaleString("de-DE")}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Zuordnungen gesamt
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🌍</span>
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Länder
                </span>
              </div>
              <div className="text-3xl font-bold">{countryMap.size}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {[...countryMap.keys()].join(", ")}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Recent areas */}
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  Gebiete
                  <Link
                    href="/"
                    className="text-xs text-muted-foreground font-normal hover:text-foreground transition-colors"
                  >
                    Alle anzeigen →
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {recent.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Noch keine Gebiete vorhanden
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {recent.map((area) => (
                      <li key={area.id}>
                        <Link
                          href={`/postal-codes/${area.id}` as Route}
                          className="flex items-center gap-3 py-2.5 hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors group"
                        >
                          <IconFolder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="flex-1 text-sm font-medium truncate">
                            {area.name}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                            {area.country && (
                              <span className="uppercase font-mono">
                                {area.country}
                              </span>
                            )}
                            {!!area.postalCodeCount && (
                              <span className="bg-muted rounded px-1 py-0.5">
                                {area.postalCodeCount} PLZ
                              </span>
                            )}
                            {!!area.layerCount && (
                              <span className="bg-muted rounded px-1 py-0.5">
                                {area.layerCount}L
                              </span>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Recent activity on dashboard */}
            {recentActivity.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <IconActivity className="h-4 w-4 text-primary" />
                    Letzte Aktivität
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-1">
                    {recentActivity.map((item, i) => {
                      const Icon =
                        CHANGE_ICONS[item.changeType] ?? IconActivity;
                      const colorClass =
                        CHANGE_COLORS[item.changeType] ??
                        "text-muted-foreground bg-muted";
                      const label =
                        CHANGE_LABELS[item.changeType] ??
                        item.changeType.replaceAll("_", " ");
                      const d = item.changeData;
                      const codes =
                        item.changeType.includes("postal") &&
                        Array.isArray(d?.codes)
                          ? (d.codes as string[])
                          : null;
                      const detail = codes
                        ? codes.length <= 3
                          ? codes.join(", ")
                          : `${codes.slice(0, 2).join(", ")} +${codes.length - 2}`
                        : typeof d?.name === "string"
                          ? d.name
                          : null;

                      return (
                        <li key={i}>
                          <Link
                            href={`/postal-codes/${item.areaId}` as Route}
                            className="flex items-start gap-3 px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/40 transition-colors"
                          >
                            <span
                              className={cn(
                                "inline-flex items-center justify-center h-6 w-6 rounded-md shrink-0 mt-0.5",
                                colorClass
                              )}
                            >
                              <Icon className="h-3 w-3" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-foreground truncate">
                                  {item.areaName}
                                </span>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {formatRelativeTime(item.createdAt)}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {label}
                                {detail && (
                                  <span className="text-foreground/60">
                                    {" "}
                                    · {detail}
                                  </span>
                                )}
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Country breakdown + quick actions */}
          <div className="space-y-4">
            {countryMap.size > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    Nach Land
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {[...countryMap.entries()].map(([country, stats]) => (
                    <div
                      key={country}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="w-8 font-mono text-xs font-bold uppercase text-muted-foreground">
                        {country}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{
                            width: `${(stats.count / activeAreas.length) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {stats.count} Geb.
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {conflictAreas.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <IconAlertTriangle className="h-4 w-4 text-orange-500" />
                    PLZ-Konflikte
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Gebiete mit überlappenden PLZ
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {conflictAreas.map((area) => (
                    <Link
                      key={area.id}
                      href={`/postal-codes/${area.id}` as Route}
                      className="flex items-center gap-2 hover:bg-muted/40 rounded-md px-1.5 py-1 -mx-1.5 transition-colors group"
                    >
                      <IconFolder className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-xs font-medium truncate">
                        {area.name}
                      </span>
                      <span className="shrink-0 text-[9px] font-medium text-orange-600 bg-orange-100 dark:bg-orange-950 dark:text-orange-400 rounded px-1.5 py-0.5 leading-none">
                        {area.conflictCount} /{" "}
                        {Math.round(area.conflictRatio * 100)}%
                      </span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">
                  Schnellaktionen
                </CardTitle>
                <CardDescription className="text-xs">
                  Verwende ⌘K für schnelle Navigation
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-1.5">
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <IconPlus className="h-3 w-3" />
                    <span>Neues Gebiet in der Seitenleiste</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconArchive className="h-3 w-3" />
                    <span>Archivierte über das Filter-Icon</span>
                  </div>
                </div>
                {archivedAreas.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs text-muted-foreground">
                      {archivedAreas.length} archivierte Gebiete
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
