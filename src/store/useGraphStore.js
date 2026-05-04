/**
 * useGraphStore — Zustand store composed from domain slices
 * 
 * Slices:
 *   dataSlice    — Raw data loading, available nodes & relations
 *   graphSlice   — Processed nodes/edges, visibility, filtering
 *   uiSlice      — Selection, layout, camera, simulation, reset
 *   historySlice — Undo/redo snapshots
 *   pinSlice     — Pinning system, groups, drag
 */
import { create } from 'zustand';
import { createDataSlice } from './slices/dataSlice';
import { createGraphSlice } from './slices/graphSlice';
import { createUiSlice } from './slices/uiSlice';
import { createHistorySlice } from './slices/historySlice';
import { createPinSlice } from './slices/pinSlice';
import { createSearchSlice } from './slices/searchSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { initPrefetchQueue } from '../services/prefetchQueue';

const useGraphStore = create((...a) => ({
  ...createDataSlice(...a),
  ...createGraphSlice(...a),
  ...createUiSlice(...a),
  ...createHistorySlice(...a),
  ...createPinSlice(...a),
  ...createSearchSlice(...a),
  ...createSettingsSlice(...a),
}));

// Wire the prefetch queue to the store so it can read/write/subscribe to state
initPrefetchQueue(useGraphStore.getState, useGraphStore.setState, useGraphStore);

export default useGraphStore;
