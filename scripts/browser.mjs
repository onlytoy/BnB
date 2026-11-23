import { chromium } from 'playwright-core';

export async function launchBrowser(options = {}) {
  const executablePath = process.env.CHROME_PATH
    || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
  if (!executablePath) throw new Error('Set CHROME_PATH to an installed Chrome or Chromium executable.');
  return chromium.launch({ executablePath, ...options });
}
