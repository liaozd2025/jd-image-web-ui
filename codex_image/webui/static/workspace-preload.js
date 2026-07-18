(() => {
  const CSRF_COOKIE = "jd_image_csrf";
  const originalFetch = window.fetch.bind(window);

  function csrfToken() {
    const prefix = `${CSRF_COOKIE}=`;
    const item = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : "";
  }

  window.fetch = (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url || String(input), window.location.href);
    const method = String(init.method || request?.method || "GET").toUpperCase();
    if (url.origin !== window.location.origin || ["GET", "HEAD", "OPTIONS"].includes(method)) {
      return originalFetch(input, init);
    }
    const headers = new Headers(request?.headers || undefined);
    new Headers(init.headers || undefined).forEach((value, key) => headers.set(key, value));
    const token = csrfToken();
    if (token && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", token);
    return originalFetch(input, { ...init, headers });
  };

  const THEME_STORAGE_KEY = "codex-image-theme-preference";
  const validThemes = new Set(["system", "light", "dark"]);
  let themePreference = "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (validThemes.has(stored)) themePreference = stored;
  } catch {
    themePreference = "system";
  }
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  document.documentElement.dataset.theme = themePreference === "system" ? (systemDark ? "dark" : "light") : themePreference;
  document.documentElement.dataset.themePreference = themePreference;

  const LOCALE_STORAGE_KEY = "codex-image-locale-preference";
  const validLocales = new Set(["zh-CN", "zh-TW", "zh-HK", "ja", "ko", "en", "es", "pt", "fr", "de", "ru", "it", "hi"]);
  const defaultLocale = "zh-CN";

  function normalizeLocale(value) {
    if (validLocales.has(value)) return value;
    const language = String(value || "").trim().toLowerCase();
    if (!language) return null;
    for (const locale of validLocales) {
      if (locale.toLowerCase() === language) return locale;
    }
    if (language.startsWith("zh-hk") || language.startsWith("zh-mo")) return "zh-HK";
    if (language.startsWith("zh-tw") || language.startsWith("zh-hant")) return "zh-TW";
    if (language.startsWith("zh-cn") || language.startsWith("zh-sg") || language.startsWith("zh-hans") || language === "zh") return "zh-CN";
    if (language.startsWith("ja")) return "ja";
    if (language.startsWith("ko")) return "ko";
    if (language.startsWith("en")) return "en";
    if (language.startsWith("es")) return "es";
    if (language.startsWith("pt")) return "pt";
    if (language.startsWith("fr")) return "fr";
    if (language.startsWith("de")) return "de";
    if (language.startsWith("ru")) return "ru";
    if (language.startsWith("it")) return "it";
    if (language.startsWith("hi")) return "hi";
    return null;
  }

  function detectPreferredLocale() {
    const candidates = [...Array.from(navigator.languages || []), navigator.language];
    for (const candidate of candidates) {
      const locale = normalizeLocale(candidate);
      if (locale) return locale;
    }
    return defaultLocale;
  }

  function readLocalLocalePreference() {
    try {
      return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function applyLocale(locale) {
    const currentLocale = locale || defaultLocale;
    document.documentElement.lang = currentLocale;
    document.documentElement.dataset.locale = currentLocale;
  }

  const initialLocale = readLocalLocalePreference() || detectPreferredLocale();
  applyLocale(initialLocale);
  void originalFetch("/api/settings")
    .then(async (response) => response.ok ? await response.json() : {})
    .then((payload) => applyLocale(normalizeLocale(payload?.settings?.locale) || initialLocale))
    .catch(() => applyLocale(initialLocale));
})();
