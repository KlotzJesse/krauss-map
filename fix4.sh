head -n 161 src/components/postal-codes/bulk-import-dialog.tsx > temp4.tsx
cat << 'INNER' >> temp4.tsx
        await toast.promise(bulkImportPostalCodesAndLayers(areaId, layers), {
          loading: `Importiere ${layers.length} Gebiete...`,
          success: (data) => {
            if (data.success) {
              setImportProgress(100);
              updateOptimisticImportStatus({
                importing: false,
                progress: 100,
                completed: true,
              });
              reset();
              onOpenChange(false);
              if (onImportComplete) onImportComplete();
              return `Import erfolgreich! ${data.createdLayers} neue Layer, ${data.updatedLayers} aktualisiert, ${data.totalPostalCodes} PLZ hinzugefügt.`;
            }
            const errorMsg = data.errors ? data.errors.join(", ") : "Unbekannter Fehler";
            throw new Error(errorMsg);
          },
          error: (err) => {
            if (err instanceof Error) return `Import fehlgeschlagen: ${err.message}`;
            return "Import fehlgeschlagen: Unbekannter Fehler";
          },
        }).catch(() => {});
        
        setIsImporting(false);
        setImportProgress(0);
INNER
tail -n +186 src/components/postal-codes/bulk-import-dialog.tsx >> temp4.tsx
mv temp4.tsx src/components/postal-codes/bulk-import-dialog.tsx
