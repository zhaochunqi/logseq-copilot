import { PageView } from '../../types/logseqBlock';

export interface LogseqClientInterface {
  getGraph(): any;
  getVersion(): any;
  getAllPages(): any;
  showMsg(message: string): any;
  getUserConfig(): any;
  isDBGraph(): any;
  getBlockViaUuid(uuid: string, opt?: { includeChildren: boolean }): any;
  search(query: string): any;
}

export interface LogseqServiceInterface {
  client: any;
  getGraph(): any;
  getPageView(name: string): Promise<PageView | null>;
  search(query: string): any;
  getBlock(
    blockUuid: string,
    graph: string,
    query?: string,
    includeChildren?: boolean,
  ): any;
  urlSearch(url: URL, opt?: { fuzzy: boolean }): any;
  showMsg(message: string): any;
  getVersion(): any;
}
