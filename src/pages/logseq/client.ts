import { getLogseqCopliotConfig } from '../../config';

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

export default class LogseqClientBase {
  baseFetch = async (method: string, args: any[]) => {
    const config = await getLogseqCopliotConfig();
    const endPoint = new URL(config.logseqHost);
    const apiUrl = new URL(`${endPoint.pathname.replace(/\/$/, '')}/api`, endPoint.origin);
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

    if (!resp.ok) {
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
    const resp = await this.baseJson('logseq.App.checkCurrentIsDBGraph', []);
    return resp === true;
  };
}
