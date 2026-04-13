/**
 * PluginRegistry — Singleton registry for InfoPanel/RightPanel plugins.
 * Each plugin declares its id, label, icon, available modes, and optional tab component.
 */

const registry = new Map();

export const registerPlugin = (plugin) => {
  if (!plugin?.id) throw new Error('[pluginRegistry] Plugin must have an id');
  registry.set(plugin.id, plugin);
};

export const getPlugin = (id) => registry.get(id);

export const getAllPlugins = () => Array.from(registry.values());

/** Returns all plugins that declare availability for the given mode ('node'|'edge'|'aggregate') */
export const getPluginsForMode = (mode) =>
  getAllPlugins().filter(p => p.availableFor?.includes(mode));

/** Returns all plugins that have a tab component for the given mode */
export const getTabsForMode = (mode) =>
  getAllPlugins().filter(p => p.availableFor?.includes(mode) && p.tab);
