import { describe, expect, it } from 'vitest';
import {
  filterPages,
  graphSearch,
  MAX_BLOCKS,
  MAX_PAGES,
  parseGraphParams,
  visibleBlocks,
  visiblePages,
} from './model';

describe('graph browser model', () => {
  it('parses and builds URL state', () => {
    expect(parseGraphParams('?page=Daily%20Notes&q=todo')).toEqual({
      page: 'Daily Notes',
      q: 'todo',
      block: '',
    });
    expect(graphSearch('Daily Notes', 'todo')).toBe('?page=Daily+Notes&q=todo');
  });
  it('filters and caps page lists', () => {
    const pages = Array.from({ length: MAX_PAGES + 2 }, (_, i) => ({
      name: `Page ${i}`,
    }));
    expect(filterPages(pages, 'page 1')).toHaveLength(111);
    expect(visiblePages(pages).pages).toHaveLength(MAX_PAGES);
    expect(visiblePages(pages).truncated).toBe(true);
  });
  it('caps large page block rendering until expanded', () => {
    const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, preorder) => ({
      preorder,
      depth: 0,
      marker: '-',
      text: '',
    }));
    expect(visibleBlocks(blocks, false)).toHaveLength(MAX_BLOCKS);
    expect(visibleBlocks(blocks, true)).toHaveLength(MAX_BLOCKS + 1);
  });
});
