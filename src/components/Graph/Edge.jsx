import React, { useState, useRef, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const Edge = ({ edge, sourcePos, targetPos, visible, isSelected, onClick, opacityLevel, totalEdges = 100 }) => {
  const [hovered, setHovered] = useState(false);
  const lineRef = useRef();
  const groupRef = useRef();
  const arrowMatRef = useRef();
  const { camera } = useThree();
  const [lodLevel, setLodLevel] = useState(0); // 0: Close (Arrow), 1: Far (Line only), 2: Very Far (Hidden)
  const lodAlpha = useRef(1); // 1: full detail, 0: low detail
  const [inFrustum, setInFrustum] = useState(true);

  // Seuils adaptatifs pour les edges
  const { lod1Threshold, lod2Threshold } = useMemo(() => {
    const base1 = 500;
    const base2 = 1200;
    const factor = Math.max(0.15, 1 - (totalEdges / 5000));
    return {
      lod1Threshold: base1 * factor,
      lod2Threshold: base2 * factor
    };
  }, [totalEdges]);

  const frustum = useMemo(() => new THREE.Frustum(), []);
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const midPoint = useMemo(() => new THREE.Vector3(), []);
  const boundingSphere = useMemo(() => new THREE.Sphere(), []);

  useFrame((state) => {
    if (!groupRef.current || !visible) return;

    // Calculer le point milieu
    midPoint.set(
      (sourcePos.x + targetPos.x) / 2,
      (sourcePos.y + targetPos.y) / 2,
      (sourcePos.z + targetPos.z) / 2
    );
    
    // Calculer la distance de la caméra au milieu de l'edge pour le LoD
    // Calculer la distance de la caméra au milieu de l'edge pour le LoD
    const distToCam = state.camera.position.distanceTo(midPoint);
    
    // Transition fluide pour la tête de flèche lors du survol/sélection
    const targetAlpha = (isSelected || hovered) ? 1 : (distToCam > lod1Threshold ? 0 : 1);
    lodAlpha.current = THREE.MathUtils.lerp(lodAlpha.current, targetAlpha, 0.1);

    if (arrowMatRef.current) {
        arrowMatRef.current.opacity = lodAlpha.current * opacityLevel;
        arrowMatRef.current.visible = lodAlpha.current > 0.01;
    }

    let newLod = 0;
    if (distToCam > lod2Threshold) newLod = 2;
    else if (distToCam > lod1Threshold) newLod = 1;

    if (newLod !== lodLevel) setLodLevel(newLod);

    // Frustum culling avec Bounding Sphere couvrant toute l'arête
    projScreenMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);
    
    // Le rayon de la sphère est la moitié de la longueur de l'arête
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dz = targetPos.z - sourcePos.z;
    const edgeLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    boundingSphere.center.copy(midPoint);
    boundingSphere.radius = edgeLength * 0.5 + 5; // Marge de sécurité
    
    const isIn = frustum.intersectsSphere(boundingSphere);
    if (isIn !== inFrustum) setInFrustum(isIn);
  });
  
  const nodeRadius = 8;
  const arrowSize = 3;

  // Calculer les propriétés nécessaires pour la flèche
  const { points, arrowHeadPos, quaternion, valid } = useMemo(() => {
    if (!sourcePos || !targetPos) return { valid: false };

    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dz = targetPos.z - sourcePos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (dist < nodeRadius * 2 + arrowSize) return { valid: false };

    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    const lineEndDistance = nodeRadius + arrowSize;
    const pts = [
      [sourcePos.x + nx * nodeRadius, sourcePos.y + ny * nodeRadius, sourcePos.z + nz * nodeRadius],
      [targetPos.x - nx * lineEndDistance, targetPos.y - ny * lineEndDistance, targetPos.z - nz * lineEndDistance]
    ];

    const headPos = [
      targetPos.x - nx * (nodeRadius + arrowSize / 2),
      targetPos.y - ny * (nodeRadius + arrowSize / 2),
      targetPos.z - nz * (nodeRadius + arrowSize / 2)
    ];

    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3(nx, ny, nz);
    q.setFromUnitVectors(axis, direction);

    return { points: pts, arrowHeadPos: headPos, quaternion: q, valid: true };
  }, [sourcePos, targetPos, nodeRadius, arrowSize]);

  if (!valid) return null;

  const color = isSelected ? '#60a5fa' : (hovered ? '#64748b' : '#475569');
  const opacity = isSelected ? 0.7 : (hovered ? 0.4 : opacityLevel);
  
  // Toujours afficher le détail max si sélectionné ou survolé
  const effectiveLod = (isSelected || hovered) ? 0 : lodLevel;
  const isVisible = visible && inFrustum && (effectiveLod < 2 || isSelected || hovered);

  return (
    <group ref={groupRef} visible={isVisible}>
      <Line
        ref={lineRef}
        points={points}
        color={color}
        lineWidth={isSelected ? 3.5 : (hovered ? 3.5 : 2.5)}
        transparent
        opacity={opacity}
        depthTest={true}
        depthWrite={false}
        renderOrder={1}
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
      
      {/* Tête de flèche - seulement en LoD 0 */}
      {effectiveLod === 0 && (
        <mesh 
          position={arrowHeadPos} 
          quaternion={quaternion}
          renderOrder={1}
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
        >
          <coneGeometry args={[1, arrowSize, 3]} />
          <meshBasicMaterial 
            ref={arrowMatRef}
            color={color} 
            transparent 
            opacity={opacity}
            depthTest={true}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
};

export default Edge;
