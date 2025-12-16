# NexReec Hybrid - Architecture Documentation

## 🏗️ Architecture en 4 Couches

Cette implémentation suit l'approche **hybride** en séparant clairement les responsabilités :

```
┌─────────────────────────────────────────────────────┐
│  COUCHE 4: Interaction Layer (UI & Controls)        │
│  - React Components                                  │
│  - Event handlers                                    │
│  - User interactions                                 │
└─────────────────────────────────────────────────────┘
                       ↓ ↑
┌─────────────────────────────────────────────────────┐
│  COUCHE 3: Rendering Engine (React Three Fiber)     │
│  - Node rendering (2D sprites with canvas texture)  │
│  - Edge rendering (lines)                            │
│  - 3D scene composition                              │
│  - Billboard labels intégrés                         │
└─────────────────────────────────────────────────────┘
                       ↓ ↑
┌─────────────────────────────────────────────────────┐
│  COUCHE 2: Layout Engine (ngraph.forcelayout3d)     │
│  - Force-directed algorithm                          │
│  - Position calculation                              │
│  - Physics simulation                                │
└─────────────────────────────────────────────────────┘
                       ↓ ↑
┌─────────────────────────────────────────────────────┐
│  COUCHE 1: Data Layer (Zustand)                     │
│  - State management                                  │
│  - Data normalization                                │
│  - Filters & selection                               │
└─────────────────────────────────────────────────────┘
```

## 📦 Installation

```bash
npm install zustand three @react-three/fiber @react-three/drei ngraph.graph ngraph.forcelayout3d lucide-react
```

### Dépendances

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0",
    "three": "^0.160.0",
    "@react-three/fiber": "^8.15.0",
    "@react-three/drei": "^9.92.0",
    "ngraph.graph": "^20.0.1",
    "ngraph.forcelayout3d": "^3.0.0",
    "lucide-react": "^0.300.0"
  }
}
```

## 🚀 Utilisation

### Basic Usage

```jsx
import NexReecHybrid from './NexReecHybrid';
import reecData from './data/epoque-moderne.json';

function App() {
  return <NexReecHybrid initialData={reecData} />;
}
```

### Format de données attendu

```json
{
  "reecs": [
    {
      "reec_id": "reec:unique-id",
      "label": "Nom du Reec",
      "type": "Entity|Event|Context",
      "subtype": "Personnalité|Conflit|...",
      "category": "Explorateur|Bataille|...",
      "summary_short": "Résumé court",
      "summary_detailed": "Résumé détaillé",
      "temporal_start_date": "1492",
      "temporal_end_date": "1506",
      "temporal_precision": "year",
      "spatial_locations": ["Lieu1", "Lieu2"],
      "metadata_confidence": 0.98,
      "metadata_tags": ["tag1", "tag2"]
    }
  ],
  "relations": [
    {
      "source_reec_id": "reec:id1",
      "target_reec_id": "reec:id2",
      "relation_type": "participe_à",
      "description": "Description de la relation",
      "confidence": 0.95
    }
  ]
}
```

## 🎯 Fonctionnalités

### Couche 1 : Data Layer (Zustand)

**État géré :**
- `rawReecs`: Données brutes des Reecs
- `rawRelations`: Relations brutes
- `nodes`: Nodes normalisés pour le graphe
- `edges`: Edges normalisés
- `filters`: Filtres par type (Entity/Event/Context)
- `selectedNode`: Node actuellement sélectionné
- `positions`: Positions 3D calculées par ngraph
- `layoutRunning`: État de la simulation
- `layoutProgress`: Progression de la simulation (0-100%)

**Actions disponibles :**
```javascript
const store = useGraphStore();

// Charger des données
store.loadData(jsonData);

// Toggle filtres
store.toggleFilter('Entity');

// Sélection
store.selectNode('reec:some-id');
store.clearSelection();

