import { useEffect, useRef } from 'react';
import { SidebarPanel } from '@/components/SidebarPanel';
import { useActiveTab } from '@/hooks/use-active-tab';
import { useLogseqSearch } from '@/hooks/use-logseq-search';
import { usePageHighlights } from '@/hooks/use-page-highlights';
import { usePageRecall } from '@/hooks/use-page-recall';
import { sendMessage } from '@/types/messaging';
import { browser } from 'wxt/browser';
import log from '@/utils/logger';
import { openLogseqLinksFromBackground } from '@/utils/logseq-links';

/**
 * This page has no tab of its own. Logseq links are translated to the
 * extension's read-only Graph page and opened in a new tab.
 */
const openGraphPage = async (url: string) => {
  const parsed = new URL(url);
  const page = parsed.searchParams.get('page');
  const block = parsed.searchParams.get('block-id');
  const query = page
    ? `?page=${encodeURIComponent(page)}`
    : block
      ? `?block=${encodeURIComponent(block)}`
      : '';
  const graphUrl = `${browser.runtime.getURL('/graph.html' as any)}${query}`;
  try {
    await browser.tabs.create({ url: graphUrl });
  } catch (error) {
    log.warn('Failed to open the Graph page in a new tab:', error);
    await sendMessage('app:openPage', { url: graphUrl });
  }
};

const openSettings = () => {
  sendMessage('app:openOptions').catch((error) =>
    log.error('Failed to open the options page:', error),
  );
};

/**
 * The highlights of the page in the active tab and what Logseq has about it,
 * in the browser sidebar (Chrome and Edge side panel, Firefox sidebar). It
 * only holds what it can read again on mount, from the active tab and from
 * storage: Edge reloads the side panel when the tab changes.
 */
export default function App() {
  const { tab, loading: tabLoading } = useActiveTab();
  const url = tab?.url ?? null;
  const { highlights, notice, setNotice, deleteHighlight, updateNote } =
    usePageHighlights(url);
  const { retry: retryRecall, ...recall } = usePageRecall(url);
  // Not tied to the page: it stays while the tab changes, until cleared.
  const search = useLogseqSearch();

  const tabId = tab?.id;

  // `logseq:` links are intercepted and turned into the extension's Graph
  // page, so following one here does not launch the desktop app or replace
  // the page beside this sidebar.
  const root = useRef<HTMLDivElement>(null);
  useEffect(
    () => openLogseqLinksFromBackground(root.current!, openGraphPage),
    [],
  );

  const handleSelect = async (id: string) => {
    if (!tab) return;
    setNotice(null);
    try {
      const found = await sendMessage(
        'content:scrollToHighlight',
        { id },
        tab.id,
      );
      if (!found) setNotice("Couldn't find this highlight on the page");
    } catch (error) {
      // There is no content script in the tab: a restricted page, or a tab
      // that was already open when the extension was installed or updated.
      log.warn('Failed to scroll to the highlight:', error);
      setNotice('Reload the page to jump to highlights');
    }
  };

  const status =
    tabLoading || (url && highlights === null)
      ? 'loading'
      : !url || !highlights
      ? 'unavailable'
      : 'ready';

  return (
    <div ref={root} className="h-screen">
      <SidebarPanel
        status={status}
        highlights={highlights ?? []}
        notice={notice}
        onSelect={handleSelect}
        onDelete={deleteHighlight}
        onUpdateNote={updateNote}
        recall={recall}
        onRetryRecall={retryRecall}
        search={search}
        onOpenSettings={openSettings}
      />
    </div>
  );
}
