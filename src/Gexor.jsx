import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader, Play, Pause, ChevronLeft, ChevronRight, Settings, StepForward, AlertCircle, Wifi } from 'lucide-react';

import useGraphStore from './store/useGraphStore';
import useForceLayout from './hooks/useForceLayout';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { computeStats } from './store/utils';
import { getCategoryColorDark } from './constants/graphConstants';
import { getTheme } from './constants/themes';
import Scene from './components/Graph/Scene';
import Minimap from './components/Graph/Minimap';
import SettingsPanel from './components/UI/SettingsPanel';
import InfoPanel from './components/UI/InfoPanel';
import RightPanel from './components/UI/RightPanel';
import SearchModal from './components/UI/SearchModal';
import { createFilter, FILTER_TYPES } from './models/searchFilter';
import { preloadClassificationData } from './services/propertyClassification';

// ============================================================================
// COUCHE 4 : INTERACTION LAYER (UI & Controls)
// ============================================================================

const SceneBackground = ({ showBackground, selectedNode }) => {
  const themeId = useGraphStore(s => s.theme);
  const theme = getTheme(themeId);
  const bg = !selectedNode
    ? theme.sceneBgFallback
    : (theme.useCategoryColors ? getCategoryColorDark(selectedNode.type, 1) : theme.sceneBgFallback);
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ perspective: '1000px', background: bg }}
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
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
            WebkitFontSmoothing: 'antialiased',
            boxShadow: 'inset 0 100 100px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              width: '100%',
              height: '180vh',
              transform: 'translate(-50%, -100%) rotateX(-75deg)',
              transformOrigin: 'bottom center',
              backgroundImage: `url("/api/image?url=${encodeURIComponent('https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/World_Map_1689.JPG/500px-World_Map_1689.JPG')}")`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'bottom center',
              filter: 'brightness(0.7) contrast(1.2) saturate(1.3)',
              maskImage: 'linear-gradient(to top, black 0px, transparent 100%)',
            }}
          />
        </div>
      )}
    </div>
  );
};

