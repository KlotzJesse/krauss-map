import { useState } from "react";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { parseCSVPostalCodes } from "@/lib/utils/postal-code-parser";

export interface FileImportResult {
  postalCodes: string[];
  fileName: string;
  fileType: string;
  error?: string;
}

export function useFileImport() {
  const [isProcessing, setIsProcessing] = useState(false);

  const processFile = useStableCallback(
    async (file: File): Promise<FileImportResult> => {
      setIsProcessing(true);

      try {
        const fileName = file.name;
        const fileType = file.type;

        // Read file content
        const content = await readFileAsText(file);

        let postalCodes: string[] = [];

        if (fileName.endsWith(".csv") || fileType === "text/csv") {
          postalCodes = parseCSVPostalCodes(content);
        } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
          // For XLSX files, we'll need to install and use a library like xlsx
          // For now, treat as CSV and let user convert to CSV first
          throw new Error(
            "XLSX-Dateien werden derzeit nicht unterstützt. Bitte konvertieren Sie zu CSV."
          );
        } else if (fileType === "text/plain" || fileName.endsWith(".txt")) {
          // Treat as plain text input
          postalCodes = content
            .split(/[,;\n\r\s]+/)
            .map((code) => code.trim())
            .filter((code) => code.length > 0);
        } else {
          throw new Error(
            `Dateityp "${fileType}" wird nicht unterstützt. Unterstützte Formate: CSV, TXT`
          );
        }

        return {
          postalCodes,
          fileName,
          fileType,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Unbekannter Fehler beim Verarbeiten der Datei";
        return {
          postalCodes: [],
          fileName: file.name,
          fileType: file.type,
          error: errorMessage,
        };
      } finally {
        setIsProcessing(false);
      }
    }
  );

  const processMultipleFiles = useStableCallback(
    async (files: FileList): Promise<FileImportResult[]> => {
      const results: FileImportResult[] = [];

      for (let i = 0; i < files.length; i++) {
        const result = await processFile(files[i]);
        results.push(result);
      }

      return results;
    }
  );

  return {
    isProcessing,
    processFile,
    processMultipleFiles,
  };
}

/**
 * Helper function to read file content as text
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      if (event.target?.result) {
        resolve(event.target.result as string);
      } else {
        reject(new Error("Datei konnte nicht gelesen werden"));
      }
    };

    reader.onerror = () => {
      reject(new Error("Fehler beim Lesen der Datei"));
    };

    reader.readAsText(file, "UTF-8");
  });
}
