export const THEME_KEY = "tis-admin-theme";

export type ThemeMode = "light" | "dark";

/** Inline before paint — keep in sync with THEME_KEY. */
export const THEME_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem('${THEME_KEY}')==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;
