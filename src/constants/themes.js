// ============================================================================
// Thèmes visuels Gexor — pilote la scène 3D ET l'UI (panneaux, texte, bordure)
// ============================================================================

export const THEME_IDS = ['edu', 'dark', 'basic'];

export const THEMES = {
  edu: {
    id: 'edu',
    label: 'Edu',
    sceneBgFallback: '#0b101e',
    useCategoryColors: true,
    nodeColor: '#64748b',
    // UI panels
    panelBg: 'rgba(15, 23, 42, 0.8)',      // slate-900/80
    panelText: '#ffffff',
    panelMuted: '#94a3b8',                  // slate-400
    panelBorder: 'rgba(51, 65, 85, 0.5)',   // slate-700/50
    buttonBg: 'rgba(71, 85, 105, 0.3)',     // slate-600/30
    accentBg: 'rgba(37, 99, 235, 0.25)',    // blue-600/25
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    sceneBgFallback: '#18122a',
    useCategoryColors: false,
    nodeColor: '#6b7280',
    panelBg: 'rgba(24, 18, 42, 0.88)',
    panelText: '#cbd5e1',                   // slate-300
    panelMuted: '#94a3b8',
    panelBorder: 'rgba(76, 56, 112, 0.55)',
    buttonBg: 'rgba(76, 56, 112, 0.45)',
    accentBg: 'rgba(139, 92, 246, 0.25)',   // violet-500/25
  },
  basic: {
    id: 'basic',
    label: 'Basic',
    sceneBgFallback: '#cdc6b9',
    useCategoryColors: false,
    nodeColor: '#80786b',
    panelBg: 'rgba(248, 245, 238, 0.92)',
    panelText: '#1f2937',                   // gray-800
    panelMuted: '#6b7280',                  // gray-500
    panelBorder: 'rgba(120, 113, 108, 0.3)',
    buttonBg: 'rgba(120, 113, 108, 0.15)',
    accentBg: 'rgba(59, 130, 246, 0.18)',
  },
};

export const DEFAULT_THEME = 'edu';

export const getTheme = (id) => THEMES[id] ?? THEMES[DEFAULT_THEME];
