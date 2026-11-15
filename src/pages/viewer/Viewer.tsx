import { useCallback, useEffect, useState } from 'react';
import { getLogseqService, renderBlock } from '@pages/logseq/tool';
import styles from './viewer.module.scss';

type PageBlock = {
  preorder: number;
  depth: number;
  marker: string;
  text: string;
  selector?: { kind: 'durable' | 'ephemeral'; id: string } | null;
};
type PageView = {
  name: string;
  originalName: string;
  journal: boolean;
  properties: { key: string; value: string }[];
  blocks: PageBlock[];
};
type Service = Awaited<ReturnType<typeof getLogseqService>>;

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function Viewer() {
  const params = new URLSearchParams(window.location.search);
  const [page, setPage] = useState(params.get('page') ?? '');
  const [graphName, setGraphName] = useState(params.get('graph') ?? '');
  const [pageView, setPageView] = useState<PageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [service, setService] = useState<Service | null>(null);
  const [anchor, setAnchor] = useState(params.get('block') ?? '');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onPopState = () => {
      const next = new URLSearchParams(window.location.search);
      setPage(next.get('page') ?? '');
      setAnchor(next.get('block') ?? '');
      setGraphName(next.get('graph') ?? '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadPage = useCallback(async (name: string) => {
    setLoading(true);
    setError('');
    setPageView(null);
    try {
      const api = await getLogseqService();
      setService(api);
      try {
        const graph = await api.getGraph();
        const graphValue = typeof graph === 'string' ? graph : (graph as { name?: string } | null)?.name;
        if (graphValue) setGraphName(graphValue);
      } catch {
        // Graph metadata is optional and must not prevent page rendering.
      }
      const result = await api.getPageView(name);
      setPageView(result as PageView | null);
    } catch (cause) {
      setError(getMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!page) {
      setLoading(false);
      return;
    }
    void loadPage(page);
  }, [loadPage, page, reloadKey]);

  useEffect(() => {
    if (!pageView || !anchor) return;
    const match = pageView.blocks.find((block) =>
      block.selector?.id === anchor || String(block.preorder) === anchor,
    );
    if (!match) return;
    const id = match.selector?.id ?? String(match.preorder);
    const node = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add(styles.highlight);
    const timer = window.setTimeout(() => node.classList.remove(styles.highlight), 4000);
    return () => window.clearTimeout(timer);
  }, [anchor, pageView]);

  const navigatePage = (name: string, block = '') => {
    const next = new URL(window.location.href);
    next.searchParams.set('page', name);
    if (block) next.searchParams.set('block', block);
    else next.searchParams.delete('block');
    window.history.pushState({}, '', next);
    setAnchor(block);
    setPage(name);
  };

  const scrollToLocal = (block: PageBlock) => {
    const id = block.selector?.id ?? String(block.preorder);
    setAnchor(id);
    const node = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add(styles.highlight);
    window.setTimeout(() => node.classList.remove(styles.highlight), 4000);
  };

  const scrollToBlock = async (uuid: string) => {
    const local = pageView?.blocks.find(
      (block) => block.selector?.id === uuid || String(block.preorder) === uuid,
    );
    if (local) {
      scrollToLocal(local);
      return;
    }
    try {
      const block = await service?.client.getBlockViaUuid(uuid, {});
      // A block with no `id::` has no selector in a page snapshot; fall back to its
      // preorder position within the page so the anchor still lands on the right block.
      const preorder = block?.block?.preorder ?? block?.preorder;
      if (typeof preorder === 'number') {
        const byPreorder = pageView?.blocks.find((item) => item.preorder === preorder);
        if (byPreorder) {
          scrollToLocal(byPreorder);
          return;
        }
      }
      const blockPage = block?.page;
      const targetPage = typeof blockPage === 'string' ? blockPage : (blockPage as { name?: string } | undefined)?.name;
      if (targetPage) navigatePage(targetPage, uuid);
    } catch (cause) {
      setError(getMessage(cause));
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const pageLink = target.closest<HTMLAnchorElement>('a[data-logseq-page]');
    if (pageLink) {
      event.preventDefault();
      const name = pageLink.dataset.logseqPage;
      if (name) navigatePage(name);
      return;
    }
    const blockLink = target.closest<HTMLAnchorElement>('a[data-logseq-block]');
    if (blockLink) {
      event.preventDefault();
      const id = blockLink.dataset.logseqBlock;
      if (id) void scrollToBlock(id);
    }
  };

  const refresh = () => setReloadKey((value) => value + 1);

  return (
    <main className={styles.viewer} onClick={handleClick}>
      <div className={styles.content}>
        {loading ? <div className={styles.state}>Loading…</div> : null}
        {!loading && !page ? <div className={styles.state}>Page parameter is required.</div> : null}
        {!loading && error ? <div className={`${styles.state} ${styles.error}`}>Unable to load page: {error}</div> : null}
        {!loading && !error && pageView === null && page ? (
          <div className={styles.state}>
            <div>Page not found</div>
            <div className="mt-2 text-sm">This page has no file in the graph. Aliases are resolved through App.search page candidates; tags and ghost pages are not file pages.</div>
          </div>
        ) : null}
        {!loading && !error && pageView ? (
          <>
            <header className={styles.header}>
              <div className={styles.toolbar}>
                <button type="button" className={styles.navButton} onClick={() => window.history.back()}>Back</button>
                <button type="button" className={styles.navButton} onClick={() => window.history.forward()}>Forward</button>
                <button type="button" className={styles.navButton} onClick={refresh}>Refresh</button>
              </div>
              <h1 className={styles.title}>{pageView.originalName}</h1>
              <div className={styles.metadata}>
                {pageView.journal ? <span className={styles.badge}>Journal</span> : null}
                {graphName ? <span>Graph: {graphName}</span> : null}
              </div>
            </header>
            {pageView.properties.length ? (
              <details className={styles.properties}>
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Properties ({pageView.properties.length})</summary>
                <div className={styles.propertyList}>
                  {pageView.properties.map(({ key, value }) => (
                    <div className={styles.property} key={key}><span className={styles.propertyKey}>{key}: </span>{value}</div>
                  ))}
                </div>
              </details>
            ) : null}
            <section className={styles.blocks}>
              {pageView.blocks.map((block) => {
                const id = block.selector?.id ?? String(block.preorder);
                const rendered = renderBlock(
                  { uuid: id, content: block.text, html: '', format: 'markdown', marker: block.marker, priority: '', page: { name: pageView.name, id: 0, uuid: '' } },
                  graphName,
                );
                return (
                  <div className={styles.block} data-block-id={id} key={`${block.preorder}-${id}`} style={{ marginLeft: `${block.depth * 16}px` }}>
                    <span className={styles.bullet} aria-hidden="true">{block.marker === '-' ? '•' : block.marker}</span>
                    <div className={styles.blockBody} dangerouslySetInnerHTML={{ __html: rendered.html }} />
                  </div>
                );
              })}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
