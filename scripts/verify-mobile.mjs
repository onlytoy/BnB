import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchBrowser } from './browser.mjs';
import { createApp } from '../server/index.js';

const output = new URL('../artifacts/mobile/', import.meta.url);
await mkdir(output, { recursive: true });
const app = await createApp(0);
const browser = await launchBrowser({
  args: ['--no-proxy-server', '--host-resolver-rules=MAP bnb.test 127.0.0.1'],
});
const errors = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await context.newPage();
page.setDefaultTimeout(7000);
page.on('pageerror', (e) => errors.push(e.message));
const sent = [];
page.on('websocket', (ws) => ws.on('framesent', ({ payload }) => sent.push(JSON.parse(payload))));
const lastInput = () => sent.filter((m) => m.t === 'input').at(-1)?.dir;
const wait = (fn) => new Promise((resolve, reject) => {
  const deadline = Date.now() + 4000;
  const poll = () => fn() ? resolve() : Date.now() > deadline ? reject(new Error(`Condition timed out: ${fn.toString()}`)) : setTimeout(poll, 20);
  poll();
});
const within = async (locator) => {
  const b = await locator.boundingBox();
  const v = page.viewportSize();
  assert(b && b.x >= -1 && b.y >= -1 && b.x + b.width <= v.width + 1 && b.y + b.height <= v.height + 1,
    `Element outside viewport: ${JSON.stringify(b)}`);
  return b;
};
const layouts = [];
const checkLayout = async () => {
  const viewport = page.viewportSize();
  const map = await within(page.locator('#game-canvas'));
  assert(Math.abs(map.x + map.width / 2 - viewport.width / 2) < 2, 'Map should be horizontally centered');
  assert(Math.abs(map.y + map.height / 2 - viewport.height / 2) < 2, 'Map should be vertically centered');
  for (const selector of ['#touch-stick', '#touch-bomb', '#touch-item', '#mobile-hud', '#touch-status']) {
    const control = await within(page.locator(selector));
    assert(map.x + map.width <= control.x + 1 || control.x + control.width <= map.x + 1
      || map.y + map.height <= control.y + 1 || control.y + control.height <= map.y + 1,
    `${selector} must not cover the map at ${viewport.width}x${viewport.height}`);
  }
  const rail = viewport.width > viewport.height ? Math.max(96, Math.min(viewport.width * 0.17, 144)) : 0;
  const availableHeight = viewport.width > viewport.height ? viewport.height : viewport.height - 312;
  const expectedHeight = Math.min(availableHeight, (viewport.width - 2 * rail) * 520 / 600);
  assert(Math.abs(map.height - expectedHeight) < 2, 'Map should fill the available area at its original aspect ratio');
  layouts.push({ viewport, map });
};

