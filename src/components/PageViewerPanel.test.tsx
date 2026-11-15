import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PageViewerPanel } from './PageViewerPanel';
import type { PageView } from '@/types/logseqBlock';

// The panel delegates to sanitizeHtml; that is tested in its own file with a
// jsdom environment, which DOMPurify needs. Here the pass-through is enough.
vi.mock('@/utils/sanitize-html', () => ({
  sanitizeHtml: (html: string) => html,
}));

const view: PageView = { name: 'test', originalName: 'Test Page', journal: true, properties: [{ key: 'type', value: 'project' }], blocks: [
  { preorder: 0, depth: 0, marker: '-', text: 'root', html: '<p>Root</p>' },
  { preorder: 1, depth: 2, marker: '1.', text: 'child', html: '<p>Child</p>' },
] };
const props = { view, loading: false, error: null, onClose: vi.fn(), onBack: vi.fn(), onRefresh: vi.fn(), onOpenFullPage: vi.fn() };

describe('PageViewerPanel', () => {
  it('renders title, journal badge, properties and depth indentation', () => {
    render(<PageViewerPanel {...props} />);
    expect(screen.getByRole('dialog', { name: /Test Page/ })).toBeTruthy();
    expect(screen.getByText('Test Page')).toBeTruthy();
    expect(screen.getByText('Journal')).toBeTruthy();
    expect(screen.getByText('type')).toBeTruthy();
    expect(screen.getByText('Root').closest('li')?.style.paddingLeft).toBe('0px');
    expect(screen.getByText('Child').closest('li')?.style.paddingLeft).toBe('32px');
  });
  it('renders loading and error states', () => {
    const { rerender } = render(<PageViewerPanel {...props} view={null} loading error={null} />);
    expect(screen.getByRole('status')).toBeTruthy();
    rerender(<PageViewerPanel {...props} view={null} loading={false} error="Offline" />);
    expect(screen.getByRole('alert').textContent).toContain('Offline');
  });
  it('renders empty state without a view', () => {
    render(<PageViewerPanel {...props} view={null} />);
    expect(screen.getByText('Page not found.')).toBeTruthy();
  });
  it('renders block HTML', () => {
    const linked: PageView = {
      ...view,
      blocks: [{ preorder: 0, depth: 0, marker: '-', text: '', html: '<p>safe</p>' }],
    };
    render(<PageViewerPanel {...props} view={linked} />);
    expect(screen.getByText('safe')).toBeTruthy();
  });
  it('routes data-logseq links to onNavigate', () => {
    const onNavigate = vi.fn();
    const linked: PageView = {
      ...view,
      blocks: [{ preorder: 0, depth: 0, marker: '-', text: '', html: '<a data-logseq-page="books" href="#">books</a>' }],
    };
    render(<PageViewerPanel {...props} view={linked} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('books'));
    expect(onNavigate).toHaveBeenCalledWith({ page: 'books' });
  });
});
