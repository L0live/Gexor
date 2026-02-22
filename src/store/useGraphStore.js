/**
 * useGraphStore — Zustand store composed from domain slices
 * 
 * Slices:
 *   dataSlice    — Raw data loading, available REECs & relations
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

const useGraphStore = create((...a) => ({
  ...createDataSlice(...a),
  ...createGraphSlice(...a),
  ...createUiSlice(...a),
  ...createHistorySlice(...a),
  ...createPinSlice(...a),
}));

export default useGraphStore;
