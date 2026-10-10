// Anti-flash: apply the stored theme before the bundle loads, so a reload never
// paints the wrong theme first. It is a file, not an inline script, because the
// production Content-Security-Policy (deploy/Caddyfile) allows scripts from this
// origin only. This duplicates the small decision in
// src/components/providers/theme-provider.tsx (THEME_STORAGE_KEY and
// resolveTheme) because it must run before any module; keep the two in step.
;(function () {
  try {
    var stored = window.localStorage.getItem('app.theme')
    var mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    var dark = mode === 'dark' || (mode === 'system' && prefersDark)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  } catch (error) {
    /* storage blocked — fall through to the light default */
  }
})()
