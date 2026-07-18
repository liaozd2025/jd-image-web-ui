export function isStandaloneWebApp(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches
    || iosNavigator.standalone === true
  );
}

export function webAppDocumentTitle(standaloneTitle: string, fullTitle: string): string {
  return isStandaloneWebApp() ? standaloneTitle : fullTitle;
}
