import type { Content, PageSize } from "pdfmake/interfaces";

import type { CountryCode } from "@/lib/config/countries";
import {
  formatWithPrefix,
  formatPostalCodeForCountry,
  getCountryConfig,
} from "@/lib/config/countries";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

interface LayerExportData {
  layerName: string;
  postalCodes: string[];
  areaName?: string;
}

/**
 * Formats a postal code with leading zeros for the given country.
 * Falls back to 5-digit DE format if no country specified.
 */
function formatPostalCode(code: string, country: CountryCode = "DE"): string {
  // Strip any existing prefix
  const cleanCode = code.replace(/^(D|DE|A|AT|CH)-?\s*/i, "");
  return formatPostalCodeForCountry(cleanCode, country);
}

/**
 * Exports postal codes per layer as PDF with CSV list format.
 * Creates sections for each layer in the format:
 * Layer Name1:
 * D-Postalcode1, D-Postalcode2
 *
 * Layer Name 2:
 * ...
 * @param layers Array of layer data with postal codes
 * @param areaName Optional area/project name to include in filename
 */
export function exportLayersPDF(
  layers: LayerExportData[],
  areaName?: string,
  country: CountryCode = "DE"
) {
  const config = getCountryConfig(country);
  const exportPromise = async () => {
    // Use pdfmake for PDF generation without manual positioning
    const pdfMake = await import("pdfmake/build/pdfmake");
    const pdfFonts = await import("pdfmake/build/vfs_fonts");

    // Register fonts
    // @ts-expect-error - Expected according to pdfmake usage but types differ
    pdfMake.default.vfs = pdfFonts.vfs;

    // Create document content
    const content: Content[] = [];

    // Add title
    content.push({
      text: "Gebiete Export",
      style: "header",
      margin: [0, 0, 0, 20],
    });

    // Add each layer
    layers.forEach(({ layerName, postalCodes }) => {
      // Layer title
      content.push({
        text: `${layerName}:`,
        style: "subheader",
        margin: [0, 0, 0, 10],
      });

      // Layer postal codes
      const formattedCodes = postalCodes
        .map((code) => formatWithPrefix(code, country))
        .join(", ");
      content.push({
        text: formattedCodes,
        style: "content",
        margin: [0, 0, 0, 20],
      });
    });

    // Define styles
    const styles = {
      header: {
        fontSize: 16,
        bold: true,
      },
      subheader: {
        fontSize: 14,
        bold: true,
      },
      content: {
        fontSize: 10,
      },
    };

    // Create document definition
    const docDefinition = {
      content,
      styles,
      pageSize: "A4" as PageSize,
      pageMargins: [20, 20, 20, 20] as [number, number, number, number],
    };

    // Generate filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:.]/g, "-");
    const areaPrefix = areaName
      ? `${areaName.replace(/[^a-zA-Z0-9-_]/g, "_")}_`
      : "";
    const filename = `${areaPrefix}gebiete-export-${timestamp}.pdf`;

    // Generate and download PDF
    const pdfDocGenerator = pdfMake.default.createPdf(docDefinition);
    pdfDocGenerator.download(filename);

    const totalCodes = layers.reduce(
      (sum, layer) => sum + layer.postalCodes.length,
      0
    );
    return `${totalCodes} Postleitzahlen in ${layers.length} Ebenen als PDF exportiert`;
  };

  return executeAction(exportPromise(), {
    loading: `📄 Exportiere Ebenen als PDF...`,
    success: (message: string) => message,
    error: "PDF-Export fehlgeschlagen",
  });
}

/**
 * Exports postal codes per layer as separate sheets in XLSX file.
 * Creates one sheet per layer with 3 columns: PLZ without D-, PLZ with D-, PLZ with D-POSTALCODE
 * @param layers Array of layer data with postal codes
 * @param areaName Optional area/project name to include in filename
 */
export async function exportLayersXLSX(
  layers: LayerExportData[],
  areaName?: string,
  country: CountryCode = "DE"
) {
  const config = getCountryConfig(country);
  const prefix = config.prefix;
  const exportPromise = async () => {
    const XLSX = await import("xlsx");

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create a sheet for each layer
    layers.forEach(({ layerName, postalCodes }) => {
      // Transform postal codes into the 3 required formats
      const sheetData = postalCodes.map((plz) => {
        const plzFormatted = formatPostalCode(plz, country);
        const plzWithPrefix = `${prefix}-${plzFormatted}`;
        const plzWithPrefixAndComma = `${plzWithPrefix},`;

        return [plzFormatted, plzWithPrefix, plzWithPrefixAndComma];
      });

      // Add header row
      const wsData = [
        [
          `PLZ ohne ${prefix}-`,
          `PLZ mit ${prefix}-`,
          `PLZ mit ${prefix}- und Komma`,
        ],
        ...sheetData,
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set all cells to text format to preserve leading zeros
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[cellAddress]) {
            ws[cellAddress].t = "s"; // Set cell type to string
          }
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, layerName.slice(0, 31));
    });

    // Generate filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:.]/g, "-");
    const areaPrefix = areaName
      ? `${areaName.replace(/[^a-zA-Z0-9-_]/g, "_")}_`
      : "";
    const filename = `${areaPrefix}gebiete-export-${timestamp}.xlsx`;

    XLSX.writeFile(wb, filename);

    const totalCodes = layers.reduce(
      (sum, layer) => sum + layer.postalCodes.length,
      0
    );
    return `${totalCodes} Postleitzahlen in ${layers.length} Ebenen als XLSX exportiert`;
  };

  return executeAction(exportPromise(), {
    loading: `📊 Exportiere Ebenen...`,
    success: (message: string) => message,
    error: "XLSX-Export fehlgeschlagen",
  });
}

