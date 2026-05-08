import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { Popover } from './components/Popover';
import './index.css';

const isPopover = window.location.hash === '#popover';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPopover ? <Popover /> : <App />}</React.StrictMode>,
);
