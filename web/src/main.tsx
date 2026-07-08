import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import UpdateBanner from './components/UpdateBanner';
import { ProjectProvider } from './state';
import './app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProjectProvider>
      <App />
      <UpdateBanner />
    </ProjectProvider>
  </React.StrictMode>,
);
