import React from 'react';
import { RefreshCw, Loader } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { defaultNodeSettings } from '../../constants/graphConstants';

/**
 * ExplorationBar — contrôle de direction d'exploration par nœud.
 * [Off] [Propriétés] [Associés]   [Load ↻]
 *
 * "Propriétés" = outgoing (sortants)
 * "Associés"   = incoming (entrants)
 */
const ExplorationBar = ({ nodeUri }) => {
  const nodeSettings = useGraphStore(s => s.nodeSettings);
  const expandedUris = useGraphStore(s => s.expandedUris);
  const incomingExpandedUris = useGraphStore(s => s.incomingExpandedUris);
  const loadingUris = useGraphStore(s => s.loadingUris);
  const setNodeDirection = useGraphStore(s => s.setNodeDirection);
  const fetchAndExpandNode = useGraphStore(s => s.fetchAndExpandNode);

  const settings = nodeSettings[nodeUri] ?? defaultNodeSettings();

  const direction = settings.explorationDirection ?? 'incoming';
  const dirParts = direction === 'both'
    ? new Set(['incoming', 'outgoing'])
    : new Set((direction || '').split(',').filter(Boolean));

  const isOff = dirParts.size === 0;
  const propriétésActive = dirParts.has('outgoing');
  const associésActive = dirParts.has('incoming');

  const outgoingLoaded = expandedUris.has(nodeUri);
  const incomingLoaded = incomingExpandedUris.has(nodeUri);
  const loading = loadingUris.has(nodeUri);

  const handleToggle = (toggle) => {
    if (toggle === 'off') {
      setNodeDirection(nodeUri, '');
      return;
    }
    const next = new Set(dirParts);
    if (next.has(toggle)) {
      next.delete(toggle);
    } else {
      next.add(toggle);
    }
    const flags = ['incoming', 'outgoing', 'shared'].filter(d => next.has(d));
    setNodeDirection(nodeUri, flags.join(','));
  };

  const handleLoad = () => {
    if (!isOff) fetchAndExpandNode(nodeUri, { force: true });
  };

  const btnBase = 'relative px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all border';
  const btnInactive = 'bg-slate-800/40 text-slate-500 border-slate-700/40 hover:bg-slate-700/50 hover:text-slate-300';
  const btnActive = 'bg-teal-500/15 text-teal-300 border-teal-500/40';

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-700/20">
      <button
        onClick={() => handleToggle('off')}
        className={`${btnBase} ${isOff ? btnActive : btnInactive}`}
      >
        Off
      </button>
      <button
        onClick={() => handleToggle('outgoing')}
        className={`${btnBase} ${propriétésActive ? btnActive : btnInactive}`}
      >
        Propriétés
        {outgoingLoaded && (
          <span className="absolute -bottom-px left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-teal-400" />
        )}
      </button>
      <button
        onClick={() => handleToggle('incoming')}
        className={`${btnBase} ${associésActive ? btnActive : btnInactive}`}
      >
        Associés
        {incomingLoaded && (
          <span className="absolute -bottom-px left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-teal-400" />
        )}
      </button>
      <div className="flex-1" />
      <button
        onClick={handleLoad}
        disabled={loading || isOff}
        className={`p-1.5 rounded-lg transition-all ${
          loading || isOff
            ? 'text-slate-700 cursor-not-allowed'
            : 'text-slate-400 hover:text-teal-300 hover:bg-teal-500/10'
        }`}
        title="Charger / Recharger"
      >
        {loading
          ? <Loader className="w-3.5 h-3.5 animate-spin" />
          : <RefreshCw className="w-3.5 h-3.5" />
        }
      </button>
    </div>
  );
};

export default ExplorationBar;
