import { useEffect, useReducer, useRef } from "react";

interface LayerFormState {
  newLayerName: string;
  isCreating: boolean;
  editingLayerId: number | null;
  editingLayerName: string;
  showDeleteDialog: boolean;
  layerToDelete: number | null;
}

type LayerFormAction =
  | { type: "SET_NEW_NAME"; name: string }
  | { type: "START_CREATING" }
  | { type: "FINISH_CREATING" }
  | { type: "START_EDIT"; layerId: number; name: string }
  | { type: "SET_EDIT_NAME"; name: string }
  | { type: "CANCEL_EDIT" }
  | { type: "OPEN_DELETE"; layerId: number }
  | { type: "CLOSE_DELETE" };

const initialState: LayerFormState = {
  newLayerName: "",
  isCreating: false,
  editingLayerId: null,
  editingLayerName: "",
  showDeleteDialog: false,
  layerToDelete: null,
};

function layerFormReducer(
  state: LayerFormState,
  action: LayerFormAction
): LayerFormState {
  switch (action.type) {
    case "SET_NEW_NAME": {
      return { ...state, newLayerName: action.name };
    }
    case "START_CREATING": {
      return { ...state, isCreating: true };
    }
    case "FINISH_CREATING": {
      return { ...state, isCreating: false, newLayerName: "" };
    }
    case "START_EDIT": {
      return {
        ...state,
        editingLayerId: action.layerId,
        editingLayerName: action.name,
      };
    }
    case "SET_EDIT_NAME": {
      return { ...state, editingLayerName: action.name };
    }
    case "CANCEL_EDIT": {
      return { ...state, editingLayerId: null, editingLayerName: "" };
    }
    case "OPEN_DELETE": {
      return {
        ...state,
        showDeleteDialog: true,
        layerToDelete: action.layerId,
      };
    }
    case "CLOSE_DELETE": {
      return { ...state, showDeleteDialog: false, layerToDelete: null };
    }
    default: {
      return state;
    }
  }
}

export function useLayerFormState() {
  const [state, dispatch] = useReducer(layerFormReducer, initialState);
  const editLayerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.editingLayerId !== null) {
      editLayerInputRef.current?.focus();
    }
  }, [state.editingLayerId]);

  return { state, dispatch, editLayerInputRef };
}
