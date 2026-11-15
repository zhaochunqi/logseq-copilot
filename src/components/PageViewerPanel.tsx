import type { MouseEvent } from 'react';
import { ArrowLeft, ExternalLink, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { PageBlock, PageView } from '@/types/logseqBlock';
import { sanitizeHtml } from '@/utils/sanitize-html';
import { Button } from '@/components/ui/button';

export interface PageViewerPanelProps {
  view: PageView | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onBack: () => void;
  onRefresh: () => void;
  onOpenFullPage: () => void;
  /** Delegated `[[page]]` / block links in rendered block HTML. */
  onNavigate?: (target: { page?: string; block?: string }) => void;
  /** A block opened by UUID: highlighted after the page view has loaded. */
  anchorBlock?: string | null;
  canBack?: boolean;
}

const bullet = (marker: string) =>
  marker === '-' || marker === '- ' ? '•' : marker;

const blockId = (block: PageBlock) =>
  block.selector?.id ?? String(block.preorder);

export function PageViewerPanel({
  view,
  loading,
  error,
  onClose,
  onBack,
  onRefresh,
  onOpenFullPage,
  onNavigate,
  anchorBlock = null,
  canBack = false,
}: PageViewerPanelProps) {
  const handleClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.(
      'a[data-logseq-page],a[data-logseq-block]',
    ) as HTMLAnchorElement | null | undefined;
    if (!link) return;
    const page = link.dataset.logseqPage;
    const block = link.dataset.logseqBlock;
    if (!page && !block) return;
    event.preventDefault();
    // The drawer's shadow-root listener handles the legacy `logseq:` hrefs;
    // links with data attributes are handled here, once.
    event.stopPropagation();
    onNavigate?.({ ...(page ? { page } : {}), ...(block ? { block } : {}) });
  };

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`Page viewer: ${view?.originalName ?? 'loading'}`}
      className="flex h-full flex-col bg-background text-foreground"
    >
      <header className="flex items-center gap-1 border-b px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          disabled={!canBack}
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
          {view?.originalName ?? 'Page viewer'}
          {view?.journal && (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal">
              Journal
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" aria-label="Refresh" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open full page"
          onClick={onOpenFullPage}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4" onClick={handleClick}>
        {loading && (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!loading && !error && !view && (
          <p className="text-sm text-muted-foreground">Page not found.</p>
        )}
        {view && (
          <>
            {!!view.properties.length && (
              <details className="mb-4 rounded border p-2 text-sm">
                <summary className="cursor-pointer font-medium">Properties</summary>
                <dl className="mt-2 space-y-1">
                  {view.properties.map((property, index) => (
                    <div key={`${property.key}-${index}`} className="flex gap-2">
                      <dt className="shrink-0 font-medium">{property.key}</dt>
                      <dd className="min-w-0 break-words text-muted-foreground">
                        {property.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <ol className="space-y-1">
              {view.blocks.map((block) => (
                <li
                  key={blockId(block)}
                  data-block-id={blockId(block)}
                  style={{ paddingLeft: `${Math.max(0, block.depth) * 16}px` }}
                  className={`flex gap-2 rounded-sm text-sm leading-6 ${
                    anchorBlock === blockId(block)
                      ? 'bg-amber-100/80 ring-1 ring-amber-400 dark:bg-amber-900/30'
                      : ''
                  }`}
                >
                  <span aria-hidden className="shrink-0 text-muted-foreground">
                    {bullet(block.marker)}
                  </span>
                  <div
                    className="min-w-0 [&_a]:text-primary [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html ?? '') }}
                  />
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </section>
  );
}
