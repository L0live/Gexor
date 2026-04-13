import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { loadPlugins } from './plugins/loadPlugins';

loadPlugins();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
