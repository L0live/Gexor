import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Line } from '@react-three/drei';
import { Network, Filter, X, Info, Loader } from 'lucide-react';
import * as THREE from 'three';
import createGraph from 'ngraph.graph';
import forceLayout3d from 'ngraph.forcelayout3d';
import { create } from 'zustand';

// ============================================================================
// COUCHE 1 : DATA LAYER (Zustand State Management)
// ============================================================================

const useGraphStore = create((set, get) => ({
  // Raw data
  rawReecs: [],
  rawRelations: [],
  
  // Processed graph data
  nodes: [],
  edges: [],
  
  // UI state
  filters: {
    Entity: true,
    Event: true,
    Context: true
  },
  selectedNode: null,
  selectedEdge: null,
  
  // Layout state
  positions: {},
  layoutRunning: false,
  layoutProgress: 0,
  layoutReady: false,
  
  // Actions
  loadData: (jsonData) => {
    set({
      rawReecs: jsonData.reecs,
      rawRelations: jsonData.relations,
      nodes: jsonData.reecs.map(reec => ({
        id: reec.reec_id,
        label: reec.label,
        type: reec.type,
        subtype: reec.subtype,
        category: reec.category,
        summary: reec.summary_short,
        summaryDetailed: reec.summary_detailed,
        temporal: {
          start: reec.temporal_start_date || reec.temporal_date,
          end: reec.temporal_end_date,
          precision: reec.temporal_precision
        },
        locations: reec.spatial_locations || [],
        confidence: reec.metadata_confidence,
        tags: reec.metadata_tags || []
      })),
      edges: jsonData.relations.map(rel => ({
        id: `${rel.source_reec_id}-${rel.target_reec_id}`,
        source: rel.source_reec_id,
        target: rel.target_reec_id,
        type: rel.relation_type,
        description: rel.description,
        confidence: rel.confidence
      }))
    });
  },
  
  toggleFilter: (type) => {
    set((state) => ({
      filters: {
        ...state.filters,
        [type]: !state.filters[type]
      }
    }));
  },
  
  selectNode: (nodeId) => {
    const node = get().nodes.find(n => n.id === nodeId);
    set({ selectedNode: node, selectedEdge: null });
  },
  
  selectEdge: (edgeId) => {
    const edge = get().edges.find(e => e.id === edgeId);
    set({ selectedEdge: edge, selectedNode: null });
  },
  
  clearSelection: () => {
    set({ selectedNode: null, selectedEdge: null });
  },
  
  setPositions: (positions) => {
    set({ positions });
  },
  
  setLayoutRunning: (running) => {
    set({ layoutRunning: running });
  },
  
  setLayoutProgress: (progress) => {
    set({ layoutProgress: progress });
  },
  
  setLayoutReady: (ready) => {
    set({ layoutReady: ready });
  }
}));

// ============================================================================
// COUCHE 2 : LAYOUT ENGINE (ngraph.forcelayout3d)
// ============================================================================

const useNgraphLayout = () => {
  const store = useGraphStore();
  const { nodes, edges, filters, setPositions, setLayoutRunning, setLayoutProgress, setLayoutReady } = store;
  const [layout, setLayout] = useState(null);
  const animationRef = useRef(null);
  
  // Initialize ngraph
  useEffect(() => {
    if (nodes.length === 0) return;
    
    // Créer le graphe ngraph
    const graph = createGraph();
    
    // Ajouter les nodes filtrés
    nodes.forEach(node => {
      if (filters[node.type]) {
        graph.addNode(node.id, { ...node, mass: 1 });
      }
    });
    
    // Ajouter les edges (seulement si source et target sont visibles)
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode && filters[sourceNode.type] && filters[targetNode.type]) {
        graph.addLink(edge.source, edge.target);
      }
    });
    
    // Créer le layout 3D
    const layoutInstance = forceLayout3d(graph, {
      springLength: 30, // longueur des ressorts, plus grand = plus espacé
      springCoeff: 0.0008, // coefficient de ressort, plus grand = ressorts plus rigides
      gravity: -1.5, // gravité, plus négatif = plus fort
      theta: 0.5, // précision, plus petit = plus précis
      dragCoeff: 0.01, // coefficient de friction, plus grand = plus de friction
      timeStep: 10, // pas de temps, plus grand = plus rapide
      nodeMass: () => 1 // masse des nodes, ici constante
    });
    
    setLayout(layoutInstance);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes, edges, filters]);
  
  // Simuler le layout
  const runSimulation = (iterations = 400) => {
    if (!layout) return;
    
    setLayoutRunning(true);
    let step = 0;
    let animationStarted = false;
    const animationStartThreshold = iterations / 10;
    
    const simulate = () => {
      if (step < iterations) {
        layout.step();
        step++;
        setLayoutProgress((step / iterations) * 100);
        
        // Afficher l'animation seulement sur les dernières 200 itérations
        if (step >= animationStartThreshold) {
          const newPositions = {};
          layout.forEachBody((body, nodeId) => {
            newPositions[nodeId] = {
              x: body.pos.x,
              y: body.pos.y,
              z: body.pos.z
            };
          });
          setPositions(newPositions);
          
          // Marquer comme prêt dès qu'on commence l'animation (une seule fois)
          if (!animationStarted) {
            animationStarted = true;
            setLayoutReady(true);
          }
        }
        
        animationRef.current = requestAnimationFrame(simulate);
      } else {
        // Final update
        const newPositions = {};
        layout.forEachBody((body, nodeId) => {
          newPositions[nodeId] = {
            x: body.pos.x,
            y: body.pos.y,
            z: body.pos.z
          };
        });
        setPositions(newPositions);
        setLayoutRunning(false);
        setLayoutProgress(100);
      }
    };
    
    simulate();
  };
  
  const stopSimulation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setLayoutRunning(false);
  };
  
  return { runSimulation, stopSimulation, layout };
};

