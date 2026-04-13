import React from 'react';
import {
  Info, Users, Globe, Calendar, MapPin, Layers, Network, Star
} from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { getTabsForMode } from '../../plugins/pluginRegistry';

const ICON_MAP = {
  Info, Users, Globe, Calendar, MapPin, Layers, Network, Star,
};

/**
 * BasicsPluginsBar — barre d'icônes en bas de l'InfoPanel.
 * Chaque icône correspond à un onglet du RightPanel.
 * Click → openRightPanel({ tab: tabId })
 */
const BasicsPluginsBar = ({ mode }) => {
  const openRightPanel = useGraphStore(s => s.openRightPanel);
  const rightPanelActiveTab = useGraphStore(s => s.rightPanelActiveTab);

  const tabs = getTabsForMode(mode || 'node');
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center justify-around border-t border-slate-700/20 pt-2 pb-1.5 px-3 gap-1">
      {tabs.map(tab => {
        const Icon = tab.icon ? (ICON_MAP[tab.icon] || null) : null;
        const isActive = rightPanelActiveTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => openRightPanel({ tab: tab.id })}
            className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all flex-1 ${
              isActive
                ? 'bg-blue-500/20 text-blue-300'
                : 'text-slate-600 hover:text-slate-300 hover:bg-slate-700/30'
            }`}
            title={tab.label}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            <span className="text-[8px] font-semibold truncate max-w-[50px]">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default BasicsPluginsBar;
