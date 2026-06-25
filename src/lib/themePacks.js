export const THEME_PACK_IDS = Object.freeze(['mist-ops', 'signal-room']);

export const DEFAULT_THEME_PACK_ID = 'mist-ops';

export function normalizeThemePackId(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return THEME_PACK_IDS.includes(normalized) ? normalized : DEFAULT_THEME_PACK_ID;
}

export function resolveThemePackIdFromUi(ui) {
  if (!ui || typeof ui !== 'object' || Array.isArray(ui)) {
    return DEFAULT_THEME_PACK_ID;
  }

  const theme = ui.theme;
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    return DEFAULT_THEME_PACK_ID;
  }

  return normalizeThemePackId(theme.id);
}

export function withResolvedThemePackId(ui, themeId) {
  const source = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {};
  const currentTheme = source.theme && typeof source.theme === 'object' && !Array.isArray(source.theme)
    ? source.theme
    : {};

  return {
    ...source,
    theme: {
      ...currentTheme,
      id: normalizeThemePackId(themeId),
    },
  };
}