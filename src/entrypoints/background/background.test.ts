/**
 * Runs the real background entrypoint against fakeBrowser and talks to it with
 * the real webext-core client, so message names and payloads are checked on both
 * ends. Only the Logseq service is faked.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { sendMessage } from '@/types/messaging';
import {
  CannotConnectWithLogseq,
  LogseqError,
  LogseqVersionIsLower,
} from './logseq/error';

const service = vi.hoisted(() => ({
  recall: vi.fn(),
  search: vi.fn(),
  urlSearch: vi.fn(),
  client: {
    getUserConfig: vi.fn(),
  },
}));

vi.mock('./logseq/tool', () => ({
  getLogseqService: async () => service,
}));

import background from './index';

beforeAll(() => {
  fakeBrowser.reset();
  // fakeBrowser does not implement these events; the handlers are not under test.
  vi.spyOn(fakeBrowser.commands.onCommand, 'addListener').mockImplementation(
    () => {},
  );
  // webext-core allows one listener per message type per context, so register
  // the background exactly once.
  background.main();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('service errors reach the sender with a readable message', () => {
  test('LogseqVersionIsLower', async () => {
    service.search.mockRejectedValue(new LogseqError(LogseqVersionIsLower));

    const err = await sendMessage('logseq:search', 'q').catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(LogseqVersionIsLower.msg);
  });

  test('CannotConnectWithLogseq', async () => {
    service.urlSearch.mockRejectedValue(new LogseqError(CannotConnectWithLogseq));

    const err = await sendMessage('logseq:urlSearch', {
      url: 'https://example.com/',
    }).catch((e) => e);

    expect(err.message).toBe(CannotConnectWithLogseq.msg);
  });
});

describe('logseq:urlSearch', () => {
  test('searches the processed URL with the scope depth of the rules', async () => {
    await fakeBrowser.storage.local.set({
      recallRulesConfig: [
        {
          id: 'gh',
          name: 'GitHub',
          enabled: true,
          urlPattern: 'github\\.com.*/pull/',
          queryProcessing: {
            ignoreHashFragments: true,
            ignoreQueryParams: true,
            excludeKeywords: [],
            includeKeywords: [],
            ignorePathSegments: ['files'],
            scopeDepth: 2,
          },
          searchScope: {},
          resultFiltering: { prioritizeRecent: false },
        },
      ],
    });
    service.urlSearch.mockResolvedValue({
      status: 200,
      msg: 'success',
      response: { blocks: [], graph: 'g' },
      count: 0,
    });

    await sendMessage('logseq:urlSearch', {
      url: 'https://github.com/foo/bar/pull/1/files?w=1#diff',
    });

    expect(service.urlSearch).toHaveBeenCalledTimes(1);
    const [url, opt] = service.urlSearch.mock.calls[0];
    expect(url.href).toBe('https://github.com/foo/bar/pull/1');
    expect(opt).toEqual({ scopeDepth: 2 });
  });
});

