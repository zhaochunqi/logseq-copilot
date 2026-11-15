import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLogseqService, renderBlock } from '@pages/logseq/tool';
import type { PageView as PageViewType } from '../../types/logseqBlock';
import styles from './graph.module.scss';

type Service = Awaited<ReturnType<typeof getLogseqService>>;
type GraphPage = { name: string; kind?: string; journal_date?: number | string | null; block_count?: number };
type SearchBlock = { uuid?: string; content?: string; text?: string; page?: string | { name?: string }; 'block/uuid'?: string; 'block/content'?: string };
type SearchPage = string | { name?: string; originalName?: string };
type SearchResults = { blocks?: SearchBlock[]; pages?: SearchPage[]; page_candidates?: SearchPage[] };
type Tag = { name: string; page_count?: number };

const PAGE_LIST_LIMIT = 300;
const BLOCK_RENDER_LIMIT = 1500;

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function pageName(page: SearchPage | undefined): string {
  return typeof page === 'string' ? page : page?.originalName ?? page?.name ?? '';
}

function readSearchResults(value: unknown): SearchResults {
  if (!value || typeof value !== 'object') return {};
  const result = value as { response?: unknown } & SearchResults;
  if (result.response && typeof result.response === 'object') return result.response as SearchResults;
  return result;
}

