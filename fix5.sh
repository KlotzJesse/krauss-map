head -n 705 src/components/shared/drawing-tools.tsx > temp5.tsx
cat << 'INNER' >> temp5.tsx
        await toast.promise(
          createLayer({
            name: createdLayerName,
            color: nextColor,
            orderIndex: optimisticLayers.length,
          }).then((result) => {
            // Set the newly created layer as active
            if (result) {
              if (result.id) {
                if (onLayerSelect) {
                  onLayerSelect(result.id);
                }
              }
            }
            return result;
          }),
          {
            loading: `Erstelle Gebiet "${createdLayerName}"...`,
            success: `Gebiet "${createdLayerName}" erstellt`,
            error: "Fehler beim Erstellen - Bitte erneut versuchen",
          }
        ).catch(() => {});
        setIsCreating(false);
INNER
tail -n +728 src/components/shared/drawing-tools.tsx >> temp5.tsx
mv temp5.tsx src/components/shared/drawing-tools.tsx
