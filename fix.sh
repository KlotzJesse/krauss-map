head -n 230 src/components/postal-codes/postal-codes-view-client-layers.tsx > temp.tsx
cat << 'INNER' >> temp.tsx
        } catch (error) {
          let errorMessage = "Fehler beim Hinzufügen der PLZ";
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          toast.error(errorMessage);
        }
      });
    };

    const removePostalCodesFromLayer = async (
      layerId: number,

      postalCodes: string[]
    ) => {
      if (!areaId) {
        toast.error("Kein Gebiet ausgewählt");

        return;
      }

      startTransition(async () => {
        updateOptimisticLayers({ type: "remove", layerId, postalCodes });

        // Optimistically increment undo count (new change added)
        updateOptimisticUndoRedo("increment");

        try {
          const result = await removePostalCodesFromLayerAction(
            areaId,

            layerId,

            postalCodes
          );

          if (!result.success) {
            throw new Error(result.error);
          }

          // Success handled by map click interaction toast
        } catch (error) {
          let errorMessage = "Fehler beim Entfernen der PLZ";
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          toast.error(errorMessage);
        }
      });
    };
INNER
tail -n +281 src/components/postal-codes/postal-codes-view-client-layers.tsx >> temp.tsx
mv temp.tsx src/components/postal-codes/postal-codes-view-client-layers.tsx
