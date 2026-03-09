head -n 248 src/components/postal-codes/address-autocomplete-enhanced.tsx > temp3.tsx
cat << 'INNER' >> temp3.tsx
      if (isAdministrativeArea && onBoundarySelect) {
        const boundarySearchPromise = async () => {
          const areaNameSearch = result.city ? result.city : (result.state ? result.state : result.display_name.split(",")[0]);
          const boundaryResult = await searchPostalCodesByBoundaryAction({
            areaName: areaNameSearch,
            granularity: granularity,
            limit: 3000, // Increased to handle large states like Bayern (2320 postal codes)
          });

          if (!boundaryResult.success || !boundaryResult.data) {
            throw new Error(boundaryResult.error ? boundaryResult.error : "Boundary search failed");
          }

          const data = boundaryResult.data;
          
          const hasPostalCodes = data.postalCodes ? data.postalCodes.length > 0 : false;

          if (hasPostalCodes && onBoundarySelect) {
            onBoundarySelect(data.postalCodes);
            return `${data.count} PLZ-Regionen in ${data.areaInfo.name} ausgewÃ¤hlt`;
          }
          throw new Error("Keine PLZ-Regionen in diesem Gebiet gefunden");
        };

        toast.promise(
          boundarySearchPromise().catch((error) => {
            console.error("Boundary search failed:", error);
            throw new Error("Gebietsauswahl fehlgeschlagen");
          }), 
          {
            loading: `í·ºï¸ Suche PLZ-Regionen in ${result.display_name}...`,
            success: (message: string) => message,
            error: (error: Error) => error.message,
          }
        );
INNER
tail -n +281 src/components/postal-codes/address-autocomplete-enhanced.tsx >> temp3.tsx
mv temp3.tsx src/components/postal-codes/address-autocomplete-enhanced.tsx
