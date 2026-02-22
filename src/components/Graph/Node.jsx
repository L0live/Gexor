import React, { useRef, useMemo, useState } from 'react';
import { Billboard, Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';
import { COLOR_MAP } from '../../constants/graphConstants';
import { getRadialDisplayPos } from '../../utils/radialLayout';

// Generics textures cache for LoD
const lodTextures = {};

const getLodTexture = (type) => {
  const color = COLOR_MAP[type] || COLOR_MAP['Default'];
  if (lodTextures[color]) return lodTextures[color];

  const canvas = document.createElement('canvas');
  const size = 128; 
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.4; // Retour à 0.4 pour garder la taille visuelle originale

  // Suppression de l'ombre pour correspondre aux nodes instanciés plus vifs
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  lodTextures[color] = new THREE.CanvasTexture(canvas);
  return lodTextures[color];
};

const borderTextures = {};
const getBorderTexture = (type) => {
  const color = COLOR_MAP[type] || COLOR_MAP['Default'];
  if (borderTextures[color]) return borderTextures[color];

  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.41; // Slightly larger for the stroke

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12; // Thick enough to be seen
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  borderTextures[color] = new THREE.CanvasTexture(canvas);
  return borderTextures[color];
};

const Node = ({ node, position, onClick, visible, isSelected, onDragStart, onDragEnd, isDragging, isPinned, filterMode, opacityLevel, totalNodes = 100 }) => {
  const spriteRef = useRef();
  const billboardRef = useRef();
  const dragStartInfo = useRef(null);
  const { camera } = useThree();
  const [lodLevel, setLodLevel] = useState(0); // 0: Close (Label), 1: Far (Circle only)
  const [hovered, setHovered] = useState(false);
  const [shouldShow, setShouldShow] = useState(true);
  const globalHoveredNodeId = useGraphStore(state => state.hoveredNodeId);
  const setGlobalHoveredNodeId = useGraphStore(state => state.setHoveredNodeId);
  
  // Le node est considéré survolé soit via ses propres événements (Billboard), 
  // soit via l'instancier (Global store)
  const isHovered = hovered || globalHoveredNodeId === node.id;
  
  const lodAlpha = useRef(1); // 1: Full High Detail, 0: Full Low Detail
  const [inFrustum, setInFrustum] = useState(true);
  const [distanceToCamera, setDistanceToCamera] = useState(0);
  
  const highResMatRef = useRef();
  const lowResMatRef = useRef();
  const borderMatRef = useRef();

  // Calculez les seuils adaptatifs basés sur le nombre total de nodes
  // Plus il y a de nodes, plus on passe vite en LoD 1
  const lodThreshold = useMemo(() => {
    const factor = Math.max(0.2, 1 - (totalNodes / 1000));
    return 400 * factor;
  }, [totalNodes]);

  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const nodePosition = useMemo(() => new THREE.Vector3(), []);
  const boundingSphere = useMemo(() => new THREE.Sphere(), []);

  useFrame((state) => {
    if (!billboardRef.current || !visible) return;

    // Get position from store positions (layout runs in Web Worker)
    const storeState = useGraphStore.getState();
    let rawPos = storeState.positions[node.id] || position;
    if (rawPos) {
      // Radial plugin: blend display position toward radial target (pure visual)
      const displayPos = getRadialDisplayPos(node.id, rawPos, storeState);
      nodePosition.set(displayPos.x, displayPos.y, displayPos.z);
    }
    
    // Forcer la position du Billboard directement
    if (billboardRef.current) {
        billboardRef.current.position.copy(nodePosition);
    }
    
    const scale = getScale();

    // 1. Check distance and update Alpha
    const dist = state.camera.position.distanceTo(nodePosition);
    if (Math.abs(dist - distanceToCamera) > 10) {
      setDistanceToCamera(dist);
    }
    
    // LoD Hybride : Si on est trop loin, le composant React (étiquette) se cache totalement 
    // pour laisser l'InstancedNode prendre le relais.
    const isCloseEnough = dist <= lodThreshold || isSelected || isDragging || isHovered;
    if (shouldShow !== isCloseEnough) {
        setShouldShow(isCloseEnough);
    }
    
    if (!isCloseEnough) return;

    // On force le mode détaillé (targetAlpha = 1) si selectionné, draggé ou survolé
    const targetAlpha = (dist > lodThreshold * 0.8 && !isSelected && !isDragging && !isHovered) ? 0 : 1;
    
    // Lerp pour transition douce
    lodAlpha.current = THREE.MathUtils.lerp(lodAlpha.current, targetAlpha, 0.1);

    // Mettre à jour les opacités et le highlight (brightness)
    const clampedOpacity = Math.min(1.0, opacityLevel);
    // Le brightness est désormais appliqué uniquement au contour (border)
    const borderOpacity = opacityLevel > 1.0 ? Math.min(1.0, (opacityLevel - 1.0) * 2.0) : 0;

    if (highResMatRef.current) {
        highResMatRef.current.opacity = lodAlpha.current * clampedOpacity;
        highResMatRef.current.visible = highResMatRef.current.opacity > 0.001;
        // On remet la couleur à blanc (normal)
        highResMatRef.current.color.setRGB(1, 1, 1);
    }
    if (lowResMatRef.current) {
        lowResMatRef.current.opacity = clampedOpacity;
        lowResMatRef.current.visible = lowResMatRef.current.opacity > 0.001;
        lowResMatRef.current.color.setRGB(1, 1, 1);
    }
    if (borderMatRef.current) {
        borderMatRef.current.opacity = borderOpacity;
        borderMatRef.current.visible = borderOpacity > 0.001;
    }

    // On ne change le lodLevel d'état (pour le useMemo texture) qu'aux extrêmes
    if (lodAlpha.current > 0.05 && lodLevel !== 0) setLodLevel(0);
    if (lodAlpha.current < 0.05 && lodLevel !== 1) setLodLevel(1);

    // 2. Frustum Culling avec marge (Bounding Sphere)
    projScreenMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    boundingSphere.center.copy(nodePosition);
    boundingSphere.radius = scale * 0.5; // Rayon approximatif du sprite

    const isIn = frustum.intersectsSphere(boundingSphere);
    if (isIn !== inFrustum) setInFrustum(isIn);
  });
  
  // Créer le canvas texture- seulement si on a besoin du High Detail
  const texture = useMemo(() => {
    if (lodLevel !== 0 && !isSelected && !isDragging && !isHovered) return null;
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size * 0.4;

    // Draw label - white text on transparent background (Circle is handled by lowResTexture)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Split label into words and draw on multiple lines if needed
    const words = node.label.split(' ');
    const maxWidth = radius * 1.7;
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
    
    lines.forEach((line) => {
      ctx.fillText(line, centerX, yStart);
      yStart += lineHeight;
    });

    return new THREE.CanvasTexture(canvas);
  }, [node.label, node.type, lodLevel]);

  const lowResTexture = useMemo(() => getLodTexture(node.type), [node.type]);
  const borderTexture = useMemo(() => getBorderTexture(node.type), [node.type]);
  
  // Créer la texture de l'icône de pin
  const pinTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Dessiner une forme de pin blanche avec rotation de -45 degrés
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    
    const centerX = size / 2;
    const centerY = size / 2;
    
    // Appliquer la rotation au contexte
    ctx.translate(centerX, centerY);
    ctx.rotate(Math.PI / 4); // -45 degrés
    ctx.translate(-centerX, -centerY);
    
    // Tête du pin (cercle)
    ctx.beginPath();
    ctx.arc(centerX, centerY - 4, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Corps du pin (rectangle)
    ctx.fillRect(centerX - 3, centerY + 4, 8, 16);

    return new THREE.CanvasTexture(canvas);
  }, []);
  
  const getScale = () => {
    // Scale basé sur la confiance
    const baseScale = 15;
    const confianceMultiplier = node.confiance || 0.8;
    return baseScale * confianceMultiplier * (isSelected ? 1.2 : 1.0) * (isDragging ? 1.3 : 1.0);
  };
  
  const lastPointerDownTime = useRef(0);
  
  const handlePointerDown = (e) => {
    e.stopPropagation();
    const now = Date.now();
    // Détection manuelle du double-clic car e.detail peut être imprécis dans R3F
    if (now - lastPointerDownTime.current < 400 && now - lastPointerDownTime.current > 0) {
      onDragStart(node.id, e.clientX, e.clientY);
    }
    lastPointerDownTime.current = now;
  };
  
  // Pas besoin de onPointerMove ici - géré via useFrame dans Scene
  
  const handlePointerUp = (e) => {
    e.stopPropagation();
    dragStartInfo.current = null;
  };
  
  if (!position) return null;
  
  const scale = getScale();
  
  // On rendu quand même le Billboard pour que le useFrame puisse prendre le relais
  // même si la prop position initiale est absente
  const initialPos = position ? [position.x, position.y, position.z] : [0, 0, 0];

  return (
    <Billboard
      ref={billboardRef}
      position={initialPos}
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
      visible={visible && inFrustum && shouldShow && opacityLevel > 0.001}
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        setGlobalHoveredNodeId(node.id); // Sync with store
        document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        setGlobalHoveredNodeId(null); // Sync with store
        document.body.style.cursor = 'default';
      }}
    >
      {/* High Res Sprite (Label) */}
      {texture && (
        <sprite
          ref={spriteRef}
          scale={[scale, scale, 1]}
          renderOrder={10}
        >
          <spriteMaterial
            ref={highResMatRef}
            map={texture}
            transparent={true}
            depthTest={true}
            depthWrite={true}
            alphaTest={0.001}
            opacity={opacityLevel}
            toneMapped={false}
          />
        </sprite>
      )}
      
      <sprite
          scale={[scale, scale, 1]}
          renderOrder={9}
      >
          <spriteMaterial
              ref={lowResMatRef}
              map={lowResTexture}
              transparent={true}
              depthTest={true}
              depthWrite={true}
              alphaTest={0.001}
              opacity={opacityLevel * 0.9} // Légère transparence pour matcher l'instancier
              visible={true}
              toneMapped={false}
          />
      </sprite>
      {/* Contour Glow (Highlight) */}
      <sprite
          scale={[scale * 1.05, scale * 1.05, 1]}
          renderOrder={10}
      >
          <spriteMaterial
              ref={borderMatRef}
              map={borderTexture}
              transparent={true}
              depthTest={true}
              depthWrite={false}
              alphaTest={0.01}
              opacity={0}
              visible={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
          />
      </sprite>      
      {/* Overlay icône de pin si le node est pinné */}
      {isPinned && visible && (
        <sprite
          position={[scale * 0.31, scale * 0.31, 0]}
          scale={[scale * 0.25, scale * 0.25, 1]}
          renderOrder={11}
        >
          <spriteMaterial
            map={pinTexture}
            transparent={true}
            depthTest={true}
            depthWrite={false}
            opacity={lodAlpha.current * opacityLevel}
          />
        </sprite>
      )}

      {/* Tooltip HTML quand le node est survolé et qu'on est en distance de LoD (quand le label interne est petit/illisible) */}
      {isHovered && distanceToCamera > lodThreshold * 0.77 && (
        <Html 
          position={[0, scale * 0.6, 0]} 
          center
          style={{ pointerEvents: 'none', zIndex: 1000 }}
        >
          <div style={{
            background: 'rgba(0, 0, 0, 0.85)',
            color: 'white',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '500',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.2)',
            pointerEvents: 'none'
          }}>
            {node.label}
          </div>
        </Html>
      )}
    </Billboard>
  );
};

export default Node;
