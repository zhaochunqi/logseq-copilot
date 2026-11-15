// @vitest-environment jsdom
/**
 * Drives LogseqBlock's read-only rendering: a block's task marker is drawn as
 * a label, never as a control that would write back to Logseq.
 */
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { LogseqBlock } from './LogseqBlock';
import type { LogseqBlockType } from '@/types/logseqBlock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  fakeBrowser.reset();
});

const makeBlock = (uuid: string, marker: string): LogseqBlockType => ({
  uuid,
  marker,
  html: `<p>task ${uuid}</p>`,
  page: { name: 'p', id: 1, uuid: 'p1' },
  content: `${marker} task ${uuid}`,
  format: 'markdown',
  priority: '',
});

let root: Root | undefined;
let container: HTMLElement | undefined;

const render = async (blocks: LogseqBlockType[]) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<LogseqBlock graph="g" blocks={blocks} />);
  });
  return container;
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe('LogseqBlock marker rendering', () => {
  test('draws a task marker as a plain label, with no checkbox to change it', async () => {
    const el = await render([makeBlock('b1', 'TODO')]);

    expect(el.querySelector('button[role="checkbox"]')).toBeNull();
    expect(el.querySelector('input[type="checkbox"]')).toBeNull();
    expect(el.querySelector('[data-marker]')!.getAttribute('data-marker')).toBe('TODO');
    expect(el.querySelector('.lc-status')!.textContent).toBe('TODO');
    // The only button-like control left is the "Open block in Logseq" link.
    const buttons = Array.from(el.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent === 'TODO')).toBe(false);
    expect(el.querySelector('.lc-marker')).toBeNull();
  });

  test('draws DONE as a label too, never a checked box', async () => {
    const el = await render([makeBlock('b2', 'DONE')]);

    expect(el.querySelector('button[role="checkbox"]')).toBeNull();
    expect(el.querySelector('[data-marker]')!.getAttribute('data-marker')).toBe('DONE');
    expect(el.querySelector('.lc-status')!.textContent).toBe('DONE');
  });

  test('renders a block without a marker with no task label', async () => {
    const el = await render([makeBlock('b3', '')]);

    expect(el.querySelector('.lc-status')).toBeNull();
    expect(el.querySelector('.lc-task')).toBeNull();
  });
});

// The block's HTML comes from the Markdown of the notes, raw HTML included,
// and the sidebar on pages draws it in the page's own document.
describe('LogseqBlock HTML', () => {
  test('draws no script and no event handler from the notes', async () => {
    const el = await render([
      {
        ...makeBlock('x1', ''),
        html:
          '<p>clipped <img src="x" onerror="window.__pwned = 1"><b onmouseover="alert(1)">page</b></p>' +
          '<script>window.__pwned = 2</script><iframe src="https://evil.example"></iframe>' +
          '<a href="javascript:alert(1)">bad</a>',
      },
    ]);
    const content = el.querySelector('.lc-content')!;

    expect(content.querySelector('script, iframe')).toBeNull();
    expect(content.querySelectorAll('[onerror], [onmouseover]')).toHaveLength(0);
    expect(content.innerHTML).not.toMatch(/onerror|onmouseover|javascript:/i);
    expect(content.querySelector('a')!.hasAttribute('href')).toBe(false);
    expect((window as any).__pwned).toBeUndefined();
    // The text is still there.
    expect(content.textContent).toContain('clipped');
    expect(content.querySelector('b')!.textContent).toBe('page');
  });

  test('keeps Logseq links, tags and search marks', async () => {
    const html =
      '<p><a class="logseq-page-link" href="logseq://graph/g?page=books">books</a> ' +
      '<a class="logseq-tag" href="logseq://graph/g?page=bug"><mark>#bug</mark></a> ' +
      '<a href="https://github.com/logseq">repo</a></p>';
    const el = await render([{ ...makeBlock('x2', ''), html }]);

    expect(el.querySelector('.lc-content')!.innerHTML).toBe(html);
  });
});