// ============================================================================
// COUCHE 3 : RENDERING ENGINE (React Three Fiber)
// ============================================================================

// Composant Node - Sprite 2D comme dans OldVersionGraph
const Node = ({ node, position, onClick, visible, isSelected }) => {
  // Créer le canvas texture une seule fois
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size * 0.4;

    // Couleurs plus sombres pour ne pas fatiguer les yeux
    const colorMap = {
      'Entity': '#3b82f6',
      'Event': '#8b5cf6',
      'Context': '#0fab77ff'
    };

    // Draw circle with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 1;
    
    // Single colored circle
    ctx.fillStyle = colorMap[node.type] || '#64748b';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw label - white text on colored background
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Split label into words and draw on multiple lines if needed
    const words = node.label.split(' ');
    const maxWidth = radius * 1.5;
    let lines = [];
    let currentLine = '';
    
    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    lines.push(currentLine);

    // Draw lines centered
    const lineHeight = 28;
    const totalHeight = lines.length * lineHeight;
    let yStart = centerY - totalHeight / 2 + lineHeight / 2;
    
    if (lines.length > 2) {
      ctx.font = 'bold 28px Arial';
    }
    
    lines.forEach((line) => {
      ctx.fillText(line, centerX, yStart);
      yStart += lineHeight;
    });

    return new THREE.CanvasTexture(canvas);
  }, [node.label, node.type]);
  
  const getScale = () => {
    // Scale basé sur la confidence
    const baseScale = 15;
    const confidenceMultiplier = node.confidence || 0.8;
    return baseScale * confidenceMultiplier * (isSelected ? 1.2 : 1.0);
  };
  
  if (!position) return null;
  
  const scale = getScale();
  
  return (
    <Billboard
      position={[position.x, position.y, position.z]}
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
    >
      <sprite
        scale={[scale, scale, 1]}
        onClick={onClick}
        renderOrder={1}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'default';
        }}
      >
        <spriteMaterial
          map={texture}
          transparent={true}
          depthTest={true}
          depthWrite={true}
          alphaTest={0.1}
          opacity={visible ? 1.0 : 0.2}
        />
      </sprite>
    </Billboard>
  );
};

// Composant Edge
const Edge = ({ edge, sourcePos, targetPos, visible, isSelected, onClick }) => {
  const [hovered, setHovered] = useState(false);
  
  if (!sourcePos || !targetPos || !visible) return null;
  
  const points = [
    new THREE.Vector3(sourcePos.x, sourcePos.y, sourcePos.z),
    new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)
  ];
  
  return (
    <Line
      points={points}
      color={isSelected ? '#60a5fa' : (hovered ? '#64748b' : '#475569')}
      lineWidth={isSelected ? 3.5 : (hovered ? 3.5 : 2.5)}
      transparent
      opacity={isSelected ? 0.7 : (hovered ? 0.4 : 0.2)}
      depthTest={true}
      depthWrite={false}
      renderOrder={-1}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
    />
  );
};

