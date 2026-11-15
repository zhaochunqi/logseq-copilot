export type LogseqPageIdenity = {
  name: string;
  id: number;
  uuid: string;
  originalName?: string;
};

export type PageBlockSelector = {
  kind: 'durable' | 'ephemeral';
  id: string;
};

export type PageBlock = {
  preorder: number;
  depth: number;
  marker: string;
  text: string;
  selector?: PageBlockSelector | null;
};

export type PageProperty = { key: string; value: string };

export type PageView = {
  name: string;
  originalName: string;
  journal: boolean;
  properties: PageProperty[];
  blocks: PageBlock[];
};

export type LogseqBlockType = {
  uuid: string;
  html: string;
  page: LogseqPageIdenity;
  content: string;
  format: string;
  marker: string;
  priority: string;
  selector?: PageBlockSelector;
};

export type LogseqPageContentType = {
  uuid: string;
  content: string;
  page: LogseqPageIdenity;
};

export type LogseqSearchResult = {
  blocks: LogseqBlockType[];
  pages: LogseqPageIdenity[];
  // pageContents: LogseqPageContentType[];
  graph: string;
};
