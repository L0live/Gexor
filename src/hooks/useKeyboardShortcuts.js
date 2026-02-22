import { useEffect } from 'react';

/**
 * Hook pour gérer les raccourcis clavier globaux
 */
const useKeyboardShortcuts = ({ selectedNode, toggleNodePin, undo, redo, canUndo, canRedo }) => {
  useEffect(() => {
    const handleKeyPress = (e) => {
      // P pour pinner/unpinner le node sélectionné
      if (e.key === 'p' || e.key === 'P') {
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