// Composant pour gérer les contrôles avec centre de masse initial
const DynamicOrbitControls = () => {
  const controlsRef = useRef();
  const { nodes, positions, filters } = useGraphStore();
  const targetInitialized = useRef(false);
  
  useEffect(() => {
    if (!controlsRef.current || targetInitialized.current) return;
    
    // Calculer le centre de masse des nodes visibles (une seule fois)
    const visibleNodes = nodes.filter(n => filters[n.type] && positions[n.id]);
    if (visibleNodes.length === 0) return;
    
    let centerX = 0, centerY = 0, centerZ = 0;
    visibleNodes.forEach(node => {
      const pos = positions[node.id];
      centerX += pos.x;
      centerY += pos.y;
      centerZ += pos.z;
    });
    
    centerX /= visibleNodes.length;
    centerY /= visibleNodes.length;
    centerZ /= visibleNodes.length;
    
    // Définir le target initial
    controlsRef.current.target.set(centerX, centerY, centerZ);
    targetInitialized.current = true;
  }, [nodes, positions, filters]);
  
  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      minDistance={5}
      maxDistance={500}
      enableDamping={true}
      dampingFactor={0.05}
    />
  );
};

// Scene 3D principale
const Scene = () => {
  const { nodes, edges, filters, positions, selectedNode, selectedEdge, selectNode, selectEdge } = useGraphStore();
  
  return (
    <>
      {/* Lumière ambiante simple comme OldVersionGraph */}
      <ambientLight intensity={1.0} />
      
      {/* Contrôles orbite dynamiques */}
      <DynamicOrbitControls />
      
      {/* Edges */}
      {edges.map((edge) => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        const visible = filters[sourceNode?.type] && filters[targetNode?.type];
        
        return (
          <Edge
            key={edge.id}
            edge={edge}
            sourcePos={positions[edge.source]}
            targetPos={positions[edge.target]}
            visible={visible}
            isSelected={selectedEdge?.id === edge.id}
            onClick={() => selectEdge(edge.id)}
          />
        );
      })}
      
      {/* Nodes */}
      {nodes.map((node) => (
        <Node
          key={node.id}
          node={node}
          position={positions[node.id]}
          visible={filters[node.type]}
          isSelected={selectedNode?.id === node.id}
          onClick={(e) => {
            e.stopPropagation();
            selectNode(node.id);
          }}
        />
      ))}
    </>
  );
};

// ============================================================================
// COUCHE 4 : INTERACTION LAYER (UI & Controls)
// ============================================================================

