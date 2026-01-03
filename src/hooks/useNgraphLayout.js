import { useState, useRef, useEffect, useCallback } from 'react';
import createGraph from 'ngraph.graph';
import forceLayout3d from 'ngraph.forcelayout3d';
import useGraphStore from '../store/useGraphStore';

const useNgraphLayout = () => {
  const nodes = useGraphStore(state => state.nodes);
  const edges = useGraphStore(state => state.edges);
  const filters = useGraphStore(state => state.filters);
  const layoutMode = useGraphStore(state => state.layoutMode);
  const setPositions = useGraphStore(state => state.setPositions);
  const setLayoutRunning = useGraphStore(state => state.setLayoutRunning);
  const setLayoutProgress = useGraphStore(state => state.setLayoutProgress);
  const setLayoutReady = useGraphStore(state => state.setLayoutReady);

  const [layout, setLayout] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const animationRef = useRef(null);
  const graphRef = useRef(null);
  const previousNodesRef = useRef([]);
  
  // Initialize or update ngraph
  useEffect(() => {
    if (nodes.length === 0) {
      graphRef.current = null;
      setLayout(null);
      setIsInitialized(false);
      return;
    }
    
    const { positions: currentPositions } = useGraphStore.getState();
    
    // Si pas de graphe, en créer un nouveau
    if (!graphRef.current) {
      graphRef.current = createGraph();
    }
    
    const graph = graphRef.current;
    
    // Calculer le nombre de relations directes pour chaque node
    const connectionCounts = {};
    edges.forEach(edge => {
      connectionCounts[edge.source] = (connectionCounts[edge.source] || 0) + 1;
      connectionCounts[edge.target] = (connectionCounts[edge.target] || 0) + 1;
    });
    
    // Obtenir les IDs actuels et précédents
    // Un node doit rester dans la simulation si le filtre global est activé
    const shouldIncludeNode = (node) => {
      return filters[node.type];
    };
    
    const filteredNodes = nodes.filter(shouldIncludeNode);
    const currentNodeIds = new Set(filteredNodes.map(n => n.id));
    const previousNodeIds = new Set(previousNodesRef.current.map(n => n.id));
    
    // Ajouter les nouveaux nodes
    nodes.forEach(node => {
      if (shouldIncludeNode(node) && !previousNodeIds.has(node.id)) {
        const connections = connectionCounts[node.id] || 1;
        const mass = 1 + Math.log(connections) * 0.5;
        graph.addNode(node.id, { ...node, mass });
      }
    });
    
    // Supprimer les nodes qui n'existent plus
    previousNodesRef.current.forEach(oldNode => {
      if (!currentNodeIds.has(oldNode.id) && graph.hasNode(oldNode.id)) {
        graph.removeNode(oldNode.id);
      }
    });
    
    // Nettoyer les anciennes edges
    graph.forEachLink(link => {
      const sourceExists = currentNodeIds.has(link.fromId);
      const targetExists = currentNodeIds.has(link.toId);
      if (!sourceExists || !targetExists) {
        graph.removeLink(link);
      }
    });
    
    // Ajouter les nouvelles edges
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode && shouldIncludeNode(sourceNode) && shouldIncludeNode(targetNode)) {
        if (!graph.hasLink(edge.source, edge.target)) {
          graph.addLink(edge.source, edge.target);
        }
      }
    });
    
    // Créer ou mettre à jour le layout 3D
    // On ne recrée le layout que si nécessaire (pas de layout ou changement du nombre de nodes)
    const nodesCountChanged = filteredNodes.length !== previousNodesRef.current.length;
    
    if (!layout || nodesCountChanged) {
      const layoutInstance = forceLayout3d(graph, {
        springLength: 30,
        springCoeff: 0.001,
        gravity: -2,
        theta: 0.5,
        dragCoeff: 0.01,
        timeStep: 10,
        nodeMass: (nodeId) => {
          const node = graph.getNode(nodeId);
          return node?.data?.mass || 1;
        }
      });
      
      // Restaurer les positions existantes
      if (Object.keys(currentPositions).length > 0) {
        const { pinnedNodes } = useGraphStore.getState();
        layoutInstance.forEachBody((body, nodeId) => {
          if (currentPositions[nodeId]) {
            body.pos.x = currentPositions[nodeId].x;
            body.pos.y = currentPositions[nodeId].y;
            body.pos.z = currentPositions[nodeId].z;
            // Restaurer l'état de pin manuel, ou pinner si on n'est pas en mode force
            body.pinned = pinnedNodes.has(nodeId) || layoutMode !== 'force';
          }
        });
      }
      
      setLayout(layoutInstance);
      setIsInitialized(true);
    }
    
    // Mettre à jour la référence des nodes précédents
    previousNodesRef.current = filteredNodes;
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes, edges, filters, layoutMode]);

  // Appliquer un layout alternatif quand le mode change
  useEffect(() => {
    if (!layout || layoutMode === 'force') return;

    const newPositions = {};
    const nodeIds = nodes.map(n => n.id);
    const count = nodeIds.length;

    if (layoutMode === 'circular') {
      const radius = Math.max(100, count * 3); // Réduit
      nodeIds.forEach((id, i) => {
        const angle = (i / count) * Math.PI * 2;
        newPositions[id] = {
          x: Math.cos(angle) * radius,
          y: 0,
          z: Math.sin(angle) * radius
        };
      });
    } 
    else if (layoutMode === 'hierarchical') {
      const { nodeLayersMap, maxLayers } = useGraphStore.getState();
      const layers = {};
      nodeIds.forEach(id => {
        const l = nodeLayersMap[id] || 0;
        if (!layers[l]) layers[l] = [];
        layers[l].push(id);
      });

      Object.entries(layers).forEach(([layer, ids]) => {
        const l = parseInt(layer);
        const r = ids.length * 5 + 50; // Réduit
        ids.forEach((id, i) => {
          const angle = (i / ids.length) * Math.PI * 2;
          newPositions[id] = {
            x: Math.cos(angle) * r,
            y: -l * 80, // Réduit
            z: Math.sin(angle) * r
          };
        });
      });
    }
    else if (layoutMode === 'temporal') {
      // Trouver min/max dates
      let minTime = Infinity;
      let maxTime = -Infinity;
      const nodeDates = {};

      nodes.forEach(n => {
        const dateStr = n.temporal?.start || n.temporal?.date;
        if (dateStr) {
          const t = new Date(dateStr).getTime();
          if (!isNaN(t)) {
            nodeDates[n.id] = t;
            if (t < minTime) minTime = t;
            if (t > maxTime) maxTime = t;
          }
        }
      });

      if (minTime === Infinity) minTime = 0, maxTime = 1;
      const range = maxTime - minTime || 1;
      const width = Math.max(500, count * 10); // Réduit

      nodeIds.forEach((id, i) => {
        const t = nodeDates[id];
        const x = t !== undefined ? ((t - minTime) / range) * width - width/2 : 0;
        // Répartir en spirale autour de l'axe X pour éviter les collisions
        const angle = i * 0.5;
        const r = 40; // Réduit
        newPositions[id] = {
          x: x,
          y: Math.cos(angle) * r,
          z: Math.sin(angle) * r
        };
      });
    }
    else if (layoutMode === 'cluster') {
      const clusters = {};
      nodes.forEach(n => {
        const c = n.type || 'Other';
        if (!clusters[c]) clusters[c] = [];
        clusters[c].push(n.id);
      });

      const clusterIds = Object.keys(clusters);
      const clusterCount = clusterIds.length;
      const clusterRadius = Math.max(200, count * 3); // Réduit

      clusterIds.forEach((cId, ci) => {
        const cAngle = (ci / clusterCount) * Math.PI * 2;
        const cx = Math.cos(cAngle) * clusterRadius;
        const cz = Math.sin(cAngle) * clusterRadius;
        
        const ids = clusters[cId];
        const r = ids.length * 4 + 30; // Réduit
        ids.forEach((id, i) => {
          const angle = (i / ids.length) * Math.PI * 2;
          newPositions[id] = {
            x: cx + Math.cos(angle) * r,
            y: (Math.random() - 0.5) * 50,
            z: cz + Math.sin(angle) * r
          };
        });
      });
    }

    // Appliquer les positions au layout physique et au store
    layout.forEachBody((body, nodeId) => {
      if (newPositions[nodeId]) {
        body.pos.x = newPositions[nodeId].x;
        body.pos.y = newPositions[nodeId].y;
        body.pos.z = newPositions[nodeId].z;
        body.velocity.x = 0;
        body.velocity.y = 0;
        body.velocity.z = 0;
        // Pinner les nodes dans les layouts statiques
        body.pinned = true;
      }
    });

    setPositions(newPositions);
    setLayoutReady(true);
    
    // Arrêter la simulation si on n'est pas en mode force
    if (layoutMode !== 'force') {
      const { setSimulationPaused } = useGraphStore.getState();
      setSimulationPaused(true);
      stopSimulation();
    }
  }, [layoutMode, layout, nodes]);
  
  // Simuler le layout
  const runSimulation = useCallback((iterations = 400) => {
    if (!layout) {
      console.warn('Layout not ready, skipping simulation');
      // Si le layout n'est pas prêt, marquer quand même comme prêt pour éviter de bloquer l'UI
      setLayoutReady(true);
      return;
    }
    
    setLayoutRunning(true);
    setLayoutProgress(0);
    let step = 0;
    const animationStartThreshold = Math.min(iterations / 10, 50);
    
    // Phase initiale : quelques itérations pour stabiliser
    const simulate = () => {
      if (step < iterations) {
        layout.step();
        step++;
        setLayoutProgress((step / iterations) * 100);
        
        // Afficher dès le seuil atteint
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
          
          // Marquer comme prêt (une seule fois)
          if (step === Math.ceil(animationStartThreshold)) {
            setLayoutReady(true);
          }
        }
        
        animationRef.current = requestAnimationFrame(simulate);
      } else {
        // Fin de la phase initiale - passer en mode simulation continue
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
        setLayoutReady(true); // S'assurer que c'est à true
        // La simulation continue maintenant via useFrame
      }
    };
    
    simulate();
  }, [layout, setLayoutRunning, setLayoutProgress, setPositions, setLayoutReady]);
  
  const stopSimulation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setLayoutRunning(false);
  }, [setLayoutRunning]);
  
  return { runSimulation, stopSimulation, layout, isInitialized };
};

export default useNgraphLayout;
