/**
 * PluginRegistry — Singleton registry for InfoPanel/RightPanel plugins.
 * Each plugin declares its id, label, icon, available modes, and optional tab component.
 */

import { lazy } from 'react';

const registry = new Map();
const lazyCache = new Map();

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

/**
 * Returns a stable React.lazy wrapper for a plugin's tab component.
 * The same LazyComponent reference is returned across renders, so React
 * does not unmount/remount the plugin when its parent re-renders.
 */
export const getLazyTabComponent = (pluginId) => {
  if (!pluginId) return null;
  if (lazyCache.has(pluginId)) return lazyCache.get(pluginId);
  const plugin = registry.get(pluginId);
  const loader = plugin?.tab?.component;
  if (!loader) return null;
  const LazyComp = lazy(loader);
  lazyCache.set(pluginId, LazyComp);
  return LazyComp;
};
