import type { LogseqPageIdenity, PageBlock } from '@/types/logseqBlock';

import { LogseqError, LogseqVersionIsLower, toLogseqError } from '../error';
import LogseqClientBase, { escapeQueryString } from '../client';
import { LogseqClientInterface } from '../interfaces';
import log from '@/utils/logger';

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

export type LogseqPageResponse = LogseqPageIdenity & {
  'journal?': boolean;
  originalName?: string;
  properties?: { key: string; value: string }[];
};

export type PageBlocksResponse = { blocks: PageBlock[] };
export type PageSnapshotResponse = {
  exists?: boolean;
  blocks: PageBlock[];
  properties?: { key: string; value: string }[];
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

  public getCurrentPage = async () => {
    return await this.catchIssues(async () => {
      return await this.baseJson('logseq.Editor.getCurrentPage', []);
    });
  };

  private getAllPage = async () => {
    return await this.baseJson('logseq.Editor.getAllPages', []);
  };

  public getPage = async (
    pageIdentity: string | Partial<LogseqPageIdenity>,
  ): Promise<LogseqPageResponse> => {
    const identity =
      typeof pageIdentity === 'string' ? { name: pageIdentity } : pageIdentity;
    const payload =
      identity.id !== undefined
        ? { id: identity.id }
        : identity.uuid
        ? { uuid: identity.uuid }
        : { name: identity.name };
    return await this.baseJson('logseq.Editor.getPage', [payload]);
  };

  public getPageBlocksTree = async (
    name: string,
  ): Promise<PageBlocksResponse> =>
    await this.baseJson('logseq.Editor.getPageBlocksTree', [name]);

  public getPageSnapshot = async (
    name: string,
  ): Promise<PageSnapshotResponse | null> => {
    try {
      const snapshot = await this.baseJson('logseq.Graph.getPageSnapshot', [
        name,
      ]);
      return snapshot?.error ? null : snapshot;
    } catch {
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
      throw new LogseqError(LogseqVersionIsLower);
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
      log.warn(e);
      return toLogseqError(e).info;
    }
  }

  private getVersionInternal = async (): Promise<
    LogseqResponseType<string>
  > => {
    return await this.baseJson('logseq.App.getAppInfo', []);
  };

  public find = async (query: string) => {
    const data = await this.baseJson('logseq.DB.q', [
      `"${escapeQueryString(query)}"`,
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
