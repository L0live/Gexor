/**
 * settingsSlice — runtime-tunable visual/physics params + theme selection
 *
 * Source de vérité unique pour les constantes que l'utilisateur peut ajuster
 * à chaud via SettingsPanel. Les defaults reflètent graphConstants.js.
 */
import {
  NODE_RADIUS,
  ARROW_SIZE,
  SHARED_NODE_OPACITY,
  SHARED_NODE_SCALE,
  SHARED_EDGE_OPACITY,
  FORCE_LAYOUT_DEFAULTS,
  AGGREGATE_NODE_COLOR,
  AGGREGATE_NODE_COLOR_LOADING,
  AGGREGATE_NODE_MIN_SCALE,
  AGGREGATE_NODE_MAX_SCALE,
  SELECTION_OUTLINE_COLOR,
  ADDED_PULSE_COLOR,
  ADDED_PULSE_DURATION,
} from '../../constants/graphConstants';
import { DEFAULT_THEME } from '../../constants/themes';

export const DEFAULT_FORCE_PARAMS = {
  nodeStrength: FORCE_LAYOUT_DEFAULTS.nodeStrength,
  edgeStrength: FORCE_LAYOUT_DEFAULTS.edgeStrength,
  linkDistance: FORCE_LAYOUT_DEFAULTS.linkDistance,
  damping: FORCE_LAYOUT_DEFAULTS.damping,
  maxSpeed: FORCE_LAYOUT_DEFAULTS.maxSpeed,
  gravity: FORCE_LAYOUT_DEFAULTS.gravity,
  coulombDisScale: FORCE_LAYOUT_DEFAULTS.coulombDisScale,
};

export const DEFAULT_NODE_PARAMS = {
  radius: NODE_RADIUS,
  sharedOpacity: SHARED_NODE_OPACITY,
  sharedScale: SHARED_NODE_SCALE,
};

export const DEFAULT_AGGREGATE_PARAMS = {
  color: AGGREGATE_NODE_COLOR,
  colorLoading: AGGREGATE_NODE_COLOR_LOADING,
  minScale: AGGREGATE_NODE_MIN_SCALE,
  maxScale: AGGREGATE_NODE_MAX_SCALE,
  threshold: 5,
};

export const DEFAULT_EDGE_PARAMS = {
  arrowSize: ARROW_SIZE,
  sharedEdgeOpacity: SHARED_EDGE_OPACITY,
  showEdges: true,
  showArrows: true,
};

export const DEFAULT_HIGHLIGHT_PARAMS = {
  selectionColor: SELECTION_OUTLINE_COLOR,
  addedPulseColor: ADDED_PULSE_COLOR,
  addedPulseDuration: ADDED_PULSE_DURATION,
};

export const createSettingsSlice = (set, get) => ({
  theme: DEFAULT_THEME,
  forceParams: { ...DEFAULT_FORCE_PARAMS },
  nodeParams: { ...DEFAULT_NODE_PARAMS },
  aggregateParams: { ...DEFAULT_AGGREGATE_PARAMS },
  edgeParams: { ...DEFAULT_EDGE_PARAMS },
  highlightParams: { ...DEFAULT_HIGHLIGHT_PARAMS },

  setTheme: (theme) => set({ theme }),

  setForceParam: (key, value) =>
    set((state) => ({ forceParams: { ...state.forceParams, [key]: value } })),

  setNodeParam: (key, value) =>
    set((state) => ({ nodeParams: { ...state.nodeParams, [key]: value } })),

  setAggregateParam: (key, value) =>
    set((state) => ({ aggregateParams: { ...state.aggregateParams, [key]: value } })),

  setEdgeParam: (key, value) =>
    set((state) => ({ edgeParams: { ...state.edgeParams, [key]: value } })),

  setHighlightParam: (key, value) =>
    set((state) => ({ highlightParams: { ...state.highlightParams, [key]: value } })),

  resetSettingsParams: () =>
    set({
      theme: DEFAULT_THEME,
      forceParams: { ...DEFAULT_FORCE_PARAMS },
      nodeParams: { ...DEFAULT_NODE_PARAMS },
      aggregateParams: { ...DEFAULT_AGGREGATE_PARAMS },
      edgeParams: { ...DEFAULT_EDGE_PARAMS },
      highlightParams: { ...DEFAULT_HIGHLIGHT_PARAMS },
    }),
});
