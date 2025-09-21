import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
} else {
  throw new Error("Root container not found");
}