// Layout
store.setPositions(newPositions);
store.setLayoutRunning(true/false);
store.setLayoutProgress(50);
```

### Couche 2 : Layout Engine (ngraph)

**Hook personnalisé : `useNgraphLayout()`**

```javascript
const { runSimulation, stopSimulation, layout } = useNgraphLayout();

// Lancer une simulation
runSimulation(300); // 300 iterations

// Stopper la simulation
stopSimulation();
```

**Configuration ngraph :**
```javascript
{
  springLength: 80,      // Distance préférée entre nodes connectés
  springCoeff: 0.0008,   // Rigidité des springs
  gravity: -1.2,         // Force de gravité
  theta: 0.8,            // Précision Barnes-Hut (0.0-1.0)
  dragCoeff: 0.02,       // Coefficient de friction
  timeStep: 20           // Pas de temps de simulation
}
```

### Couche 3 : Rendering Engine (R3F)

**Composants 3D :**

1. **Node** : Sprite 2D avec canvas texture (style OldVersionGraph)
   - Cercles colorés avec labels intégrés
   - Couleurs dark mode : Entity (#60a5fa), Event (#c084fc), Context (#34d399)
   - Billboard (toujours face caméra)
   - Scale basé sur confidence
   - Hover effects

2. **Edge** : Line entre deux nodes
   - Visibilité conditionnelle
   - Opacité subtile (0.3)
   - Couleurs slate (#475569)

3. **Scene** : Composition complète
   - Lumière ambiante unique (intensity 1.0)
   - OrbitControls
   - Grille infinie 400x800 avec tilt (-15°)

### Couche 4 : Interaction Layer

**Contrôles disponibles :**

- **Filtres** : Toggle Entity/Event/Context
- **Simulation** : Play/Pause du layout
- **Sélection** : Click sur node pour info
- **Caméra** : OrbitControls
  - Rotation : Click + drag
  - Zoom : Molette
  - Pan : Shift + click + drag

## ⚙️ Configuration & Optimisation

### Paramètres de simulation

Pour ajuster les performances vs qualité :

```javascript
// Simulation rapide (moins précise)
runSimulation(100);

// Simulation standard
runSimulation(300);

// Simulation longue (très précise)
runSimulation(1000);
```

### Optimisation du rendu

Le rendu est optimisé via :
- **Instancing** : Tous les nodes utilisent la même géométrie
- **Frustum culling** : Three.js ne rend que ce qui est visible
- **LOD potentiel** : Peut être ajouté pour grands graphes

### Scaling pour grands graphes

Pour 1000+ nodes :

1. **Augmenter le theta** : `theta: 0.9` (moins précis mais plus rapide)
2. **Réduire springLength** : `springLength: 50`
3. **Utiliser Web Workers** (futur) pour layout en background

## 🔧 Modification et Extension

### Ajouter un nouveau layout

```javascript
// Dans useNgraphLayout, créer une variante :
const createCircularLayout = () => {
  const positions = {};
  nodes.forEach((node, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    positions[node.id] = {
      x: Math.cos(angle) * 50,
      y: 0,
      z: Math.sin(angle) * 50
    };
  });
  setPositions(positions);
};
```

### Personnaliser le rendu des nodes

Dans le composant `Node`, modifier :

```javascript
// Changer les couleurs dans le colorMap
const colorMap = {
  'Entity': '#60a5fa',  // Bleu clair
  'Event': '#c084fc',   // Violet clair
  'Context': '#34d399'  // Vert clair
};

// Ajuster le canvas pour différents styles
ctx.font = 'bold 24px Arial'; // Police
ctx.shadowBlur = 20;          // Ombre
const radius = size * 0.4;    // Taille du cercle
```

### Ajouter des effets visuels

```javascript
// Import
import { EffectComposer, Bloom } from '@react-three/postprocessing';

// Dans Scene
<EffectComposer>
  <Bloom luminanceThreshold={0.8} intensity={0.5} />
