/**
 * 存储适配器：扩展环境用 chrome.storage.local，独立 Web 打包（不依赖扩展）
 * 用 localStorage。数据层（config.ts）只依赖本模块，不再直接 import
 * webextension-polyfill —— 后者在非扩展环境 import 会直接 throw。
 */
export type StorageArea = {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

const isExtension = (): boolean => {
  if (typeof globalThis === 'undefined') return false;
  const g = globalThis as Record<string, any>;
  return !!(g.browser?.storage?.local || g.chrome?.storage?.local);
};

const LS_KEY = 'logseq-copilot-config';

const readLS = (): Record<string, unknown> => {
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const writeLS = (all: Record<string, unknown>) => {
  globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(all));
};

const localStorageArea: StorageArea = {
  async get(keys) {
    const all = readLS();
    if (keys == null) return all;
    if (typeof keys === 'string') return { [keys]: all[keys] };
    if (Array.isArray(keys)) {
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = all[k];
      return out;
    }
    const out: Record<string, unknown> = {};
    for (const [k, fallback] of Object.entries(keys)) {
      out[k] = all[k] ?? fallback;
    }
    return out;
  },
  async set(items) {
    const all = readLS();
    Object.assign(all, items);
    writeLS(all);
  },
  async remove(keys) {
    const all = readLS();
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) delete all[k];
    writeLS(all);
  },
};

/** 扩展环境（chrome.storage.local）优先，Web 环境回退 localStorage。 */
export const storage: StorageArea = isExtension()
  ? ((globalThis as Record<string, any>).browser?.storage?.local ??
    (globalThis as Record<string, any>).chrome.storage.local)
  : localStorageArea;
