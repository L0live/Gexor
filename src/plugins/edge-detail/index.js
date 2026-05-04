export default {
  id: 'edge-detail',
  label: 'Détail',
  icon: 'Network',
  category: 'basics',
  version: '1.0.0',
  availableFor: ['edge'],
  tier: 'free',
  tags: [],
  tab: {
    component: () => import('./EdgeDetailTab'),
  },
};