</EffectComposer>
```

## 📊 Exemple de Workflow

1. **Chargement** : 
   - Utilisateur charge un JSON de Reecs
   - `loadData()` normalise les données

2. **Layout** :
   - ngraph crée le graphe
   - Simulation de 500 iterations
   - Positions mises à jour tous les 10 steps

3. **Rendu** :
   - R3F reçoit les positions
   - Nodes et edges affichés
   - Labels HTML superposés

4. **Interaction** :
   - User clique sur un node
   - `selectNode()` met à jour le state
   - Panel d'info s'affiche
   - Node sélectionné s'illumine

5. **Filtrage** :
   - User désactive "Event"
   - ngraph re-calcule sans les Events
   - R3F re-render avec nodes filtrés

## 🎨 Style Visuel

Cette implémentation utilise un style visuel inspiré de **OldVersionGraph.jsx** :

### Caractéristiques visuelles :

- **Nodes en sprites 2D** : Cercles colorés avec labels intégrés sur canvas
- **Palette dark mode** : Couleurs claires sur fond sombre (#0f172a)
  - Entity : #60a5fa (bleu clair)
  - Event : #c084fc (violet clair)
  - Context : #34d399 (vert clair)
- **Grille infinie** : 400x800 divisions avec tilt de -15° pour la profondeur
- **Lumière simple** : Une seule lumière ambiante (intensité 1.0)
- **Lignes subtiles** : Opacité 0.3, couleur slate (#475569)
- **Billboard** : Les nodes font toujours face à la caméra

### Différences avec l'approche sphère 3D :

| Aspect | Sprite 2D (actuel) | Sphère 3D |
|--------|-------------------|-----------|
| Performance | ✅ Excellent | Bon |
| Lisibilité | ✅ Labels intégrés | Labels HTML séparés |
| Style | Flat design | 3D réaliste |
| Rotation | Face caméra | Rotation automatique |

## 🐛 Troubleshooting

### La simulation ne démarre pas

Vérifier que :
- Les données sont bien chargées (`nodes.length > 0`)
- Il y a au moins un node visible (filtres)
- Le format JSON est correct

### Performance lente

Solutions :
- Réduire le nombre d'iterations
- Augmenter `theta` dans la config ngraph
- Désactiver les labels HTML pour nodes lointains
- Utiliser `<Billboard>` de drei au lieu de `<Html>`

### Nodes se chevauchent

Ajuster :
- `springLength` : augmenter
- `gravity` : diminuer (plus négatif)
- Nombre d'iterations : augmenter

## 🚀 Prochaines Étapes

1. **Web Workers** : Layout en background
2. **Timeline integration** : Disposer nodes sur une timeline
3. **Clustering** : Algorithme de communautés
4. **Export** : PNG, SVG des vues
5. **Layouts multiples** : Switch entre force/timeline/circular

## 📝 Notes Techniques

### Pourquoi cette architecture ?

- **Modularité** : Changer une couche sans toucher aux autres
- **Testabilité** : Chaque couche peut être testée isolément
- **Performance** : Optimisations ciblées par couche
- **Évolutivité** : Facile d'ajouter des features

### Trade-offs

**Avantages** :
- Code organisé et maintenable
- Performance optimale
- Extensibilité maximale

**Inconvénients** :
- Setup initial plus complexe
- Plusieurs dépendances
- Courbe d'apprentissage

### Comparaison avec votre code actuel

| Aspect | Code actuel | Hybrid Approach |
|--------|-------------|----------------|
| Lines of code | ~900 | ~600 (sans UI) |
| Dependencies | Three.js | +4 libs |
| Layout flexibility | Fixed (Fibonacci) | Dynamic (force) |
| State management | Refs | Zustand |
| Rendering | Imperative | Declarative |
| Performance | Excellent | Excellent |
| Extensibilité | Moyenne | Élevée |

---

**Made with ❤️ for NexReec by Claude + Monseigneur**