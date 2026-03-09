head -n 156 src/components/postal-codes/address-autocomplete-enhanced.tsx > temp2.tsx
cat << 'INNER' >> temp2.tsx
        const geocodePromise = async () => {
          // Detect if query is likely an address (contains numbers) or a place name (only letters)
          const looksLikeAddress = /\d/.test(value.trim());

          // Enhanced search with German/English support and city/state handling
          const geocodeResult = await geocodeSearchAction({
            query: value,
            includePostalCode: looksLikeAddress, // Only require postal codes for address-like queries
            limit: 8,
            enhancedSearch: true, // Enable enhanced German/English search
          });

          if (!geocodeResult.success || !geocodeResult.data) {
            throw new Error(geocodeResult.error ? geocodeResult.error : "Geocoding failed");
          }

          let results = geocodeResult.data.results ? geocodeResult.data.results : [];

          setResults(results);

          if (results.length === 0) {
            throw new Error(
              `Keine Ergebnisse für "${value}" gefunden. Versuchen Sie deutsche Stadtnamen (z.B. München statt Munich) oder PLZ.`
            );
          }

          const resultType = "Adressen";
          return `${results.length} ${resultType} gefunden`;
        };

        toast.promise(
          geocodePromise()
            .catch((error) => {
              console.error("Geocoding error:", error);
              setResults([]);
              throw error;
            })
            .finally(() => {
              setIsLoading(false);
            }),
          {
INNER
tail -n +197 src/components/postal-codes/address-autocomplete-enhanced.tsx >> temp2.tsx
mv temp2.tsx src/components/postal-codes/address-autocomplete-enhanced.tsx
