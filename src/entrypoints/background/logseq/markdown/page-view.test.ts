import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
} from '@/utils/storage';
import '../tool';
import LogseqService from './service';

type Handler = (method: string, args: unknown[]) => unknown;

const stubApi = (handler: Handler) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init: { body: string }) => {
      const { method, args } = JSON.parse(init.body);
      const result = handler(method, args);
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result ?? null), { status: 200 });
    }),
  );
};

beforeEach(async () => {
  fakeBrowser.reset();
  await logseqHostNameItem.setValue('127.0.0.1');
  await logseqPortItem.setValue(12315);
  await logseqAuthTokenItem.setValue('token');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const page = (name = 'Page') => ({
  id: 1,
  uuid: 'page-uuid',
  name,
  originalName: 'Original Page',
  'journal?': false,
  properties: [{ key: 'source', value: 'metadata' }],
});
const block = {
  page: 'Page',
  preorder: 0,
  depth: 0,
  marker: 'TODO',
  text: 'hello **world**',
  selector: { kind: 'durable', id: 'block-id' },
};

const commonApi = (method: string) => {
  if (method === 'logseq.Editor.getPage') return page();
  if (method === 'logseq.Graph.getPageSnapshot')
    return {
      exists: true,
      properties: [{ key: 'source', value: 'snapshot' }],
      blocks: [block],
    };
  if (method === 'logseq.getCurrentGraph')
    return { name: 'graph', path: '/graph' };
  return null;
};

describe('getPageView', () => {
  test('returns page metadata, snapshot blocks and rendered HTML', async () => {
    stubApi(commonApi);
    const result = await new LogseqService().getPageView('Page');
    expect(result).toMatchObject({
      name: 'Page',
      originalName: 'Original Page',
      journal: false,
      properties: [{ key: 'source', value: 'snapshot' }],
      blocks: [{ ...block, html: '<p>hello <strong>world</strong></p>' }],
    });
  });

  test('returns null when page is not found and has no matching alias', async () => {
    const calls: string[] = [];
    stubApi((method) => {
      calls.push(method);
      if (method === 'logseq.Editor.getPage')
        return new Response('not found', { status: 404 });
      if (method === 'logseq.App.search') return { page_candidates: [] };
      return null;
    });
    expect(await new LogseqService().getPageView('Missing')).toBeNull();
    expect(calls).toEqual(['logseq.Editor.getPage', 'logseq.App.search']);
  });

  test('resolves a case-insensitive alias and retries once', async () => {
    const pageCalls: unknown[][] = [];
    stubApi((method, args) => {
      if (method === 'logseq.Editor.getPage') {
        pageCalls.push(args);
        const identity = args[0];
        return identity === 'Canonical'
          ? page('Canonical')
          : new Response('not found', { status: 404 });
      }
      if (method === 'logseq.App.search')
        return {
          page_candidates: [
            { via: 'alias', alias: 'LEGACY', name: 'Canonical' },
          ],
        };
      return commonApi(method);
    });
    const result = await new LogseqService().getPageView('legacy');
    expect(result?.name).toBe('Canonical');
    expect(pageCalls).toEqual([['legacy'], ['Canonical']]);
  });

  test('falls back to page blocks tree when snapshot is unavailable', async () => {
    const calls: string[] = [];
    stubApi((method) => {
      calls.push(method);
      if (method === 'logseq.Editor.getPage') return page();
      if (method === 'logseq.Graph.getPageSnapshot')
        return new Response('unavailable', { status: 500 });
      if (method === 'logseq.Editor.getPageBlocksTree')
        return { blocks: [block] };
      if (method === 'logseq.getCurrentGraph')
        return { name: 'graph', path: '/graph' };
      return null;
    });
    const result = await new LogseqService().getPageView('Page');
    expect(result?.properties).toEqual([{ key: 'source', value: 'metadata' }]);
    expect(result?.blocks[0].html).toBe('<p>hello <strong>world</strong></p>');
    expect(calls).toContain('logseq.Editor.getPageBlocksTree');
  });
});
