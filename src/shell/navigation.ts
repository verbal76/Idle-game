// Decides what a navigation inside the game WebView does. The game page
// is a local HTML string and never navigates anywhere itself; links it
// opens with another scheme (mailto: from Send bug report / feature
// request) are handed to the OS instead of replacing the game page with
// an error page. Pure so it can be tested; App.tsx passes Linking.openURL.

const IN_WEBVIEW = /^(https?:|about:|data:|blob:|file:)/i;

export function shouldLoadInWebView(url: string, openExternal: (url: string) => Promise<unknown>): boolean {
  if (IN_WEBVIEW.test(url)) return true;
  openExternal(url).catch(() => { /* no app for this link: stay on the game */ });
  return false;
}