const Gexor = () => {
  const {
    nodes,
    edges,
    showBackground,
    toggleBackground,
    selectedNode,
    selectedEdge,
    layoutProgress,
    layoutRunning,
    layoutReady,
    loadedNodes,
    loadedRelations,
    visibleNodeIds,
    selectNode,
    selectEdge,
    clearSelection,
    clearSelectedNode,
    setLayoutReady,
    simulationPaused,
    setSimulationPaused,
    toggleNodePin,
    isPinned,
    undo,
    redo,
    canUndo,
    canRedo,
    resetAllSettings,
    setAutoDragNode,
    fetchAndExpandNode,
    initFromEntity,
    sparqlRequestCount,
    loadingUris,
    failedUris,
    loadingSelectedNodeProperties,
    refreshNode,
    expandAggregate,
    collapseAggregate,
    loadedAggregates,
    nodeSettings,
    outgoingFetchedUris,
    outgoingDisplayRelations,
    openSearchModal,
    rightPanelOpen,
  } = useGraphStore();
  
  const [showSettings, setShowSettings] = useState(false);
  const [showPinnedNodesSection, setShowPinnedNodesSection] = useState(false);
  const initialSimulationStarted = useRef(false);
  const lastClickRef = useRef({ time: 0, id: null });
  const settingsRef = useRef(null);
  const { runSimulation, stopSimulation, isInitialized } = useForceLayout();
  
  // Preload classification data from backend API (removes ~100KB from JS bundle)
  useEffect(() => {
    preloadClassificationData();
  }, []);

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
  
  // Lancer la simulation automatiquement quand de nouveaux nodes arrivent
  useEffect(() => {
    if (isInitialized && !initialSimulationStarted.current && nodes.length > 0) {
      initialSimulationStarted.current = true;
      runSimulation(Math.min(nodes.length * 35, 1000));
    } else if (nodes.length === 0) {
      setLayoutReady(true);
    }
  }, [isInitialized, nodes.length, runSimulation, setLayoutReady]);
  
  // Calculer les nœuds connectés au nœud sélectionné
  // Only show nodes visible in graph, except outgoing properties (fetched on click)
  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    
    // Collect connections with their relation classification
    // Merge loadedRelations (graph edges) + outgoingDisplayRelations (display-only outgoing edges)
    const connectionMap = new Map(); // uri -> { relations: [{pid, label, classification, direction}] }
    const allRelations = [...Object.values(loadedRelations), ...Object.values(outgoingDisplayRelations)];
    allRelations.forEach(rel => {
      let neighborUri = null;
      let direction = null;
      if (rel.source === selectedNode.id) { neighborUri = rel.target; direction = 'outgoing'; }
      else if (rel.target === selectedNode.id) { neighborUri = rel.source; direction = 'incoming'; }
      if (!neighborUri) return;

      // Filter: only visible nodes OR outgoing properties (fetched on click, may not be in graph)
      const isVisible = visibleNodeIds.has(neighborUri);
      const isOutgoingFetch = direction === 'outgoing' && outgoingFetchedUris.has(selectedNode.id);
      if (!isVisible && !isOutgoingFetch) return;
      
      if (!connectionMap.has(neighborUri)) {
        connectionMap.set(neighborUri, { relations: [] });
      }
      connectionMap.get(neighborUri).relations.push({
        pid: rel.predicate,
        label: rel.label,
        classification: rel.classification || 'unclassified',
        direction,
      });
    });
    
    return Array.from(connectionMap.entries())
      .map(([uri, data]) => {
        const node = loadedNodes[uri];
        if (!node) return null;
        // Best classification: primary > context-dependent > unclassified > secondary
        const classOrder = { 'primary': 0, 'context-dependent': 1, 'unclassified': 2, 'secondary': 3 };
        const bestClassification = data.relations.reduce((best, r) => {
          return (classOrder[r.classification] || 3) < (classOrder[best] || 3) ? r.classification : best;
        }, 'secondary');
        return {
          uri: node.uri,
          label: node.label,
          type: node.category || 'unknown',
          description: node.description,
          isVisible: visibleNodeIds.has(node.uri),
          bestClassification,
          relations: data.relations,
        };
      })
      .filter(Boolean)
      // Sort: primary connections first
      .sort((a, b) => {
        const order = { 'primary': 0, 'context-dependent': 1, 'unclassified': 2, 'secondary': 3 };
        return (order[a.bestClassification] || 3) - (order[b.bestClassification] || 3);
      });
  }, [selectedNode, loadedNodes, loadedRelations, outgoingDisplayRelations, visibleNodeIds, outgoingFetchedUris]);
  
  const handleAddNode = async (nodeUri, shouldPin = true, event = null) => {
    // 1. On active d'abord l'auto-drag dans le store si l'événement est fourni
    if (event) {
      setAutoDragNode({
        nodeId: nodeUri,
        clientX: event.clientX,
        clientY: event.clientY
      });
    }

    // 2. If the node is not yet loaded, fetch it from SPARQL first
    if (!loadedNodes[nodeUri]) {
      await fetchAndExpandNode(nodeUri);
    }

    // 3. Pin the node
    setTimeout(() => {
      if (!isPinned(nodeUri)) {
        toggleNodePin(nodeUri);
      } else {
        selectNode(nodeUri);
      }
    }, 10);
  };
  
  const handleCustomDoubleClick = (e, nodeUri, shouldPin = true) => {
    const now = Date.now();
    if (lastClickRef.current.id === nodeUri && now - lastClickRef.current.time < 400) {
      e.preventDefault();
      e.stopPropagation();
      handleAddNode(nodeUri, shouldPin, e);
      lastClickRef.current = { time: 0, id: null };
    } else {
      lastClickRef.current = { time: now, id: nodeUri };
    }
  };
  
  // Raccourcis clavier (extraits dans un hook dédié)
  useKeyboardShortcuts({ selectedNode, toggleNodePin, undo, redo, canUndo, canRedo });
  
  const stats = useMemo(() => computeStats(nodes, edges), [nodes, edges]);
  const themeId = useGraphStore(s => s.theme);

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col" data-theme={themeId}>
      {/* Layout principal : Canvas + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas 3D — contrainte de largeur quand RightPanel est ouvert */}
        <div className={`${rightPanelOpen ? 'w-[calc(100%-500px)]' : 'flex-1'} relative`}>
          {/* Settings flottant en haut à gauche */}
          <div className="absolute bottom-4 left-4 z-[100] flex flex-col-reverse items-start gap-2" ref={settingsRef}>
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
                stats={stats}
                showBackground={showBackground}
                toggleBackground={toggleBackground}
                resetAllSettings={resetAllSettings}
              />
            )}
          </div>

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
              <SceneBackground showBackground={showBackground} selectedNode={selectedNode} />

              <Canvas
                frameloop="demand"
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

          {/* Minimap */}
          {layoutReady && <Minimap />}

          {/* SPARQL activity / error indicator */}
          {
            <div className="absolute top-4 right-44 z-[100] flex flex-col gap-2 items-end">
              {sparqlRequestCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/60 backdrop-blur-sm border border-blue-700/40 rounded-lg text-blue-300 text-xs">
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                  <span>Chargement ({loadingUris.size} entité{loadingUris.size > 1 ? 's' : ''})…</span>
                </div>
              )}
              {failedUris.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/60 backdrop-blur-sm border border-amber-700/40 rounded-lg text-amber-300 text-xs">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{failedUris.size} entité{failedUris.size > 1 ? 's' : ''} non chargée{failedUris.size > 1 ? 's' : ''}</span>
                  <button
                    onClick={() => {
                      const uris = Array.from(failedUris);
                      uris.forEach(uri => refreshNode(uri));
                    }}
                    className="ml-1 px-2 py-0.5 bg-amber-700/40 hover:bg-amber-700/60 rounded text-amber-200 text-[10px] font-bold transition-colors"
                  >
                    Réessayer
                  </button>
                </div>
              )}
              {sparqlRequestCount === 0 && failedUris.size === 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/40 backdrop-blur-sm border border-slate-700/20 rounded-lg text-slate-500 text-xs opacity-50 hover:opacity-100 transition-opacity">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{Object.keys(loadedNodes).length} entités · {Object.keys(loadedRelations).length} relations</span>
                </div>
              )}
            </div>
          }

          {/* InfoPanel + RightPanel (remplacent NodeDetailPanel) */}
          <InfoPanel />
          <RightPanel />

          {/* SearchModal (overlay) */}
          <SearchModal />
        </div>
      </div>
    </div>
  );
};

export default Gexor;
