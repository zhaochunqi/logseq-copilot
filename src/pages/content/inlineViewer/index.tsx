import { createRoot, Root } from 'react-dom/client';
import InlinePanel from './InlinePanel';
import { panelStyles } from './panelStyles';

type Target = { page?: string; block?: string };

let host: HTMLElement | undefined;
let root: Root | undefined;
let previouslyFocused: Element | null = null;

// Styles are delivered via a constructable stylesheet (CSSStyleSheet +
// adoptedStyleSheets) so no inline <style> text is needed; browsers without
// constructable stylesheet support fall back to a shadow <style> element.
// Positioning of the host (`:host{position:fixed;...}`) also comes from that
// shadow-scoped sheet, so the host element itself carries no inline style.
function applyStyles(shadow: ShadowRoot) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(panelStyles);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = panelStyles;
    shadow.appendChild(style);
  }
}

export function openInlineViewer(target: Target) {
  closeInlineViewer();
  previouslyFocused = document.activeElement;
  host = document.createElement('div');
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  applyStyles(shadow);
  const mount = document.createElement('div');
  shadow.appendChild(mount);
  root = createRoot(mount);
  root.render(<InlinePanel target={target} />);
}

export function closeInlineViewer() {
  root?.unmount();
  root = undefined;
  host?.remove();
  host = undefined;
  if (previouslyFocused instanceof HTMLElement) {
    previouslyFocused.focus();
  }
  previouslyFocused = null;
}
