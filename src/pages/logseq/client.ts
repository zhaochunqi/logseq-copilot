import {
  getLogseqCopliotConfig,
  LogseqCopliotConfig,
  normalizeLogseqHost,
} from '../../config';

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

/**
 * 从配置构建 Logseq HTTP API 端点（POST /api）。
 * 用户配置的完整 URL（scheme / host / port）原样保留：
 * `new URL('/api', base)` 不会改 scheme、不会补默认端口，只追加 `/api`。
 * 配置非法时抛 TypeError，由调用方（options 页保存时）捕获并提示。
 */
export const buildApiUrl = (config: LogseqCopliotConfig): URL => {
  return new URL('/api', normalizeLogseqHost(config.logseqHost));
};

export default class LogseqClientBase {
  baseFetch = async (method: string, args: any[]) => {
    const config = await getLogseqCopliotConfig();
    const apiUrl = buildApiUrl(config);
    const resp = await fetch(apiUrl, {
      mode: 'cors',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.logseqAuthToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        method: method,
        args: args,
      }),
    });

    if (resp.status !== 200) {
      throw resp;
    }

    return resp;
  };

  baseJson = async (method: string, args: any[]) => {
    const resp = await this.baseFetch(method, args);
    const data = await resp.json();
    console.debug(`Logseq Method ${method}, Response -> \n`, data);
    return data;
  };

  public isDBGraph = async () => {
    return await this.baseJson('check_current_is_db_graph', []);
  };
}
