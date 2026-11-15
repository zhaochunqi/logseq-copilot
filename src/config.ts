import Browser from 'webextension-polyfill';

export type LogseqCopliotConfig = {
  version: string;
  logseqHost: string;
  logseqHostName: string;
  logseqPort: number;
  logseqAuthToken: string;
  pageOpenMode: 'drawer' | 'tab';
};

export const getLogseqCopliotConfig =
  async (): Promise<LogseqCopliotConfig> => {
    const {
      version = '',
      logseqHost = '',
      logseqHostName = '127.0.0.1',
      logseqPort = 8765,
      logseqAuthToken = '',
      pageOpenMode = 'drawer',
    } = await Browser.storage.local.get();
    return {
      version,
      logseqHost: typeof logseqHost === 'string' && logseqHost.trim()
        ? logseqHost
        : `http://${logseqHostName}:${logseqPort}`,
      logseqHostName,
      logseqPort,
      logseqAuthToken,
      pageOpenMode,
    };
  };

export const saveLogseqCopliotConfig = async (
  updates: Partial<LogseqCopliotConfig>,
) => {
  console.log('saveLogseqCopliotConfig', updates);
  await Browser.storage.local.set(updates);
};
