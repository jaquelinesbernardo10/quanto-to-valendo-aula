import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { ProvedorSessao } from './auth.jsx';
import './estilos.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ProvedorSessao>
        <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: '#161b22', color: '#e6edf3', border: '1px solid #30363d' },
            success: { iconTheme: { primary: '#25D366', secondary: '#0d1117' } },
          }}
        />
      </ProvedorSessao>
    </BrowserRouter>
  </React.StrictMode>,
);
