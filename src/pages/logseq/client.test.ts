import { buildApiUrl } from './client';
import { LogseqCopliotConfig } from '../../config';

const base: LogseqCopliotConfig = {
  version: '1.6.0',
  logseqHost: 'http://localhost:12315',
  logseqHostName: 'localhost',
  logseqPort: 12315,
  logseqAuthToken: 'token',
  enableClipNoteFloatButton: false,
  clipNoteLocation: 'journal',
  clipNoteCustomPage: '',
  clipNoteTemplate: '',
};

describe('buildApiUrl', () => {
  test('uses hostName and port from the options page config', () => {
    expect(buildApiUrl({ ...base, logseqPort: 8787 }).href).toBe(
      'http://localhost:8787/api',
    );
  });

  test('uses a custom host name with default port', () => {
    expect(
      buildApiUrl({ ...base, logseqHostName: '127.0.0.1' }).href,
    ).toBe('http://127.0.0.1:12315/api');
  });

  test('normalizes a host name pasted with a scheme', () => {
    expect(
      buildApiUrl({
        ...base,
        logseqHostName: 'http://localhost',
        logseqPort: 8787,
      }).href,
    ).toBe('http://localhost:8787/api');
  });

  test('falls back to legacy logseqHost when port is missing', () => {
    expect(buildApiUrl({ ...base, logseqPort: 0 }).href).toBe(
      'http://localhost:12315/api',
    );
  });

  test('falls back to legacy logseqHost when host name is empty', () => {
    expect(buildApiUrl({ ...base, logseqHostName: '' }).href).toBe(
      'http://localhost:12315/api',
    );
  });
});
