import type { LogseqPageEntry, PageBlock } from '@/types/logseqBlock';

/** Page rows drawn before asking the user to narrow the list. */
export const MAX_PAGES = 300;

/** Blocks drawn for a page before "Show all". */
export const MAX_BLOCKS = 1500;

export type GraphParams = { page: string; block: string; q: string };

/** The `?page=&block=&q=` state of the browser page. */
export const parseGraphParams = (search: string): GraphParams => {
  const params = new URLSearchParams(search);
  return {
    page: params.get('page') ?? '',
    block: params.get('block') ?? '',
    q: params.get('q') ?? '',
  };
};

/** `?page=&q=` for history.pushState; empty when neither is set. */
export const graphSearch = (page?: string, q?: string): string => {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (q) params.set('q', q);
  const query = params.toString();
  return query ? `?${query}` : '';
};

const journalOf = (page: LogseqPageEntry) =>
  !!page.journal_date || page.kind === 'journal';

/** Rows to draw: every page whose name contains `filter`, case-insensitively. */
export const filterPages = (
  pages: LogseqPageEntry[],
  filter: string,
): LogseqPageEntry[] => {
  const needle = filter.trim().toLowerCase();
  if (!needle) return pages;
  return pages.filter((page) => page.name.toLowerCase().includes(needle));
};

/** The first `MAX_PAGES` rows, and whether more were left out. */
export const visiblePages = (
  pages: LogseqPageEntry[],
): { pages: LogseqPageEntry[]; total: number; truncated: boolean } => ({
  pages: pages.slice(0, MAX_PAGES),
  total: pages.length,
  truncated: pages.length > MAX_PAGES,
});

/** Blocks to draw: a large page stops at `MAX_BLOCKS` until shown in full. */
export const visibleBlocks = (blocks: PageBlock[], showAll: boolean) =>
  showAll ? blocks : blocks.slice(0, MAX_BLOCKS);

export const isJournal = journalOf;
