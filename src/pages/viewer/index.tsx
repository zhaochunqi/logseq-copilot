import './viewer.module.scss';
import { createRoot } from 'react-dom/client';
import Viewer from './Viewer';

const container = document.getElementById('app-container');
if (container) createRoot(container).render(<Viewer />);
