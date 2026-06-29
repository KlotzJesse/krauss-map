# Postal Code System Fixes - Complete Summary

## Issues Fixed

### 1. **Search Not Finding Postal Codes with Different Formats**

**Problem:** Searching for "26781" wouldn't find "D-26781" and vice versa. This happened because:

- The search function did exact string matching on the `postal_code` field
- Different formats exist in the database (some with country prefixes like "D-", "A-", "CH-", some without)
- Input normalization wasn't happening

**Files Changed:**

- `src/app/actions/area-actions.ts` - `searchPostalCodeInAreasAction()`

**Fix Applied:**

```typescript
// Before: direct exact match
WHERE alpc.postal_code = ${code}

// After: detect country prefix and search for both formats
const { country, code: cleanCode } = detectCountryFromCode(input);
const searchCountry = (country ?? "DE") as CountryCode;
const formattedCode = formatWithPrefix(cleanCode, searchCountry);

WHERE (alpc.postal_code = ${formattedCode} OR alpc.postal_code = ${cleanCode})
```

This normalizes the search input and queries for both the prefixed format (D-26781) and the legacy non-prefixed format (26781).

---

### 2. **"In Which Regions" Badges Not Showing**

**Problem:** When viewing a postal code in the address search dropdown, the badges showing which layers/regions contain that code weren't appearing.

**Files Changed:**

- `src/components/postal-codes/address-autocomplete-enhanced.tsx` - `getLayersForPostalCode()`

**Fix Applied:**

```typescript
// Before: exact match only
layer.postalCodes?.some((pc) => pc.postalCode === postalCode);

// After: normalize both sides of comparison
const normalizeCode = (code: string): string => {
  return code.replace(/[^0-9]/g, "").toUpperCase();
};
const normalizedInput = normalizeCode(postalCode);

layer.postalCodes?.some(
  (pc) =>
    normalizeCode(pc.postalCode) === normalizedInput ||
    pc.postalCode === postalCode
);
```

Now finds regions even if the postal code format differs (26781 vs D-26781).

---

### 3. **Address Search Dropdown Causing Layout Shift**

**Problem:** When opening the address search dropdown, the page would shift down ("moves down weirdly on open").

**Files Changed:**

- `src/components/postal-codes/address-autocomplete-enhanced.tsx` - Dropdown styling

**Fix Applied:**

- Changed from `mt-1` (margin-top) to `mt-0` on the dropdown container
- Improved shadow styling from `shadow-sm` to `shadow-lg` for better visibility
- The dropdown now uses `absolute left-0 top-full` positioning which doesn't cause layout shift

---

### 4. **Postal Code Layer Search Not Finding Cross-Layer Matches**

**Problem:** The layer search feature (looking for 5-digit postal codes) wasn't finding postal codes with country prefixes.

**Files Changed:**

- `src/components/shared/drawing-tools.tsx` - `plzSearchResults` useMemo

**Fix Applied:**

```typescript
// Before: only matched 5-digit numeric codes
if (!/^\d{5}$/.test(q)) return null;
return optimisticLayers.filter((l) =>
  l.postalCodes?.some((pc) => pc.postalCode === q)
);

// After: matches prefixed codes too and normalizes comparison
if (!/^(D|A|CH|DE|AT)?-?\d{1,5}$/.test(q)) return null;
const normalizeCode = (code: string): string => {
  return code.replace(/[^0-9]/g, "").toUpperCase();
};
const normalizedQ = normalizeCode(q);

return optimisticLayers.filter((l) =>
  l.postalCodes?.some(
    (pc) => normalizeCode(pc.postalCode) === normalizedQ || pc.postalCode === q
  )
);
```

---

### 5. **Map Click Handler Not Finding Postal Codes**

**Problem:** When clicking on the map to add/remove a postal code, the system couldn't find the postal code due to format mismatches.

**Files Changed:**

- `src/lib/hooks/use-map-interactions.ts` - `handleDeckClick()`

**Fix Applied:**

```typescript
// Before: exact match only
const codeExists = existingCodesSet.has(storedCode);
l.postalCodes?.some((pc) => pc.postalCode === storedCode);

// After: normalize and compare both formats
const normalizeCode = (code: string): string => {
  return code.replace(/[^0-9]/g, "").toUpperCase();
};
const normalizedStoredCode = normalizeCode(storedCode);
const codeExists =
  existingCodesSet.has(storedCode) ||
  Array.from(existingCodesSet).some(
    (code) => normalizeCode(code) === normalizedStoredCode
  );

l.postalCodes?.some(
  (pc) =>
    pc.postalCode === storedCode ||
    normalizeCode(pc.postalCode) === normalizedStoredCode
);
```

---

## Database Cleanup Script

Created `src/scripts/fix-duplicate-postal-codes.ts` to identify and merge duplicate postal codes stored in both formats (e.g., "26781" and "D-26781").

**Usage:**

```bash
bun run src/scripts/fix-duplicate-postal-codes.ts
```

**What it does:**

1. Finds all raw numeric postal codes (e.g., "26781")
2. Finds all prefixed postal codes (e.g., "D-26781")
3. Identifies duplicates (same code with and without prefix)
4. Merges duplicates by deleting the raw numeric version
5. Reports any unmatched raw codes that need manual correction

---

## Root Cause Analysis

The system was designed to store postal codes with country prefixes:

- German: `D-12345`
- Austrian: `A-1010`
- Swiss: `CH-8001`

However, legacy code or imports may have created entries without prefixes. The normalization fixes ensure the system works with both formats, and the cleanup script helps remove duplicates going forward.

---

## Testing Recommendations

1. **Search Tests:**
   - Search for "26781" (numeric) and verify it finds "D-26781"
   - Search for "D-26781" and verify it finds entries
   - Search for "A-1010" and "AT-1010" and verify both work

2. **Address Autocomplete:**
   - Search for a postal code
   - Verify region badges appear correctly
   - Verify dropdown doesn't cause page scroll shift

3. **Layer Search:**
   - Enter a 5-digit postal code in layer search
   - Verify it finds cross-layer matches
   - Try with prefixes (D-26781)

4. **Map Interactions:**
   - Click on map to add postal codes
   - Verify add/remove works regardless of code format
   - Check that region reassignment works correctly

---

## Deployment Notes

- Build verification: ✅ All TypeScript and Next.js builds pass
- Database migration: Run the cleanup script after deployment to fix existing duplicates
- Backward compatible: Changes work with both prefixed and non-prefixed codes

---

## Files Modified

1. `src/app/actions/area-actions.ts` - Search normalization
2. `src/components/postal-codes/address-autocomplete-enhanced.tsx` - Layer lookup + dropdown positioning
3. `src/components/shared/drawing-tools.tsx` - Layer cross-search
4. `src/lib/hooks/use-map-interactions.ts` - Map click handler
5. `src/scripts/fix-duplicate-postal-codes.ts` - New cleanup utility

---

## Performance Impact

- ✅ Minimal: Added simple string normalization (remove non-digits)
- ✅ No new database queries or indices needed
- ✅ All comparisons remain O(n) or O(1)
- ✅ Uses existing database indices

---

## Future Improvements

1. Run cleanup script to normalize all legacy postal codes to prefixed format
2. Consider enforcing prefixed format in the database schema
3. Add unit tests for postal code normalization
4. Document postal code format requirements in codebase
