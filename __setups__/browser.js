require('jest-webextension-mock');

// webextension-polyfill refuses to load unless chrome.runtime.id exists
browser.runtime.id = 'jest-extension-id';

const getDetails = (details, cb) => {
    if (cb !== undefined) {
      return cb();
    }
    return Promise.resolve();
  };

browser.action = browser.browserAction;
browser.action.setBadgeTextColor = jest.fn();


