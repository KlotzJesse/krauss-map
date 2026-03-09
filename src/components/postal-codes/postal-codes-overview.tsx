"use client";

import {
  IconFolder,
  IconMapPin,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PostalCodesOverview() {
  return (
    <div className="h-full p-6 pt-10">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">KRAUSS Gebietsmanagement</h1>
          <p className="text-muted-foreground text-lg">
            PLZ-Gebiete mit verschiedenen Granularitäten verwalten und
            Gebietsaufteilungen erstellen.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconFolder className="w-5 h-5 text-primary" />
                Gebietsverwaltung
              </CardTitle>
              <CardDescription>
                Gebietsaufteilungen mit mehreren Layern für verschiedene
                PLZ-Bereiche erstellen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Mehrere Layer pro Gebiet</li>
                <li>• Flexible PLZ-Zuordnung</li>
                <li>• Versionsverwaltung</li>
                <li>• Export & Import</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconMapPin className="w-5 h-5 text-primary" />
                PLZ erkunden
              </CardTitle>
              <CardDescription>
                Interaktive Karte zur Erforschung der deutschen
                Postleitzahlgebiete mit verschiedenen Granularitätsstufen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 1- bis 5-stellige PLZ-Granularität</li>
                <li>• Interaktive Kartennavigation</li>
                <li>• Adresssuche und Geokodierung</li>
                <li>• Radius- und Fahrtzeitsuche</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconUpload className="w-5 h-5 text-primary" />
                Datenimport
              </CardTitle>
              <CardDescription>
                Importieren Sie Postleitzahllisten oder verwenden Sie die
                integrierten Suchwerkzeuge zur Gebietsanalyse.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• CSV-Import von PLZ-Listen</li>
                <li>• Adressbasierte Suche</li>
                <li>• Umkreissuche</li>
                <li>• Fahrtzeitsuche</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconSearch className="w-5 h-5 text-primary" />
              Erste Schritte
            </CardTitle>
            <CardDescription>
              So starten Sie mit der Gebietsverwaltung:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                  1
                </div>
                <h3 className="font-semibold mb-1">Gebiet erstellen</h3>
                <p className="text-sm text-muted-foreground">
                  Verwenden Sie die "Neues Gebiet erstellen" Schaltfläche in der
                  Seitenleiste, um Ihr erstes Gebiet anzulegen.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                  2
                </div>
                <h3 className="font-semibold mb-1">Layer hinzufügen</h3>
                <p className="text-sm text-muted-foreground">
                  Fügen Sie Layer hinzu und weisen Sie Postleitzahlen zu, um
                  Ihre Gebietsstruktur aufzubauen.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                  3
                </div>
                <h3 className="font-semibold mb-1">
                  Analysieren & Exportieren
                </h3>
                <p className="text-sm text-muted-foreground">
                  Nutzen Sie die Analysewerkzeuge und exportieren Sie Ihre
                  Gebietsdaten für weitere Verwendung.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
