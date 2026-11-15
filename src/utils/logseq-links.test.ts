/**
 * `logseq:` links in a content script UI are routed to the host's opener
 * (the in-extension page viewer), never to the browser: following one would
 * launch the Logseq desktop app. Clicks are delegated on the UI's shadow root;
 * other links keep their default.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

import log from '@/utils/logger';
import { openLogseqLinksFromBackground } from './logseq-links';

const LOGSEQ = 'logseq://graph/My%20Notes?block-id=6650a1b2-0000-4000-8000-000000000001';

const open = vi.fn().mockResolvedValue(undefined);

/** A UI like the content script's: a closed shadow root with links in it. */
const makeUi = () => {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <a id="logseq" href="${LOGSEQ}"><span id="inside">Block</span></a>
    <a id="web" href="https://example.com/">Web</a>
    <a id="nohref">No href</a>
    <span id="plain">Text</span>
  `;
  openLogseqLinksFromBackground(shadow, open);
  return shadow;
};

/**
 * A user's mouse event (happy-dom has no isTrusted; in browsers only the
 * browser's own events have it). Returns whether the default was prevented.
 */
const press = (
  target: Element,
  type: 'click' | 'auxclick',
  init: MouseEventInit = {},
  trusted = true,
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: type === 'click' ? 0 : 1,
    ...init,
  });
  Object.defineProperty(event, 'isTrusted', { value: trusted });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};

beforeEach(() => {
  open.mockReset().mockResolvedValue(undefined);
});

describe('logseq: links', () => {
  test('a left click is opened by the host opener, not the browser', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'click')).toBe(true);

    expect(open.mock.calls).toEqual([[LOGSEQ]]);
  });

  test('a click on an element inside the link opens the link', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('inside')!, 'click')).toBe(true);

    expect(open.mock.calls).toEqual([[LOGSEQ]]);
  });

  test.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
  ])('%s + click is opened by the opener too', (_key, init) => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'click', init)).toBe(true);

    expect(open.mock.calls).toEqual([[LOGSEQ]]);
  });

  test('a middle click is opened by the opener', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'auxclick', { button: 1 })).toBe(true);

    expect(open.mock.calls).toEqual([[LOGSEQ]]);
  });

  test('a right click keeps the context menu ("Copy link address")', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'auxclick', { button: 2 })).toBe(false);

    expect(open).not.toHaveBeenCalled();
  });

  test('the link keeps its href', () => {
    const ui = makeUi();
    press(ui.getElementById('logseq')!, 'click');

    expect(ui.getElementById('logseq')!.getAttribute('href')).toBe(LOGSEQ);
  });

  test('a failed opener is logged, not thrown', async () => {
    const error = new Error('Extension context invalidated.');
    open.mockRejectedValue(error);
    const logged = vi.spyOn(log, 'error').mockImplementation(() => {});
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'click')).toBe(true);

    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(expect.any(String), error));
    logged.mockRestore();
  });
});

describe('everything else keeps its default', () => {
  test('a web link', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('web')!, 'click')).toBe(false);
    expect(press(ui.getElementById('web')!, 'auxclick')).toBe(false);

    expect(open).not.toHaveBeenCalled();
  });

  test('an <a> without href, and text outside links', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('nohref')!, 'click')).toBe(false);
    expect(press(ui.getElementById('plain')!, 'click')).toBe(false);

    expect(open).not.toHaveBeenCalled();
  });

  test('a click a page script made (not trusted)', () => {
    const ui = makeUi();

    expect(press(ui.getElementById('logseq')!, 'click', {}, false)).toBe(false);

    expect(open).not.toHaveBeenCalled();
  });

  test('a click the UI already handled (default prevented)', () => {
    const ui = makeUi();
    const link = ui.getElementById('logseq')!;
    link.addEventListener('click', (event) => event.preventDefault());

    press(link, 'click');

    expect(open).not.toHaveBeenCalled();
  });

  test('stops after the returned function is called', () => {
    const host = document.createElement('div');
    const root = document.createElement('div');
    root.innerHTML = `<a id="logseq" href="${LOGSEQ}">Block</a>`;
    host.append(root);
    document.body.replaceChildren(host);
    const stop = openLogseqLinksFromBackground(root, open);

    stop();

    expect(press(root.querySelector('#logseq')!, 'click')).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
