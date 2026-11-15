import { escapeHtml, highlightText, safeHref } from './sanitize';

describe('sanitize helpers', () => {
  describe('safeHref (link)', () => {
    it('rejects javascript: and vbscript: links', () => {
      expect(safeHref('javascript:alert(1)', 'link')).toBeNull();
      expect(safeHref('  JavaScript:alert(1)  ', 'link')).toBeNull();
      expect(safeHref('vbscript:msgbox(1)', 'link')).toBeNull();
    });

    it('rejects obfuscated javascript: with control characters', () => {
      expect(safeHref('java\nscript:alert(1)', 'link')).toBeNull();
      expect(safeHref('java\tscript:alert(1)', 'link')).toBeNull();
    });

    it('rejects data: and file: links', () => {
      expect(safeHref('data:text/html,<script>alert(1)</script>', 'link')).toBeNull();
      expect(safeHref('data:image/png;base64,AAAA', 'link')).toBeNull();
      expect(safeHref('file:///etc/passwd', 'link')).toBeNull();
    });

    it('allows http, https, mailto, fragments and relative paths', () => {
      expect(safeHref('https://example.com/a?b=1', 'link')).toBe('https://example.com/a?b=1');
      expect(safeHref('http://example.com', 'link')).toBe('http://example.com');
      expect(safeHref('mailto:me@example.com', 'link')).toBe('mailto:me@example.com');
      expect(safeHref('#section', 'link')).toBe('#section');
      expect(safeHref('/relative/path', 'link')).toBe('/relative/path');
      expect(safeHref('foo/bar', 'link')).toBe('foo/bar');
    });

    it('rejects null, empty and unknown schemes', () => {
      expect(safeHref(null, 'link')).toBeNull();
      expect(safeHref(undefined, 'link')).toBeNull();
      expect(safeHref('   ', 'link')).toBeNull();
      expect(safeHref('tel:+100000', 'link')).toBeNull();
    });
  });

  describe('safeHref (image)', () => {
    it('allows base64 image data URIs', () => {
      const png = 'data:image/png;base64,iVBORw0KGgo=';
      expect(safeHref(png, 'image')).toBe(png);
      expect(safeHref('data:image/svg+xml;base64,PHN2Zz4=', 'image')).toBe(
        'data:image/svg+xml;base64,PHN2Zz4=',
      );
    });

    it('rejects non-image data URIs', () => {
      expect(safeHref('data:text/html;base64,PHNjcmlwdD4=', 'image')).toBeNull();
      expect(safeHref('data:image/png,notbase64', 'image')).toBeNull();
    });

    it('allows https and relative image sources', () => {
      expect(safeHref('https://example.com/a.png', 'image')).toBe(
        'https://example.com/a.png',
      );
      expect(safeHref('./a.png', 'image')).toBe('./a.png');
    });
  });

  describe('escapeHtml', () => {
    it('escapes html metacharacters', () => {
      expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    });

    it('neutralises script markup into inert text', () => {
      const out = escapeHtml('<script>alert(1)</script>');
      expect(out).not.toContain('<script');
      expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('neutralises event handlers and data URIs in attributes', () => {
      const out = escapeHtml('<img src=x onerror="alert(1)">');
      expect(out).not.toContain('<img');
      expect(out).not.toContain('"');
      expect(out).toContain('onerror=&quot;alert(1)&quot;');
    });
  });

  describe('highlightText', () => {
    it('wraps ordinary matches in <mark>', () => {
      expect(highlightText('find ok please', 'ok')).toBe(
        'find <mark>ok</mark> please',
      );
    });

    it('does not highlight an empty query', () => {
      expect(highlightText('plain text', '')).toBe('plain text');
      expect(highlightText('plain text', undefined)).toBe('plain text');
    });

    it('escapes a malicious query so it cannot inject markup', () => {
      const query = '"><img src=x onerror=1>';
      const out = highlightText(`before ${query} after`, query);
      expect(out).not.toContain('<img');
      expect(out).not.toContain('onerror=1>');
      expect(out).toContain('&lt;img');
      expect(out).toContain('&quot;&gt;');
      expect(out).toContain('<mark>');
    });

    it('keeps link display text inert when escaped then highlighted', () => {
      const display = escapeHtml('<img src=x onerror=alert(1)>');
      const out = highlightText(display, 'img');
      expect(out).not.toContain('<img');
      expect(out).toContain('<mark>img</mark>');
    });
  });
});