/**
 * Copies an array of postal codes as a CSV string to the clipboard.
 * Ensures postal codes are formatted with leading zeros.
 * @param codes Array of postal codes (strings)
 */
export async function copyPostalCodesCSV(
  codes: string[],
  country: CountryCode = "DE"
) {
  const copyPromise = async () => {
    const formattedCodes = codes.map((code) => {
      // If code already has a prefix, strip it and reformat
      const cleanCode = code.replace(/^(D|DE|A|AT|CH)-?\s*/i, "");
      return formatPostalCode(cleanCode, country);
    });
    const csv = formattedCodes.join(",");
    await navigator.clipboard.writeText(csv);
    return `${codes.length} Postleitzahlen in Zwischenablage kopiert`;
  };

  return executeAction(copyPromise(), {
    loading: `📋 Kopiere ${codes.length} Postleitzahlen...`,
    success: (message: string) => message,
    error: "Kopieren in Zwischenablage fehlgeschlagen",
  });
}

/**
 * Downloads the postal codes of a single layer as a CSV file.
 */
export async function downloadLayerCSV(
  layerName: string,
  postalCodes: string[],
  country: CountryCode = "DE"
) {
  const config = getCountryConfig(country);
  const prefix = config.prefix;

  const downloadPromise = async () => {
    const lines = [
      `PLZ,${prefix}-PLZ`,
      ...postalCodes.map((code) => {
        const clean = code.replace(/^[A-Z]{1,2}-?/i, "");
        const formatted = formatPostalCode(clean, country);
        return `${formatted},${prefix}-${formatted}`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${layerName.replace(/[^a-zA-Z0-9-_äöüÄÖÜß]/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return `${postalCodes.length} PLZ als CSV heruntergeladen`;
  };

  return executeAction(downloadPromise(), {
    loading: `📥 Exportiere Layer...`,
    success: (msg: string) => msg,
    error: "CSV-Export fehlgeschlagen",
  });
}

interface MultiAreaExportRow {
  areaName: string;
  layerName: string;
  postalCodes: string[];
}

/**
 * Exports all areas + layers as a single XLSX workbook.
 * One worksheet per area, rows: Layer | PLZ | DE-PLZ | DE-PLZ,
 * Each layer is separated by a blank row + layer header.
 */
export async function exportAllAreasXLSX(
  rows: MultiAreaExportRow[],
  country: CountryCode = "DE"
) {
  const config = getCountryConfig(country);
  const prefix = config.prefix;

  const exportPromise = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Group by area
    const byArea = new Map<string, MultiAreaExportRow[]>();
    for (const row of rows) {
      const list = byArea.get(row.areaName) ?? [];
      list.push(row);
      byArea.set(row.areaName, list);
    }

    let totalCodes = 0;
    for (const [areaName, layers] of byArea) {
      const wsData: (string | null)[][] = [
        ["Ebene", "PLZ", `${prefix}-PLZ`, `${prefix}-PLZ,`],
      ];
      for (const layer of layers) {
        if (wsData.length > 1) wsData.push([null, null, null, null]);
        wsData.push([`[${layer.layerName}]`, null, null, null]);
        for (const code of layer.postalCodes) {
          const fmt = formatWithPrefix(code, country);
          const raw = code.replace(/^[A-Z]{1,2}-?/i, "");
          wsData.push([null, raw, fmt, `${fmt},`]);
          totalCodes++;
        }
      }
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Force text type for PLZ columns to preserve leading zeros
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        for (let C = 1; C <= 3; ++C) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) ws[addr].t = "s";
        }
      }
      XLSX.utils.book_append_sheet(wb, ws, areaName.slice(0, 31));
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `alle-gebiete-${timestamp}.xlsx`);
    return `${totalCodes} PLZ in ${byArea.size} Gebieten exportiert`;
  };

  return executeAction(exportPromise(), {
    loading: "📊 Exportiere alle Gebiete...",
    success: (msg: string) => msg,
    error: "Gesamt-Export fehlgeschlagen",
  });
}
