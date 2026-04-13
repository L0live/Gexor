/**
 * loadPlugins — Auto-découverte et enregistrement de tous les plugins.
 * Utilise import.meta.glob de Vite pour importer tous les index.js des sous-dossiers.
 * À appeler une seule fois au démarrage de l'application (dans main.jsx).
 */
import { registerPlugin } from './pluginRegistry';

const pluginModules = import.meta.glob('./*/index.js', { eager: true });

export const loadPlugins = () => {
  for (const module of Object.values(pluginModules)) {
    if (module.default) {
      try {
        registerPlugin(module.default);
      } catch (e) {
        console.warn('[loadPlugins] Failed to register plugin:', e);
      }
    }
  }
};
