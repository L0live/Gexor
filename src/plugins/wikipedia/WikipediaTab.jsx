import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';

const WikipediaTab = () => {
  const selectedNode = useGraphStore(s => s.selectedNode);

  if (!selectedNode) return null;

  const rawId = selectedNode.id || '';
  const qid = rawId.startsWith('http') ? rawId.split('/').pop() : rawId;

  // Redirect from Wikidata QID to Wikipedia article (fr first, then en)
  const wikiUrl = `https://fr.m.wikipedia.org/wiki/Special:Redirect/wikidata/${qid}`;
  const wikidataUrl = `https://www.wikidata.org/wiki/${qid}`;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/20 shrink-0">
        <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span className="text-[10px] text-slate-500 truncate flex-1">{wikiUrl}</span>
        <a
          href={wikidataUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-slate-600 hover:text-blue-400 transition-colors"
          title="Ouvrir sur Wikidata"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Embedded Wikipedia */}
      <iframe
        src={wikiUrl}
        title={`Wikipedia — ${selectedNode.label}`}
        className="flex-1 w-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation"
        loading="lazy"
      />
    </div>
  );
};

export default React.memo(WikipediaTab);
