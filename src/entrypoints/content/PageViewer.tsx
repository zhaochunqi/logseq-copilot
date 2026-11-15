import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { browser } from 'wxt/browser';
import { PageViewerPanel } from '@/components/PageViewerPanel';
import { ThemeProvider } from '@/components/ThemeProvider';
import type { PageView } from '@/types/logseqBlock';
import { sendMessage } from '@/types/messaging';
import { shadowRootMode } from '@/utils/shadow-mode';
import { zIndex } from '@/utils/z-index';
import '@/assets/globals.css';

type Target = { page?: string; block?: string };

type Controller = {
  navigate: (target: Target) => void;
  close: () => void;
};

let active: Controller | null = null;
let pending: Target | null = null;

/** Open the singleton in-page drawer. Safe before `startPageViewer` runs. */
export function openPageViewer(target: Target): void {
  if (!active) {
    pending = target;
    return;
  }
  active.navigate(target);
}

/** Legacy `logseq://graph/...?page=|block-id=` href, parsed but never followed. */
const targetOfLogseqUrl = (href: string): Target => {
  const url = new URL(href);
  const page = url.searchParams.get('page');
  const block = url.searchParams.get('block-id');
  return { ...(page ? { page } : {}), ...(block ? { block } : {}) };
};

const graphPageUrl = (name: string) =>
  `${browser.runtime.getURL('/graph.html' as any)}?page=${encodeURIComponent(name)}`;

const openNewTab = async (url: string) => {
  try {
    // In an extension page this is available; in a content script it may not
    // be, in which case the ordinary window opener leaves the host page alone.
    await browser.tabs.create({ url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

export async function startPageViewer(ctx: ContentScriptContext): Promise<void> {
  let ui: ShadowRootContentScriptUi<Root> | null = null;
  let view: PageView | null = null;
  let loading = false;
  let error: string | null = null;
  let current: Target = {};
  let anchorBlock: string | null = null;
  let requestId = 0;
  const history: Target[] = [];
  let mounted = false;

  const close = () => {
    if (!mounted) return;
    // Drop the UI rather than reusing an unmounted React root after `remove`.
    ui?.remove();
    ui = null;
    mounted = false;
  };

  const draw = () => {
    if (!ui?.mounted) return;
    ui.mounted.render(
      <ThemeProvider>
        <div
          data-page-viewer
          className="fixed inset-y-0 right-0 w-[min(560px,100vw)] border-l bg-background shadow-xl"
          style={{ zIndex }}
        >
          <PageViewerPanel
            view={view}
            loading={loading}
            error={error}
            anchorBlock={anchorBlock}
            canBack={history.length > 0}
            onClose={close}
            onBack={() => {
              const previous = history.pop();
              if (previous) void navigate(previous, false);
            }}
            onRefresh={() => void navigate(current, false)}
            onOpenFullPage={() => {
              const name = view?.name ?? current.page;
              if (name) void openNewTab(graphPageUrl(name));
            }}
            onNavigate={(target) => void navigate(target)}
          />
        </div>
      </ThemeProvider>,
    );
  };

  const scrollToAnchor = () => {
    if (!anchorBlock || !ui?.shadow) return;
    const frame = () => {
      const block = [...ui!.shadow.querySelectorAll('li[data-block-id]')].find(
        (element) => (element as HTMLElement).dataset.blockId === anchorBlock,
      ) as HTMLElement | undefined;
      block?.scrollIntoView({ block: 'center' });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
    else setTimeout(frame, 0);
  };

  const navigate = async (target: Target, push = true) => {
    const id = ++requestId;
    if (push && mounted && (current.page || current.block)) history.push(current);
    current = target;
    anchorBlock = target.block ?? null;
    loading = true;
    error = null;
    view = null;
    draw();
    try {
      const next = await sendMessage('logseq:pageView', target);
      if (id !== requestId) return;
      view = next;
    } catch (cause) {
      if (id !== requestId) return;
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (id === requestId) {
        loading = false;
        draw();
        scrollToAnchor();
      }
    }
  };

  const ensureUi = async () => {
    if (!ui) {
      ui = await createShadowRootUi(ctx, {
        name: 'logseq-copilot-page-viewer',
        mode: shadowRootMode,
        position: 'inline',
        anchor: 'body',
        isolateEvents: true,
        onMount: (container) => {
          const app = document.createElement('div');
          container.append(app);
          return createRoot(app);
        },
        onRemove: (root) => root?.unmount(),
      });

      const escape = (event: Event) => {
        if ((event as KeyboardEvent).key === 'Escape') close();
      };
      ui.shadow.addEventListener('keydown', escape);
      ui.shadow.addEventListener('click', (event) => {
        const link = (event.target as Element | null)?.closest?.('a[href]') as
          | HTMLAnchorElement
          | null
          | undefined;
        if (!link || link.dataset.logseqPage || link.dataset.logseqBlock) return;
        try {
          const url = new URL(link.href, location.href);
          if (url.protocol === 'logseq:') {
            // Never follow a logseq: URL: it would launch the desktop app.
            event.preventDefault();
            const target = targetOfLogseqUrl(link.href);
            if (target.page || target.block) void navigate(target);
          } else if (/^https?:$/.test(url.protocol)) {
            event.preventDefault();
            void openNewTab(url.href);
          }
        } catch {
          // Ignore a malformed link rather than navigating the host page.
        }
      });
    }
    if (!mounted) {
      ui.mount();
      mounted = true;
    }
  };

  active = {
    navigate: (target) => {
      const wasMounted = mounted;
      void ensureUi().then(() => navigate(target, wasMounted));
    },
    close,
  };
  if (pending) {
    const target = pending;
    pending = null;
    active.navigate(target);
  }

  try {
    ctx.addEventListener?.(window, 'keydown', ((event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    }) as EventListener);
  } catch {
    // A minimal test context may not expose addEventListener; the drawer's
    // shadow-root listener still handles Escape while it has focus.
  }
}
