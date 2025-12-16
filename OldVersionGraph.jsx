import React, { useEffect, useRef, useState } from 'react';
import { Network, Filter, Info, X, Move, ZoomIn } from 'lucide-react';

// Helper function to distribute nodes on a sphere using Fibonacci sphere algorithm
const generateSpherePositions = (count, radius) => {
  const positions = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = Math.PI * 2 * goldenRatio;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const inclination = Math.acos(1 - 2 * t); // angle from north pole (0 to Ï€)
    const azimuth = angleIncrement * i; // rotation around vertical axis

    const x = radius * Math.sin(inclination) * Math.cos(azimuth);
    const y = radius * Math.cos(inclination); // Y = vertical axis (up/down)
    const z = radius * Math.sin(inclination) * Math.sin(azimuth);

    positions.push({ x, y, z });
  }

  return positions;
};

// Generate sphere positions for 32 nodes
const sphereRadius = 5;
const sphereYOffset = 8; // Le groupe sera Ã  Y=8, pas besoin de l'ajouter aux positions
const spherePositions = generateSpherePositions(32, sphereRadius).map(pos => ({
  x: pos.x,
  y: pos.y, // Positions relatives au centre du groupe (0,0,0 local)
  z: pos.z
}));

// Sample data based on taxonomy v2.1
const SAMPLE_DATA = {
  nodes: [
    // Center: Napoleon (BIGGER)
    { 
      id: 'reec:napoleon', 
      label: 'NapolÃ©on Bonaparte',
      type: 'Entity',
      subtype: 'PersonnalitÃ©',
      category: 'Chef d\'Ã‰tat',
      summary: 'Empereur des FranÃ§ais de 1804 Ã  1814',
      position: { x: 0, y: 0, z: 0 }, // Centre du groupe (le groupe est Ã  Y=8 en monde)
      scale: 2.5 // Plus gros que les autres mais rÃ©duit
    },
    
    // All nodes distributed uniformly on sphere
    { 
      id: 'reec:waterloo', 
      label: 'Bataille de Waterloo',
      type: 'Event',
      subtype: 'Conflit',
      category: 'Bataille majeure',
      summary: 'DÃ©faite finale de NapolÃ©on en 1815',
      position: spherePositions[0],
      scale: 1.5
    },
    { 
      id: 'reec:wellington', 
      label: 'Duc de Wellington',
      type: 'Entity',
      subtype: 'PersonnalitÃ©',
      category: 'Militaire',
      position: spherePositions[1],
      scale: 1.5
    },
    { 
      id: 'reec:empire', 
      label: 'Premier Empire',
      type: 'Entity',
      subtype: 'Organisation',
      category: 'Ã‰tat',
      position: spherePositions[2],
      scale: 1.5
    },
    { 
      id: 'reec:france', 
      label: 'France',
      type: 'Entity',
      subtype: 'Lieu',
      category: 'Pays',
      position: spherePositions[3],
      scale: 1.5
    },
    { 
      id: 'reec:revolution', 
      label: 'RÃ©volution franÃ§aise',
      type: 'Event',
      subtype: 'Politique',
      category: 'RÃ©volution',
      position: spherePositions[4],
      scale: 1.5
    },
    { 
      id: 'reec:couronnement', 
      label: 'Couronnement de NapolÃ©on',
      type: 'Event',
      subtype: 'Politique',
      category: 'Couronnement',
      position: spherePositions[5],
      scale: 1.5
    },
    { 
      id: 'reec:guerres-napoleoniennes', 
      label: 'Guerres napolÃ©oniennes',
      type: 'Context',
      subtype: 'PÃ©riode',
      category: 'Ã‰poque historique',
      position: spherePositions[6],
      scale: 1.5
    },
    { 
      id: 'reec:europe-19', 
      label: 'Europe du XIXe siÃ¨cle',
      type: 'Context',
      subtype: 'GÃ©ographique',
      category: 'Continent',
      position: spherePositions[7],
      scale: 1.5
    },
    { 
      id: 'reec:josephine', 
      label: 'JosÃ©phine de Beauharnais',
      type: 'Entity',
      subtype: 'PersonnalitÃ©',
      category: 'ImpÃ©ratrice',
      position: spherePositions[8],
      scale: 1.5
    },
    { 
      id: 'reec:elbe', 
      label: 'ÃŽle d\'Elbe',
      type: 'Entity',
      subtype: 'Lieu',
      category: 'ÃŽle',
      position: spherePositions[9],
      scale: 1.5
    },
    { 
      id: 'reec:austerlitz', 
      label: 'Bataille d\'Austerlitz',
      type: 'Event',
      subtype: 'Conflit',
      category: 'Bataille',
      position: spherePositions[10],
      scale: 1.5
    },
    { 
      id: 'reec:code-civil', 
      label: 'Code Civil',
      type: 'Entity',
      subtype: 'Objet',
      category: 'TraitÃ©',
      position: spherePositions[11],
      scale: 1.5
    },
    { 
      id: 'reec:talleyrand', 
      label: 'Talleyrand',
      type: 'Entity',
      subtype: 'PersonnalitÃ©',
      category: 'Diplomate',
      position: spherePositions[12],
      scale: 1.5
    },
    { 
      id: 'reec:campagne-russie', 
      label: 'Campagne de Russie',
      type: 'Event',
      subtype: 'Conflit',
      category: 'Campagne militaire',
      position: spherePositions[13],
      scale: 1.5
    },
    { 
      id: 'reec:sainte-helene', 
      label: 'Sainte-HÃ©lÃ¨ne',
      type: 'Entity',
      subtype: 'Lieu',
      category: 'ÃŽle',
      position: spherePositions[14],
      scale: 1.5
    },
    { 
      id: 'reec:congres-vienne', 
      label: 'CongrÃ¨s de Vienne',
      type: 'Event',
      subtype: 'Politique',
      category: 'ConfÃ©rence',
      position: spherePositions[15],
      scale: 1.5
    },
    { 
      id: 'reec:coalition', 
      label: 'Coalitions anti-napolÃ©oniennes',
      type: 'Context',
      subtype: 'Politique',
      category: 'Alliance',
      position: spherePositions[16],
      scale: 1.5
    },
    { 
      id: 'reec:cent-jours', 
      label: 'Les Cent-Jours',
      type: 'Context',
      subtype: 'PÃ©riode',
      category: 'Ã‰poque',
      position: spherePositions[17],
      scale: 1.5
    },
    { 
      id: 'reec:legion-honneur', 
      label: 'LÃ©gion d\'honneur',
      type: 'Entity',
      subtype: 'Organisation',
      category: 'Ordre',
      position: spherePositions[18],
      scale: 1.5
    },
    { 
      id: 'reec:pyramides', 
      label: 'Bataille des Pyramides',
      type: 'Event',
      subtype: 'Conflit',
      category: 'Bataille',
      position: spherePositions[19],
      scale: 1.5
    },
    { 
      id: 'reec:egypte', 
      label: 'Campagne d\'Ã‰gypte',
      type: 'Event',
      subtype: 'Conflit',
      category: 'Campagne',
      position: spherePositions[20],
      scale: 1.5
    },
    { 
      id: 'reec:marie-louise', 
      label: 'Marie-Louise d\'Autriche',
      type: 'Entity',
      subtype: 'PersonnalitÃ©',
      category: 'ImpÃ©ratrice',
      position: spherePositions[21],
      scale: 1.5
    },
    { 
      id: 'reec:nelson', 
      label: 'Horatio Nelson',
      type: 'Entity',
      subtype: 'PersonnalitÃ©',
      category: 'Amiral',
      position: spherePositions[22],
      scale: 1.5
    },
    { 
      id: 'reec:trafalgar', 
      label: 'Bataille de Trafalgar',
      type: 'Event',
      subtype: 'Conflit',
      category: 'Bataille navale',
      position: spherePositions[23],
      scale: 1.5
    },
    { 
      id: 'reec:blucher', 
      label: 'BlÃ¼cher',
      type: 'Entity',
      subtype: 'PersonnalitÃ©',
      category: 'GÃ©nÃ©ral',
      position: spherePositions[24],
      scale: 1.5
    },
    { 
      id: 'reec:peninsule', 
      label: 'Guerre d\'Espagne',
      type: 'Event',
      subtype: 'Conflit',
      category: 'Guerre',
      position: spherePositions[25],
      scale: 1.5
    },
    { 
      id: 'reec:prusse', 
      label: 'Royaume de Prusse',
      type: 'Entity',
      subtype: 'Organisation',
      category: 'Ã‰tat',
      position: spherePositions[26],
      scale: 1.5
    },
    { 
      id: 'reec:autriche', 
      label: 'Empire d\'Autriche',
      type: 'Entity',
      subtype: 'Organisation',
      category: 'Ã‰tat',
      position: spherePositions[27],
      scale: 1.5
    },
    { 
      id: 'reec:angleterre', 
      label: 'Royaume-Uni',
      type: 'Entity',
      subtype: 'Organisation',
      category: 'Ã‰tat',
      position: spherePositions[28],
      scale: 1.5
    },
    { 
      id: 'reec:blocus', 
      label: 'Blocus continental',
      type: 'Context',
      subtype: 'Ã‰conomique',
      category: 'Politique',
      position: spherePositions[29],
      scale: 1.5
    },
    { 
      id: 'reec:louis18', 
      label: 'Louis XVIII',
      type: 'Entity',
      subtype: 'PersonnalitÃ©',
      category: 'Roi',
      position: spherePositions[30],
      scale: 1.5
    },
    { 
      id: 'reec:restauration', 
      label: 'Restauration',
      type: 'Context',
      subtype: 'PÃ©riode',
      category: 'Ã‰poque',
      position: spherePositions[31],
      scale: 1.5
    }
  ],
  edges: [
    // Napoleon center connections
    { source: 'reec:napoleon', target: 'reec:waterloo', relation: 'participe_Ã ' },
    { source: 'reec:napoleon', target: 'reec:wellington', relation: 'oppose_Ã ' },
    { source: 'reec:napoleon', target: 'reec:empire', relation: 'crÃ©e' },
    { source: 'reec:napoleon', target: 'reec:france', relation: 'dirige' },
    { source: 'reec:napoleon', target: 'reec:revolution', relation: 'influence' },
    { source: 'reec:napoleon', target: 'reec:couronnement', relation: 'participe_Ã ' },
    { source: 'reec:napoleon', target: 'reec:guerres-napoleoniennes', relation: 'mÃ¨ne' },
    { source: 'reec:napoleon', target: 'reec:josephine', relation: 'Ã©poux_de' },
    { source: 'reec:napoleon', target: 'reec:marie-louise', relation: 'Ã©poux_de' },
    { source: 'reec:napoleon', target: 'reec:elbe', relation: 'exilÃ©_Ã ' },
    { source: 'reec:napoleon', target: 'reec:sainte-helene', relation: 'exilÃ©_Ã ' },
    { source: 'reec:napoleon', target: 'reec:code-civil', relation: 'crÃ©e' },
    { source: 'reec:napoleon', target: 'reec:legion-honneur', relation: 'crÃ©e' },
    { source: 'reec:napoleon', target: 'reec:cent-jours', relation: 'participe_Ã ' },
    
    // Sphere interconnections
    { source: 'reec:wellington', target: 'reec:waterloo', relation: 'participe_Ã ' },
    { source: 'reec:waterloo', target: 'reec:guerres-napoleoniennes', relation: 'situÃ©_dans' },
    { source: 'reec:guerres-napoleoniennes', target: 'reec:europe-19', relation: 'situÃ©_dans' },
    { source: 'reec:france', target: 'reec:europe-19', relation: 'situÃ©_dans' },
    { source: 'reec:empire', target: 'reec:france', relation: 'basÃ©_Ã ' },
    { source: 'reec:couronnement', target: 'reec:empire', relation: 'fonde' },
    { source: 'reec:austerlitz', target: 'reec:guerres-napoleoniennes', relation: 'situÃ©_dans' },
    { source: 'reec:austerlitz', target: 'reec:napoleon', relation: 'concerne' },
    { source: 'reec:campagne-russie', target: 'reec:guerres-napoleoniennes', relation: 'situÃ©_dans' },
    { source: 'reec:campagne-russie', target: 'reec:napoleon', relation: 'concerne' },
    { source: 'reec:talleyrand', target: 'reec:napoleon', relation: 'conseille' },
    { source: 'reec:talleyrand', target: 'reec:congres-vienne', relation: 'participe_Ã ' },
    { source: 'reec:congres-vienne', target: 'reec:waterloo', relation: 'succÃ¨de_Ã ' },
    { source: 'reec:coalition', target: 'reec:napoleon', relation: 'oppose_Ã ' },
    { source: 'reec:coalition', target: 'reec:guerres-napoleoniennes', relation: 'situÃ©_dans' },
    { source: 'reec:cent-jours', target: 'reec:waterloo', relation: 'se_termine_par' },
    { source: 'reec:cent-jours', target: 'reec:elbe', relation: 'dÃ©bute_aprÃ¨s' },
    { source: 'reec:pyramides', target: 'reec:egypte', relation: 'situÃ©_dans' },
    { source: 'reec:egypte', target: 'reec:napoleon', relation: 'concerne' },
    { source: 'reec:nelson', target: 'reec:trafalgar', relation: 'participe_Ã ' },
    { source: 'reec:nelson', target: 'reec:napoleon', relation: 'oppose_Ã ' },
    { source: 'reec:trafalgar', target: 'reec:guerres-napoleoniennes', relation: 'situÃ©_dans' },
    { source: 'reec:blucher', target: 'reec:waterloo', relation: 'participe_Ã ' },
    { source: 'reec:blucher', target: 'reec:wellington', relation: 'alliÃ©_de' },
    { source: 'reec:peninsule', target: 'reec:guerres-napoleoniennes', relation: 'situÃ©_dans' },
    { source: 'reec:peninsule', target: 'reec:napoleon', relation: 'concerne' },
    { source: 'reec:prusse', target: 'reec:coalition', relation: 'membre_de' },
    { source: 'reec:prusse', target: 'reec:blucher', relation: 'basÃ©_Ã ' },
    { source: 'reec:autriche', target: 'reec:coalition', relation: 'membre_de' },
    { source: 'reec:autriche', target: 'reec:marie-louise', relation: 'originaire_de' },
    { source: 'reec:angleterre', target: 'reec:coalition', relation: 'membre_de' },
    { source: 'reec:angleterre', target: 'reec:wellington', relation: 'basÃ©_Ã ' },
    { source: 'reec:angleterre', target: 'reec:nelson', relation: 'basÃ©_Ã ' },
    { source: 'reec:blocus', target: 'reec:napoleon', relation: 'imposÃ©_par' },
    { source: 'reec:blocus', target: 'reec:angleterre', relation: 'vise' },
    { source: 'reec:louis18', target: 'reec:restauration', relation: 'rÃ¨gne_pendant' },
    { source: 'reec:louis18', target: 'reec:napoleon', relation: 'succÃ¨de_Ã ' },
    { source: 'reec:restauration', target: 'reec:empire', relation: 'succÃ¨de_Ã ' },
    { source: 'reec:restauration', target: 'reec:france', relation: 'situÃ©_dans' }
  ]
};

