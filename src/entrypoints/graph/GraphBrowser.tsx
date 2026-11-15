import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  LogseqPageEntry,
  LogseqSearchResult,
  PageBlock,
  PageView,
} from '@/types/logseqBlock';
import { sendMessage } from '@/types/messaging';
import { sanitizeHtml } from '@/utils/sanitize-html';
import {
  filterPages,
  graphSearch,
  MAX_BLOCKS,
  MAX_PAGES,
  isJournal,
  parseGraphParams,
  visibleBlocks,
  visiblePages,
} from './model';
import styles from './graph.module.scss';

type Target = { page?: string; block?: string };

/** `logseq://graph/<g>?page=|block-id=` rendered into block HTML: never followed. */
const targetOf = (href: string): Target => {
  const url = new URL(href);
  return {
    page: url.searchParams.get('page') ?? undefined,
    block: url.searchParams.get('block-id') ?? undefined,
  };
};

const blockKey = (block: PageBlock) =>
  block.selector?.id ?? String(block.preorder);

function PageBlocks({ view }: { view: PageView }) {
  const [showAll, setShowAll] = useState(false);
  const blocks = visibleBlocks(view.blocks, showAll);
  return (
    <>
      <ol className={styles.blocks}>
        {blocks.map((block) => (
          <li
            key={blockKey(block)}
            data-block-id={blockKey(block)}
            style={{ paddingLeft: `${Math.max(0, block.depth) * 16}px` }}
          >
            <span aria-hidden className={styles.marker}>
              {block.marker === '-' || block.marker === '- '
                ? '•'
                : block.marker}
            </span>
            <div
              className={styles.blockHtml}
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(block.html ?? ''),
              }}
            />
          </li>
        ))}
      </ol>
      {!showAll && view.blocks.length > MAX_BLOCKS && (
        <button type="button" onClick={() => setShowAll(true)}>
          Show all {view.blocks.length} blocks
        </button>
      )}
    </>
  );
}

function SearchResults({
  result,
  onSelect,
}: {
  result: LogseqSearchResult;
  onSelect: (target: Target) => void;
}) {
  const pages = (result.pages ?? []).filter((page) => !!page?.name);
  const blocks = (result.blocks ?? []).filter((block) => !!block?.html);
  return (
    <section aria-label="Search results" className={styles.results}>
      <h2>Search results</h2>
      {pages.map((page) => (
        <button
          type="button"
          className={styles.result}
          key={`page-${page.name}`}
          onClick={() => onSelect({ page: page.name })}
        >
          {page.name}
        </button>
      ))}
      {blocks.map((block) => (
        <button
          type="button"
          className={styles.result}
          key={`block-${block.uuid}`}
          title={block.content}
          onClick={() =>
            onSelect({ page: block.page?.name, block: block.uuid })
          }
        >
          <span className={styles.resultPage}>{block.page?.name}</span>
          <span className={styles.resultText}>{block.content}</span>
        </button>
      ))}
      {!pages.length && !blocks.length && <p>Nothing found.</p>}
    </section>
  );
}

/**
 * The standalone read-only Graph browser (`graph.html`): search and page list
 * on the left, one whole page on the right. It only reads (`logseq:allPages`,
 * `logseq:search`, `logseq:pageView`) and `logseq:` links switch pages here
 * instead of launching the Logseq desktop app.
 */
