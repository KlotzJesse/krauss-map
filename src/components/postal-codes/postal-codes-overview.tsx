import {
  IconArchive,
  IconFolder,
  IconFolders,
  IconMap,
  IconMapPin,
  IconPlus,
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
import { getAreas } from "@/lib/db/data-functions";
import { ExportAllAreasButton } from "./export-all-areas-button";

export async function PostalCodesOverview() {
  const areas = await getAreas();

  const activeAreas = areas.filter((a) => a.isArchived !== "true");
  const archivedAreas = areas.filter((a) => a.isArchived === "true");
  const totalPLZ = activeAreas.reduce((s, a) => s + (a.postalCodeCount ?? 0), 0);
  const totalLayers = activeAreas.reduce((s, a) => s + (a.layerCount ?? 0), 0);

  // Country breakdown
  const countryMap = new Map<string, { count: number; plz: number }>();
  for (const a of activeAreas) {
    const c = a.country ?? "?";
    const prev = countryMap.get(c) ?? { count: 0, plz: 0 };
    countryMap.set(c, { count: prev.count + 1, plz: prev.plz + (a.postalCodeCount ?? 0) });
  }

  // Recent (sorted by updatedAt desc)
  const recent = activeAreas.slice(0, 5);

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
          {activeAreas.length > 0 && <ExportAllAreasButton />}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <IconFolders className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Gebiete</span>
              </div>
              <div className="text-3xl font-bold">{activeAreas.length}</div>
              {archivedAreas.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">{archivedAreas.length} archiviert</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <IconMap className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Layer</span>
              </div>
              <div className="text-3xl font-bold">{totalLayers}</div>
              <div className="text-xs text-muted-foreground mt-1">gesamt aktiv</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <IconMapPin className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">PLZ</span>
              </div>
              <div className="text-3xl font-bold">{totalPLZ.toLocaleString("de-DE")}</div>
              <div className="text-xs text-muted-foreground mt-1">Zuordnungen gesamt</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">🌍</span>
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Länder</span>
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
          <div className="md:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  Zuletzt bearbeitet
                  <Link
                    href="/" className="text-xs text-muted-foreground font-normal hover:text-foreground transition-colors"
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
                          <span className="flex-1 text-sm font-medium truncate">{area.name}</span>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                            {area.country && (
                              <span className="uppercase font-mono">{area.country}</span>
                            )}
                            {!!area.postalCodeCount && (
                              <span className="bg-muted rounded px-1 py-0.5">{area.postalCodeCount} PLZ</span>
                            )}
                            {!!area.layerCount && (
                              <span className="bg-muted rounded px-1 py-0.5">{area.layerCount}L</span>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Country breakdown + quick actions */}
          <div className="space-y-4">
            {countryMap.size > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Nach Land</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {[...countryMap.entries()].map(([country, stats]) => (
                    <div key={country} className="flex items-center gap-2 text-sm">
                      <span className="w-8 font-mono text-xs font-bold uppercase text-muted-foreground">{country}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${(stats.count / activeAreas.length) * 100}%` }}
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

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Schnellaktionen</CardTitle>
                <CardDescription className="text-xs">Verwende ⌘K für schnelle Navigation</CardDescription>
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
