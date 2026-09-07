import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import type { CountryCode } from "@/lib/config/countries";
import { db } from "@/lib/db";

/**
 * Per-postal-code metadata for the map hover card: place name, population,
 * area and Bundesland/Kanton.
 *
 * Shipped separately from the geometry rather than folded into the TopoJSON,
 * because the geometry is fetched on every map load while this is only needed
 * once someone hovers a polygon.
 *
 * State names are interned — there are 16 German Bundesländer against 8,170
 * codes — so each entry stores an index instead of repeating the string.
 */
export interface PostalCodeMeta {
  /** Interned state names; `entries[n][3]` indexes into this. */
  states: string[];
  /** code -> [place, population, areaKm2, stateIndex]. Nulls where unknown. */
  entries: Record<
    string,
    [string | null, number | null, number | null, number | null]
  >;
}

interface MetaRow extends Record<string, unknown> {
  code: string;
  note: string | null;
  einwohner: number | null;
  qkm: number | null;
  state_name: string | null;
}

/**
 * `note` reads "86899 Landsberg a. Lech" — the code repeated, then the place.
 * Strip the leading code so the card can show the place on its own.
 */
function placeFromNote(note: string | null, code: string): string | null {
  if (!note) {
    return null;
  }
  const trimmed = note.trim();
  const withoutCode = trimmed.startsWith(code)
    ? trimmed.slice(code.length).trim()
    : trimmed;
  return withoutCode.length > 0 ? withoutCode : null;
}

export async function getPostalCodeMeta(
  granularity: string,
  country: CountryCode
): Promise<PostalCodeMeta> {
  "use cache";
  cacheLife("days");
  cacheTag("postal-code-meta", `postal-code-meta-${country}-${granularity}`);

  const { rows } = await db.execute<MetaRow>(sql`
    SELECT code,
           properties->>'note'                AS note,
           (properties->>'einwohner')::int    AS einwohner,
           round((properties->>'qkm')::numeric, 1)::float8 AS qkm,
           state_name
    FROM postal_codes
    WHERE country = ${country}
      AND granularity = ${granularity}
      AND is_active = 'true'
  `);

  const states: string[] = [];
  const stateIndex = new Map<string, number>();
  const entries: PostalCodeMeta["entries"] = {};

  for (const row of rows) {
    let idx: number | null = null;
    if (row.state_name) {
      const existing = stateIndex.get(row.state_name);
      if (existing === undefined) {
        idx = states.push(row.state_name) - 1;
        stateIndex.set(row.state_name, idx);
      } else {
        idx = existing;
      }
    }
    entries[row.code] = [
      placeFromNote(row.note, row.code),
      row.einwohner ?? null,
      row.qkm ?? null,
      idx,
    ];
  }

  return { states, entries };
}
