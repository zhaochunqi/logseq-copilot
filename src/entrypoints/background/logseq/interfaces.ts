import type { PageView } from '@/types/logseqBlock';
import type { RecallResult } from '@/types/recall';
import type { RecallOptions } from './recall/recall';

export interface LogseqClientInterface {
  getGraph(): any;
  getVersion(): any;
  getAllPages(): any;
  showMsg(message: string): any;
  getUserConfig(): any;
  getBlockViaUuid(uuid: string, opt?: { includeChildren: boolean }): any;
  search(query: string): any;
}

export interface LogseqServiceInterface {
  client: any;
  getGraph(): any;
  search(query: string): any;
  getBlock(
    blockUuid: string,
    graph: string,
    query?: string,
    includeChildren?: boolean,
  ): any;
  /**
   * Blocks mentioning the page, then those mentioning its parent paths up to
   * `scopeDepth` segments (src/utils/recall-scope.ts). `count` is the number
   * of blocks for the page itself.
   */
  urlSearch(url: URL, opt?: { scopeDepth?: number }): any;
  showMsg(message: string): any;
  getVersion(): any;
  /** Pages mentioning a search engine query, see recall/recall.ts. */
  recall(query: string, options?: RecallOptions): Promise<RecallResult>;
  getPageView?(name: string): Promise<PageView | null>;
}
