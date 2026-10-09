import React from 'react';
import ReactDOM from 'react-dom/client';
import HubStage from './HubStage';
import PetStage from './PetStage';
import './mate.css';

const root = document.getElementById('root')!;
const mode = new URLSearchParams(window.location.search).get('mode') || window.mate?.mode || 'pet';

ReactDOM.createRoot(root).render(
  <React.StrictMode>{mode === 'hub' ? <HubStage /> : <PetStage />}</React.StrictMode>
);