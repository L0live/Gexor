export default {
  id: 'associates',
  label: 'Associés',
  icon: 'Users',
  category: 'basics',
  version: '1.0.0',
  availableFor: ['node'],
  tier: 'free',
  tags: [],
  tab: {
    component: () => import('./AssociatesTab'),
  },
};
