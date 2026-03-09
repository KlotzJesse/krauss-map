"use client";

import type { InferSelectModel } from "drizzle-orm";
import React, { createContext, useContext, useOptimistic, useTransition, useCallback } from 'react';
import type { ReactNode } from 'react';

import type { areaLayers, areas } from "../schema/schema";

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

type Area = InferSelectModel<typeof areas>;

// Optimistic update action types
type LayerAction =
  | { type: "create"; layer: Partial<Layer> }
  | { type: "update"; id: number; layer: Partial<Layer> }
  | { type: "delete"; id: number }
  | { type: "add_codes"; layerId: number; codes: string[] }
  | { type: "remove_codes"; layerId: number; codes: string[] };

type AreaAction =
  | { type: "rename"; id: number; name: string }
  | { type: "delete"; id: number };

type UndoRedoAction =
  | { type: "undo"; decrementUndo: boolean; incrementRedo: boolean }
  | { type: "redo"; incrementUndo: boolean; decrementRedo: boolean }
  | { type: "add_change"; incrementUndo: boolean; clearRedo: boolean }
  | { type: "set"; undoCount: number; redoCount: number };

interface UndoRedoState {
  undoCount: number;
  redoCount: number;
  canUndo: boolean;
  canRedo: boolean;
}

interface OptimisticContextValue {
  // State
  optimisticLayers: Layer[];
  optimisticAreas: Area[];
  optimisticUndoRedo: UndoRedoState;
  isPending: boolean;

  // Actions
  updateLayers: (action: LayerAction) => void;
  updateAreas: (action: AreaAction) => void;
  updateUndoRedo: (action: UndoRedoAction) => void;

  // Wrapper for server actions
  withOptimistic: <T>(
    optimisticUpdate: () => void,
    serverAction: () => Promise<T>
  ) => Promise<T>;
}

const OptimisticContext = createContext<OptimisticContextValue | undefined>(
  undefined
);

// Reducer for layer updates
function layersReducer(currentLayers: Layer[], action: LayerAction): Layer[] {
  switch (action.type) {
    case "create": {
      return [...currentLayers, { ...action.layer, id: Date.now() } as Layer];
    }

    case "update": {
      return currentLayers.map((l) =>
        l.id === action.id ? { ...l, ...action.layer } : l
      );
    }

    case "delete": {
      return currentLayers.filter((l) => l.id !== action.id);
    }

    case "add_codes": {
      return currentLayers.map((l) => {
        if (l.id === action.layerId) {
          const currentCodes = l.postalCodes?.map((pc) => pc.postalCode) || [];
          const newCodes = [...new Set([...currentCodes, ...action.codes])];
          return {
            ...l,
            postalCodes: newCodes.map((code) => ({ postalCode: code })),
          };
        }
        return l;
      });
    }

    case "remove_codes": {
      return currentLayers.map((l) => {
        if (l.id === action.layerId) {
          const currentCodes = l.postalCodes?.map((pc) => pc.postalCode) || [];
          const newCodes = currentCodes.filter(
            (code) => !action.codes.includes(code)
          );
          return {
            ...l,
            postalCodes: newCodes.map((code) => ({ postalCode: code })),
          };
        }
        return l;
      });
    }

    default: {
      return currentLayers;
    }
  }
}

// Reducer for area updates
function areasReducer(currentAreas: Area[], action: AreaAction): Area[] {
  switch (action.type) {
    case "rename": {
      return currentAreas.map((area) =>
        area.id === action.id ? { ...area, name: action.name } : area
      );
    }

    case "delete": {
      return currentAreas.filter((area) => area.id !== action.id);
    }

    default: {
      return currentAreas;
    }
  }
}

