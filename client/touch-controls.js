// Touch input uses the same actions as the keyboard; each finger keeps its own capture.
export function createTouchControls({ onDirection, onBomb, onItem }) {
  const root = document.getElementById('touch-controls');
  const zone = document.getElementById('touch-move-zone');
  const stick = document.getElementById('touch-stick');
  const knob = document.getElementById('touch-knob');
  const bomb = document.getElementById('touch-bomb');
  const item = document.getElementById('touch-item');
  const status = document.getElementById('touch-status');
  let active = false;
  let pointer = null;
  let origin = null;
  let direction = null;
  const actions = new Map();

  if (navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches) {
    document.documentElement.classList.add('touch-device');
  }

  function setDirection(next) {
    if (next === direction) return;
    direction = next;
    stick.dataset.direction = next ?? '';
    onDirection(next);
  }

  function releaseStick() {
    const old = pointer;
    pointer = null;
    origin = null;
    if (old !== null && zone.hasPointerCapture(old)) zone.releasePointerCapture(old);
    knob.style.transform = '';
    stick.classList.remove('pressed', 'floating');
    setDirection(null);
  }

  function move(event) {
    const rect = stick.getBoundingClientRect();
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    const distance = Math.hypot(dx, dy);
    const radius = rect.width * 0.28;
    const scale = distance > radius ? radius / distance : 1;
    knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    setDirection(distance < rect.width * 0.12 ? null
      : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up'));
  }

  zone.addEventListener('pointerdown', (event) => {
    if (!active || pointer !== null || event.button !== 0
      || document.documentElement.classList.contains('page-zoomed')) return;
    event.preventDefault();
    pointer = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    const bounds = zone.getBoundingClientRect();
    const margin = stick.getBoundingClientRect().width / 2 + 6;
    const x = Math.max(margin, Math.min(event.clientX - bounds.left, bounds.width - margin));
    const y = Math.max(margin, Math.min(event.clientY - bounds.top, bounds.height - margin));
    stick.style.setProperty('--stick-x', `${x}px`);
    stick.style.setProperty('--stick-y', `${y}px`);
    zone.setPointerCapture(pointer);
    stick.classList.add('pressed', 'floating');
    move(event);
  });
  zone.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    move(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zone.addEventListener(type, (event) => {
      if (event.pointerId === pointer) releaseStick();
    });
  }

  for (const [button, action] of [[bomb, onBomb], [item, onItem]]) {
    button.addEventListener('pointerdown', (event) => {
      if (!active || button.disabled || event.button !== 0 || actions.has(button)) return;
      event.preventDefault();
      actions.set(button, event.pointerId);
      button.setPointerCapture(event.pointerId);
      button.classList.add('pressed');
      action();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, (event) => {
        if (actions.get(button) !== event.pointerId) return;
        actions.delete(button);
        button.classList.remove('pressed');
      });
    }
    // Allow assistive technology / keyboard activation without duplicating pointer actions.
    button.addEventListener('click', (event) => {
      if (active && !button.disabled && event.detail === 0 && !event.pointerType) action();
    });
  }
  root.addEventListener('contextmenu', (event) => event.preventDefault());

  function reset() {
    releaseStick();
    for (const [button, id] of actions) {
      actions.delete(button);
      button.classList.remove('pressed');
      if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
    }
  }

  function syncZoom() {
    const zoomed = (window.visualViewport?.scale ?? 1) > 1.01;
    document.documentElement.classList.toggle('page-zoomed', zoomed);
    if (zoomed) {
      reset();
      status.textContent = '双指收拢恢复视图';
    }
  }
  window.visualViewport?.addEventListener('resize', syncZoom);
  syncZoom();

  return {
    reset,
    setActive(value) {
      active = value;
      root.classList.toggle('hidden', !value);
      if (!value) reset();
    },
    update(state, myId) {
      const me = state.players.find((p) => p.id === myId);
      const ready = active && !state.warmup && me?.alive;
      const remote = state.bombs.some((b) => b.remote && b.owner === myId);
      bomb.textContent = remote ? '引爆' : '放泡';
      bomb.setAttribute('aria-label', remote ? '引爆遥控水泡' : '放水泡');
      bomb.disabled = !ready || !!me?.trapped;
      const count = me?.trapped ? me.inv.needle : me?.inv.remote;
      item.textContent = `${me?.trapped ? '自救' : '道具'} ×${count ?? 0}`;
      item.disabled = !ready || !count;
      status.textContent = document.documentElement.classList.contains('page-zoomed') ? '双指收拢恢复视图'
        : state.warmup ? '准备开战…' : !me?.alive ? '已阵亡 · 观战中'
        : me.trapped ? '被困！有针可点自救' : '左半屏拖动 · 右手放泡';
    },
  };
}
