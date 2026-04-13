export default {
  id: 'aggregate-childs',
  label: 'Contenu',
  icon: 'Layers',
  category: 'basics',
  version: '1.0.0',
  availableFor: ['aggregate'],
  tier: 'free',
  tags: [],
  tab: {
    component: () => import('./AggregateChildsTab'),
  },
};
