// Theme switch shared by every page: Auto follows the device, Light and Dark are remembered.
const THEMES = ['auto', 'light', 'dark'];
const LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };
const ICON = {
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4 a8 8 0 0 1 0 16 Z" style="fill:var(--ink)"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
};

export function initTheme(btn) {
  let theme = 'auto';
  try { const t = localStorage.getItem('dd-theme'); if (THEMES.includes(t)) theme = t; } catch { /* private mode */ }
  const apply = () => {
    if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">${ICON[theme]}</svg>${LABEL[theme]}`;
    btn.setAttribute('aria-label', `Theme: ${LABEL[theme]}. Switch theme`);
    btn.title = 'Switch between auto, light and dark';
  };
  btn.addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    try { if (theme === 'auto') localStorage.removeItem('dd-theme'); else localStorage.setItem('dd-theme', theme); } catch { /* private mode */ }
    apply();
  });
  apply();
}
