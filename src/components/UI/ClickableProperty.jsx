import React from 'react';
import useGraphStore from '../../store/useGraphStore';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';

const ClickableProperty = ({ pid, label, children }) => {
  const openSearchModal = useGraphStore(s => s.openSearchModal);
  const addFilter = useGraphStore(s => s.addFilter);

  const handleLeftClick = (e) => {
    e.stopPropagation();
    openSearchModal([createFilter(FILTER_TYPES.PROPERTY, pid, label || pid)]);
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addFilter(createFilter(FILTER_TYPES.PROPERTY, pid, label || pid));
  };

  return (
    <span
      onClick={handleLeftClick}
      onContextMenu={handleRightClick}
      className="cursor-pointer hover:text-blue-300 transition-colors"
      title={`Gauche: rechercher ${pid} · Droit: ajouter filtre`}
    >
      {children || label || pid}
    </span>
  );
};

export default ClickableProperty;
