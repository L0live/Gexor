export default {
  id: 'wikipedia',
  label: 'Wikipedia',
  icon: 'Globe',
  category: 'basics',
  version: '1.0.0',
  availableFor: ['node', 'aggregate'],
  tier: 'free',
  tags: [],
  tab: {
    component: () => import('./WikipediaTab'),
  },
};
