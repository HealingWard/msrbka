import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { AppProvider } from './state.jsx';
import { loadConfig } from './lib/config.js';
import './styles.css';

await loadConfig();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