export default function GraphBrowser() {
  const [pages, setPages] = useState<LogseqPageEntry[]>([]);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState(() => parseGraphParams(location.search).q);
  const [search, setSearch] = useState<LogseqSearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState(
    () => parseGraphParams(location.search).page,
  );
  const [anchor, setAnchor] = useState<string | null>(
    () => parseGraphParams(location.search).block || null,
  );
  const [view, setView] = useState<PageView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const loadPages = () => {
    setPagesError(null);
    sendMessage('logseq:allPages').then(
      (list) => setPages(list ?? []),
      (cause) =>
        setPagesError(cause instanceof Error ? cause.message : String(cause)),
    );
  };

  const loadPage = (target: Target) => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    sendMessage('logseq:pageView', target)
      .then(
        (next) => {
          if (id !== request.current) return;
          setView(next);
          // A block link solved to its page titles the view; keep the URL in step.
          if (next && !selected) setSelected(next.name);
        },
        (cause) => {
          if (id !== request.current) return;
          setError(cause instanceof Error ? cause.message : String(cause));
        },
      )
      .finally(() => {
        if (id === request.current) setLoading(false);
      });
  };

  const runSearch = (submitted: string) => {
    setSearchError(null);
    if (!submitted) {
      setSearch(null);
      return;
    }
    sendMessage('logseq:search', submitted).then(
      (answer) =>
        setSearch(answer.status === 200 ? answer.response ?? null : null),
      (cause) => {
        setSearch(null);
        setSearchError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  useEffect(loadPages, []);
  useEffect(() => {
    if (!selected && !anchor) {
      setView(null);
      return;
    }
    loadPage(selected ? { page: selected } : { block: anchor! });
    // Only the route selects the page; loadPage closes over the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, anchor]);
  // Restore `?q=` of a refreshed tab: the same search again.
  useEffect(() => {
    const restored = parseGraphParams(location.search).q;
    if (restored) runSearch(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The drawer's "Open full page" link may carry a block to highlight.
  useEffect(() => {
    if (!view || !anchor) return;
    const block = [
      ...document.querySelectorAll<HTMLElement>('[data-block-id]'),
    ].find((element) => element.dataset.blockId === anchor);
    block?.scrollIntoView?.({ block: 'center' });
  }, [view, anchor]);

  useEffect(() => {
    const onPop = () => {
      const params = parseGraphParams(location.search);
      setSelected(params.page);
      setAnchor(params.block || null);
      setQuery(params.q);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const navigate = (target: Target) => {
    if (!target.page && !target.block) return;
    // Back to the top of the page the link stays in.
    setAnchor(target.block && target.block !== anchor ? target.block : null);
    setSelected(target.page ?? selected);
    history.pushState({}, '', graphSearch(target.page ?? selected, query));
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const submitted = query.trim();
    history.pushState({}, '', graphSearch(selected || undefined, submitted));
    runSearch(submitted);
  };

  const listed = useMemo(
    () => visiblePages(filterPages(pages, filter)),
    [pages, filter],
  );

  const handleContentClick = (event: React.MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.('a[href]') as
      | HTMLAnchorElement
      | null
      | undefined;
    if (!link) return;
    if (link.dataset.logseqPage || link.dataset.logseqBlock) {
      event.preventDefault();
      navigate({
        page: link.dataset.logseqPage,
        block: link.dataset.logseqBlock,
      });
    } else if (link.protocol === 'logseq:') {
      // Never let a logseq: URL launch the desktop app.
      event.preventDefault();
      navigate(targetOf(link.href));
    }
  };

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <h1>Graph Browser</h1>
        <form onSubmit={submitSearch}>
          <input
            aria-label="Search graph"
            placeholder="Search pages and blocks"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>
        {searchError && <p role="alert">{searchError}</p>}
        {search && <SearchResults result={search} onSelect={navigate} />}
        <label>
          Pages
          <input
            aria-label="Filter pages"
            placeholder="Filter pages"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        {pagesError && (
          <p role="alert">
            {pagesError}{' '}
            <button type="button" onClick={loadPages}>
              Retry
            </button>
          </p>
        )}
        <div className={styles.pageList}>
          {listed.pages.map((page) => (
            <button
              type="button"
              key={page.name}
              aria-current={selected === page.name ? 'page' : undefined}
              className={selected === page.name ? styles.active : undefined}
              onClick={() => navigate({ page: page.name })}
            >
              <span className={styles.pageName}>{page.name}</span>
              {isJournal(page) && <span className={styles.badge}>Journal</span>}
            </button>
          ))}
        </div>
        {listed.truncated && (
          <p>
            Showing {MAX_PAGES} of {listed.total} pages — refine filter or
            search
          </p>
        )}
      </aside>
      <main
        className={styles.content}
        onClick={handleContentClick}
        onAuxClick={handleContentClick}
      >
        {loading && (
          <p role="status" className={styles.status}>
            Loading page…
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && !view && <p>Select a page</p>}
        {view && (
          <article>
            <header>
              <h2>
                {view.originalName}
                {view.journal && <span className={styles.badge}>Journal</span>}
              </h2>
            </header>
            {view.properties.length > 0 && (
              <details open className={styles.properties}>
                <summary>Properties</summary>
                <dl>
                  {view.properties.map((property, index) => (
                    <div key={`${property.key}-${index}`}>
                      <dt>{property.key}</dt>
                      <dd>{property.value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <PageBlocks view={view} />
          </article>
        )}
      </main>
    </div>
  );
}
