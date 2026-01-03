import React, { useRef, useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';

const Node = ({ node, position, onClick, visible, isSelected, onDragStart, onDragMove, isDragging, isPinned, filterMode, opacityLevel }) => {
  const spriteRef = useRef();
  const dragStartInfo = useRef(null);
  
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
      'Context': '#0f9c6dff'
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
      position={[position.x, position.y, position.z]}
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
    >
      <sprite
        ref={spriteRef}
        scale={[scale, scale, 1]}
        onClick={onClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        renderOrder={1}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
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
          opacity={opacityLevel}
        />
      </sprite>
      
      {/* Overlay icône de pin si le node est pinné */}
      {isPinned && visible && (
        <sprite
          position={[scale * 0.31, scale * 0.31, 0]}
          scale={[scale * 0.25, scale * 0.25, 1]}
          renderOrder={2}
        >
          <spriteMaterial
            map={pinTexture}
            transparent={true}
            depthTest={true}
            depthWrite={false}
            opacity={opacityLevel}
          />
        </sprite>
      )}
    </Billboard>
  );
};

export default Node;
