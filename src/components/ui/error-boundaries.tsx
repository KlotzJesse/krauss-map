import { AlertTriangle, RefreshCw } from "lucide-react";

import { AlertError } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/ui/error-boundary";

// Specific error boundaries for different features
export function MapErrorBoundary({
  children,
  resetKeys,
}: {
  children: React.ReactNode;
  resetKeys?: unknown[];
}) {
  return (
    <ErrorBoundary
      resetKeys={resetKeys}
      fallback={
        <div className="h-full w-full flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Kartenfehler
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Die Karte konnte nicht geladen werden. Bitte versuchen Sie es
                erneut.
              </p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Seite neu laden
              </Button>
            </CardContent>
          </Card>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export function PostalCodesErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-6">
          <AlertError message="Fehler beim Laden der Postleitzahldaten. Bitte aktualisieren Sie die Seite." />
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export function DrawingToolsErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary
      fallback={
        <Card className="w-56">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <AlertTriangle className="w-8 h-8 mx-auto text-destructive" />
              <p className="text-sm text-muted-foreground">
                Zeichenwerkzeuge konnten nicht geladen werden
              </p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Neu laden
              </Button>
            </div>
          </CardContent>
        </Card>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export function AddressAutocompleteErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary
      fallback={
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
              <p className="text-sm text-muted-foreground">
                Adresssuche nicht verfügbar
              </p>
            </div>
          </CardContent>
        </Card>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export function FeatureErrorBoundary({
  children,
  fallbackMessage = "Ein Fehler ist aufgetreten",
  resetKeys,
}: {
  children: React.ReactNode;
  fallbackMessage?: string;
  resetKeys?: unknown[];
}) {
  return (
    <ErrorBoundary
      resetKeys={resetKeys}
      fallback={
        <div className="p-4">
          <AlertError message={fallbackMessage} />
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
