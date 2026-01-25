import React, { useRef, useMemo, useState } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const colorMap = {
  'Entity': '#3b82f6',
  'Event': '#8b5cf6',
  'Context': '#0f9c6dff',
  'Default': '#64748b'
};

// Generics textures cache for LoD
const lodTextures = {};

const getLodTexture = (type) => {
  const color = colorMap[type] || colorMap['Default'];
  if (lodTextures[color]) return lodTextures[color];

  const canvas = document.createElement('canvas');
  const size = 128; 
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.4;

  // Même ombre que le high-res pour la cohérence
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 1;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  lodTextures[color] = new THREE.CanvasTexture(canvas);
  return lodTextures[color];
};

const Node = ({ node, position, onClick, visible, isSelected, onDragStart, onDragMove, isDragging, isPinned, filterMode, opacityLevel, totalNodes = 100 }) => {
  const spriteRef = useRef();
  const billboardRef = useRef();
  const dragStartInfo = useRef(null);
  const { camera } = useThree();
  const [lodLevel, setLodLevel] = useState(0); // 0: Close (Label), 1: Far (Circle only)
  const [hovered, setHovered] = useState(false);
  const lodAlpha = useRef(1); // 1: Full High Detail, 0: Full Low Detail
  const [inFrustum, setInFrustum] = useState(true);
  
  const highResMatRef = useRef();
  const lowResMatRef = useRef();

  // Calculez les seuils adaptatifs basés sur le nombre total de nodes
  // Plus il y a de nodes, plus on passe vite en LoD 1
  const lodThreshold = useMemo(() => {
    const base = 400; // Distance de base
    const factor = Math.max(0.2, 1 - (totalNodes / 2000));
    return base * factor;
  }, [totalNodes]);

  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const nodePosition = useMemo(() => new THREE.Vector3(), []);
  const boundingSphere = useMemo(() => new THREE.Sphere(), []);

  useFrame((state) => {
    if (!billboardRef.current || !visible) return;

    nodePosition.set(position.x, position.y, position.z);
    const scale = getScale();

    // 1. Check distance and update Alpha
    const dist = state.camera.position.distanceTo(nodePosition);
    const targetAlpha = (dist > lodThreshold && !isSelected && !isDragging && !hovered) ? 0 : 1;
    
    // Lerp pour transition douce
    lodAlpha.current = THREE.MathUtils.lerp(lodAlpha.current, targetAlpha, 0.1);

    // Mettre à jour les opacités des matériaux directement
    if (highResMatRef.current) {
        // Le label (High Res) fade In/Out
        highResMatRef.current.opacity = lodAlpha.current * opacityLevel;
        highResMatRef.current.visible = lodAlpha.current > 0.01;
    }
    if (lowResMatRef.current) {
        // Le cercle (Low Res) reste OPAQUE tout au long pour éviter le trou de transparence
        lowResMatRef.current.opacity = opacityLevel;
        lowResMatRef.current.visible = true;
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
    if (lodLevel !== 0 && !isSelected && !isDragging) return null;
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
    ctx.font = 'bold 36px Arial';
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
    
    if (lines.length > 2) {
      ctx.font = 'bold 28px Arial';
    }
    
    lines.forEach((line) => {
      ctx.fillText(line, centerX, yStart);
      yStart += lineHeight;
    });

    return new THREE.CanvasTexture(canvas);
  }, [node.label, node.type, lodLevel, isSelected, isDragging]);

  const lowResTexture = useMemo(() => getLodTexture(node.type), [node.type]);
  
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
    // Scale basé sur la confidence
    const baseScale = 15;
    const confidenceMultiplier = node.confidence || 0.8;
    return baseScale * confidenceMultiplier * (isSelected ? 1.2 : 1.0) * (isDragging ? 1.3 : 1.0) * 1.0;
  };
  
  const handlePointerDown = (e) => {
    e.stopPropagation();
    onDragStart(node.id, e.clientX, e.clientY);
  };
  
  // Pas besoin de onPointerMove ici - géré via useFrame dans Scene
  
  const handlePointerUp = (e) => {
    e.stopPropagation();
    dragStartInfo.current = null;
  };
  
  if (!position) return null;
  
  const scale = getScale();
  
  return (
    <Billboard
      ref={billboardRef}
      position={[position.x, position.y, position.z]}
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
      visible={visible && inFrustum}
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
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
            alphaTest={0.05}
            opacity={opacityLevel}
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
              alphaTest={0.05}
              opacity={opacityLevel}
              visible={true}
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
    </Billboard>
);
};

export default Node;