try {
  const url = `http://bnb.test:${app.port}`;
  await page.goto(url);
  await page.evaluate(() => {
    window.__inputTrace = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'resize', 'blur', 'visibilitychange']) {
      window.addEventListener(type, (e) => window.__inputTrace.push({ type, id: e.pointerId, target: e.target.id, x: e.clientX, y: e.clientY, scale: visualViewport.scale }), true);
    }
  });
  assert.equal(await page.evaluate(() => isSecureContext), false, 'LAN HTTP should work');
  await page.locator('#name-input').fill('手机玩家');
  await page.locator('#btn-login').tap();
  await page.locator('#view-lobby').waitFor({ state: 'visible' });
  await within(page.locator('#btn-create'));
  await page.screenshot({ path: new URL('mobile-lobby.png', output).pathname });
  await page.locator('#btn-create').tap();
  await page.locator('#view-room').waitFor({ state: 'visible' });
  await page.locator('#btn-start').scrollIntoViewIfNeeded();
  await within(page.locator('#btn-start'));
  await page.screenshot({ path: new URL('mobile-room.png', output).pathname });

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  desktop.on('pageerror', (e) => errors.push(e.message));
  await desktop.goto(url);
  await desktop.locator('#name-input').fill('电脑玩家');
  await desktop.locator('#btn-login').click();
  await desktop.locator('.ldb-room:not(.empty)').first().click();
  await desktop.locator('#view-room').waitFor({ state: 'visible' });
  await page.locator('#btn-start').tap();
  await page.locator('#view-game').waitFor({ state: 'visible' });
  const room = [...app.lobby.rooms.values()][0];
  room.brains.clear(); // Keep test opponents still; exercise the real server and actual touch events.
  for (const p of room.game.players.values()) p.dirs = [];
  const id = room.players.find((p) => p.name === '手机玩家').id;
  const me = room.game.players.get(id);
  const clearBombs = () => { room.game.bombs.clear(); room.game.bombsByPos.clear(); room.game.explosions = []; };
  await page.waitForFunction(() => !document.getElementById('touch-bomb').disabled);
  await within(page.locator('#game-canvas'));
  await within(page.locator('#touch-stick'));
  await within(page.locator('#touch-bomb'));
  await checkLayout();
  await page.screenshot({ path: new URL('mobile-portrait.png', output).pathname });
  await page.setViewportSize({ width: 844, height: 390 });
  await within(page.locator('#game-canvas'));
  const stick = await within(page.locator('#touch-stick'));
  const bomb = await within(page.locator('#touch-bomb'));
  await checkLayout();
  const cdp = await context.newCDPSession(page);
  const touch = (type, ...touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const up = { id: 1, x: Math.round(stick.x + stick.width / 2), y: Math.round(stick.y + 14) };
  const fire = { id: 2, x: Math.round(bomb.x + bomb.width / 2), y: Math.round(bomb.y + bomb.height / 2) };
  const home = { ...up, y: Math.round(stick.y + stick.height / 2) };
  const startJoystick = async () => {
    await touch('touchStart', home);
    await touch('touchMove', up);
  };
  const y = me.y;
  await startJoystick();
  await wait(() => lastInput()?.[0] === 'up' && me.y < y - 5);
  await touch('touchStart', up, fire);
  await wait(() => [...room.game.bombs.values()].some((b) => b.ownerId === id));
  await touch('touchEnd', fire);
  await page.waitForTimeout(80);
  assert.deepEqual(lastInput(), ['up'], 'Releasing fire must keep joystick held');
  await touch('touchEnd');
  await wait(() => lastInput()?.length === 0);
  await page.waitForTimeout(70);
  const stopped = me.y;
  await page.waitForTimeout(150);
  assert.equal(me.y, stopped, 'Releasing the joystick must stop the player');
  clearBombs();

  // Capture outside the stick, center dead zone and system cancellation.
  await startJoystick();
  await touch('touchMove', { ...up, x: up.x + 470, y: Math.round(stick.y + stick.height / 2) });
  await wait(() => lastInput()?.[0] === 'right');
  await touch('touchMove', { ...up, y: Math.round(stick.y + stick.height / 2) });
  await wait(() => lastInput()?.length === 0);
  await touch('touchCancel');
  await startJoystick();
  await wait(() => lastInput()?.[0] === 'up');
  await touch('touchCancel');
  await wait(() => lastInput()?.length === 0);

  // A touch away from the visible home pad creates a floating joystick anywhere on the left.
  const anywhere = { id: 1, x: 300, y: 120 };
  await touch('touchStart', anywhere);
  await wait(() => lastInput()?.length === 0);
  await touch('touchMove', { ...anywhere, x: anywhere.x - 40 });
  await wait(() => lastInput()?.[0] === 'left');
  const shotsBefore = sent.filter((message) => message.t === 'placeBomb').length;
  await touch('touchStart', { ...anywhere, x: anywhere.x - 40 }, fire);
  await wait(() => sent.filter((message) => message.t === 'placeBomb').length === shotsBefore + 1);
  await touch('touchEnd', fire);
  await page.waitForTimeout(80);
  assert.deepEqual(lastInput(), ['left'], 'A floating map joystick must keep moving when fire is released');
  await touch('touchMove', { ...anywhere, y: anywhere.y + 40 });
  await wait(() => lastInput()?.[0] === 'down');
  await page.screenshot({ path: new URL('mobile-floating-stick.png', output).pathname });
  await touch('touchEnd');
  await wait(() => lastInput()?.length === 0);
  assert.equal(await page.locator('#touch-stick').evaluate((el) => el.classList.contains('floating')), false);
  const rightSide = { id: 1, x: 600, y: 120 };
  await touch('touchStart', rightSide);
  await touch('touchMove', { ...rightSide, y: 160 });
  await touch('touchEnd');
  assert.deepEqual(lastInput(), [], 'The right side must not create movement');
  assert.equal(await page.locator('#touch-stick').evaluate((el) => el.classList.contains('floating')), false);
  clearBombs();

  // Real inventory updates drive remote placement, detonation and needle self-rescue.
  me.x = 60;
  me.y = 260;
  me.dirs = [];
  me.alive = true;
  me.trapped = false;
  me.inv.remote = 1;
  await page.waitForFunction(() => !document.getElementById('touch-item').disabled);
  await page.locator('#touch-item').tap();
  await wait(() => [...room.game.bombs.values()].some((b) => b.remote && b.ownerId === id));
  await page.waitForFunction(() => document.getElementById('touch-bomb').textContent === '引爆');
  await page.locator('#touch-bomb').tap();
  await wait(() => ![...room.game.bombs.values()].some((b) => b.remote && b.ownerId === id));
  clearBombs();
  me.x = 60;
  me.y = 260;
  me.alive = true;
  me.trapped = true;
  me.trapTicks = 120;
  me.inv.needle = 1;
  await page.waitForFunction(() => document.getElementById('touch-item').textContent === '自救 ×1');
  await page.locator('#touch-item').tap();
  await wait(() => !me.trapped && me.inv.needle === 0);
  await page.waitForFunction(() => document.getElementById('touch-item').disabled);

  await startJoystick();
  await wait(() => lastInput()?.[0] === 'up');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await wait(() => lastInput()?.length === 0);
  await touch('touchEnd');
  await startJoystick();
  await wait(() => lastInput()?.[0] === 'up');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  await wait(() => lastInput()?.length === 0);
  await touch('touchEnd');
  await page.screenshot({ path: new URL('mobile-landscape.png', output).pathname });

  // Desktop continues to use the keyboard and does not show mobile controls.
  assert.equal(await desktop.locator('#touch-stick').isVisible(), false);
  const desktopId = room.players.find((p) => p.name === '电脑玩家').id;
  await desktop.keyboard.down('ArrowLeft');
  await wait(() => room.game.players.get(desktopId).dirs.includes('left'));
  await desktop.keyboard.up('ArrowLeft');
  await wait(() => room.game.players.get(desktopId).dirs.length === 0);
  await desktop.screenshot({ path: new URL('desktop-game.png', output).pathname });
  app.lobby.endGame(room);
  await page.locator('#touch-controls').waitFor({ state: 'hidden' });
  await page.locator('#view-room').waitFor({ state: 'visible' });
  await page.locator('#btn-start').scrollIntoViewIfNeeded();
  await within(page.locator('#btn-start'));
  await page.screenshot({ path: new URL('mobile-room-landscape.png', output).pathname });
  await page.locator('#btn-start').tap();
  await page.locator('#view-game').waitFor({ state: 'visible' });
  room.brains.clear();
  for (const p of room.game.players.values()) p.dirs = [];
  assert.deepEqual(room.game.players.get(id).dirs, [], 'A new round must start without stale movement');
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await within(page.locator('#game-canvas'));
    await within(page.locator('#touch-stick'));
    await within(page.locator('#touch-bomb'));
    await checkLayout();
  }
  assert.deepEqual(errors, []);
  const result = { http: true, mobileLobbyAndRoom: true, portrait: true, landscape: true, multiTouchMoveAndBomb: true,
    releaseStops: true, pointerCancel: true, deadZone: true, remoteDetonation: true, needleRescue: true,
    blurAndBackgroundReset: true, multiplayer: true, desktopKeyboard: true, gameOverReset: true,
    nextRoundReset: true, smallPhoneAndTabletLayout: true, centeredMaximumMap: true, sideHints: true, floatingLeftHalfJoystick: true, layouts, pageErrors: errors };
  await writeFile(new URL('touch-verification.json', output), JSON.stringify(result, null, 2));
  console.log(result);
} catch (error) {
  console.error('Recent messages:', sent.slice(-15), 'Viewport scale:', await page.evaluate(() => visualViewport.scale));
  console.error('Input trace:', await page.evaluate(() => window.__inputTrace.slice(-35)));
  console.error('Failure state:', await page.evaluate(() => ({ state: window.__dbgState, status: document.getElementById('touch-status').textContent })));
  await page.screenshot({ path: new URL('touch-failure.png', output).pathname });
  throw error;
} finally {
  await browser.close();
  await app.close();
}