describe('logseq:recall', () => {
  test('passes the query and the recall rules (maxResults in pages)', async () => {
    await fakeBrowser.storage.local.set({
      recallRulesConfig: [
        {
          id: 'r1',
          name: 'scoped',
          enabled: true,
          urlPattern: 'bing\\.com',
          queryProcessing: {
            ignoreHashFragments: false,
            ignoreQueryParams: false,
            excludeKeywords: ['secret'],
            includeKeywords: ['logseq'],
            ignorePathSegments: [],
          },
          searchScope: { excludePages: ['Work'] },
          resultFiltering: { maxResults: 4, prioritizeRecent: true },
        },
      ],
    });
    const answer = { graph: 'g', pages: [] };
    service.recall.mockResolvedValue(answer);

    const result = await sendMessage('logseq:recall', {
      query: 'logseq plugin',
      url: 'https://www.bing.com/search?q=logseq+plugin',
    });

    expect(result).toEqual(answer);
    expect(service.recall).toHaveBeenCalledWith('logseq plugin', {
      excludeKeywords: ['secret'],
      includeKeywords: ['logseq'],
      searchScope: { excludePages: ['Work'] },
      prioritizeRecent: true,
      maxPages: 4,
    });
    expect(service.search).not.toHaveBeenCalled();
    expect(service.urlSearch).not.toHaveBeenCalled();
  });

  test('the default rules leave the page limit to recall', async () => {
    await fakeBrowser.storage.local.remove('recallRulesConfig');
    service.recall.mockResolvedValue({ graph: 'g', pages: [] });

    await sendMessage('logseq:recall', {
      query: 'default limit',
      url: 'https://www.google.com/search?q=default+limit',
    });

    expect(service.recall).toHaveBeenCalledTimes(1);
    expect(service.recall.mock.calls[0][1].maxPages).toBeUndefined();
  });

  test('a result page that loads twice (Bing &rdr=1) searches Logseq once', async () => {
    service.recall.mockResolvedValue({ graph: 'g', pages: [] });
    await sendMessage('logseq:recall', {
      query: 'twice',
      url: 'https://www.bing.com/search?q=twice',
    });
    await sendMessage('logseq:recall', {
      query: 'twice',
      url: 'https://www.bing.com/search?q=twice&rdr=1&rdrig=9E58F2A7',
    });
    expect(service.recall).toHaveBeenCalledTimes(1);
    await sendMessage('logseq:recall', {
      query: 'other',
      url: 'https://www.bing.com/search?q=other',
    });
    expect(service.recall).toHaveBeenCalledTimes(2);
  });

  test('a storage change (new recall rules) makes the same request search again', async () => {
    service.recall.mockResolvedValue({ graph: 'g', pages: [] });
    const recall = () =>
      sendMessage('logseq:recall', {
        query: 'rules changed',
        url: 'https://www.bing.com/search?q=rules+changed',
      });
    await recall();
    expect(service.recall).toHaveBeenCalledTimes(1);

    await fakeBrowser.storage.local.set({
      recallRulesConfig: [
        {
          id: 'r1',
          name: 'scoped',
          enabled: true,
          urlPattern: 'bing\\.com',
          queryProcessing: {
            ignoreHashFragments: false,
            ignoreQueryParams: false,
            excludeKeywords: [],
            includeKeywords: [],
            ignorePathSegments: [],
          },
          searchScope: { excludePages: ['Work'] },
          resultFiltering: { maxResults: 3 },
        },
      ],
    });
    await recall();
    expect(service.recall).toHaveBeenCalledTimes(2);
    expect(service.recall.mock.calls[1][1]).toMatchObject({
      searchScope: { excludePages: ['Work'] },
      maxPages: 3,
    });
  });

  test('errors reach the sender', async () => {
    service.recall.mockRejectedValue(new LogseqError(CannotConnectWithLogseq));
    const err = await sendMessage('logseq:recall', {
      query: 'q',
      url: 'https://www.bing.com/search?q=q',
    }).catch((e) => e);
    expect(err.message).toBe(CannotConnectWithLogseq.msg);
  });
});

// A logseq: link of a content script UI (src/utils/logseq-links.ts).
describe('logseq:openLink', () => {
  const LINK = 'logseq://graph/My%20Notes?page=copilot';
  const pageTab = { id: 7, url: 'https://www.google.com/search?q=copilot' };

  beforeEach(() => {
    vi.spyOn(fakeBrowser.tabs, 'update').mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.mocked(fakeBrowser.tabs.update).mockRestore();
  });

  /** Send as the content script in `tab` would (fakeBrowser's sender is empty). */
  const openFrom = async (tab: { id?: number; url?: string }, url: unknown) => {
    const send = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockImplementationOnce(async (message: any) => {
        const res = await fakeBrowser.runtime.onMessage.trigger(message, { tab } as any);
        return res.find((r: unknown) => !!r);
      });
    return sendMessage('logseq:openLink', { url: url as string }).finally(() =>
      send.mockRestore(),
    );
  };

  test('opens the link in the tab of the content script that sent it', async () => {
    await openFrom(pageTab, LINK);

    expect(fakeBrowser.tabs.update).toHaveBeenCalledTimes(1);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(7, { url: LINK });
  });

  test.each([
    'https://evil.example/',
    'http://localhost:12315/api',
    'javascript:alert(1)',
    'data:text/html,<p>hi',
    'file:///etc/passwd',
    'chrome://settings',
    'about:blank',
    'logseq',
    '/graph/Notes',
    '',
    undefined,
    42,
  ])('rejects %j: only logseq: URLs', async (url) => {
    const err = await openFrom(pageTab, url).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Not a logseq: link.');
    expect(fakeBrowser.tabs.update).not.toHaveBeenCalled();
  });

  test('ignores a message without a sender tab (the browser sidebar)', async () => {
    await sendMessage('logseq:openLink', { url: LINK });

    expect(fakeBrowser.tabs.update).not.toHaveBeenCalled();
  });

  test('ignores a sender without a tab id', async () => {
    await openFrom({ url: pageTab.url }, LINK);
    await openFrom({ id: -1, url: pageTab.url }, LINK);

    expect(fakeBrowser.tabs.update).not.toHaveBeenCalled();
  });
});

describe('browser startup', () => {
  test('closes the sidebar drawn on pages', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });

    await fakeBrowser.runtime.onStartup.trigger();

    await vi.waitFor(async () =>
      expect(
        (await fakeBrowser.storage.local.get('inPageSidebarOpen'))
          .inPageSidebarOpen,
      ).toBe(false),
    );
  });
});
