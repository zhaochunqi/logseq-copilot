import { storage } from './storage';

export type LogseqCopliotConfig = {
  version: string;
  /** 完整的 Logseq API base URL，如 http://localhost:12315 或 https://logseq-api.mac.zhaochunqi.com */
  logseqHost: string;
  logseqAuthToken: string;
  enableClipNoteFloatButton: boolean;
  clipNoteLocation: string;
  clipNoteCustomPage: string;
  clipNoteTemplate: string;
};

export const DEFAULT_LOGSEQ_HOST = 'http://localhost:12315';

/**
 * 把用户输入的 Logseq API base URL 归一化成可被 `new URL` 解析的形式：
 * - 裸 `host[:port]`（无 scheme）补 `http://`（本地 Logseq 默认 http）
 * - 完整 `http(s)://...` 原样保留 —— scheme 与 port 都不得丢弃，
 *   否则 `https://host` 会被降级成明文 http（默认端口 80）。
 */
export const normalizeLogseqHost = (input: string): string => {
  const raw = (input || DEFAULT_LOGSEQ_HOST).trim();
  return raw.includes('://') ? raw : `http://${raw}`;
};

export const getLogseqCopliotConfig =
  async (): Promise<LogseqCopliotConfig> => {
    const raw = await storage.get();
    // 一次性迁移（幂等）：旧版把连接配置拆成 logseqHostName + logseqPort 两个字段，
    // 且升级脚本会把完整 URL 的 scheme/port 弄丢；现在统一为单个完整 URL，
    // 读到旧字段时合成 logseqHost 并删除旧字段。
    let logseqHost: string | undefined = raw.logseqHost;
    if (!logseqHost) {
      const legacyHost: string | undefined = raw.logseqHostName;
      const legacyPort: number | undefined = raw.logseqPort;
      if (legacyHost) {
        logseqHost = legacyHost.includes('://')
          ? legacyHost
          : `http://${legacyHost}${legacyPort ? `:${legacyPort}` : ''}`;
        await storage.set({ logseqHost });
        await storage.remove(['logseqHostName', 'logseqPort']);
      }
    }
    const {
      version = '',
      logseqAuthToken = '',
      enableClipNoteFloatButton = false,
      clipNoteLocation = 'journal',
      clipNoteCustomPage = '',
      clipNoteTemplate = `#[[Clip]] [{{title}}]({{url}})
{{content}}`,
    } = raw;
    return {
      version,
      logseqHost: logseqHost || DEFAULT_LOGSEQ_HOST,
      logseqAuthToken,
      enableClipNoteFloatButton,
      clipNoteLocation,
      clipNoteCustomPage,
      clipNoteTemplate,
    };
  };

export const saveLogseqCopliotConfig = async (
  updates: Partial<LogseqCopliotConfig>,
) => {
  console.log('saveLogseqCopliotConfig', updates);
  await storage.set(updates);
};
