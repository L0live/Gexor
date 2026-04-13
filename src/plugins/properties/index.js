export default {
  id: 'properties',
  label: 'Propriétés',
  icon: 'Info',
  category: 'basics',
  version: '1.0.0',
  availableFor: ['node'],
  tier: 'free',
  tags: [],
  tab: {
    component: () => import('./PropertiesTab'),
  },
};
