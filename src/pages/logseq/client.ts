import {
  getLogseqCopliotConfig,
  LogseqCopliotConfig,
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
 * Build the Logseq HTTP API endpoint from the options page config.
 * The options page edits host name and port as separate fields; the legacy
 * `logseqHost` full URL is kept only as a fallback for old installs.
 */
export const buildApiUrl = (config: LogseqCopliotConfig): URL => {
  const fallback = new URL(config.logseqHost || 'http://localhost:12315');
  const host = config.logseqHostName.includes('://')
    ? new URL(config.logseqHostName).hostname
    : config.logseqHostName || fallback.hostname;
  const port = config.logseqPort || fallback.port || '12315';
  return new URL(`http://${host}:${port}/api`);
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
