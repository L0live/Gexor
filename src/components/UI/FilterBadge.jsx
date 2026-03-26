import React from 'react';
import { X, MoreVertical } from 'lucide-react';

const FilterBadge = ({ filter, onToggleOperator, onRemove, onShowHierarchy }) => {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all"
      style={{
        backgroundColor: `${filter.color}15`,
        borderColor: `${filter.color}40`,
        color: filter.color,
      }}
    >
      {/* Operator toggle (clickable) */}
      {onToggleOperator && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleOperator(filter.id); }}
          className="uppercase text-[9px] font-black opacity-60 hover:opacity-100 px-1 rounded transition-opacity"
          title="Cycle: AND → OR → NOT"
        >
          {filter.operator}
        </button>
      )}

      {/* Label */}
      <span className="truncate max-w-[150px]">{filter.label}</span>

      {/* Hierarchy button for TYPE filters */}
      {onShowHierarchy && (
        <button
          onClick={(e) => { e.stopPropagation(); onShowHierarchy(); }}
          className="p-0.5 rounded-full hover:bg-white/20 transition-colors opacity-60 hover:opacity-100"
          title="Naviguer dans la taxonomie P279"
        >
          <MoreVertical className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Remove */}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(filter.id); }}
          className="p-0.5 rounded-full hover:bg-white/20 transition-colors"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
};

export default FilterBadge;
