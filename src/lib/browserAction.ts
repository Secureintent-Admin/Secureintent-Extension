import { browser } from '#imports';

// The toolbar-button API is `action` under Manifest V3 (Chrome build) but
// `browserAction` under Manifest V2 (Firefox build). Firefox MV2 has no
// `browser.action`, so reaching for it directly throws
// "can't access property ... p.action is undefined". Resolve whichever the
// current browser exposes so badge + popup code works cross-browser.
export const browserAction = browser.action ?? browser.browserAction;
