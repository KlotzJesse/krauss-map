import * as XLSX from "xlsx";

import { normalizePostalCode } from "./postal-code-parser";

export type ParsedRow = Record<string, string | number | null>;

export interface ParsedFileData {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number;
  hasHeaders: boolean;
}

export interface ColumnMapping {
  postalCodeColumn: string | null;
  layerColumn: string | null;
}

export interface ProcessedImportRow {
  postalCode: string;
  layer?: string;
  isValid: boolean;
  error?: string;
}

/**
 * Parse Excel or CSV file and return structured data
 */
export async function parseSpreadsheetFile(
  file: File
): Promise<ParsedFileData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  // Get first sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON with header option
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1, // Use array of arrays
    defval: null,
    raw: false, // Convert to strings
  });

  if (rawData.length === 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      hasHeaders: false,
    };
  }

  // Try to detect if first row is headers
  const hasHeaders = detectHeaders(rawData);

  let headers: string[];
  let dataRows: unknown[][];

  if (hasHeaders && rawData.length > 1) {
    headers = (rawData[0] as (string | number)[]).map((h, idx) =>
      h ? String(h).trim() : `Column ${idx + 1}`
    );
    dataRows = rawData.slice(1);
  } else {
    // Generate column names
    const firstRow = rawData[0] as unknown[];
    headers = firstRow.map((_, idx) => `Column ${idx + 1}`);
    dataRows = rawData;
  }

  // Convert rows to objects
  const rows: ParsedRow[] = dataRows
    .map((row) => {
      const rowObj: ParsedRow = {};
      headers.forEach((header, idx) => {
        const value = (row as unknown[])[idx];
        rowObj[header] =
          value === null || value === undefined ? null : String(value).trim();
      });
      return rowObj;
    })
    .filter((row) =>
      Object.values(row).some((val) => val !== null && val !== "")
    );

  return {
    headers,
    rows,
    totalRows: rows.length,
    hasHeaders,
  };
}

/**
 * Detect if first row contains headers
 */
function detectHeaders(data: unknown[][]): boolean {
  if (data.length < 2) {
    return false;
  }

  const firstRow = data[0] as unknown[];
  const secondRow = data[1] as unknown[];

  // Check if first row has string values and second row has different types
  const firstRowAllStrings = firstRow.every(
    (cell) =>
      typeof cell === "string" &&
      cell.trim().length > 0 &&
      !/^\d+$/.test(String(cell))
  );

  const secondRowHasNumbers = secondRow.some(
    (cell) => !isNaN(Number(cell)) && String(cell).trim() !== ""
  );

  return firstRowAllStrings || (firstRowAllStrings && secondRowHasNumbers);
}

/**
 * Auto-detect which columns likely contain postal codes and layer names
 */
export function autoDetectColumns(
  headers: string[],
  rows: ParsedRow[]
): ColumnMapping {
  const postalCodePatterns = /plz|postal|post|zip|code/i;
  const layerPatterns =
    /layer|schicht|ebene|kategorie|category|name|gruppe|group/i;

  let postalCodeColumn: string | null = null;
  let layerColumn: string | null = null;

  // First, try to match by column name
  for (const header of headers) {
    if (!postalCodeColumn && postalCodePatterns.test(header)) {
      postalCodeColumn = header;
    }
    if (!layerColumn && layerPatterns.test(header)) {
      layerColumn = header;
    }
  }

  // If no postal code column found, analyze data
  if (!postalCodeColumn && rows.length > 0) {
    for (const header of headers) {
      const values = rows.slice(0, 10).map((row) => row[header]);
      const validPostalCodes = values.filter((val) => {
        if (!val) {
          return false;
        }
        const str = String(val).trim();
        // Check if it looks like a German postal code
        const normalized = str.replace(/^D-?/i, "");
        return /^\d{1,5}$/.test(normalized);
      });

      // If more than 60% of values are valid postal codes
      if (validPostalCodes.length / values.length > 0.6) {
        postalCodeColumn = header;
        break;
      }
    }
  }

  // If still no postal code column, use first column as fallback
  if (!postalCodeColumn && headers.length > 0) {
    postalCodeColumn = headers[0];
  }

  // For layer column, if we have 2+ columns and no match yet, use second column
  if (!layerColumn && headers.length > 1 && postalCodeColumn !== headers[1]) {
    layerColumn = headers[1];
  }

  return {
    postalCodeColumn,
    layerColumn,
  };
}

/**
 * Process rows with column mapping and validate postal codes
 */
export function processImportRows(
  rows: ParsedRow[],
  mapping: ColumnMapping
): ProcessedImportRow[] {
  const processed: ProcessedImportRow[] = [];

  for (const row of rows) {
    const postalCodeValue = mapping.postalCodeColumn
      ? row[mapping.postalCodeColumn]
      : null;
    const layerValue = mapping.layerColumn ? row[mapping.layerColumn] : null;

    if (!postalCodeValue || String(postalCodeValue).trim() === "") {
      continue; // Skip rows without postal code
    }

    const postalCodeStr = String(postalCodeValue).trim();
    const normalized = normalizePostalCode(postalCodeStr);

    // Validate German postal code
    const isValid = /^\d{1,5}$/.test(normalized);

    processed.push({
      postalCode: normalized,
      layer: layerValue ? String(layerValue).trim() : undefined,
      isValid,
      error: !isValid ? `Invalid postal code: ${postalCodeStr}` : undefined,
    });
  }

  return processed;
}

/**
 * Group processed rows by layer name
 */
export interface LayerGroup {
  layerName: string;
  postalCodes: string[];
  validCount: number;
  invalidCount: number;
}

export function groupByLayer(rows: ProcessedImportRow[]): LayerGroup[] {
  const groups = new Map<string, ProcessedImportRow[]>();

  for (const row of rows) {
    const layerName = row.layer || "Standard-Layer";
    if (!groups.has(layerName)) {
      groups.set(layerName, []);
    }
    groups.get(layerName)!.push(row);
  }

  return [...groups.entries()].map(([layerName, layerRows]) => {
    const validRows = layerRows.filter((r) => r.isValid);
    const invalidRows = layerRows.filter((r) => !r.isValid);

    return {
      layerName,
      postalCodes: validRows.map((r) => r.postalCode),
      validCount: validRows.length,
      invalidCount: invalidRows.length,
    };
  });
}

/**
 * Get statistics about the import data
 */
export interface ImportStats {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  uniquePostalCodes: number;
  uniqueLayers: number;
}

export function getImportStats(rows: ProcessedImportRow[]): ImportStats {
  const validRows = rows.filter((r) => r.isValid);
  const invalidRows = rows.filter((r) => !r.isValid);
  const uniquePostalCodes = new Set(validRows.map((r) => r.postalCode)).size;
  const uniqueLayers = new Set(rows.map((r) => r.layer).filter(Boolean)).size;

  return {
    totalRows: rows.length,
    validRows: validRows.length,
    invalidRows: invalidRows.length,
    uniquePostalCodes,
    uniqueLayers: uniqueLayers > 0 ? uniqueLayers : 1, // Mindestens 1 (Standard)
  };
}
