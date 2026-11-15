/**
 * Content script startup. Restoring saved highlights can be slow, and it must
 * not delay the message handlers: what the browser sidebar needs from the page
 * (scrolling to a highlight, following changes made elsewhere) has to work
 * from the start.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import type { HighlightData } from '@/types/highlight';

const messaging = vi.hoisted(() => ({
  handlers: new Map<string, (message: { data: unknown }) => unknown>(),
  sendMessage: vi.fn(),
}));

vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => messaging.sendMessage(...args),
  onMessage: (name: string, handler: (message: { data: unknown }) => unknown) => {
    messaging.handlers.set(name, handler);
  },
}));
vi.mock('wxt/utils/content-script-ui/shadow-root', () => ({
  createShadowRootUi: vi.fn(async () => undefined),
}));
vi.mock('@/assets/globals.css', () => ({}));
vi.mock('./index.module.scss', () => ({ default: {} }));
vi.mock('../../assets/img/logo.png', () => ({ default: '' }));
vi.mock('./arc-detection', () => ({ detectArc: vi.fn() }));

import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { HighlightService } from '@/utils/highlight-service';
import { HighlightManager } from '@/utils/highlight-manager';
import { contentEvents } from '@/utils/content-events';
import { detectArc } from './arc-detection';
import contentScript from './index';

const saved: HighlightData = {
  id: 'h1',
  url: 'http://localhost:3000/',
  title: 'Page',
  hostname: 'localhost',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 11,
    textContent: 'hello world',
  },
  createdAt: 1,
  lastAccessedAt: 1,
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('content script startup', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    messaging.handlers.clear();
    messaging.sendMessage.mockReset();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
      clear() {}
    };
    HighlightManager.getInstance().cleanup();
    vi.restoreAllMocks();
    // happy-dom has no XPath, so displaying a highlight is out of scope here.
    vi.spyOn(HighlightManager.prototype, 'displayHighlight').mockResolvedValue(
      true,
    );
  });

  it('registers the highlight message handlers synchronously, before any await', async () => {
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
      new Promise(() => {}),
    );

    // Do not await main: the restore below never resolves.
    void (contentScript as any).main({});

    for (const name of ['content:scrollToHighlight']) {
      expect(messaging.handlers.has(name), name).toBe(true);
    }
  });

  describe('for the browser sidebar', () => {
    it('handles scrollToHighlight from the start', async () => {
      const scroll = vi
        .spyOn(HighlightManager.prototype, 'scrollToHighlight')
        .mockResolvedValue(true);
      vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
        new Promise(() => {}),
      );

      // Not awaited: it is still waiting for the restore and the UI.
      void (contentScript as any).main({});

      const handler = messaging.handlers.get('content:scrollToHighlight')!;

      await expect(handler({ data: { id: 'h1' } })).resolves.toBe(true);
      expect(scroll).toHaveBeenCalledWith('h1');

      scroll.mockResolvedValue(false);
      await expect(handler({ data: { id: 'gone' } })).resolves.toBe(false);
      expect(scroll).toHaveBeenLastCalledWith('gone');
    });

    it('follows highlights changed in other contexts from the start', async () => {
      await fakeBrowser.storage.local.set({ highlights: [saved] });
      const removed = vi.fn();
      const off = contentEvents.on('highlightRemoved', removed);

      void (contentScript as any).main({});
      await HighlightManager.getInstance().ready;

      await fakeBrowser.storage.local.set({ highlights: [] });

      await vi.waitFor(() =>
        expect(removed).toHaveBeenCalledWith({ highlightId: 'h1' }),
      );
      off();
    });
  });
});

describe('content script UI mounting', () => {
  const mountedNames = () =>
    vi.mocked(createShadowRootUi).mock.calls.map(([, options]) => options.name);

  beforeEach(async () => {
    fakeBrowser.reset();
    messaging.handlers.clear();
    vi.mocked(createShadowRootUi).mockClear();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
      clear() {}
    };
    HighlightManager.getInstance().cleanup();
    vi.restoreAllMocks();
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockResolvedValue(
      [],
    );
  });

  // Clip UI (the floating button and the quick capture popup) is gone: the
  // page draws no extension UI of its own any more.
  it('mounts no clip UI on the page', async () => {
    await (contentScript as any).main({});

    expect(mountedNames()).not.toContain('logseq-copilot-popup');
  });
});

// Browsers without a sidebar of their own (src/utils/sidebar.ts).
describe('content script in-page highlights sidebar', () => {
  const ctx = { addEventListener: vi.fn() };
  const sidebarUi = {
    mount: vi.fn(),
    remove: vi.fn(),
    mounted: undefined,
    shadow: new EventTarget(),
  };
  const sidebarCreated = () =>
    vi
      .mocked(createShadowRootUi)
      .mock.calls.some(([, options]) => options.name === 'logseq-copilot-highlights');

  beforeEach(() => {
    fakeBrowser.reset();
    messaging.handlers.clear();
    sidebarUi.mount.mockClear();
    sidebarUi.remove.mockClear();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
      clear() {}
    };
    HighlightManager.getInstance().cleanup();
    vi.restoreAllMocks();
    vi.mocked(createShadowRootUi)
      .mockClear()
      .mockImplementation((async (_ctx: unknown, options: { name: string }) =>
        options.name === 'logseq-copilot-highlights' ? sidebarUi : undefined) as never);
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockResolvedValue(
      [],
    );
  });

  afterEach(() => {
    vi.mocked(createShadowRootUi).mockImplementation((async () => undefined) as never);
  });

  it('is mounted while open, and removed when closed', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });

    await (contentScript as any).main(ctx);

    await vi.waitFor(() => expect(sidebarUi.mount).toHaveBeenCalledTimes(1));

    await fakeBrowser.storage.local.set({ inPageSidebarOpen: false });

    await vi.waitFor(() => expect(sidebarUi.remove).toHaveBeenCalledTimes(1));
  });

  it('is not on the page while closed', async () => {
    await (contentScript as any).main(ctx);

    expect(sidebarCreated()).toBe(false);
  });

  it('is not mounted in a frame', async () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });

    await (contentScript as any).main(ctx);
    await flush();

    expect(sidebarCreated()).toBe(false);
  });

  // Arc has the side panel API but never shows the panel.
  describe('looking for Arc', () => {
    beforeEach(() => {
      vi.mocked(detectArc).mockClear();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('looks in the top frame of pages', async () => {
      await (contentScript as any).main(ctx);

      expect(detectArc).toHaveBeenCalledTimes(1);
      expect(detectArc).toHaveBeenCalledWith(ctx);
    });

    it('does not look in a frame', async () => {
      vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);

      await (contentScript as any).main(ctx);

      expect(detectArc).not.toHaveBeenCalled();
    });

    it('does not look in Firefox', async () => {
      vi.stubEnv('FIREFOX', 'true');

      await (contentScript as any).main(ctx);

      expect(detectArc).not.toHaveBeenCalled();
    });
  });
});
