import { buildApiUrl } from './client';
import { LogseqCopliotConfig } from '../../config';

const base: LogseqCopliotConfig = {
  version: '1.6.0',
  logseqHost: 'http://localhost:12315',
  logseqAuthToken: 'token',
  enableClipNoteFloatButton: false,
  clipNoteLocation: 'journal',
  clipNoteCustomPage: '',
  clipNoteTemplate: '',
};

describe('buildApiUrl', () => {
  test('keeps a configured https URL exactly (scheme + host)', () => {
    expect(
      buildApiUrl({ ...base, logseqHost: 'https://logseq-api.mac.zhaochunqi.com' })
        .href,
    ).toBe('https://logseq-api.mac.zhaochunqi.com/api');
  });

  test('keeps a configured https URL with explicit port', () => {
    expect(
      buildApiUrl({ ...base, logseqHost: 'https://logseq-api.mac.zhaochunqi.com:8443' })
        .href,
    ).toBe('https://logseq-api.mac.zhaochunqi.com:8443/api');
  });

  test('keeps an http URL with port (default local Logseq)', () => {
    expect(
      buildApiUrl({ ...base, logseqHost: 'http://127.0.0.1:8787' }).href,
    ).toBe('http://127.0.0.1:8787/api');
  });

  test('defaults to http://localhost:12315 when empty', () => {
    expect(buildApiUrl({ ...base, logseqHost: '' }).href).toBe(
      'http://localhost:12315/api',
    );
  });

  test('bare hostname gets implicit http scheme (never https->http downgrade)', () => {
    expect(
      buildApiUrl({ ...base, logseqHost: 'logseq-api.mac.zhaochunqi.com' }).href,
    ).toBe('http://logseq-api.mac.zhaochunqi.com/api');
  });

  test('bare host:port gets implicit http scheme with the port kept', () => {
    expect(buildApiUrl({ ...base, logseqHost: 'localhost:8787' }).href).toBe(
      'http://localhost:8787/api',
    );
  });

  test('trailing slash does not break the endpoint', () => {
    expect(buildApiUrl({ ...base, logseqHost: 'http://localhost:12315/' }).href).toBe(
      'http://localhost:12315/api',
    );
  });

  test('trims surrounding whitespace', () => {
    expect(
      buildApiUrl({ ...base, logseqHost: '  https://logseq-api.mac.zhaochunqi.com  ' })
        .href,
    ).toBe('https://logseq-api.mac.zhaochunqi.com/api');
  });

  test('throws on invalid input so the options page can surface it', () => {
    expect(() => buildApiUrl({ ...base, logseqHost: 'http://' })).toThrow();
  });
});
