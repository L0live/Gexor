import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader, Play, Pause, ChevronLeft, ChevronRight, Settings, StepForward } from 'lucide-react';

import useGraphStore from './store/useGraphStore';
import useForceLayout from './hooks/useForceLayout';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { computeStats } from './store/utils';
import Scene from './components/Graph/Scene';
import Minimap from './components/Graph/Minimap';
import SettingsPanel from './components/UI/SettingsPanel';
import GroupInfoPanel from './components/UI/GroupInfoPanel';
import NodeDetailPanel from './components/UI/NodeDetailPanel';
import ConnectedReecsPanel from './components/UI/ConnectedReecsPanel';
import SearchBar from './components/UI/SearchBar';

// ============================================================================
// COUCHE 4 : INTERACTION LAYER (UI & Controls)
// ============================================================================

const NexReecGraph = ({ initialData }) => {
  const {
    nodes,
    edges,
    filters,
    opacityLevels,
    showBackground,
    toggleBackground,
    selectedNode,
    selectedEdge,
    layoutProgress,
    layoutRunning,
    layoutReady,
    availableReecs,
    availableRelations,
    visibleReecIds,
    loadData,
    toggleFilter,
    setOpacityLevel,
    selectNode,
    selectEdge,
    clearSelection,
    clearSelectedNode,
    clearSelectedGroup,
    setLayoutReady,
    simulationPaused,
    setSimulationPaused,
    toggleNodePin,
    isPinned,
    pinnedSettings,
    setGroupDepth,
    setGroupRenderMode,
    setRadialStrength,
    setRadialSpacingMode,
    setRadialSpacing,
    undo,
    redo,
    canUndo,
    canRedo,
    pinnedNodes,
    nodeGroupMemberships,
    selectedGroupId,
    setAdvancedFilter,
    allTags = [],
    resetAllSettings,
    setAutoDragNode
  } = useGraphStore();
  
  const [initialized, setInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFiltersSubSection, setShowFiltersSubSection] = useState({
    entityNodes: false,
    eventNodes: false,
    contextNodes: false,
    relationsList: false,
    pinnedNodesList: false,
    data: false,
    connectedReecs: false,
  });
  const [showPinnedNodesSection, setShowPinnedNodesSection] = useState(false);
  const initialSimulationStarted = useRef(false);
  const lastClickRef = useRef({ time: 0, id: null });
  const settingsRef = useRef(null);
  const { runSimulation, stopSimulation, isInitialized } = useForceLayout();
  
  // Charger les données initiales
  useEffect(() => {
    if (initialData && !initialized) {
      loadData(initialData);
      setInitialized(true);
    }
  }, [initialData, initialized, loadData]);

  // Fermer les settings lors d'un clic à l'extérieur
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showSettings && settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);
  
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
    return Array.from(pinnedNodes).map(id => {
      const reec = availableReecs.find(r => r.reec_id === id);
      return {
        id,
        label: reec ? reec.label : id,
        type: reec ? reec.type : 'Entity'
      };
    });
  }, [availableReecs, pinnedNodes]);
  
  const handleAddReec = (reecId, shouldPin = true, event = null) => {
    // 1. On active d'abord l'auto-drag dans le store si l'événement est fourni
    if (event) {
      setAutoDragNode({
        nodeId: reecId,
        clientX: event.clientX,
        clientY: event.clientY
      });
    }

    // 2. Dans le nouveau système par groupes, ajouter un REEC revient à le pinner
    // On attend un tout petit peu pour éviter les conflits d'interface
    setTimeout(() => {
      if (!isPinned(reecId)) {
        toggleNodePin(reecId);
      } else {
        selectNode(reecId);
      }
    }, 10);
  };
  
  const handleCustomDoubleClick = (e, reecId, shouldPin = true) => {
    const now = Date.now();
    // Augmenter un peu le délai pour plus de souplesse (400ms au lieu de 300ms)
    if (lastClickRef.current.id === reecId && now - lastClickRef.current.time < 400) {
      e.preventDefault();
      e.stopPropagation();
      handleAddReec(reecId, shouldPin, e);
      lastClickRef.current = { time: 0, id: null };
    } else {
      lastClickRef.current = { time: now, id: reecId };
    }
  };
  
  // Raccourcis clavier (extraits dans un hook dédié)
  useKeyboardShortcuts({ selectedNode, toggleNodePin, undo, redo, canUndo, canRedo });
  
  const stats = useMemo(() => computeStats(nodes, edges, filters), [nodes, edges, filters]);
  
  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col">
      {/* Layout principal : Canvas + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas 3D */}
        <div className="flex-1 relative">
          {/* Settings flottant en haut à gauche */}
          <div className="absolute top-4 left-4 z-[100] flex flex-col items-start gap-2" ref={settingsRef}>
            <div className="flex items-center gap-3">
              <div className="flex bg-slate-800/10 backdrop-blur-sm p-2 rounded-xl border border-slate-700/20 shadow-xl transition-all hover:bg-slate-800/50">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    showSettings 
                      ? 'bg-slate-700/40 text-white' 
                      : 'bg-slate-700/20 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  }`}
                  title="Paramètres"
                >
                  <Settings className={`w-5 h-5 ${showSettings ? 'animate-spin-slow' : ''}`} />
                </button>
                <div className="w-px bg-slate-700 my-1 mx-1" />
                <button
                  onClick={() => undo()}
                  disabled={!canUndo()}
                  className="p-2.5 rounded-lg transition-all hover:bg-blue-600/10 text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed"
                  title="Annuler (Ctrl+Z)"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => redo()}
                  disabled={!canRedo()}
                  className="p-2.5 rounded-lg transition-all hover:bg-blue-600/10 text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed"
                  title="Refaire (Ctrl+Y)"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="w-px bg-slate-700 my-1 mx-1" />

                <button
                  onClick={() => runSimulation(nodes.length * 50)}
                  disabled={layoutRunning}
                  className={`p-2.5 rounded-lg transition-all ${
                    layoutRunning 
                      ? 'bg-blue-600/20 text-blue-400' 
                      : 'hover:bg-blue-600/10 text-slate-300'
                  }`}
                  title="Stabiliser le layout (Avancer jusqu'à stabilité)"
                >
                  {layoutRunning ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <StepForward className="w-5 h-5" />
                  )}
                </button>

                <button
                  onClick={() => setSimulationPaused(!simulationPaused)}
                  className={`px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${
                    simulationPaused 
                      ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/30' 
                      : 'bg-slate-700/20 text-slate-300 hover:bg-slate-700/50 border border-transparent'
                  }`}
                >
                  {simulationPaused ? (
                    <Play className="w-4 h-4" />
                  ) : (
                    <Pause className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {showSettings && (
              <SettingsPanel
                nodes={nodes}
                edges={edges}
                filters={filters}
                opacityLevels={opacityLevels}
                stats={stats}
                showBackground={showBackground}
                toggleBackground={toggleBackground}
                resetAllSettings={resetAllSettings}
                showFiltersSubSection={showFiltersSubSection}
                setShowFiltersSubSection={setShowFiltersSubSection}
                toggleFilter={toggleFilter}
                setOpacityLevel={setOpacityLevel}
                setAdvancedFilter={setAdvancedFilter}
                selectNode={selectNode}
                selectEdge={selectEdge}
                selectedNode={selectedNode}
                pinnedNodes={pinnedNodes}
                pinnedNodesInfo={pinnedNodesInfo}
                allTags={allTags}
                tagSearchQuery={tagSearchQuery}
                setTagSearchQuery={setTagSearchQuery}
                showAllTags={showAllTags}
                setShowAllTags={setShowAllTags}
              />
            )}
          </div>

          {availableReecs.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="text-center">
                <Loader className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
                <p className="text-slate-300 font-medium">Chargement des données...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Overlay de calcul du layout (uniquement si des nodes sont présents) */}
              {nodes.length > 0 && !layoutReady && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                  <div className="text-center">
                    <Loader className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-300 font-medium">Calcul du layout...</p>
                    {layoutProgress > 0 && (
                      <p className="text-slate-400 text-sm mt-2">{Math.round(layoutProgress)}%</p>
                    )}
                  </div>
                </div>
              )}

              {/* Grille 3D Statique (Calque de fond) */}
              <div 
                className="absolute inset-0 pointer-events-none overflow-hidden" 
                style={{ perspective: '1000px', background: !selectedNode ? '#0b101eff' : 
                    selectedNode.type === 'Entity' ? '#08101faf' : // Teinte Navy très sombre
                    selectedNode.type === 'Event' ? '#0a1711af' :  // Teinte Forêt très sombre (Green)
                    selectedNode.type === 'Context' ? '#140b21af' : // Teinte Prune très sombre (Purple)
                    '#0f172a' }}
              >
                {showBackground && (
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
                )}
              </div>

              <Canvas
                camera={{ position: [0, 150, 100], fov: 70, near: 0.1, far: 10000 }}
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

          {/* Group Info Panel (Bottom Left) */}
          {layoutReady && (
            <GroupInfoPanel 
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              nodeGroupMemberships={nodeGroupMemberships}
              pinnedNodes={pinnedNodes}
              pinnedSettings={pinnedSettings}
              availableReecs={availableReecs}
              nodes={nodes}
              edges={edges}
              filters={filters}
              opacityLevels={opacityLevels}
              setGroupDepth={setGroupDepth}
              toggleNodePin={toggleNodePin}
              selectNode={selectNode}
              selectEdge={selectEdge}
              toggleFilter={toggleFilter}
              setOpacityLevel={setOpacityLevel}
              setAdvancedFilter={setAdvancedFilter}
              clearSelection={clearSelection}
              selectedGroupId={selectedGroupId}
              clearSelectedGroup={clearSelectedGroup}
              setGroupRenderMode={setGroupRenderMode}
              setRadialStrength={setRadialStrength}
              setRadialSpacingMode={setRadialSpacingMode}
              setRadialSpacing={setRadialSpacing}
            />
          )}

          {/* Barre de recherche flottante */}
          {layoutReady && (
            <SearchBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchFocused={searchFocused}
              setSearchFocused={setSearchFocused}
              filteredReecs={filteredReecs}
              topReecs={topReecs}
              handleCustomDoubleClick={handleCustomDoubleClick}
            />
          )}

          {/* Panel d'information flottant (Node/Edge Details) */}
          <NodeDetailPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            nodes={nodes}
            connectedReecs={connectedReecs}
            isPinned={isPinned}
            toggleNodePin={toggleNodePin}
            clearSelectedNode={clearSelectedNode}
            selectNode={selectNode}
            onShowConnectedReecs={() => setShowFiltersSubSection(prev => ({...prev, connectedReecs: true}))}
          />

          {/* Section flottante Détails REEC Connectés */}
          {showFiltersSubSection.connectedReecs && (
            <ConnectedReecsPanel
              selectedNode={selectedNode}
              connectedReecs={connectedReecs}
              selectNode={selectNode}
              onClose={() => setShowFiltersSubSection(prev => ({...prev, connectedReecs: false}))}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default NexReecGraph;