export default function GraphBrowser() {
  const initial = new URLSearchParams(window.location.search);
  const [service, setService] = useState<Service | null>(null);
  const [pages, setPages] = useState<GraphPage[]>([]);
  const [pageFilter, setPageFilter] = useState('');
  const [query, setQuery] = useState(initial.get('q') ?? '');
  const [selectedPage, setSelectedPage] = useState(initial.get('page') ?? '');
  const [pageView, setPageView] = useState<PageViewType | null>(null);
  const [graphName, setGraphName] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [loadingPages, setLoadingPages] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [anchor, setAnchor] = useState('');
  const [showAllBlocks, setShowAllBlocks] = useState(false);

  const writeUrl = useCallback((page: string, q: string, push = false) => {
    const url = new URL(window.location.href);
    if (page) url.searchParams.set('page', page);
    else url.searchParams.delete('page');
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    if (push) window.history.pushState({}, '', url);
    else window.history.replaceState({}, '', url);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const api = await getLogseqService();
        if (!active) return;
        setService(api);
        const [allPages, graph] = await Promise.all([
          api.client.getAllPages(),
          api.getGraph().catch(() => ''),
        ]);
        if (!active) return;
        const pageData = (allPages as unknown as { pages?: GraphPage[] } | GraphPage[]);
        setPages(Array.isArray(pageData) ? pageData : pageData?.pages ?? []);
        setGraphName(typeof graph === 'string' ? graph : '');
        try {
          const tagData = await api.client.baseJson('logseq.Graph.getAllTags', []) as { tags?: Tag[] } | Tag[];
          if (active) setTags(Array.isArray(tagData) ? tagData : tagData?.tags ?? []);
        } catch {
          // Tags are optional for graph browsing.
        }
      } catch (cause) {
        if (active) setError(getMessage(cause));
      } finally {
        if (active) setLoadingPages(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const navigatePage = useCallback((name: string, block = '', push = true) => {
    setSelectedPage(name);
    setAnchor(block);
    setError('');
    setNotFound(false);
    writeUrl(name, query, push);
  }, [query, writeUrl]);

  useEffect(() => {
    if (!service || !selectedPage) {
      setPageView(null);
      setLoadingPage(false);
      return;
    }
    let active = true;
    setLoadingPage(true);
    setShowAllBlocks(false);
    setError('');
    setNotFound(false);
    void service.getPageView(selectedPage).then((view) => {
      if (!active) return;
      setPageView(view as PageViewType | null);
      setNotFound(!view);
    }).catch((cause: unknown) => {
      if (active) setError(getMessage(cause));
    }).finally(() => {
      if (active) setLoadingPage(false);
    });
    return () => { active = false; };
  }, [selectedPage, service]);

  useEffect(() => {
    if (!service || !query.trim()) {
      setSearchResults(null);
      setLoadingSearch(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingSearch(true);
      void service.client.search(query.trim()).then((result: unknown) => {
        if (active) setSearchResults(readSearchResults(result));
      }).catch(() => {
        if (active) setSearchResults({});
      }).finally(() => {
        if (active) setLoadingSearch(false);
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, service]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedPage(params.get('page') ?? '');
      setQuery(params.get('q') ?? '');
      setAnchor('');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    writeUrl(selectedPage, query, false);
  }, [query, selectedPage, writeUrl]);

  useEffect(() => {
    if (!pageView || !anchor) return;
    const foundIndex = pageView.blocks.findIndex((block) => block.selector?.id === anchor || String(block.preorder) === anchor);
    if (foundIndex < 0) return;
    if (foundIndex >= BLOCK_RENDER_LIMIT && !showAllBlocks) {
      setShowAllBlocks(true);
      return;
    }
    const found = pageView.blocks[foundIndex];
    const id = found.selector?.id ?? String(found.preorder);
    const node = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add(styles.highlight);
    const timer = window.setTimeout(() => node.classList.remove(styles.highlight), 4000);
    return () => window.clearTimeout(timer);
  }, [anchor, pageView, showAllBlocks]);

  const visiblePages = useMemo(() => {
    const filter = pageFilter.trim().toLocaleLowerCase();
    return pages.filter((page) => !filter || page.name.toLocaleLowerCase().includes(filter));
  }, [pageFilter, pages]);
  const displayedPages = visiblePages.slice(0, PAGE_LIST_LIMIT);
  const displayedBlocks = pageView
    ? showAllBlocks ? pageView.blocks : pageView.blocks.slice(0, BLOCK_RENDER_LIMIT)
    : [];

  const openSearchBlock = async (block: SearchBlock) => {
    const id = block.uuid ?? block['block/uuid'] ?? '';
    let name = typeof block.page === 'string' ? block.page : block.page?.name ?? '';
    if (!name && id) {
      try {
        const data = await service?.client.getBlockViaUuid(id, {}) as { page?: string | { name?: string } } | undefined;
        name = typeof data?.page === 'string' ? data.page : data?.page?.name ?? '';
      } catch (cause) {
        setError(getMessage(cause));
        return;
      }
    }
    if (name) navigatePage(name, id);
  };

  const openFullPage = () => {
    if (!selectedPage) return;
    void browser.tabs.create({ url: browser.runtime.getURL(`viewer.html?page=${encodeURIComponent(selectedPage)}`) });
  };

  const scrollToBlock = async (uuid: string) => {
    const local = pageView?.blocks.find((block) => block.selector?.id === uuid || String(block.preorder) === uuid);
    if (local) {
      setAnchor(uuid);
      const node = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(local.selector?.id ?? String(local.preorder))}"]`);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        node.classList.add(styles.highlight);
        window.setTimeout(() => node.classList.remove(styles.highlight), 4000);
      }
      return;
    }
    try {
      const data = await service?.client.getBlockViaUuid(uuid, {}) as { block?: { preorder?: number }; preorder?: number; page?: string | { name?: string } } | undefined;
      const targetPage = typeof data?.page === 'string' ? data.page : data?.page?.name;
      const preorder = data?.block?.preorder ?? data?.preorder;
      if (targetPage) navigatePage(targetPage, typeof preorder === 'number' ? String(preorder) : uuid);
    } catch (cause) {
      setError(getMessage(cause));
    }
  };

  const handleContentClick = (event: React.MouseEvent<HTMLElement>) => {
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

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <header className={styles.brand}>
          <div className={styles.brandTitle}>Graph Browser</div>
          <div className={styles.brandMeta}>{graphName || 'Read-only graph view'}</div>
        </header>
        <div className={styles.searchArea}>
          <label className={styles.label} htmlFor="graph-search">Search graph</label>
          <input id="graph-search" className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and blocks" />
        </div>
        {query.trim() ? (
          <div className={styles.searchResults}>
            <div className={styles.sectionTitle}>Search results</div>
            {loadingSearch ? <div className={styles.state}>Searching…</div> : null}
            {!loadingSearch && searchResults ? (
              <>
                {(searchResults.pages ?? searchResults.page_candidates ?? []).map((item, index) => {
                  const name = pageName(item);
                  return name ? <button type="button" className={styles.result} key={`p-${name}-${index}`} onClick={() => navigatePage(name)}>{name}<span className={styles.resultDetail}>Page</span></button> : null;
                })}
                {(searchResults.blocks ?? []).map((block, index) => {
                  const name = typeof block.page === 'string' ? block.page : block.page?.name ?? '';
                  const id = block.uuid ?? block['block/uuid'] ?? '';
                  const text = block.content ?? block.text ?? block['block/content'] ?? '';
                  return <button type="button" className={styles.result} key={`b-${id}-${index}`} onClick={() => void openSearchBlock(block)}>{name || 'Block match'}<span className={styles.resultDetail}>{text}</span></button>;
                })}
                {!searchResults.pages?.length && !searchResults.page_candidates?.length && !searchResults.blocks?.length ? <div className={styles.state}>No matches found.</div> : null}
              </>
            ) : null}
          </div>
        ) : null}
        <div className={styles.searchArea}>
          <label className={styles.label} htmlFor="page-filter">Pages</label>
          <input id="page-filter" className={styles.input} value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} placeholder="Filter pages" />
        </div>
        <nav className={styles.pageList} aria-label="Graph pages">
          {loadingPages ? <div className={styles.state}>Loading pages…</div> : null}
          {!loadingPages && displayedPages.map((page) => (
            <button type="button" className={`${styles.pageButton} ${selectedPage === page.name ? styles.pageButtonActive : ''}`} key={page.name} onClick={() => navigatePage(page.name)}>
              <span className={styles.pageName}>{page.name}</span>
              {page.kind === 'journal' || page.journal_date ? <span className={styles.badge}>Journal</span> : null}
            </button>
          ))}
          {!loadingPages && !visiblePages.length ? <div className={styles.state}>{pages.length ? 'No pages match.' : 'No pages available.'}</div> : null}
          {!loadingPages && visiblePages.length > PAGE_LIST_LIMIT ? <div className={styles.listNotice}>Showing {PAGE_LIST_LIMIT} of {visiblePages.length} pages — refine filter or search for more</div> : null}
        </nav>
        {tags.length ? (
          <section className={styles.tags}>
            <div className={styles.sectionTitle}>Tags</div>
            {tags.map((tag) => <button type="button" className={styles.tagButton} key={tag.name} onClick={() => setQuery(tag.name)}>#{tag.name}{typeof tag.page_count === 'number' ? ` · ${tag.page_count}` : ''}</button>)}
          </section>
        ) : null}
      </aside>
      <main className={styles.main} onClick={handleContentClick}>
        <div className={styles.content}>
          {!selectedPage ? <div className={styles.state}>Choose a page or search the graph to get started.</div> : null}
          {loadingPage ? <div className={styles.state}>Loading page…</div> : null}
          {!loadingPage && error ? <div className={`${styles.state} ${styles.error}`}>Unable to load graph data: {error}</div> : null}
          {!loadingPage && !error && notFound ? <div className={styles.state}>Page not found: {selectedPage}</div> : null}
          {!loadingPage && !error && pageView ? (
            <>
              <header className={styles.header}>
                <div className={styles.headerActions}><button type="button" className={styles.action} onClick={openFullPage}>Open full page in new tab</button></div>
                <h1 className={styles.title}>{pageView.originalName}</h1>
                <div className={styles.metadata}>{pageView.journal ? <span className={styles.badge}>Journal</span> : null}{graphName ? <span>Graph: {graphName}</span> : null}</div>
              </header>
              {pageView.properties.length ? <details className={styles.properties}><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Properties ({pageView.properties.length})</summary><div className={styles.propertyList}>{pageView.properties.map(({ key, value }) => <div className={styles.property} key={key}><span className={styles.propertyKey}>{key}: </span>{value}</div>)}</div></details> : null}
              <section className={styles.blocks}>
                {pageView.blocks.length > BLOCK_RENDER_LIMIT && !showAllBlocks ? (
                  <div className={styles.largePageNotice}>
                    <span>Showing {BLOCK_RENDER_LIMIT} of {pageView.blocks.length} blocks (large page)</span>
                    <button type="button" className={styles.action} onClick={() => setShowAllBlocks(true)}>Show all</button>
                  </div>
                ) : null}
                {displayedBlocks.map((block) => {
                  const id = block.selector?.id ?? String(block.preorder);
                  const rendered = renderBlock({ uuid: id, content: block.text, html: '', format: 'markdown', marker: block.marker, priority: '', page: { name: pageView.name, id: 0, uuid: '' } }, graphName);
                  return <div className={styles.block} data-block-id={id} key={`${block.preorder}-${id}`} style={{ marginLeft: `${block.depth * 16}px` }}><span className={styles.bullet} aria-hidden="true">{block.marker === '-' ? '•' : block.marker}</span><div className={styles.blockBody} dangerouslySetInnerHTML={{ __html: rendered.html }} /></div>;
                })}
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
