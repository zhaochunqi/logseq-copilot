import log from '@/utils/logger';
import { isLogseqUrl } from '@/utils/logseq-url';

/**
 * The `logseq:` link a user's click opens, if any: a left click (with or
 * without Ctrl, Cmd, Shift, Alt) or a middle click. Not a right click: the
 * context menu still offers "Copy link address".
 */
const logseqLinkOf = (event: MouseEvent): string | undefined => {
  if (!event.isTrusted || event.defaultPrevented) return undefined;
  if (event.button !== (event.type === 'auxclick' ? 1 : 0)) return undefined;
  const target = event.target as Element | null;
  const link = target?.closest?.('a[href]') as HTMLAnchorElement | null | undefined;
  // `href` of an SVG <a> is no string, so it is skipped too.
  return isLogseqUrl(link?.href) ? link.href : undefined;
};

type OpenLink = (url: string) => Promise<unknown> | unknown;

const opener = (open: OpenLink) => (event: Event) => {
  const url = logseqLinkOf(event as MouseEvent);
  if (!url) return;
  event.preventDefault();
  Promise.resolve(open(url)).catch((error) =>
    log.error('Failed to open the Logseq link', error),
  );
};

/**
 * Route the `logseq:` links of a content script UI to `open` instead of the
 * browser, which would launch the Logseq desktop app.
 *
 * The links keep their `href`, for the status bar and "Copy link address";
 * callers parse the page/block out of it and open the in-extension viewer.
 * Call it with the UI's shadow root: the listeners there see the real target
 * of a click, even in a closed shadow root. Returns a function that removes
 * the listeners; adding them again is a no-op.
 */
export function openLogseqLinksFromBackground(
  root: EventTarget,
  open: OpenLink,
): () => void {
  const listener = opener(open);
  root.addEventListener('click', listener);
  root.addEventListener('auxclick', listener);
  return () => {
    root.removeEventListener('click', listener);
    root.removeEventListener('auxclick', listener);
  };
}
