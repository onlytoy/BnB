import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './browser.mjs';
import { createApp } from '../server/index.js';

await mkdir(new URL('../artifacts/mobile/', import.meta.url), { recursive: true });
const app = await createApp(0);
const browser = await launchBrowser({
  args: ['--no-proxy-server'],
});
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await page.goto(`http://127.0.0.1:${app.port}/`);
  await page.locator('#name-input').fill('缩放检查');
  await page.locator('#btn-login').tap();
  await page.locator('#btn-create').tap();
  const inputFontSize = await page.locator('#chat-input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  await page.locator('#btn-start').tap();
  await page.locator('#view-game').waitFor({ state: 'visible' });
  const room = [...app.lobby.rooms.values()][0];
  room.brains.clear();
  for (const player of room.game.players.values()) player.dirs = [];
  const cdp = await page.context().newCDPSession(page);
  const scale = () => page.evaluate(() => window.visualViewport.scale);
  const pinch = async (factor, xRatio = 0.7) => {
    const center = await page.evaluate((ratio) => ({ x: visualViewport.width * ratio, y: visualViewport.height / 2 }), xRatio);
    await cdp.send('Input.synthesizePinchGesture', { ...center, scaleFactor: factor, gestureSourceType: 'touch' });
    await page.waitForTimeout(250);
  };

  // Reproduce an already-zoomed view under the old game-wide gesture block.
  const oldStyle = await page.addStyleTag({ content: '.touch-device #view-game { touch-action: none; }' });
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.waitForFunction(() => document.documentElement.classList.contains('page-zoomed'));
  await pinch(0.5, 0.3);
  const oldScaleAfterPinchIn = await scale();
  assert(oldScaleAfterPinchIn > 1.5, 'Old full-game block should reproduce the zoom trap');
  await oldStyle.evaluate((el) => el.remove());

  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await pinch(0.5, 0.3);
  const recoveredScale = await scale();
  if (process.argv.includes('--baseline')) {
    console.log({ inputFontSize, oldScaleAfterPinchIn, recoveredScale });
  } else {
    assert(recoveredScale < 1.1, 'Pinching the map should recover from an inherited 2x viewport scale');
    assert(inputFontSize >= 16, 'Chat field should use a readable mobile font size');
    const policy = await page.evaluate(() => ({
      game: getComputedStyle(document.getElementById('view-game')).touchAction,
      stick: getComputedStyle(document.getElementById('touch-stick')).touchAction,
      moveZone: getComputedStyle(document.getElementById('touch-move-zone')).touchAction,
      bomb: getComputedStyle(document.getElementById('touch-bomb')).touchAction,
      page: getComputedStyle(document.documentElement).touchAction,
    }));
    assert.equal(policy.game, 'pinch-zoom');
    assert.equal(policy.stick, 'none');
    assert.equal(policy.moveZone, 'none');
    assert.equal(policy.bomb, 'none');
    assert.equal(policy.page, 'manipulation');
    await pinch(1.8);
    const zoomedScale = await scale();
    assert(zoomedScale > 1.3, 'Deliberate pinch zoom should remain usable');
    await pinch(1 / zoomedScale, 0.3);
    const finalScale = await scale();
    assert(finalScale < 1.1, 'Pinch back should restore the viewport');
    const result = { oldScaleAfterPinchIn, recoveredScale, zoomedScale, finalScale, inputFontSize, policy };
    await writeFile(new URL('../artifacts/mobile/zoom-verification.json', import.meta.url), JSON.stringify(result, null, 2));
    console.log(result);
  }
} finally {
  await browser.close();
  await app.close();
}
