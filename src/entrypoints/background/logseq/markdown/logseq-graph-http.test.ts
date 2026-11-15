// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
} from '@/utils/storage';
// Imported before the service so its circular import (tool -> service) settles
// the same way it does in production (see page-view.test.ts).
import '../tool';
import LogseqService from '@/entrypoints/background/logseq/markdown/service';
import {
  startFakeLogseqGraph,
  type FakeLogseqGraph,
} from '../../../../../tests/support/fake-logseq-graph';

let fixture: FakeLogseqGraph;
let service: LogseqService;

beforeAll(async () => {
  fixture = await startFakeLogseqGraph();
  const url = new URL(fixture.url);
  fakeBrowser.reset();
  await logseqHostNameItem.setValue(url.hostname);
  await logseqPortItem.setValue(Number(url.port));
  await logseqAuthTokenItem.setValue(fixture.token);
  service = new LogseqService();
});
afterAll(async () => {
  await fixture?.close();
});

describe('LogseqService over fake logseq-graph HTTP', () => {
  test('reads full page metadata, flat nested blocks and rendered HTML', async () => {
    const view = await service.getPageView('Project Alpha');
    expect(view).toMatchObject({
      name: 'project alpha',
      originalName: 'Project Alpha',
      journal: false,
      blocks: [
        {
          preorder: 0,
          depth: 0,
          html: '<p>Alpha <strong>overview</strong></p>',
        },
        {
          preorder: 1,
          depth: 1,
          marker: 'TODO',
          selector: { kind: 'durable', id: 'block-durable-alpha' },
        },
        { preorder: 2, depth: 2, text: 'Deep child' },
      ],
    });
    expect(view?.properties).toEqual(
      expect.arrayContaining([{ key: 'alias', value: 'nick' }]),
    );
  });
  test('returns null for a missing page and resolves aliases to declared pages', async () => {
    expect(await service.getPageView('Does Not Exist')).toBeNull();
    expect((await service.getPageView('nick'))?.originalName).toBe(
      'Project Alpha',
    );
  });
  test('search returns rendered blocks from HTTP', async () => {
    const result = await service.search('overview');
    expect(result.status).toBe(200);
    expect(result.response.blocks).toHaveLength(1);
    expect(result.response.blocks[0]).toMatchObject({
      content: 'Alpha **overview**',
      // search marks the query in the rendered HTML
      html: '<p>Alpha <strong><mark>overview</mark></strong></p>',
    });
  });
  test('exposes snapshot and tree wire shapes including null selectors', async () => {
    const snapshot = await service.client.getPageSnapshot('Project Alpha');
    const tree = await service.client.getPageBlocksTree('Project Alpha');
    expect(snapshot).toMatchObject({ exists: true, version: 1 });
    expect(snapshot?.blocks.map((block) => block.selector)).toEqual([
      null,
      { kind: 'durable', id: 'block-durable-alpha' },
      null,
    ]);
    expect(tree.blocks.map(({ preorder, depth }) => [preorder, depth])).toEqual(
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    );
  });
});
