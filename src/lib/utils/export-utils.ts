import type { Content, PageSize } from "pdfmake/interfaces";

import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

interface LayerExportData {
  layerName: string;
  postalCodes: string[];
  areaName?: string;
}

/**
 * Formats a postal code to ensure it has leading zeros (5 digits).
 * Examples: "1900" -> "01900", "01900" -> "01900", "12345" -> "12345"
 */
function formatPostalCode(code: string): string {
  // Remove D- prefix if present
  const cleanCode = code.startsWith("D-") ? code.slice(2) : code;
  // Pad with leading zeros to ensure 5 digits
  return cleanCode.padStart(5, "0");
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
export function exportLayersPDF(layers: LayerExportData[], areaName?: string) {
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
        .map((code) => `D-${formatPostalCode(code)}`)
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
  areaName?: string
) {
  const exportPromise = async () => {
    const XLSX = await import("xlsx");

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create a sheet for each layer
    layers.forEach(({ layerName, postalCodes }) => {
      // Transform postal codes into the 3 required formats
      const sheetData = postalCodes.map((plz) => {
        const plzFormatted = formatPostalCode(plz);
        const plzWithD = `D-${plzFormatted}`;
        const plzWithDAndComma = `${plzWithD},`;

        return [plzFormatted, plzWithD, plzWithDAndComma];
      });

      // Add header row
      const wsData = [
        ["PLZ ohne D-", "PLZ mit D-", "PLZ mit D- und Komma"],
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

      XLSX.utils.book_append_sheet(wb, ws, layerName);
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
export async function copyPostalCodesCSV(codes: string[]) {
  const copyPromise = async () => {
    // Format codes to ensure leading zeros are preserved
    const formattedCodes = codes.map((code) => {
      // If code already has D- prefix, keep it and format the postal code part
      if (code.startsWith("D-")) {
        const postalPart = code.slice(2);
        return `D-${formatPostalCode(postalPart)}`;
      }
      // Otherwise just format the code
      return formatPostalCode(code);
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
