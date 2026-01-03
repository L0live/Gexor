import React, { useState, useRef } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

const Edge = ({ edge, sourcePos, targetPos, visible, isSelected, onClick, opacityLevel }) => {
  const [hovered, setHovered] = useState(false);
  const lineRef = useRef();
  
  if (!sourcePos || !targetPos) return null;

  const nodeRadius = 8;
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;
  const dz = targetPos.z - sourcePos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  if (dist < nodeRadius * 2) return null;

  const nx = dx / dist;
  const ny = dy / dist;
  const nz = dz / dist;

  const points = [
    [sourcePos.x + nx * nodeRadius, sourcePos.y + ny * nodeRadius, sourcePos.z + nz * nodeRadius],
    [targetPos.x - nx * nodeRadius, targetPos.y - ny * nodeRadius, targetPos.z - nz * nodeRadius]
  ];
  
  return (
    <Line
      ref={lineRef}
      points={points}
      color={isSelected ? '#60a5fa' : (hovered ? '#64748b' : '#475569')}
      lineWidth={isSelected ? 3.5 : (hovered ? 3.5 : 2.5)}
      transparent
      opacity={isSelected ? 0.7 : (hovered ? 0.4 : opacityLevel)}
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

export default Edge;
