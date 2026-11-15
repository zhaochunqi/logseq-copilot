import { createRoot } from 'react-dom/client';
import '@/assets/globals.css';
import { followSystemColorScheme } from '@/utils/color-scheme';
import GraphBrowser from './GraphBrowser';
followSystemColorScheme();
createRoot(document.getElementById('app')!).render(<GraphBrowser />);
