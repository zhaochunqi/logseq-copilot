import {
  LogseqBlockType,
  LogseqPageIdenity,
  PageBlock,
  PageProperty,
} from '../../../types/logseqBlock';

import {
  CannotConnectWithLogseq,
  LogseqVersionIsLower,
  TokenNotCurrect,
  UnknownIssues,
  NoSearchingResult,
} from '../error';
import LogseqClientBase from '../client';
import { LogseqClientInterface } from '../interfaces';

type Graph = {
  name: string;
  path: string;
};

type LogseqSearchResponse = {
  blocks: {
    'block/uuid': string;
    'block/content': string;
    'block/page': number;
  }[];
  'pages-content': {
    'block/uuid': string;
    'block/snippet': string;
  }[];
  pages: string[];
};

export type LogseqPageResponse = {
  name: string;
  uuid: string;
  'journal?': boolean;
};

export type LogseqResponseType<T> = {
  status: number;
  msg: string;
  response: T;
  count?: number;
};

export default class LogseqClient
  extends LogseqClientBase
  implements LogseqClientInterface
{
  private getCurrentGraph = async (): Promise<Graph> => {
    return await this.baseJson('logseq.getCurrentGraph', []);
  };

  private getAllPage = async () => {
    return await this.baseJson('logseq.Editor.getAllPages', []);
  };

  public getPage = async (
    pageIdenity: string | Partial<LogseqPageIdenity>,
  ): Promise<LogseqPageIdenity> => {
    const identity = typeof pageIdenity === 'string'
      ? pageIdenity
      : typeof pageIdenity.id === 'number'
        ? { id: pageIdenity.id }
        : pageIdenity.uuid
          ? { uuid: pageIdenity.uuid }
          : { name: pageIdenity.name };
    return await this.baseJson('logseq.Editor.getPage', [identity]);
  };

  public getPageBlocksTree = async (name: string): Promise<{ blocks: PageBlock[] }> => {
    const result = await this.baseJson('logseq.Editor.getPageBlocksTree', [name]);
    return Array.isArray(result) ? { blocks: result } : result;
  };

  public getPageSnapshot = async (name: string): Promise<{
    exists: boolean;
    properties: PageProperty[];
    blocks: PageBlock[];
    version?: unknown;
  } | null> => {
    try {
      return await this.baseJson('logseq.Graph.getPageSnapshot', [name]);
    } catch (_error) {
      return null;
    }
  };

  public getPageDB = async (
    pageIdenity: LogseqPageIdenity,
  ): Promise<LogseqPageIdenity> => {
    const resp: LogseqPageIdenity = await this.baseJson('get_page', [
      pageIdenity.uuid || pageIdenity.name || pageIdenity.id,
    ]);
    return resp;
  };

  public search = async (query: string): Promise<LogseqSearchResponse> => {
    const resp = await this.baseJson('logseq.App.search', [query]);
    if (resp.error) {
      throw LogseqVersionIsLower;
    }
    return resp;
  };

  public getBlockViaUuid = async (
    uuid: string,
    opt?: { includeChildren: boolean },
  ) => {
    return await this.baseJson('logseq.Editor.getBlock', [uuid, opt]);
  };

  public getBlockViaUuidDB = async (
    uuid: string,
    opt?: { includeChildren: boolean },
  ) => {
    return await this.baseJson('get_block', [uuid, opt]);
  };

  private showMsgInternal = async (
    message: string,
  ): Promise<LogseqResponseType<null>> => {
    await this.baseFetch('logseq.showMsg', [message]);
    return {
      status: 200,
      msg: 'success',
      response: null,
    };
  };

  private async catchIssues(func: Function) {
    try {
      return await func();
    } catch (e: any) {
      console.info(e);
      if (e.status === 401) {
        return TokenNotCurrect;
      } else if (
        e.toString() === 'TypeError: Failed to fetch' ||
        e.toString().includes('Invalid URL')
      ) {
        return CannotConnectWithLogseq;
      } else if (e === LogseqVersionIsLower || e === NoSearchingResult) {
        return e;
      } else {
        return UnknownIssues;
      }
    }
  }

  private getVersionInternal = async (): Promise<
    LogseqResponseType<string>
  > => {
    return await this.baseJson('logseq.App.getAppInfo', []);
  };

  public find = async (query: string) => {
    const data = await this.baseJson('logseq.DB.q', [
      `"${query.replaceAll('"', '"')}"`,
    ]);
    return data;
  };

  public getUserConfig = async () => {
    return await this.catchIssues(
      async () => await this.baseJson('logseq.App.getUserConfigs', []),
    );
  };

  public showMsg = async (
    message: string,
  ): Promise<LogseqResponseType<null>> => {
    return await this.catchIssues(
      async () => await this.showMsgInternal(message),
    );
  };

  public getAllPages = async (): Promise<string> => {
    return await this.catchIssues(async () => await this.getAllPage());
  };

  public getGraph = async (): Promise<Graph> => {
    return await this.catchIssues(async () => await this.getCurrentGraph());
  };

  public getVersion = async (): Promise<LogseqResponseType<string>> => {
    return await this.catchIssues(async () => await this.getVersionInternal());
  };

}
