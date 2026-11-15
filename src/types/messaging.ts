import {
  defineExtensionMessaging,
  type ExtensionSendMessageArgs,
  type GetDataType,
  type GetReturnType,
} from '@webext-core/messaging';
import type { LogseqSearchResult, PageView } from './logseqBlock';
import { LogseqResponseType } from '@/entrypoints/background/logseq/client';
import type { RecallResult } from './recall';

// Define all message types for cross-context communication
export interface MessagingProtocol {
  // Background script messages
  'logseq:search': (query: string) => LogseqResponseType<LogseqSearchResult>;

  /** Whole page read for the in-page PageViewer, by page name or block UUID. */
  'logseq:pageView': (data: { page?: string; block?: string }) => PageView | null;

  /** The recall rules matching `url` decide how far up its path to search. */
  'logseq:urlSearch': (data: {
    url: string;
  }) => LogseqResponseType<LogseqSearchResult>;

  /**
   * Pages that mention a search engine query, best first (see
   * background/logseq/recall). `url` picks the recall rules (keyword
   * filters, page scope, maxResults counted in pages). Errors are thrown
   * (LogseqError) and reach the sender as a readable message.
   */
  'logseq:recall': (data: { query: string; url: string }) => RecallResult;

  'app:openOptions': () => void;

  'app:openPage': (data: { url: string }) => void;

  /**
   * From a content script: open a `logseq:` link of its UI in its tab
   * (src/utils/logseq-links.ts). Rejects any other URL; ignored without a
   * sender tab.
   */
  'logseq:openLink': (data: { url: string }) => void;

  /**
   * Sent by the browser sidebar to one tab: scroll the highlight to the middle
   * of the viewport. Resolves to false when the page has no such highlight.
   */
  'content:scrollToHighlight': (data: { id: string }) => boolean;
}

// Create the messaging instance
const messaging = defineExtensionMessaging<MessagingProtocol>();

type DataOf<T extends keyof MessagingProtocol> = GetDataType<MessagingProtocol[T]>;

/**
 * webext-core's sendMessage, except that data the message may go without
 * (`(data?: ...) => ...`) may be left out, as for messages without data.
 */
export const sendMessage: <T extends keyof MessagingProtocol>(
  type: T,
  ...args: undefined extends DataOf<T>
    ? [data?: DataOf<T>, ...rest: ExtensionSendMessageArgs]
    : [data: DataOf<T>, ...rest: ExtensionSendMessageArgs]
) => Promise<GetReturnType<MessagingProtocol[T]>> = messaging.sendMessage;

export const { onMessage } = messaging;
