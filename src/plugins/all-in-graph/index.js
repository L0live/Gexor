export default {
  id: 'all-in-graph',
  label: 'Dans le graphe',
  icon: 'Network',
  category: 'basics',
  version: '1.0.0',
  availableFor: ['node'],
  tier: 'free',
  tags: [],
  tab: {
    component: () => import('./AllInGraphTab'),
  },
};