const NexReecGraph = ({ initialData }) => {
  const {
    nodes,
    filters,
    selectedNode,
    selectedEdge,
    layoutRunning,
    layoutProgress,
    layoutReady,
    loadData,
    toggleFilter,
    clearSelection,
    setLayoutReady
  } = useGraphStore();
  
  const [showFilters, setShowFilters] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const { runSimulation, stopSimulation } = useNgraphLayout();
  
  // Charger les données initiales
  useEffect(() => {
    if (initialData && !initialized) {
      loadData(initialData);
      setInitialized(true);
    }
  }, [initialData, initialized, loadData]);
  
  // Lancer la simulation automatiquement après chargement
  useEffect(() => {
    if (initialized && nodes.length > 0 && !layoutRunning && !layoutReady) {
      setTimeout(() => {
        runSimulation(nodes.length * 35 > 1000 ? 1000 : nodes.length * 35);
      }, 100);
    }
  }, [initialized, nodes.length, layoutRunning, layoutReady, runSimulation]);
  
  const stats = {
    total: nodes.length,
    entities: nodes.filter(n => n.type === 'Entity').length,
    events: nodes.filter(n => n.type === 'Event').length,
    contexts: nodes.filter(n => n.type === 'Context').length,
    visible: nodes.filter(n => filters[n.type]).length
  };
  
  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 shadow-lg px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <Network className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">NexReec Hybrid</h1>
              <p className="text-sm text-slate-400">
                ngraph.forcelayout3d + React Three Fiber
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Stats */}
            <div className="flex items-center gap-4 px-4 py-2 bg-slate-700/50 rounded-lg">
              <div className="text-center">
                <div className="text-xs text-slate-400">Visible</div>
                <div className="text-lg font-bold text-white">{stats.visible}</div>
              </div>
              <div className="w-px h-8 bg-slate-600"></div>
              <div className="text-center">
                <div className="text-xs text-blue-400">Entity</div>
                <div className="text-sm font-semibold text-white">{stats.entities}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-purple-400">Event</div>
                <div className="text-sm font-semibold text-white">{stats.events}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-green-400">Context</div>
                <div className="text-sm font-semibold text-white">{stats.contexts}</div>
              </div>
            </div>
            
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${
                showFilters 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
            <div className="flex items-center gap-6">
              <span className="text-sm font-semibold text-slate-300">Filtres par type :</span>
              
              {['Entity', 'Event', 'Context'].map(type => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters[type]}
                    onChange={() => toggleFilter(type)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="flex items-center gap-2 text-sm">
                    <span className={`w-3 h-3 rounded-full ${
                      type === 'Entity' ? 'bg-blue-500' :
                      type === 'Event' ? 'bg-purple-500' : 'bg-green-500'
                    }`}></span>
                    <span className="font-medium text-slate-300">{type}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

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
          <Canvas
            camera={{ position: [0, 50, 100], fov: 50 }}
            style={{ background: '#0f172a' }}
            gl={{ antialias: true, alpha: true }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                clearSelection();
              }
            }}
          >
            <Scene />
          </Canvas>
        )}

        {/* Info panel pour edge sélectionnée */}
        {selectedEdge && (
          <div className="absolute top-6 right-6 w-96 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden animate-in slide-in-from-right">
            <div className="p-6 bg-gradient-to-r from-slate-600 to-slate-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-white/80 text-sm font-medium uppercase tracking-wide mb-1">
                    Relation
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">
                    {selectedEdge.type || 'Connexion'}
                  </h2>
                  <div className="text-white/90 text-sm">
                    {nodes.find(n => n.id === selectedEdge.source)?.label} → {nodes.find(n => n.id === selectedEdge.target)?.label}
                  </div>
                </div>
                <button
                  onClick={clearSelection}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {selectedEdge.description && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                      Description
                    </h3>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-sm">
                    {selectedEdge.description}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">
                  Connexion
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Source</span>
                    <span className="font-medium text-slate-200">
                      {nodes.find(n => n.id === selectedEdge.source)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Cible</span>
                    <span className="font-medium text-slate-200">
                      {nodes.find(n => n.id === selectedEdge.target)?.label}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Type de relation</span>
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
            </div>
          </div>
        )}
        
        {/* Info panel pour node sélectionné */}
        {selectedNode && (
          <div className="absolute top-6 right-6 w-96 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden animate-in slide-in-from-right">
            <div className={`p-6 ${
              selectedNode.type === 'Entity' ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
              selectedNode.type === 'Event' ? 'bg-gradient-to-r from-purple-500 to-purple-600' :
              'bg-gradient-to-r from-green-500 to-green-600'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-white/80 text-sm font-medium uppercase tracking-wide mb-1">
                    {selectedNode.type}
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-1">
                    {selectedNode.label}
                  </h2>
                  <div className="text-white/90 text-sm">
                    {selectedNode.subtype}
                    {selectedNode.category && ` • ${selectedNode.category}`}
                  </div>
                </div>
                <button
                  onClick={clearSelection}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
              {selectedNode.summary && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                      Résumé
                    </h3>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-sm">
                    {selectedNode.summary}
                  </p>
                </div>
              )}

              {selectedNode.summaryDetailed && selectedNode.summaryDetailed !== selectedNode.summary && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">
                    Description détaillée
                  </h3>
                  <p className="text-slate-400 leading-relaxed text-sm">
                    {selectedNode.summaryDetailed}
                  </p>
                </div>
              )}

              {selectedNode.temporal?.start && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">
                    Période temporelle
                  </h3>
                  <div className="text-slate-400 text-sm">
                    {selectedNode.temporal.start}
                    {selectedNode.temporal.end && ` → ${selectedNode.temporal.end}`}
                  </div>
                </div>
              )}

              {selectedNode.locations?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">
                    Localisations
                  </h3>
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
                  <h3 className="text-sm font-semibold text-slate-300 mb-2">
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedNode.tags.map((tag, i) => (
                      <span key={i} className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs border border-blue-500/30">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-700">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Confidence</span>
                  <span className="font-medium text-slate-200">
                    {Math.round((selectedNode.confidence || 0) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Légende */}
        <div className="absolute bottom-6 left-6 bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 p-4">
          <div className="text-sm font-semibold text-slate-300 mb-3">Légende</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
              <span className="text-slate-400">Entity ({stats.entities})</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
              <span className="text-slate-400">Event ({stats.events})</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-4 h-4 bg-green-500 rounded-full"></div>
              <span className="text-slate-400">Context ({stats.contexts})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// EXPORT & EXEMPLE D'UTILISATION
// ============================================================================

export default NexReecGraph;

// Exemple d'utilisation :
/*
import NexReecGraph from './NexReecGraph';
import dataJSON from './data/epoque-moderne.json';

function App() {
  return <NexReecGraph initialData={dataJSON} />;
}
*/