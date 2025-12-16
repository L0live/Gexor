# Changelog - Adaptation visuelle à OldVersionGraph.jsx

## Date : 16 décembre 2025

### 🎨 Changements visuels majeurs

#### 1. Nodes - Sprites 2D au lieu de Sphères 3D

**Avant :**
- Sphères 3D avec `<Sphere>` et `<meshStandardMaterial>`
- Labels HTML séparés avec `<Html>`
- Rotation automatique des sphères
- Émissivité pour l'effet de sélection

**Après :**
- Sprites 2D avec canvas texture personnalisée
- Labels intégrés directement dans le canvas
- Billboard (toujours face à la caméra)
- Cercles colorés avec ombre portée

```jsx
// Ancien code
<Sphere args={[scale, 32, 32]}>
  <meshStandardMaterial color={color} />
</Sphere>

// Nouveau code
<Billboard>
  <sprite>
    <spriteMaterial map={canvasTexture} />
  </sprite>
</Billboard>
```

#### 2. Palette de couleurs - Dark Mode

**Couleurs mises à jour :**

| Type    | Avant (Standard) | Après (Dark Mode) |
|---------|-----------------|-------------------|
| Entity  | #3b82f6         | #60a5fa          |
| Event   | #a855f7         | #c084fc          |
| Context | #22c55e         | #34d399          |

Les nouvelles couleurs sont plus claires et s'intègrent mieux au fond dark slate (#0f172a).

#### 3. Grille - Infinie avec tilt

**Avant :**
```jsx
<gridHelper args={[200, 20, '#334155', '#1e293b']} />
```

**Après :**
```jsx
<gridHelper 
  args={[400, 800, '#475569', '#1e293b']} 
  position={[0, -5, 0]}
  rotation={[0, 0, -Math.PI / 12]}
/>
```

- Grille 2x plus grande (400x400)
- 40x plus de divisions (800 au lieu de 20)
- Positionnée 5 unités plus bas
- Tilt de -15° pour la profondeur

#### 4. Lumière - Simplifiée

**Avant :**
```jsx
<ambientLight intensity={0.6} />
<pointLight position={[20, 20, 20]} intensity={1.2} />
<pointLight position={[-20, -20, -20]} intensity={0.6} />
<pointLight position={[0, 40, 0]} intensity={0.8} color="#a855f7" />
```

**Après :**
```jsx
<ambientLight intensity={1.0} />
```

Une seule lumière ambiante pour un rendu flat design cohérent avec les sprites 2D.

#### 5. Edges - Plus subtiles

**Opacité :**
- Avant : 0.5
- Après : 0.3

**Largeur :**
- Avant : 1.5
- Après : 1.0

Les lignes sont plus discrètes pour ne pas surcharger la visualisation.

### 📦 Imports modifiés

**Ajoutés :**
- `useMemo` de React
- `Billboard` de @react-three/drei

**Supprimés :**
- `Sphere` de @react-three/drei
- `Html` de @react-three/drei
- `useFrame` (non utilisé avec sprites)

### 🎯 Avantages de l'approche Sprite 2D

1. **Performance** : Moins de géométrie à calculer
2. **Lisibilité** : Labels toujours visibles et orientés
3. **Cohérence** : Style uniforme avec OldVersionGraph.jsx
4. **Simplicité** : Une texture canvas vs géométrie + matériau + HTML

### 🔄 Compatibilité

✅ Toutes les fonctionnalités sont préservées :
- Filtrage par type (Entity/Event/Context)
- Sélection de nodes
- Panel d'information
- Simulation ngraph force-directed
- OrbitControls pour la navigation
- Animation fluide

### 📝 Documentation mise à jour

- [README.md](README.md) : Section COUCHE 3 mise à jour
- Nouvelle section "Style Visuel" ajoutée
- Exemples de personnalisation adaptés

### 🚀 Pour tester

```bash
npm run dev
```

Puis ouvrir http://localhost:3000/

Les nodes doivent maintenant apparaître comme des cercles colorés 2D avec labels intégrés, similaires à OldVersionGraph.jsx.
