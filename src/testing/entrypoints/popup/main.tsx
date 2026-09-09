import React from 'react';
import ReactDOM from 'react-dom/client';
import { ShadowTestPopup } from '@/testing/ShadowTestPopup';
import '@/entrypoints/popup/style.css';
import '@/entrypoints/popup/App.css';

const root = document.getElementById('root');
if (!root) throw new Error('Test popup root is missing');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ShadowTestPopup />
  </React.StrictMode>,
);
