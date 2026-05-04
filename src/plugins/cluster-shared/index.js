export default {
  id: 'cluster-shared',
  label: 'Similaires',
  icon: 'GitMerge',
  category: 'mvct',
  version: '1.0.0',
  availableFor: ['node'],
  tier: 'free',
  tags: [],
  tab: {
    component: () => import('./ClusterSharedTab'),
  },
};
