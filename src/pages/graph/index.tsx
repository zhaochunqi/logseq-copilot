import './graph.module.scss';
import { createRoot } from 'react-dom/client';
import GraphBrowser from './GraphBrowser';

const container = document.getElementById('app-container');
if (container) createRoot(container).render(<GraphBrowser />);