const NexReecGraph3D = () => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const spritesRef = useRef({});
  const linesRef = useRef([]);
  const animationRef = useRef(null);
  const gridRef = useRef(null);
  const nodesGroupRef = useRef(null); // Groupe contenant tous les nÅ“uds et lignes
  
  const [selectedNode, setSelectedNode] = useState(null);
  const [filters, setFilters] = useState({
    Entity: true,
    Event: true,
    Context: true
  });
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Orbital rotation control
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const groupRotation = useRef({ x: 0, y: 0 }); // Rotation du groupe de nÅ“uds
  const cameraOffset = useRef({ x: 0, y: 0, z: 0 }); // Offset pour panning du quadrillage (3D)
  const isRotatingNodes = useRef(false); // Flag pour savoir si on rotate les nÅ“uds
  const isRotatingCamera = useRef(false); // Flag pour rotation orbitale de camÃ©ra
  const cameraOrbit = useRef({ theta: 0, phi: Math.PI / 4 }); // Angles orbitaux camÃ©ra
  const cameraDistance = useRef(12); // Distance camÃ©ra du centre

  useEffect(() => {
    if (!containerRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.async = true;
    
    script.onload = () => {
      const THREE = window.THREE;
      
      // Scene setup - DARK MODE
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a); // Dark slate background
      sceneRef.current = scene;

      // Camera - Perspective pour voir le quadrillage 3D dessous
      const camera = new THREE.PerspectiveCamera(
        50,
        containerRef.current.clientWidth / containerRef.current.clientHeight,
        0.1,
        100
      );
      // Initialize camera position from orbital coordinates (theta=0, phi=Ï€/4, distance=12)
      const initTheta = 0;
      const initPhi = Math.PI / 4;
      const initDistance = 12;
      const center = new THREE.Vector3(0, 8, 0);
      
      camera.position.x = center.x + initDistance * Math.sin(initPhi) * Math.cos(initTheta);
      camera.position.y = center.y + initDistance * Math.cos(initPhi);
      camera.position.z = center.z + initDistance * Math.sin(initPhi) * Math.sin(initTheta);
      camera.lookAt(center);
      cameraRef.current = camera;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Simple ambient light only
      const ambientLight = new THREE.AmbientLight(0xffffff, 1);
      scene.add(ambientLight);

      // Create infinite grid with smaller cells - DARK MODE
      const createInfiniteGrid = () => {
        const gridSize = 200; // Much larger to never see edges
        const divisions = 400; // Smaller cells, more divisions
        const grid = new THREE.GridHelper(gridSize, divisions, 0x475569, 0x1e293b); // Dark slate colors
        grid.material.transparent = true;
        grid.material.opacity = 0.3; // Subtle in dark mode
        grid.position.y = -5; // Descendre le quadrillage sous la sphÃ¨re
        return grid;
      };

      const grid = createInfiniteGrid();
      grid.rotation.z = -Math.PI / 12; // Tilt grid backward (15 degrees)
      scene.add(grid);
      gridRef.current = grid;

      // Create a group to contain all nodes and lines (for rotation)
      const nodesGroup = new THREE.Group();
      nodesGroup.position.set(0, 8, 0); // Position at sphere center
      scene.add(nodesGroup);
      nodesGroupRef.current = nodesGroup;

      // Color mapping for node types - DARK MODE (lighter colors)
      const colorMap = {
        'Entity': '#60a5fa',     // Lighter blue
        'Event': '#c084fc',      // Lighter purple
        'Context': '#34d399'     // Lighter green
      };

      // Create 2D circular node sprites
      const createNodeSprite = (nodeData) => {
        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size * 0.4;

        // Draw circle with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 5;
        
        // Single colored circle (no white inner circle)
        ctx.fillStyle = colorMap[nodeData.type];
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw label - white text on colored background
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#ffffff'; // White text
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Split label into words and draw on multiple lines if needed
        const words = nodeData.label.split(' ');
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
          ctx.font = 'bold 20px Arial';
        }
        
        lines.forEach((line, i) => {
          ctx.fillText(line, centerX, yStart + i * lineHeight);
        });

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
          map: texture,
          transparent: true,
          depthTest: true,
          depthWrite: true,
          alphaTest: 0.1 // Ignore pixels with alpha < 0.1 to avoid square artifacts
        });
        const sprite = new THREE.Sprite(material);
        
        // Scale will be set when creating the node
        
        return sprite;
      };

      // Create nodes
      SAMPLE_DATA.nodes.forEach(nodeData => {
        const sprite = createNodeSprite(nodeData);
        sprite.position.set(
          nodeData.position.x,
          nodeData.position.y, // Use actual Y from sphere
          nodeData.position.z
        );
        // Use node scale (Napoleon is bigger)
        const scale = nodeData.scale || 1.5; // RÃ©duire taille par dÃ©faut
        sprite.scale.set(scale, scale, 1);
        
        // Store all data including base position for panning
        sprite.userData = {
          ...nodeData,
          basePosition: {
            x: nodeData.position.x,
            y: nodeData.position.y, // Use actual Y from sphere
            z: nodeData.position.z
          }
        };
        nodesGroup.add(sprite); // Add to group instead of scene
        spritesRef.current[nodeData.id] = sprite;
      });

      // Helper function to calculate edge point of a node
      const getNodeEdgePoint = (fromPos, toPos, nodeScale) => {
        const nodeRadius = nodeScale * 0.6; // Approximate visual radius
        const direction = new THREE.Vector3(
          toPos.x - fromPos.x,
          toPos.y - fromPos.y,
          toPos.z - fromPos.z
        ).normalize();
        
        return new THREE.Vector3(
          fromPos.x + direction.x * nodeRadius,
          fromPos.y + direction.y * nodeRadius,
          fromPos.z + direction.z * nodeRadius
        );
      };

      // Create connection lines
      SAMPLE_DATA.edges.forEach(edge => {
        const sourceSprite = spritesRef.current[edge.source];
        const targetSprite = spritesRef.current[edge.target];
        
        if (sourceSprite && targetSprite) {
          const sourceScale = sourceSprite.scale.x;
          const targetScale = targetSprite.scale.x;
          
          // Calculate edge points instead of center points
          const sourceEdge = getNodeEdgePoint(
            sourceSprite.position,
            targetSprite.position,
            sourceScale
          );
          const targetEdge = getNodeEdgePoint(
            targetSprite.position,
            sourceSprite.position,
            targetScale
          );
          
          const material = new THREE.LineBasicMaterial({
            color: 0x475569, // Dark slate for dark mode
            opacity: 0.4,
            transparent: true,
            linewidth: 2
          });
          
          const points = [sourceEdge, targetEdge];
          
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, material);
          nodesGroup.add(line); // Add to group instead of scene
          linesRef.current.push(line);
        }
      });

      // Helper: Check if mouse is within rotation zone (radius 5 around sphere center)
      const isMouseOverNode = (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        
        // Check intersection with a sphere of radius 5 around center (0, 8, 0)
        const sphereCenter = new THREE.Vector3(
          nodesGroupRef.current.position.x,
          8,
          nodesGroupRef.current.position.z
        );
        const sphereRadius = 5; // Match the nodes distribution radius
        
        // Ray-sphere intersection test
        const ray = raycaster.ray;
        const centerToRay = ray.origin.clone().sub(sphereCenter);
        const a = ray.direction.lengthSq();
        const b = 2 * centerToRay.dot(ray.direction);
        const c = centerToRay.lengthSq() - sphereRadius * sphereRadius;
        const discriminant = b * b - 4 * a * c;
        
        return discriminant >= 0; // Intersection exists
      };

      // Update camera position from orbital coordinates
      const updateCameraOrbit = () => {
        const theta = cameraOrbit.current.theta;
        const phi = cameraOrbit.current.phi;
        const distance = cameraDistance.current;
        
        // Center follows all panning offsets (X, Y, Z)
        const center = new THREE.Vector3(
          cameraOffset.current.x,
          8 + cameraOffset.current.y,
          cameraOffset.current.z
        );
        
        // Spherical to Cartesian coordinates
        camera.position.x = center.x + distance * Math.sin(phi) * Math.cos(theta);
        camera.position.y = center.y + distance * Math.cos(phi);
        camera.position.z = center.z + distance * Math.sin(phi) * Math.sin(theta);
        
        camera.lookAt(center);
      };

      // Camera orbital rotation control
      const onMouseDown = (event) => {
        isDragging.current = true;
        previousMousePosition.current = {
          x: event.clientX,
          y: event.clientY
        };
        
        // Determine mode based on mouse position and Shift key
        const overNode = isMouseOverNode(event);
        const shiftPressed = event.shiftKey;
        
        if (overNode) {
          // MODE 1: Over node = rotate nodes group
          isRotatingNodes.current = true;
          isRotatingCamera.current = false;
        } else if (shiftPressed) {
          // MODE 2: Empty space + Shift = rotate camera orbit
          isRotatingNodes.current = false;
          isRotatingCamera.current = true;
        } else {
          // MODE 3: Empty space + no Shift = pan grid
          isRotatingNodes.current = false;
          isRotatingCamera.current = false;
        }
      };

      const onMouseMove = (event) => {
        if (!isDragging.current) return;

        const deltaX = event.clientX - previousMousePosition.current.x;
        const deltaY = event.clientY - previousMousePosition.current.y;

        // Detect actual drag movement
        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
          containerRef.current.hasDragged = true;
        }

        if (isRotatingNodes.current) {
          // MODE 1: Rotate the nodes group (when over a node)
          const rotationSpeed = 0.015; // Increased for more freedom
          groupRotation.current.y -= deltaY * rotationSpeed; // Vertical mouse = Y rotation
          groupRotation.current.x -= deltaX * rotationSpeed; // Horizontal mouse = X rotation
          
          // Apply rotation to the group
          if (nodesGroupRef.current) {
            nodesGroupRef.current.rotation.y = groupRotation.current.y;
            nodesGroupRef.current.rotation.x = groupRotation.current.x;
          }
        } else if (isRotatingCamera.current) {
          // MODE 2: Rotate camera orbit (empty space + Shift)
          const rotationSpeed = 0.01; // Increased for more freedom
          cameraOrbit.current.phi -= deltaY * rotationSpeed;
          cameraOrbit.current.theta -= deltaX * rotationSpeed;
          
          // No clamping - allow full 360Â° rotation
          
          updateCameraOrbit();
        } else {
          // MODE 3: Pan the grid (empty space, no Shift)
          const panSpeed = 0.05; // Increased for more freedom
          
          // Check if Ctrl or Alt is pressed for vertical panning
          const verticalPan = event.ctrlKey || event.altKey;
          
          if (verticalPan) {
            // Vertical panning (Y axis)
            cameraOffset.current.y -= deltaY * panSpeed; // Inverted for natural feeling
          } else {
            // Horizontal panning (X and Z)
            cameraOffset.current.x += deltaY * panSpeed;
            cameraOffset.current.z += deltaX * panSpeed;
          }

          // Move grid
          if (gridRef.current) {
            gridRef.current.position.x = cameraOffset.current.x;
            gridRef.current.position.z = cameraOffset.current.z;
            gridRef.current.position.y = -5 + cameraOffset.current.y; // Base Y + offset
          }

          // Move entire nodes group with the grid
          if (nodesGroupRef.current) {
            nodesGroupRef.current.position.x = cameraOffset.current.x;
            nodesGroupRef.current.position.z = cameraOffset.current.z;
            nodesGroupRef.current.position.y = 8 + cameraOffset.current.y; // Base Y + offset
          }
        }

        previousMousePosition.current = {
          x: event.clientX,
          y: event.clientY
        };
      };

      const onMouseUp = () => {
        isDragging.current = false;
      };

      const onMouseClick = (event) => {
        // Don't select if we just dragged
        if (containerRef.current.hasDragged) {
          containerRef.current.hasDragged = false;
          return;
        }

        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        
        const sprites = Object.values(spritesRef.current);
        const intersects = raycaster.intersectObjects(sprites);

        if (intersects.length > 0) {
          const clickedSprite = intersects[0].object;
          setSelectedNode(clickedSprite.userData);
          
          // Highlight selected
          sprites.forEach(s => {
            s.material.opacity = 0.5;
          });
          clickedSprite.material.opacity = 1.0;
        } else {
          setSelectedNode(null);
          sprites.forEach(s => {
            s.material.opacity = 1.0;
          });
        }
      };

      const onWheel = (event) => {
        event.preventDefault();
        
        // Radial zoom - update distance and recalculate position
        const zoomSpeed = 0.5;
        const delta = event.deltaY > 0 ? zoomSpeed : -zoomSpeed;
        
        // Update distance with clamping
        cameraDistance.current = Math.max(8, Math.min(25, cameraDistance.current + delta));
        
        // Update camera position using orbital coordinates
        updateCameraOrbit();
      };

      renderer.domElement.addEventListener('mousedown', onMouseDown);
      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('mouseup', onMouseUp);
      renderer.domElement.addEventListener('click', onMouseClick);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

      setLoading(false);

      // Animation loop
      const animate = () => {
        animationRef.current = requestAnimationFrame(animate);

        // No depth scaling - nodes stay fixed size

        renderer.render(scene, camera);
      };
      animate();

      // Handle resize
      const handleResize = () => {
        if (!containerRef.current) return;
        camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        renderer.domElement.removeEventListener('mousedown', onMouseDown);
        renderer.domElement.removeEventListener('mousemove', onMouseMove);
        renderer.domElement.removeEventListener('mouseup', onMouseUp);
        renderer.domElement.removeEventListener('click', onMouseClick);
        renderer.domElement.removeEventListener('wheel', onWheel);
      };
    };

    document.head.appendChild(script);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (rendererRef.current && containerRef.current && containerRef.current.contains(rendererRef.current.domElement)) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);

  const toggleFilter = (type) => {
    setFilters(prev => ({ ...prev, [type]: !prev[type] }));
    
    Object.values(spritesRef.current).forEach(sprite => {
      if (sprite.userData.type === type) {
        sprite.visible = !filters[type];
      }
    });

    // Update lines visibility
    linesRef.current.forEach(line => {
      line.visible = true;
    });
  };

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col">
      <div className="bg-slate-800 border-b border-slate-700 shadow-lg px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <Network className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">NexReec Graph</h1>
              <p className="text-sm text-slate-400">Graphe de connaissances interactif</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm border border-blue-500/30">
              <Move className="w-4 h-4" />
              <span>NÅ“ud = rotation | Shift = vue | Ctrl/Alt = hauteur</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 text-purple-400 rounded-lg text-sm border border-purple-500/30">
              <ZoomIn className="w-4 h-4" />
              <span>Molette = zoom 360Â°</span>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
            <div className="flex items-center gap-6">
              <span className="text-sm font-semibold text-slate-300">Filtres par type :</span>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.Entity}
                  onChange={() => toggleFilter('Entity')}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                  <span className="font-medium text-slate-300">Entity</span>
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.Event}
                  onChange={() => toggleFilter('Event')}
                  className="w-4 h-4 text-purple-600 rounded"
                />
                <span className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                  <span className="font-medium text-slate-300">Event</span>
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.Context}
                  onChange={() => toggleFilter('Context')}
                  className="w-4 h-4 text-green-600 rounded"
                />
                <span className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                  <span className="font-medium text-slate-300">Context</span>
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-10">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-300 font-medium">Initialisation du graphe...</p>
            </div>
          </div>
        )}

        <div ref={containerRef} className="flex-1 cursor-grab active:cursor-grabbing" />

        {selectedNode && (
          <div className="absolute top-6 right-6 w-96 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
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
                  {selectedNode.subtype && (
                    <div className="text-white/90 text-sm">
                      {selectedNode.subtype}
                      {selectedNode.category && ` â€¢ ${selectedNode.category}`}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedNode(null);
                    Object.values(spritesRef.current).forEach(s => {
                      s.material.opacity = 1.0;
                    });
                  }}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {selectedNode.summary && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                      RÃ©sumÃ©
                    </h3>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    {selectedNode.summary}
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Network className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                    Informations
                  </h3>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Type</span>
                    <span className="font-medium text-slate-200">{selectedNode.type}</span>
                  </div>
                  {selectedNode.subtype && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Sous-type</span>
                      <span className="font-medium text-slate-200">{selectedNode.subtype}</span>
                    </div>
                  )}
                  {selectedNode.category && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">CatÃ©gorie</span>
                      <span className="font-medium text-slate-200">{selectedNode.category}</span>
                    </div>
                  )}
                </div>
              </div>

              <button className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/25">
                Explorer les relations
              </button>
            </div>
          </div>
        )}

        <div className="absolute bottom-6 left-6 bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 p-4">
          <div className="text-sm font-semibold text-slate-300 mb-3">LÃ©gende</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
              <span className="text-slate-400">Entity</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
              <span className="text-slate-400">Event</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-4 h-4 bg-green-500 rounded-full"></div>
              <span className="text-slate-400">Context</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NexReecGraph3D;