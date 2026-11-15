import { buildOutline, findBlockAnchor } from './model';

describe('inline viewer model', () => {
  const page = { blocks: [
    { preorder: 2, depth: 1, marker: '-', text: 'child' },
    { preorder: 1, depth: 0, marker: '-', text: 'root', selector: { id: 'abc' } },
  ] };
  it('sorts and indents blocks', () => { expect(buildOutline(page).map(x => [x.block.text, x.indent])).toEqual([['root', 0], ['child', 16]]); });
  it('finds selector or preorder anchors', () => { expect(findBlockAnchor(page.blocks, 'abc')?.text).toBe('root'); expect(findBlockAnchor(page.blocks, '2')?.text).toBe('child'); });
});
