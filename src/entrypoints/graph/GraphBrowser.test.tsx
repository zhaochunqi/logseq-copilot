import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { PageView } from '@/types/logseqBlock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const send = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage: send }));
vi.mock('@/utils/sanitize-html', () => ({
  sanitizeHtml: (html: string) => html,
}));
vi.mock('./graph.module.scss', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}));

import GraphBrowser from './GraphBrowser';
import { MAX_BLOCKS, MAX_PAGES } from './model';

const pageEntry = (name: string, journal = false) => ({
  name,
  journal_date: journal ? '2024-01-02' : null,
});

const viewOf = (name: string, blocks: PageView['blocks']): PageView => ({
  name,
  originalName: name,
  journal: false,
  properties: [{ key: 'type', value: 'note' }],
  blocks,
});

const answers: Record<string, unknown> = {
  'logseq:allPages': [
    pageEntry('Books'),
    pageEntry('Daily Notes', true),
    pageEntry('Work'),
  ],
};

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  send.mockReset().mockImplementation((type: string) => {
    if (type === 'logseq:allPages')
      return Promise.resolve(answers['logseq:allPages']);
    if (type === 'logseq:pageView') return Promise.resolve(viewOf('Books', []));
    return Promise.resolve({ status: 200, response: null });
  });
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

const mount = async () => {
  await act(async () => {
    render(<GraphBrowser />);
  });
  await waitFor(() => expect(send).toHaveBeenCalledWith('logseq:allPages'));
};

describe('GraphBrowser', () => {
  it('lists pages with a journal badge', async () => {
    await mount();
    expect(screen.getByText('Work')).toBeTruthy();
    const journal = screen.getByText('Journal');
    expect(journal.closest('button')?.textContent).toContain('Daily Notes');
  });

  it('filters the page list by the filter box', async () => {
    await mount();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Filter pages'), {
        target: { value: 'boo' },
      });
    });
    expect(screen.getByText('Books')).toBeTruthy();
    expect(screen.queryByText('Work')).toBeNull();
  });

  it('opens a page, renders it read-only and syncs the URL', async () => {
    send.mockImplementation((type: string) => {
      if (type === 'logseq:allPages')
        return Promise.resolve(answers['logseq:allPages']);
      if (type === 'logseq:pageView')
        return Promise.resolve(
          viewOf('Books', [
            {
              preorder: 0,
              depth: 0,
              marker: '-',
              text: '',
              html: '<p>Root</p>',
            },
            {
              preorder: 1,
              depth: 1,
              marker: '-',
              text: '',
              html: '<p>Child</p>',
            },
          ]),
        );
      return Promise.resolve({ status: 200, response: null });
    });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByText('Books'));
    });
    await waitFor(() => expect(screen.getByText('Root')).toBeTruthy());
    expect(screen.getByText('type')).toBeTruthy();
    expect(window.location.search).toBe('?page=Books');
    expect(screen.getByText('Child').closest('li')?.style.paddingLeft).toBe(
      '16px',
    );
  });

  it('follows an in-page [[link]] without leaving the browser', async () => {
    send.mockImplementation((type: string) => {
      if (type === 'logseq:allPages')
        return Promise.resolve(answers['logseq:allPages']);
      if (type === 'logseq:pageView')
        return Promise.resolve(
          viewOf('Books', [
            {
              preorder: 0,
              depth: 0,
              marker: '-',
              text: '',
              html: '<a href="logseq://graph/g?page=Work">work</a>',
            },
          ]),
        );
      return Promise.resolve({ status: 200, response: null });
    });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByText('Books'));
    });
    await waitFor(() => expect(screen.getByText('work')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByText('work'));
    });
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('logseq:pageView', { page: 'Work' }),
    );
    expect(window.location.search).toBe('?page=Work');
  });

  it('restores the page and query from the URL on load', async () => {
    window.history.replaceState({}, '', '/?page=Work&q=notes');
    await mount();
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('logseq:pageView', { page: 'Work' }),
    );
    expect(
      (screen.getByLabelText('Search graph') as HTMLInputElement).value,
    ).toBe('notes');
  });

  it('caps the page list at 300 with a hint', async () => {
    send.mockImplementation((type: string) => {
      if (type === 'logseq:allPages')
        return Promise.resolve(
          Array.from({ length: MAX_PAGES + 3 }, (_, i) =>
            pageEntry(`Page ${i}`),
          ),
        );
      return Promise.resolve(viewOf('Books', []));
    });
    await mount();
    await waitFor(() => expect(screen.getByText('Page 0')).toBeTruthy());
    const rows = screen
      .getAllByRole('button')
      .filter((b) => /^Page /.test(b.textContent ?? ''));
    expect(rows).toHaveLength(MAX_PAGES);
    expect(
      screen.getByText(
        `Showing 300 of ${MAX_PAGES + 3} pages — refine filter or search`,
      ),
    ).toBeTruthy();
  });

  it('renders only the first 1500 blocks of a large page until "Show all"', async () => {
    send.mockImplementation((type: string) => {
      if (type === 'logseq:allPages')
        return Promise.resolve(answers['logseq:allPages']);
      if (type === 'logseq:pageView')
        return Promise.resolve(
          viewOf(
            'Books',
            Array.from({ length: MAX_BLOCKS + 5 }, (_, i) => ({
              preorder: i,
              depth: 0,
              marker: '-',
              text: '',
              html: `<p>Block ${i}</p>`,
            })),
          ),
        );
      return Promise.resolve({ status: 200, response: null });
    });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByText('Books'));
    });
    await waitFor(() => expect(screen.getByText('Block 1499')).toBeTruthy());
    expect(screen.queryByText(`Block ${MAX_BLOCKS}`)).toBeNull();
    expect(
      screen.getByRole('button', { name: `Show all ${MAX_BLOCKS + 5} blocks` }),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: `Show all ${MAX_BLOCKS + 5} blocks`,
        }),
      );
    });
    expect(screen.getByText(`Block ${MAX_BLOCKS + 4}`)).toBeTruthy();
  });

  it('surfaces a failed page read', async () => {
    send.mockImplementation((type: string) => {
      if (type === 'logseq:allPages')
        return Promise.resolve(answers['logseq:allPages']);
      if (type === 'logseq:pageView')
        return Promise.reject(new Error('No connection'));
      return Promise.resolve({ status: 200, response: null });
    });
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByText('Books'));
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('No connection'),
    );
  });
});
