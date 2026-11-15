export type LogseqPageIdenity = {
  name: string;
  id: number;
  uuid: string;
  originalName?: string;
};

export type LogseqBlockType = {
  uuid: string;
  html: string;
  page: LogseqPageIdenity;
  content: string;
  format: string;
  marker: string;
  priority: string;
  /** Entity id and parent entity id: nests results under their parent. */
  id?: number;
  parent?: { id: number };
  /** Text of the blocks referenced as `((uuid))`, by uuid. */
  refTitles?: Record<string, string>;
  /** DB graphs: class tags shown after the block (not the inline ones). */
  tagNames?: string[];
};

export type LogseqPageContentType = {
  uuid: string;
  content: string;
  page: LogseqPageIdenity;
};

/** Identity of one block as `logseq-graph` states it on reads. */
export type PageBlockSelector = {
  kind: 'durable' | 'ephemeral';
  id: string;
};

/** One block of a whole page read (`getPageBlocksTree` / `getPageSnapshot`). */
export type PageBlock = {
  preorder: number;
  depth: number;
  marker: string;
  text: string;
  selector?: PageBlockSelector | null;
  /** The block's markdown rendered to sanitized HTML by the background. */
  html?: string;
};

export type PageProperty = { key: string; value: string };

/** One page rendered from the API, read-only. */
export type PageView = {
  name: string;
  originalName: string;
  journal: boolean;
  properties: PageProperty[];
  blocks: PageBlock[];
};

/** One entry of `logseq.Editor.getAllPages`, as `logseq-graph` states it. */
export type LogseqPageEntry = {
  name: string;
  id?: number;
  kind?: string;
  journal_date?: string | null;
  block_count?: number;
};

export type LogseqSearchResult = {
  blocks: LogseqBlockType[];
  pages: LogseqPageIdenity[];
  // pageContents: LogseqPageContentType[];
  graph: string;
};

/**
 * Answer to `logseq:changeBlockMarker`. `marker` is the marker the block now
 * has when `status` is 'success', otherwise the marker that was requested.
 */
export type ChangeBlockMarkerResult = {
  type: 'change-block-marker-result';
  uuid: string;
  status: 'success' | 'failed';
  marker: string;
  msg?: string;
};
