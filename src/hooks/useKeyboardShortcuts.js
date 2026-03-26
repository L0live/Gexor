import { useEffect } from 'react';
import useGraphStore from '../store/useGraphStore';

/**
 * Hook pour gérer les raccourcis clavier globaux
 */
const useKeyboardShortcuts = ({ selectedNode, toggleNodePin, undo, redo, canUndo, canRedo }) => {
  useEffect(() => {
    const handleKeyPress = (e) => {
      // ⌘K / Ctrl+K — Toggle SearchModal
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const { searchModalOpen, openSearchModal, closeSearchModal } = useGraphStore.getState();
        if (searchModalOpen) closeSearchModal();
        else openSearchModal();
        return;
      }

      // Escape — Close SearchModal if open
      if (e.key === 'Escape') {
        const { searchModalOpen, closeSearchModal } = useGraphStore.getState();
        if (searchModalOpen) {
          e.preventDefault();
          closeSearchModal();
          return;
        }
      }

      // Ctrl+Backspace — Remove last filter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
        const { searchModalOpen, searchFilters, removeFilter } = useGraphStore.getState();
        if (searchModalOpen && searchFilters.length > 0) {
          e.preventDefault();
          removeFilter(searchFilters[searchFilters.length - 1].id);
          return;
        }
      }

      // P pour pinner/unpinner le node sélectionné
      if (e.key === 'p' || e.key === 'P') {
        // Don't trigger when typing in search modal
        const { searchModalOpen } = useGraphStore.getState();
        if (searchModalOpen) return;
        if (selectedNode) {
          e.preventDefault();
          toggleNodePin(selectedNode.id);
        }
      }
      
      // Ctrl+Z pour undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
      }
      
      // Ctrl+Y ou Ctrl+Shift+Z pour redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedNode, toggleNodePin, undo, redo, canUndo, canRedo]);
};

export default useKeyboardShortcuts;
