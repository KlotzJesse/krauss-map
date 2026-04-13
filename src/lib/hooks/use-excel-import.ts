import { useState, useCallback } from "react";

import {
  parseSpreadsheetFile,
  autoDetectColumns,
  processImportRows,
  groupByLayer,
  getImportStats,
} from "../utils/excel-parser";
import type {
  ParsedFileData,
  ColumnMapping,
  ProcessedImportRow,
  LayerGroup,
  ImportStats,
} from "../utils/excel-parser";
import { useStableCallback } from "./use-stable-callback";

interface ExcelImportState {
  fileData: ParsedFileData | null;
  columnMapping: ColumnMapping;
  processedRows: ProcessedImportRow[];
  layerGroups: LayerGroup[];
  stats: ImportStats | null;
  isProcessing: boolean;
  error: string | null;
}

export function useExcelImport() {
  const [state, setState] = useState<ExcelImportState>({
    fileData: null,
    columnMapping: { postalCodeColumn: null, layerColumn: null },
    processedRows: [],
    layerGroups: [],
    stats: null,
    isProcessing: false,
    error: null,
  });

  const loadFile = useStableCallback(async (file: File) => {
    setState((prev) => ({ ...prev, isProcessing: true, error: null }));

    try {
      const fileData = await parseSpreadsheetFile(file);
      const columnMapping = autoDetectColumns(fileData.headers, fileData.rows);

      setState((prev) => ({
        ...prev,
        fileData,
        columnMapping,
        isProcessing: false,
      }));

      // Automatically process with detected columns
      processData(fileData, columnMapping);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : "Failed to parse file",
      }));
    }
  });

  const processData = useCallback(
    (fileData: ParsedFileData, mapping: ColumnMapping) => {
      try {
        const processedRows = processImportRows(fileData.rows, mapping);
        const layerGroups = groupByLayer(processedRows);
        const stats = getImportStats(processedRows);

        setState((prev) => ({
          ...prev,
          processedRows,
          layerGroups,
          stats,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to process data",
        }));
      }
    },
    []
  );

  const updateColumnMapping = useStableCallback(
    (mapping: Partial<ColumnMapping>) => {
      setState((prev) => {
        const newMapping = { ...prev.columnMapping, ...mapping };

        if (prev.fileData) {
          // Re-process with new mapping
          const processedRows = processImportRows(
            prev.fileData.rows,
            newMapping
          );
          const layerGroups = groupByLayer(processedRows);
          const stats = getImportStats(processedRows);

          return {
            ...prev,
            columnMapping: newMapping,
            processedRows,
            layerGroups,
            stats,
          };
        }

        return {
          ...prev,
          columnMapping: newMapping,
        };
      });
    }
  );

  const toggleHeaders = useStableCallback(() => {
    setState((prev) => {
      if (!prev.fileData) {
        return prev;
      }

      // Re-parse with toggled header detection
      // This is a simplified version - in production you might want to re-parse the file
      const hasHeaders = !prev.fileData.hasHeaders;

      return {
        ...prev,
        fileData: {
          ...prev.fileData,
          hasHeaders,
        },
      };
    });
  });

  const reset = useStableCallback(() => {
    setState({
      fileData: null,
      columnMapping: { postalCodeColumn: null, layerColumn: null },
      processedRows: [],
      layerGroups: [],
      stats: null,
      isProcessing: false,
      error: null,
    });
  });

  return {
    ...state,
    loadFile,
    updateColumnMapping,
    toggleHeaders,
    reset,
  };
}
