import { useEffect } from 'react';
import { isFieldGamesNow } from './schedule';
import { useNow } from './useNow';

const THEME_COLORS = { light: '#e8ecf3', dark: '#15171c' };

/** The whole app goes dark for the duration of the field games. */
export function useEventTheme(): boolean {
  const now = useNow(15_000);
  const dark = isFieldGamesNow(now);

  useEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    // Otherwise the browser chrome and PWA status bar stay pale.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[theme]);
  }, [dark]);

  return dark;
}