// Reducer for undo/redo updates
function undoRedoReducer(
  current: UndoRedoState,
  action: UndoRedoAction
): UndoRedoState {
  switch (action.type) {
    case "undo": {
      const newUndoCount = Math.max(0, current.undoCount - 1);
      const newRedoCount = current.redoCount + 1;
      return {
        undoCount: newUndoCount,
        redoCount: newRedoCount,
        canUndo: newUndoCount > 0,
        canRedo: true,
      };
    }

    case "redo": {
      const undoCount = current.undoCount + 1;
      const redoCount = Math.max(0, current.redoCount - 1);
      return {
        undoCount,
        redoCount,
        canUndo: true,
        canRedo: redoCount > 0,
      };
    }

    case "add_change": {
      const incrementedUndo = current.undoCount + 1;
      return {
        undoCount: incrementedUndo,
        redoCount: 0, // Clear redo stack on new change
        canUndo: true,
        canRedo: false,
      };
    }

    case "set": {
      return {
        undoCount: action.undoCount,
        redoCount: action.redoCount,
        canUndo: action.undoCount > 0,
        canRedo: action.redoCount > 0,
      };
    }

    default: {
      return current;
    }
  }
}

interface OptimisticProviderProps {
  children: ReactNode;
  initialLayers?: Layer[];
  initialAreas?: Area[];
  initialUndoRedo?: UndoRedoState;
}

export function OptimisticProvider({
  children,
  initialLayers = [],
  initialAreas = [],
  initialUndoRedo = {
    undoCount: 0,
    redoCount: 0,
    canUndo: false,
    canRedo: false,
  },
}: OptimisticProviderProps) {
  const [isPending, startTransition] = useTransition();

  // Optimistic states
  const [optimisticLayers, updateOptimisticLayers] = useOptimistic(
    initialLayers,
    layersReducer
  );

  const [optimisticAreas, updateOptimisticAreas] = useOptimistic(
    initialAreas,
    areasReducer
  );

  const [optimisticUndoRedo, updateOptimisticUndoRedo] = useOptimistic(
    initialUndoRedo,
    undoRedoReducer
  );

  // Action creators
  const updateLayers = useCallback(
    (action: LayerAction) => {
      updateOptimisticLayers(action);
    },
    [updateOptimisticLayers]
  );

  const updateAreas = useCallback(
    (action: AreaAction) => {
      updateOptimisticAreas(action);
    },
    [updateOptimisticAreas]
  );

  const updateUndoRedo = useCallback(
    (action: UndoRedoAction) => {
      updateOptimisticUndoRedo(action);
    },
    [updateOptimisticUndoRedo]
  );

  // Wrapper for server actions with optimistic updates
  const withOptimistic = useCallback(
    <T,>(
      optimisticUpdate: () => void,
      serverAction: () => Promise<T>
    ): Promise<T> => new Promise((resolve, reject) => {
        startTransition(async () => {
          optimisticUpdate();
          try {
            const result = await serverAction();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      }),
    []
  );

  const value: OptimisticContextValue = {
    optimisticLayers,
    optimisticAreas,
    optimisticUndoRedo,
    isPending,
    updateLayers,
    updateAreas,
    updateUndoRedo,
    withOptimistic,
  };

  return (
    <OptimisticContext.Provider value={value}>
      {children}
    </OptimisticContext.Provider>
  );
}

export function useOptimisticContext() {
  const context = useContext(OptimisticContext);
  if (!context) {
    throw new Error(
      "useOptimisticContext must be used within OptimisticProvider"
    );
  }
  return context;
}

// Convenience hooks for specific parts of state
export function useOptimisticLayers() {
  const { optimisticLayers, updateLayers, isPending } = useOptimisticContext();
  return { layers: optimisticLayers, updateLayers, isPending };
}

export function useOptimisticAreas() {
  const { optimisticAreas, updateAreas, isPending } = useOptimisticContext();
  return { areas: optimisticAreas, updateAreas, isPending };
}

export function useOptimisticUndoRedo() {
  const { optimisticUndoRedo, updateUndoRedo, isPending } =
    useOptimisticContext();
  return { undoRedo: optimisticUndoRedo, updateUndoRedo, isPending };
}
