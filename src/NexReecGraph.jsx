import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { 
  Network, X, Info, Loader, Search, Plus, Trash2, 
  ChevronDown, ChevronUp, Play, Pause, Pin, Orbit, 
  Focus, ChevronLeft, ChevronRight, Settings, Eye, 
  EyeOff, ListChevronsDownUp, Download, Upload, Filter, 
  Layers, Calendar, ShieldCheck, Tag, RefreshCcw
} from 'lucide-react';

import useGraphStore from './store/useGraphStore';
import useNgraphLayout from './hooks/useNgraphLayout';
import Scene from './components/Graph/Scene';
import Minimap from './components/Graph/Minimap';
import FilterSection from './components/UI/FilterSection';
import RelationsSection from './components/UI/RelationsSection';
import CollapsibleSection from './components/UI/CollapsibleSection';

// ============================================================================
// COUCHE 4 : INTERACTION LAYER (UI & Controls)
// ============================================================================

const NexReecGraph = ({ initialData }) => {
  const {
    nodes,
    edges,
    filters,
    filterModes,
    opacityLevels,
    showRelations,
    selectedNode,
    selectedEdge,
    layoutRunning,
    layoutProgress,
    layoutReady,
    availableReecs,
    availableRelations,
    visibleReecIds,
    loadData,
    addReecToGraph,
    removeReecFromGraph,
    toggleFilter,
    setFilterMode,
    setOpacityLevel,
    toggleRelations,
    selectNode,
    selectEdge,
    clearSelection,
    setLayoutReady,
    setPositions,
    simulationPaused,
    setSimulationPaused,
    toggleNodePin,
    isPinned,
    unpinAllNodes,
    pinAllVisibleNodes,
    undo,
    redo,
    canUndo,
    canRedo,
    pinnedNodes,
    individualNodeOpacity,
    individualEdgeOpacity,
    setIndividualNodeOpacity,
    setIndividualEdgeOpacity,
    layoutMode,
    setLayoutMode,
    setAdvancedFilter,
    exportGraph,
    importGraph,
    allTags = [],
    resetAllSettings,
    resetFilters,
    wakeSimulation
  } = useGraphStore();
  
  const [initialized, setInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);
  const [activeTab, setActiveTab] = useState('settings'); // 'settings', 'node', 'edge'
  const [showDetailsSection, setShowDetailsSection] = useState(true);
  const [showFiltersSubSection, setShowFiltersSubSection] = useState({
    entity: false,
    event: false,
    context: false,
    relations: false,
    entityNodes: false,
    eventNodes: false,
    contextNodes: false,
    relationsList: false,
    pinnedNodesList: false,
    filters: true,
    data: false,
  });
  const [showPinnedNodesSection, setShowPinnedNodesSection] = useState(false);
  const [showConnectedReecsSection, setShowConnectedReecsSection] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const initialSimulationStarted = useRef(false);
  const { runSimulation, stopSimulation, layout, isInitialized } = useNgraphLayout();
  
  // Charger les données initiales
  useEffect(() => {
    if (initialData && !initialized) {
      loadData(initialData);
      setInitialized(true);
    }
  }, [initialData, initialized, loadData]);
  
  // Lancer la simulation automatiquement uniquement au premier chargement (une seule fois)
  useEffect(() => {
    if (initialized && isInitialized && !initialSimulationStarted.current && nodes.length > 0) {
      initialSimulationStarted.current = true;
      runSimulation(nodes.length * 35 > 1000 ? 1000 : nodes.length * 35);
    } else if (initialized && nodes.length === 0) {
      setLayoutReady(true);
    }
  }, [initialized, isInitialized, nodes.length, runSimulation, setLayoutReady]);
  
  // Calculer les REECs filtrés par recherche
  const filteredReecs = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return availableReecs
      .filter(reec => 
        !visibleReecIds.has(reec.reec_id) && (
          reec.label.toLowerCase().includes(query) ||
          reec.aliases?.some(alias => alias.toLowerCase().includes(query))
        )
      )
      .slice(0, 10); // Limiter à 10 résultats
  }, [searchQuery, availableReecs, visibleReecIds]);
  
  // Calculer les top REECs par nombre de connexions
  const topReecs = useMemo(() => {
    const connectionCounts = {};
    availableRelations.forEach(rel => {
      connectionCounts[rel.source_reec_id] = (connectionCounts[rel.source_reec_id] || 0) + 1;
      connectionCounts[rel.target_reec_id] = (connectionCounts[rel.target_reec_id] || 0) + 1;
    });
    
    return availableReecs
      .map(reec => ({
        ...reec,
        connectionCount: connectionCounts[reec.reec_id] || 0
      }))
      .filter(reec => !visibleReecIds.has(reec.reec_id))
      .sort((a, b) => b.connectionCount - a.connectionCount)
      .slice(0, 10);
  }, [availableReecs, availableRelations, visibleReecIds]);
  
  // Calculer les REECs connectés au nœud sélectionné
  const connectedReecs = useMemo(() => {
    if (!selectedNode) return [];
    
    const connectedIds = new Set();
    availableRelations.forEach(rel => {
      if (rel.source_reec_id === selectedNode.id) {
        connectedIds.add(rel.target_reec_id);
      }
      if (rel.target_reec_id === selectedNode.id) {
        connectedIds.add(rel.source_reec_id);
      }
    });
    
    return availableReecs
      .filter(reec => connectedIds.has(reec.reec_id))
      .map(reec => ({
        ...reec,
        isVisible: visibleReecIds.has(reec.reec_id)
      }));
  }, [selectedNode, availableReecs, availableRelations, visibleReecIds]);
  
  // Calculer les nodes pinnés avec leurs informations
  const pinnedNodesInfo = useMemo(() => {
    return nodes
      .filter(node => pinnedNodes.has(node.id))
      .map(node => ({
        id: node.id,
        label: node.label,
        type: node.type
      }));
  }, [nodes, pinnedNodes]);
  
  const handleAddReec = (reecId) => {
    addReecToGraph(reecId);
    // La simulation continue s'occupe automatiquement du nouveau nœud
  };
  
  const handleRemoveReec = (reecId) => {
    removeReecFromGraph(reecId);
    // La simulation continue s'occupe automatiquement de la suppression
  };
  
  // Gérer le changement automatique d'onglet lors de la sélection
  useEffect(() => {
    if (selectedNode) {
      setActiveTab('node');
    } else if (selectedEdge) {
      setActiveTab('edge');
    } else {
      setActiveTab('settings');
    }
  }, [selectedNode, selectedEdge]);
  
  // Raccourcis clavier
  useEffect(() => {
    const handleKeyPress = (e) => {
      // P pour pinner/unpinner le node sélectionné
      if (e.key === 'p' || e.key === 'P') {
        if (selectedNode && layout) {
          e.preventDefault();
          toggleNodePin(selectedNode.id, layout);
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
  }, [selectedNode, layout, toggleNodePin, undo, redo, canUndo, canRedo]);
  
  const stats = {
    total: nodes.length,
    entities: nodes.filter(n => n.type === 'Entity').length,
    events: nodes.filter(n => n.type === 'Event').length,
    contexts: nodes.filter(n => n.type === 'Context').length,
    visible: nodes.filter(n => filters[n.type]).length
  };
  
  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col">
      {/* Layout principal : Canvas + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas 3D */}
        <div className="flex-1 relative">
          {(nodes.length === 0 || !layoutReady) ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="text-center">
                <Loader className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
                <p className="text-slate-300 font-medium">
                  {nodes.length === 0 ? 'Chargement des données...' : 'Calcul du layout...'}
                </p>
                {layoutProgress > 0 && (
                  <p className="text-slate-400 text-sm mt-2">{Math.round(layoutProgress)}%</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Grille 3D Statique (Calque de fond) */}
              <div 
                className="absolute inset-0 pointer-events-none overflow-hidden" 
                style={{ perspective: '1000px', background: !selectedNode ? '#0b101eff' : 
                    selectedNode.type === 'Entity' ? '#08101faf' : // Teinte Navy très sombre
                    selectedNode.type === 'Event' ? '#0a1711af' :  // Teinte Forêt très sombre (Green)
                    selectedNode.type === 'Context' ? '#140b21af' : // Teinte Prune très sombre (Purple)
                    '#0f172a' }}
              >
                <div 
                  className="absolute left-1/2 -translate-x-1/2 bottom-[-10%] w-[250vw] h-[300vh]" 
                  style={{ 
                    backgroundImage: `
                      linear-gradient(to right, rgba(150, 150, 150, 0.1) 0px, rgba(100, 100, 100, 0.05) 2px, transparent 5px),
                      linear-gradient(to bottom, rgba(150, 150, 150, 0.1) 0px, rgba(100, 100, 100, 0.05) 2px, transparent 5px)
                    `,
                    backgroundSize: '60px 60px',
                    transform: 'rotateX(75deg)',
                    transformOrigin: 'bottom center',
                    transformStyle: 'preserve-3d', // <--- IMPORTANT : Autorise les enfants 3D
                    backfaceVisibility: 'hidden',
                    WebkitFontSmoothing: 'antialiased',
                    boxShadow: 'inset 0 100 100px rgba(0, 0, 0, 0.5)'
                  }} 
                >
                  {/* Image à l'horizon */}
                  <div 
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '50%',
                      width: '100%',
                      height: '180vh',
                      transform: 'translate(-50%, -100%) rotateX(-75deg)', // <--- Redresse l'image face caméra
                      transformOrigin: 'bottom center',
                      backgroundImage: 'url("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/World_Map_1689.JPG/500px-World_Map_1689.JPG")', // <--- VOTRE IMAGE ICI
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'bottom center',
                      filter: 'brightness(0.7) contrast(1.2) saturate(1.3)',
                      maskImage: 'linear-gradient(to top, black 0px, transparent 100%)',
                      // boxShadow: 'inset 0 0 200px 150px rgba(0, 0, 0, 0.5)'
                    }}
                  />
                </div>
              </div>

              <Canvas
                camera={{ position: [0, 150, 100], fov: 50 }}
                style={{ background: 'transparent' }}
                gl={{ antialias: true, alpha: true }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    clearSelection();
                  }
                }}
              >
                <Scene />
              </Canvas>
            </>
          )}

          {/* Minimap */}
          {layoutReady && <Minimap />}

          {/* Barre de recherche flottante */}
          {layoutReady && (
            <div className="absolute bottom-1 left-1/2 w-[450px] z-10 transition-opacity duration-300 opacity-40 hover:opacity-100 focus-within:opacity-100" style={{ transform: 'translateX(-50%)' }}>
              <div className="bg-transparent backdrop-blur-sm rounded-2xl shadow-2xl border border-transparent p-1">
                {/* Résultats de recherche */}
                {searchFocused && searchQuery && filteredReecs.length > 0 && (
                  <div className="mb-3 max-h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
                    {filteredReecs.map(reec => (
                      <div key={reec.reec_id} className="flex items-center gap-2 p-2 bg-slate-700/70 rounded-lg hover:bg-slate-700 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-200 truncate">{reec.label}</div>
                          <div className="text-xs text-slate-400">{reec.type} • {reec.subtype}</div>
                        </div>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleAddReec(reec.reec_id);
                          }}
                          className="p-1 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex-shrink-0"
                          title="Ajouter au graphe"
                        >
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {searchFocused && searchQuery && filteredReecs.length === 0 && (
                  <div className="text-sm text-slate-400 text-center py-3 mb-3">
                    Aucun résultat
                  </div>
                )}
                
                {/* Top REECs (affichés automatiquement au focus) */}
                {searchFocused && !searchQuery && (
                  <div className="mb-3 max-h-72 overflow-y-auto space-y-2">
                    {topReecs.slice(0, 3).map(reec => (
                      <div key={reec.reec_id} className="flex items-center gap-2 p-2 bg-slate-700/70 rounded-lg hover:bg-slate-700 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-200 truncate">{reec.label}</div>
                          <div className="text-xs text-slate-400">
                            {reec.type} • {reec.connectionCount} relation{reec.connectionCount > 1 ? 's' : ''}
                          </div>
                        </div>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleAddReec(reec.reec_id);
                          }}
                          className="p-1 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex-shrink-0"
                          title="Ajouter au graphe"
                        >
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Barre de recherche */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    placeholder="Rechercher un REEC par nom ou alias..."
                    className="w-full pl-10 pr-10 py-2 bg-slate-700 border border-transparent rounded-2xl text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-600 rounded"
                    >
                      <X className="w-3 h-3 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bouton Layout - Carré et rétractable */}
          <div className="absolute bottom-0 left-0 z-20 p-1 bg-slate-700/20 rounded-tr-xl flex flex-col items-center">
            {/* Menu de Layout rétractable (s'ouvre vers le haut) */}
            {showLayoutMenu && (
              <div className="relative bottom-0 right-0 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom duration-200">
                {[
                  { id: 'force', label: 'Physique (Force)', icon: <Orbit className="w-5 h-5" /> },
                  { id: 'hierarchical', label: 'Hiérarchique', icon: <ListChevronsDownUp className="w-5 h-5" /> },
                  { id: 'circular', label: 'Circulaire', icon: <Orbit className="w-5 h-5 rotate-45" /> },
                  { id: 'cluster', label: 'Clusters', icon: <Network className="w-5 h-5" /> },
                  { id: 'temporal', label: 'Temporel', icon: <Calendar className="w-5 h-5" /> }
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      setLayoutMode(mode.id);
                      setShowLayoutMenu(false);
                      if (mode.id === 'force') {
                        setSimulationPaused(false);
                        wakeSimulation();
                      }
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                      layoutMode === mode.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                    title={mode.label}
                  >
                    <div className={layoutMode === mode.id ? 'text-white' : 'text-slate-500'}>
                      {mode.icon}
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            <button
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className={`p-3 rounded-xl transition-colors ${
                showLayoutMenu 
                  ? 'bg-blue-600/20 text-blue-400 hover:text-blue-300' 
                  : 'hover:bg-slate-600/20 text-slate-400 hover:text-slate-300'
              }`}
              title={`Changer le mode de layout\nMode actuel: ${layoutMode.charAt(0).toUpperCase() + layoutMode.slice(1)}`}
            >
              <Layers className="w-5.5 h-5.5" />
            </button>
          </div>

          {/* Actions rapides sur le node sélectionné */}
          {selectedNode && (
            <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const { triggerCenterOnNode } = useGraphStore.getState();
                    triggerCenterOnNode(selectedNode.id);
                  }}
                  className="p-3 rounded-xl transition-colors hover:bg-blue-600/20 text-blue-400 hover:text-blue-300"
                  title="Centrer la vue sur ce node"
                >
                  <Focus className="w-5.5 h-5.5" />
                </button>
                <button
                  onClick={() => toggleNodePin(selectedNode.id, layout)}
                  className={`p-3 rounded-xl transition-colors ${
                    isPinned(selectedNode.id)
                      ? 'bg-yellow-600/20 text-yellow-400 hover:text-yellow-300'
                      : 'hover:bg-slate-600/20 text-slate-400 hover:text-slate-300'
                  }`}
                  title={isPinned(selectedNode.id) ? 'Dépingler' : 'Épingler'}
                >
                  <Pin className="w-5.5 h-5.5" />
                </button>
                {connectedReecs.length > 0 && (
                  <button
                    onClick={() => {
                      // Obtenir la position du node sélectionné
                      const currentPositions = useGraphStore.getState().positions;
                      const selectedNodePos = currentPositions[selectedNode.id];
                      if (!selectedNodePos) return;
                      
                      // Récupérer les REECs à ajouter
                      const reecsToAdd = connectedReecs.filter(r => !r.isVisible);
                      
                      // Initialiser les positions des nouveaux nodes sur le node sélectionné
                      const newPositions = { ...currentPositions };
                      reecsToAdd.forEach(reec => {
                        newPositions[reec.reec_id] = {
                          x: selectedNodePos.x,
                          y: selectedNodePos.y,
                          z: selectedNodePos.z
                        };
                      });!
                      
                      // Mettre à jour les positions avant d'ajouter les nodes
                      setPositions(newPositions);
                      
                      // Ajouter les nodes
                      reecsToAdd.forEach(reec => handleAddReec(reec.reec_id));
                    }}
                    disabled={connectedReecs.filter(r => !r.isVisible).length === 0}
                    className="p-3 rounded-xl transition-colors bg-green-600/20 text-green-400 hover:text-green-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Ajouter tous les REECs connectés"
                  >
                    <Orbit className="w-5.5 h-5.5" />
                  </button>
                )}
              </div>
              
              <div className="flex flex-col gap-3">
                {connectedReecs.length > 0 && (
                  <button
                    onClick={() => {
                      connectedReecs.filter(r => r.isVisible && !isPinned(r.reec_id)).forEach(reec => handleRemoveReec(reec.reec_id));
                    }}
                    disabled={connectedReecs.filter(r => r.isVisible && !isPinned(r.reec_id)).length === 0}
                    className="p-3 rounded-xl transition-colors bg-red-600/20 text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Retirer tous les REECs connectés (sauf pinnés)"
                  >
                    <Orbit className="w-5.5 h-5.5" />
                  </button>
                )}
                <button
                  onClick={() => handleRemoveReec(selectedNode.id)}
                  className="p-3 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded-xl transition-colors"
                  title="Supprimer du graphe"
                >
                  <Trash2 className="w-5.5 h-5.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Panel d'information avec onglets */}
        <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col">
          {/* Barre d'onglets */}
          <div className="flex border-b border-slate-700 bg-slate-800">
            {selectedNode && (
              <button
                onClick={() => setActiveTab('node')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'node'
                    ? 'bg-slate-700 text-white border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Info className="w-4 h-4" />
                  <span>Node</span>
                </div>
              </button>
            )}
            {selectedEdge && (
              <button
                onClick={() => setActiveTab('edge')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'edge'
                    ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Network className="w-4 h-4" />
                  <span>Relation</span>
                </div>
              </button>
            )}
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-14 px-4 py-3 text-sm font-medium transition-colors border-l border-slate-700 ml-auto ${
                activeTab === 'settings'
                  ? 'bg-slate-700 text-white border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
              title="Paramètres"
            >
              <div className="flex items-center justify-center">
                <Settings className="w-5 h-5" />
              </div>
            </button>
          </div>

          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* Onglet Node */}
            {activeTab === 'node' && selectedNode && (
            <div className="flex flex-col">
              <div className={`sticky top-0 z-10 p-6 bg-slate-800 ${
                selectedNode.type === 'Entity' ? 'bg-gradient-to-br from-blue-600/20 to-blue-500/10 border-l-4 border-blue-500' :
                selectedNode.type === 'Event' ? 'bg-gradient-to-br from-green-600/20 to-green-500/10 border-l-4 border-green-500' :
                'bg-gradient-to-br from-purple-600/20 to-purple-500/10 border-l-4 border-purple-500'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    {selectedNode.type}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearSelection}
                      className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  {selectedNode.label}
                </h2>
                <div className="text-slate-400 text-sm">
                  {selectedNode.subtype}
                  {selectedNode.category && ` • ${selectedNode.category}`}
                </div>
              </div>

              <div className="p-6 space-y-4">

                {selectedNode.summary && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Résumé
                      </h3>
                    </div>
                    <p className="text-slate-400 leading-relaxed text-sm">
                      {selectedNode.summary}
                    </p>
                  </div>
                )}

                {/* Confidence */}
                <div className="flex justify-between text-sm py-1 border-slate-700">
                  <span className="text-slate-400">Confidence</span>
                  <span className="font-medium text-slate-200">
                    {Math.round((selectedNode.confidence || 0) * 100)}%
                  </span>
                </div>

                {/* Slider Opacité */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300">Opacité</span>
                    <span className="text-xs font-mono text-slate-400">
                      {Math.round((individualNodeOpacity[selectedNode.id] ?? opacityLevels[selectedNode.type]) * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <EyeOff 
                      className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                      onClick={() => setIndividualNodeOpacity(selectedNode.id, 0)}
                      title="Opacité minimale (0%)"
                    />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={individualNodeOpacity[selectedNode.id] ?? opacityLevels[selectedNode.type]}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        setIndividualNodeOpacity(selectedNode.id, value);
                      }}
                      className={`flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer ${
                        selectedNode.type === 'Entity' ? '[&::-webkit-slider-thumb]:bg-blue-500 [&::-moz-range-thumb]:bg-blue-500' :
                        selectedNode.type === 'Event' ? '[&::-webkit-slider-thumb]:bg-green-500 [&::-moz-range-thumb]:bg-green-500' :
                        '[&::-webkit-slider-thumb]:bg-purple-500 [&::-moz-range-thumb]:bg-purple-500'
                      }`}
                    />
                    <Eye 
                      className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                      onClick={() => setIndividualNodeOpacity(selectedNode.id, 1)}
                      title="Opacité maximale (100%)"
                    />
                  </div>
                </div>

                {/* Section Détails - Rétractable */}
                <div className="border-t border-slate-700 pt-4">
                  <button
                    onClick={() => {
                      if (!showDetailsSection && showConnectedReecsSection)
                        setShowConnectedReecsSection(!showConnectedReecsSection);
                      setShowDetailsSection(!showDetailsSection);}}
                    className="w-full flex items-center justify-between mb-3 hover:bg-slate-700/30 p-2 rounded transition-colors"
                  >
                    <Info className="w-4 h-4 text-slate-400" />
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                      Détails
                    </h3>
                    {showDetailsSection ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  
                  {showDetailsSection && (
                    <div className="space-y-4">
                      {selectedNode.summaryDetailed && selectedNode.summaryDetailed !== selectedNode.summary && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                            Description
                          </h4>
                          <p className="text-slate-400 leading-relaxed text-sm">
                            {selectedNode.summaryDetailed}
                          </p>
                        </div>
                      )}

                      {selectedNode.temporal?.start && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                            Période temporelle
                          </h4>
                          <div className="text-slate-400 text-sm">
                            {selectedNode.temporal.start}
                            {selectedNode.temporal.end && ` → ${selectedNode.temporal.end}`}
                          </div>
                        </div>
                      )}

                      {selectedNode.locations?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                            Localisations
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedNode.locations.map((loc, i) => (
                              <span key={i} className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                                {loc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedNode.tags?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                            Tags
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedNode.tags.map((tag, i) => (
                              <span key={i} className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs border border-blue-500/30">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Section REECs connectés - Rétractable */}
                {connectedReecs.length > 0 && (
                    <div className="mt-4 border-t border-slate-700 pt-4">
                      <button
                        onClick={() => {
                          if (!showConnectedReecsSection && showDetailsSection)
                            setShowDetailsSection(!showDetailsSection);
                          setShowConnectedReecsSection(!showConnectedReecsSection);}}
                        className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors"
                      >
                        <Network className="w-4 h-4 text-slate-400" />
                        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                          REECs connectés ({connectedReecs.length})
                        </h4>
                        {showConnectedReecsSection ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      
                      {showConnectedReecsSection && (
                        <>
                          <div className="overflow-y-auto space-y-2 mt-3">
                            {connectedReecs.map(reec => (
                              <div key={reec.reec_id} className="flex items-start gap-2 p-2 bg-slate-700/50 rounded">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-slate-200 truncate">{reec.label}</div>
                                  <div className="text-xs text-slate-400">{reec.type}</div>
                                </div>
                                {reec.isVisible ? (
                                  <button
                                    onClick={() => handleRemoveReec(reec.reec_id)}
                                    className="p-1 bg-red-600 hover:bg-red-700 rounded transition-colors flex-shrink-0"
                                    title="Retirer du graphe"
                                  >
                                    <X className="w-4 h-4 text-white" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleAddReec(reec.reec_id)}
                                    className="p-1 bg-green-600 hover:bg-green-700 rounded transition-colors flex-shrink-0"
                                    title="Ajouter au graphe"
                                  >
                                    <Plus className="w-4 h-4 text-white" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Onglet Edge */}
            {activeTab === 'edge' && selectedEdge && (
            <div>
              <div className="p-6 bg-gradient-to-br from-slate-600/20 to-slate-700/10 border-l-4 border-slate-500">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Relation
                  </div>
                  <button
                    onClick={clearSelection}
                    className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  {selectedEdge.type || 'Connexion'}
                </h2>
                <div className="text-slate-400 text-sm">
                  {nodes.find(n => n.id === selectedEdge.source)?.label} → {nodes.find(n => n.id === selectedEdge.target)?.label}
                </div>
              </div>

              <div className="p-6 space-y-4">

                {selectedEdge.description && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-slate-400" />
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Description
                      </h3>
                    </div>
                    <p className="text-slate-400 leading-relaxed text-sm">
                      {selectedEdge.description}
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-semibold text-slate-300 mb-3 uppercase tracking-wide">
                    Connexion
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm p-2 bg-slate-700/30 rounded">
                      <span className="text-slate-400">Source</span>
                      <span className="font-medium text-slate-200">
                        {nodes.find(n => n.id === selectedEdge.source)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm p-2 bg-slate-700/30 rounded">
                      <span className="text-slate-400">Cible</span>
                      <span className="font-medium text-slate-200">
                        {nodes.find(n => n.id === selectedEdge.target)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm p-2 bg-slate-700/30 rounded">
                      <span className="text-slate-400">Type</span>
                      <span className="font-medium text-slate-200">
                        {selectedEdge.type}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedEdge.confidence && (
                  <div className="pt-4 border-t border-slate-700">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Confidence</span>
                      <span className="font-medium text-slate-200">
                        {Math.round((selectedEdge.confidence || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
                  
                {/* Slider Opacité */}
                <div className="border-t pt-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300">Opacité</span>
                    <span className="text-xs font-mono text-slate-400">
                      {Math.round((individualEdgeOpacity[selectedEdge.id] ?? opacityLevels.Relations) * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <EyeOff 
                      className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                      onClick={() => setIndividualEdgeOpacity(selectedEdge.id, 0)}
                      title="Opacité minimale (0%)"
                    />
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.05"
                      value={individualEdgeOpacity[selectedEdge.id] ?? opacityLevels.Relations}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        setIndividualEdgeOpacity(selectedEdge.id, value);
                      }}
                      className="flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-slate-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                    />
                    <Eye 
                      className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                      onClick={() => setIndividualEdgeOpacity(selectedEdge.id, 0.5)}
                      title="Opacité maximale (50%)"
                    />
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Onglet Settings (Paramètres) */}
            {activeTab === 'settings' && (
              <div className="p-4 space-y-6">

                {/* En-têtE*/}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-slate-300" />
                      <h2 className="text-lg font-bold text-white">Paramètres</h2>
                    </div>
                    {/* Bouton pour remettre tous les paramètres par défaut */}
                    <button
                      onClick={() => resetAllSettings(layout)}
                      className="ml-20 bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                      title="Réinitialiser tous les paramètres"
                    >
                      <RefreshCcw className="w-5 h-5" />
                    </button>
                    {/* Bouton pour rétracter toutes les sections */}
                    <button
                      onClick={() => {
                        setShowFiltersSubSection({
                          entity: false,
                          event: false,
                          context: false,
                          relations: false,
                          entityNodes: false,
                          eventNodes: false,
                          contextNodes: false,
                          relationsList: false,
                          pinnedNodesList: false,
                          filters: false,
                          data: false
                        });
                        setShowPinnedNodesSection(false);
                        setShowLayoutMenu(false);
                      }}
                      className="bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                      title="Rétracter toutes les sections"
                    >
                      <ListChevronsDownUp className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Recherche Full-text */}
                <div className="space-y-2 pb-4 border-b border-slate-700">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Search className="w-3 h-3" /> Recherche Full-text
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={filters.advancedSearch}
                      onChange={(e) => setAdvancedFilter('advancedSearch', e.target.value)}
                      placeholder="Chercher dans les descriptions..."
                      className="w-full pl-3 pr-8 py-2 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    {filters.advancedSearch && (
                      <button 
                        onClick={() => setAdvancedFilter('advancedSearch', '')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filtres avec statistiques - Rétractable */}
                <div className="space-y-2">
                  <div
                    onClick={() => setShowFiltersSubSection(prev => ({ ...prev, filters: !prev.filters }))}
                    className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-blue-400" />
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Filtres</h3>
                    </div>
                    <div className="flex items-center text-xs gap-1 ml-6">
                      <span className="text-slate-400">Total:</span>
                      <span className="font-bold text-white">{stats.total}</span>
                    </div>
                    <div className="flex items-center text-xs gap-1">
                      <span className="text-slate-400">Visible:</span>
                      <span className="font-bold text-white">{stats.visible}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        resetFilters();
                      }}
                      className="ml-2 p-1 bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded transition-colors"
                      title="Réinitialiser les filtres"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                    </button>
                    {showFiltersSubSection.filters ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                  </div>

                  {showFiltersSubSection.filters && (
                    <div className="space-y-4 pl-2 pt-2">
                      <FilterSection
                        type="Entity"
                        color="bg-blue-500"
                        description="Entités représentant des personnes, lieux, organisations ou objets."
                        nodes={nodes}
                        filters={filters}
                        filterModes={filterModes}
                        opacityLevels={opacityLevels}
                        stats={{ total: stats.entities }}
                        isOpen={showFiltersSubSection.entity}
                        isNodesListOpen={showFiltersSubSection.entityNodes}
                        onToggle={() => setShowFiltersSubSection(prev => ({ ...prev, entity: !prev.entity }))}
                        onNodesListToggle={() => setShowFiltersSubSection(prev => ({ ...prev, entityNodes: !prev.entityNodes }))}
                        toggleFilter={toggleFilter}
                        setFilterMode={setFilterMode}
                        setOpacityLevel={setOpacityLevel}
                        selectNode={selectNode}
                      />

                      <FilterSection
                        type="Event"
                        color="bg-green-500"
                        description="Événements majeurs ayant marqué la période étudiée."
                        nodes={nodes}
                        filters={filters}
                        filterModes={filterModes}
                        opacityLevels={opacityLevels}
                        stats={{ total: stats.events }}
                        isOpen={showFiltersSubSection.event}
                        isNodesListOpen={showFiltersSubSection.eventNodes}
                        onToggle={() => setShowFiltersSubSection(prev => ({ ...prev, event: !prev.event }))}
                        onNodesListToggle={() => setShowFiltersSubSection(prev => ({ ...prev, eventNodes: !prev.eventNodes }))}
                        toggleFilter={toggleFilter}
                        setFilterMode={setFilterMode}
                        setOpacityLevel={setOpacityLevel}
                        selectNode={selectNode}
                      />

                      <FilterSection
                        type="Context"
                        color="bg-purple-500"
                        description="Éléments contextuels définissant le cadre historique."
                        nodes={nodes}
                        filters={filters}
                        filterModes={filterModes}
                        opacityLevels={opacityLevels}
                        stats={{ total: stats.contexts }}
                        isOpen={showFiltersSubSection.context}
                        isNodesListOpen={showFiltersSubSection.contextNodes}
                        onToggle={() => setShowFiltersSubSection(prev => ({ ...prev, context: !prev.context }))}
                        onNodesListToggle={() => setShowFiltersSubSection(prev => ({ ...prev, contextNodes: !prev.contextNodes }))}
                        toggleFilter={toggleFilter}
                        setFilterMode={setFilterMode}
                        setOpacityLevel={setOpacityLevel}
                        selectNode={selectNode}
                      />

                      <RelationsSection
                        edges={edges}
                        nodes={nodes}
                        filters={filters}
                        filterModes={filterModes}
                        opacityLevels={opacityLevels}
                        isOpen={showFiltersSubSection.relations}
                        isRelationsListOpen={showFiltersSubSection.relationsList}
                        onToggle={() => setShowFiltersSubSection(prev => ({ ...prev, relations: !prev.relations }))}
                        onRelationsListToggle={() => setShowFiltersSubSection(prev => ({ ...prev, relationsList: !prev.relationsList }))}
                        toggleFilter={toggleFilter}
                        setFilterMode={setFilterMode}
                        setOpacityLevel={setOpacityLevel}
                        selectEdge={selectEdge}
                      />

                      {/* Tags */}
                      <div className="space-y-3">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                          <Tag className="w-3 h-3" /> Filtrer par Tags
                        </label>
                        
                        {/* Barre de recherche de tags */}
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                          <input
                            type="text"
                            value={tagSearchQuery}
                            onChange={(e) => setTagSearchQuery(e.target.value)}
                            placeholder="Rechercher un tag..."
                            className="w-full pl-7 pr-7 py-1.5 bg-slate-900/50 border border-slate-700 rounded text-[10px] text-slate-200 focus:outline-none focus:border-blue-500"
                          />
                          {tagSearchQuery && (
                            <button 
                              onClick={() => setTagSearchQuery('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {(tagSearchQuery 
                              ? (allTags || []).filter(t => t.toLowerCase().includes(tagSearchQuery.toLowerCase())) 
                              : (showAllTags ? (allTags || []) : (allTags || []).slice(0, 8))
                            ).map(tag => (
                              <button
                                key={tag}
                                onClick={() => {
                                  const newTags = new Set(filters.selectedTags);
                                  if (newTags.has(tag)) newTags.delete(tag);
                                  else newTags.add(tag);
                                  setAdvancedFilter('selectedTags', newTags);
                                }}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                                  filters.selectedTags.has(tag)
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                }`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                          
                          {!tagSearchQuery && allTags && allTags.length > 12 && (
                            <button
                              onClick={() => setShowAllTags(!showAllTags)}
                              className="text-[10px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
                            >
                              {showAllTags ? (
                                <><ChevronUp className="w-3 h-3" /> Afficher moins</>
                              ) : (
                                <><ChevronDown className="w-3 h-3" /> Afficher plus ({allTags.length - 12})</>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Confidence Level */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <ShieldCheck className="w-3 h-3" /> Confidence Minimale
                          </label>
                          <span className="text-[10px] font-mono text-blue-400">{Math.round(filters.minConfidence * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={filters.minConfidence}
                          onChange={(e) => setAdvancedFilter('minConfidence', parseFloat(e.target.value))}
                          className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Pin Management - Rétractable */}
                <div className="space-y-2">
                  <button
                    onClick={() => setShowPinnedNodesSection(!showPinnedNodesSection)}
                    className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Pin className="w-4 h-4 text-yellow-500" />
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Pin Management</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500">{pinnedNodesInfo.length}</span>
                      {showPinnedNodesSection ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                    </div>
                  </button>

                  {showPinnedNodesSection && (
                    <div className="space-y-3 pl-2 pt-1">
                      <div className="flex gap-2">
                        <button
                          onClick={() => pinAllVisibleNodes(layout, nodes.filter(n => filters[n.type]).map(n => n.id))}
                          className="flex-1 px-2 py-1.5 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded text-[10px] font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <Pin className="w-3 h-3" /> Pin All
                        </button>
                        <button
                          onClick={() => unpinAllNodes(layout)}
                          disabled={pinnedNodesInfo.length === 0}
                          className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded text-[10px] font-medium transition-colors disabled:opacity-30"
                        >
                          Unpin All
                        </button>
                      </div>
                      
                      {pinnedNodesInfo.length > 0 && (
                        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                          {pinnedNodesInfo.map(node => (
                            <div key={node.id} className="flex items-center justify-between p-1.5 bg-slate-800/50 rounded border border-slate-700/50">
                              <span className="text-[10px] text-slate-300 truncate flex-1 mr-2">{node.label}</span>
                              <button
                                onClick={() => toggleNodePin(node.id, layout)}
                                className="text-yellow-500 hover:text-yellow-400"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Données (Export/Import) - Rétractable */}
                <div className="space-y-2">
                  <button
                    onClick={() => setShowFiltersSubSection(prev => ({ ...prev, data: !prev.data }))}
                    className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-slate-400" />
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Données</h3>
                    </div>
                    {showFiltersSubSection.data ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                  </button>

                  {showFiltersSubSection.data && (
                    <div className="grid grid-cols-2 gap-2 pl-2 pt-1">
                      <button
                        onClick={() => exportGraph()}
                        className="flex items-center justify-center gap-2 p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[10px] font-medium transition-colors border border-slate-600"
                      >
                        <Download className="w-3 h-3" /> Export
                      </button>
                      <label className="flex items-center justify-center gap-2 p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[10px] font-medium transition-colors border border-slate-600 cursor-pointer">
                        <Upload className="w-3 h-3" /> Import
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => importGraph(event.target.result);
                              reader.readAsText(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>

          {/* Boutons Historique et Play/Pause - toujours visibles en bas */}
          <div className="p-4 bg-slate-800">
            <div className="flex gap-2">
              {/* Bouton Undo */}
              <button
                onClick={() => undo()}
                disabled={!canUndo()}
                className="px-5 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
                title="Annuler (Ctrl+Z)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              {/* Bouton Redo */}
              <button
                onClick={() => redo()}
                disabled={!canRedo()}
                className="px-5 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
                title="Refaire (Ctrl+Y)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              
              {/* Bouton Play/Pause */}
              <button
                onClick={() => setSimulationPaused(!simulationPaused)}
                className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                  simulationPaused 
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/30' 
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                {simulationPaused ? (
                  <>
                    <Play className="w-4 h-4" />
                    Play
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NexReecGraph;
