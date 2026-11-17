import { describe, expect, test, vi } from 'vitest';
import MarkdownClient from './markdown/client';
import DBClient from './db/client';
import { escapeQueryString } from './client';

describe('markdown client getPage identity', () => {
  test.each([
    ['name', { name: 'Page' }, 'Page'],
    ['uuid', { uuid: 'page-uuid' }, 'page-uuid'],
    ['id', { id: 42 }, 42],
  ])('sends the %s identity', async (_label, identity, expected) => {
    const client = new MarkdownClient();
    const spy = vi.fn().mockResolvedValue({ name: 'Page' });
    client.baseJson = spy;
    await client.getPage(identity);
    expect(spy).toHaveBeenCalledWith('logseq.Editor.getPage', [expected]);
  });
});

describe('escapeQueryString', () => {
  test('escapes quotes and backslashes', () => {
    expect(escapeQueryString('a"b')).toBe('a\\"b');
    expect(escapeQueryString('a\\b')).toBe('a\\\\b');
    expect(escapeQueryString('a\\"b')).toBe('a\\\\\\"b');
  });
});

describe.each([
  ['markdown', MarkdownClient],
  ['db', DBClient],
])('%s client isDBGraph()', (_name, Client) => {
  test('uses the base graph-type check', async () => {
    const client = new Client();
    const spy = vi.fn().mockResolvedValue(false);
    client.baseJson = spy;
    await client.isDBGraph();
    expect(spy).toHaveBeenCalledWith('logseq.App.checkCurrentIsDBGraph', []);
  });
});

describe.each([
  ['markdown', MarkdownClient],
  ['db', DBClient],
])('%s client find()', (_name, Client) => {
  test('escapes quotes in the query string', async () => {
    const client = new Client();
    const spy = vi.fn().mockResolvedValue([]);
    client.baseJson = spy;
    await client.find('https://x.com/?q="a"');
    expect(spy).toHaveBeenCalledWith('logseq.DB.q', [
      '"https://x.com/?q=\\"a\\""',
    ]);
  });
});
