import Browser from 'webextension-polyfill';
import { useEffect, useRef, useState } from 'react';
import { getLogseqService, renderBlock } from '@pages/logseq/tool';
import { closeInlineViewer } from './index';
import { buildOutline, findBlockAnchor } from './model';

type Target = { page?: string; block?: string };
type View = {
  name: string;
  originalName: string;
  journal: boolean;
  properties: { key: string; value: string }[];
  blocks: any[];
};

export default function InlinePanel({ target }: { target: Target }) {
  const [service, setService] = useState<any>();
  const [view, setView] = useState<View | null>(null);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(target.page || '');
  const [anchor, setAnchor] = useState(target.block || '');
  const [graphName, setGraphName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeInlineViewer();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      const root = ref.current?.getRootNode();
      const active =
        root instanceof ShadowRoot ? (root.activeElement as HTMLElement | null) : null;
      const current = active ?? (document.activeElement as HTMLElement | null);
      if (!items.length) {
        e.preventDefault();
        ref.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = !!current && !!ref.current?.contains(current);
      if (e.shiftKey) {
        if (!inside || current === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      setView(null);
      setShowAll(false);
      try {
        const api = service || (await getLogseqService());
        setService(api);
        try {
          const graph = await api.getGraph();
          if (typeof graph === 'string') setGraphName(graph);
        } catch {
          // Graph metadata is optional; never block page rendering on it.
        }
        let p = page;
        let a = anchor;
        if (!p && target.block) {
          const b = await api.client.getBlockViaUuid(target.block, {});
          p = b?.page?.name ?? b?.page;
          a = String(b?.block?.preorder ?? target.block);
          setPage(p || '');
          setAnchor(a);
        }
        if (p) setView(await api.getPageView(p));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [page, anchor, target.block, reload]);

  // Scroll to and briefly highlight the anchor block once a page has rendered.
  useEffect(() => {
    if (!view || !anchor) return;
    const match = findBlockAnchor(view.blocks, anchor);
    if (!match) return;
    const id = match.selector?.id ?? String(match.preorder);
    const node = ref.current?.querySelector<HTMLElement>(
      `[data-block-id="${CSS.escape(id)}"]`,
    );
    if (!node) {
      // Large page: the anchor may live beyond the first 1500 rendered blocks.
      // Expand the full outline first; showAll is a dependency so this effect
      // re-runs once the block is actually in the DOM and can scroll to it.
      if (!showAll && view.blocks.length > 1500) setShowAll(true);
      return;
    }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('highlight');
    const timer = window.setTimeout(() => node.classList.remove('highlight'), 3000);
    return () => window.clearTimeout(timer);
  }, [view, anchor, showAll]);

  const navigate = (p: string, a = '') => {
    if (page) setHistory((h) => [...h, page]);
    setPage(p);
    setAnchor(a);
  };

  const click = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const pl = t.closest<HTMLAnchorElement>('a[data-logseq-page]');
    if (pl) {
      e.preventDefault();
      if (pl.dataset.logseqPage) navigate(pl.dataset.logseqPage);
      return;
    }
    const bl = t.closest<HTMLAnchorElement>('a[data-logseq-block]');
    if (bl) {
      e.preventDefault();
      const id = bl.dataset.logseqBlock;
      if (!id) return;
      const local = view && findBlockAnchor(view.blocks, id);
      if (local) {
        setAnchor(id);
        const localId = local.selector?.id ?? String(local.preorder);
        ref.current
          ?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(localId)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        void service?.client.getBlockViaUuid(id, {}).then((b: any) => {
          const p = b?.page?.name ?? b?.page;
          const preorder = b?.block?.preorder;
          if (p) navigate(p, preorder != null ? String(preorder) : id);
        });
      }
    }
  };

  const outline = view ? buildOutline(view) : [];
  const BLOCK_LIMIT = 1500;
  const truncated = !showAll && outline.length > BLOCK_LIMIT;
  const visibleBlocks = truncated ? outline.slice(0, BLOCK_LIMIT) : outline;

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeInlineViewer();
      }}
    >
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label="Logseq page viewer"
        tabIndex={-1}
        ref={ref}
        onClick={click}
      >
        <header className="header">
          <div className="toolbar">
            <button className="button" onClick={closeInlineViewer}>
              Close
            </button>
            <button
              className="button"
              disabled={!history.length}
              onClick={() => {
                const p = history.at(-1);
                if (p) {
                  setHistory((h) => h.slice(0, -1));
                  setPage(p);
                }
              }}
            >
              Back
            </button>
            <button className="button" onClick={() => setReload((x) => x + 1)}>
              Refresh
            </button>
            <button
              className="button"
              onClick={() => {
                if (page)
                  Browser.runtime.sendMessage({
                    type: 'open-viewer',
                    page,
                    block: anchor || undefined,
                  });
              }}
            >
              Open full page
            </button>
          </div>
          {view && (
            <>
              <h2>
                {view.originalName} {view.journal ? '(Journal)' : ''}
              </h2>
              {graphName ? <small>{graphName}</small> : null}
            </>
          )}
        </header>
        {loading ? (
          <div className="state">Loading…</div>
        ) : error ? (
          <div className="state">{error}</div>
        ) : !view ? (
          <div className="state">
            Page not found
            <br />
            <small>
              This page has no file in the graph; aliases are resolved, while tags
              and ghost pages are not file pages.
            </small>
          </div>
        ) : (
          <div className="content">
            {view.properties.length > 0 && (
              <details>
                <summary>Properties ({view.properties.length})</summary>
                {view.properties.map((p) => (
                  <div key={p.key}>
                    <b>{p.key}:</b> {p.value}
                  </div>
                ))}
              </details>
            )}
            {truncated && (
              <div className="notice">
                Showing {BLOCK_LIMIT} of {outline.length} blocks (large page){' '}
                <button className="button" onClick={() => setShowAll(true)}>
                  Show all
                </button>
              </div>
            )}
            {visibleBlocks.map(({ block, indent, anchor: a }) => {
              const r = renderBlock(
                {
                  uuid: a,
                  content: block.text,
                  html: '',
                  format: 'markdown',
                  marker: block.marker,
                  priority: '',
                  page: { name: view.name, id: 0, uuid: '' },
                } as any,
                graphName,
              );
              return (
                <div className="block" data-block-id={a} key={a} style={{ marginLeft: indent }}>
                  <span>{block.marker === '-' ? '•' : block.marker}</span>
                  <div className="body" dangerouslySetInnerHTML={{ __html: r.html }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
