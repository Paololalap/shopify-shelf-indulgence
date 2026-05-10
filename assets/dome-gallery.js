(function () {
  'use strict';

  var SEGMENTS = 35;
  var FIT = 0.5;
  var MIN_RADIUS = 600;
  var MAX_RADIUS = Infinity;
  var PAD_FACTOR = 0.25;
  var MAX_VERT_ROT = 5;
  var DRAG_SENS = 20;
  var ENLARGE_MS = 300;
  var DRAG_DAMP = 2;
  var OPENED_W = '400px';
  var OPENED_H = '400px';
  var TILE_BR = '12px';
  var ENLARGE_BR = '12px';
  var OVERLAY_COLOR = '#fdf9f4';
  var GRAYSCALE = false;

  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
  function normalizeAngle(d) { return ((d % 360) + 360) % 360; }
  function wrapAngleSigned(d) { var a = (((d + 180) % 360) + 360) % 360; return a - 180; }
  function getDataNumber(el, name, fb) {
    var attr = el.dataset[name]; var n = attr == null ? NaN : parseFloat(attr);
    return Number.isFinite(n) ? n : fb;
  }

  function buildItems(pool, seg) {
    var xCols = []; for (var i = 0; i < seg; i++) xCols.push(-37 + i * 2);
    var evenYs = [-4, -2, 0, 2, 4]; var oddYs = [-3, -1, 1, 3, 5];
    var coords = [];
    xCols.forEach(function (x, c) {
      var ys = c % 2 === 0 ? evenYs : oddYs;
      ys.forEach(function (y) { coords.push({ x: x, y: y, sizeX: 2, sizeY: 2 }); });
    });
    var total = coords.length;
    if (!pool.length) return coords.map(function (c) { return Object.assign({}, c, { src: '', alt: '' }); });
    var norm = pool.map(function (img) {
      if (typeof img === 'string') return { src: img, alt: '' };
      return { src: img.src || '', alt: img.alt || '' };
    });
    var used = [];
    for (var j = 0; j < total; j++) used.push(norm[j % norm.length]);
    for (var k = 1; k < used.length; k++) {
      if (used[k].src === used[k - 1].src) {
        for (var m = k + 1; m < used.length; m++) {
          if (used[m].src !== used[k].src) {
            var tmp = used[k]; used[k] = used[m]; used[m] = tmp; break;
          }
        }
      }
    }
    return coords.map(function (c, idx) { return Object.assign({}, c, { src: used[idx].src, alt: used[idx].alt }); });
  }

  function computeItemBaseRot(ox, oy, sx, sy, seg) {
    var unit = 360 / seg / 2;
    return { rotateX: unit * (oy - (sy - 1) / 2), rotateY: unit * (ox + (sx - 1) / 2) };
  }

  function initDomeGallery(container, images) {
    var root = container;
    var rotation = { x: 0, y: 0 };
    var startRot = { x: 0, y: 0 };
    var startPos = null;
    var dragging = false;
    var moved = false;
    var focusedEl = null;
    var originalTilePos = null;
    var opening = false;
    var openStartedAt = 0;
    var lastDragEndAt = 0;
    var scrollLocked = false;
    var inertiaRAF = null;
    var posHistory = [];

    // Build DOM
    root.style.setProperty('--segments-x', SEGMENTS);
    root.style.setProperty('--segments-y', SEGMENTS);
    root.style.setProperty('--overlay-blur-color', OVERLAY_COLOR);
    root.style.setProperty('--tile-radius', TILE_BR);
    root.style.setProperty('--enlarge-radius', ENLARGE_BR);
    root.style.setProperty('--image-filter', GRAYSCALE ? 'grayscale(1)' : 'none');
    root.classList.add('sphere-root');

    var mainEl = document.createElement('main');
    mainEl.className = 'sphere-main';

    var stageEl = document.createElement('div');
    stageEl.className = 'stage';

    var sphereEl = document.createElement('div');
    sphereEl.className = 'sphere';

    var items = buildItems(images, SEGMENTS);
    items.forEach(function (it) {
      var itemDiv = document.createElement('div');
      itemDiv.className = 'item';
      itemDiv.dataset.src = it.src;
      itemDiv.dataset.offsetX = it.x;
      itemDiv.dataset.offsetY = it.y;
      itemDiv.dataset.sizeX = it.sizeX;
      itemDiv.dataset.sizeY = it.sizeY;
      itemDiv.style.setProperty('--offset-x', it.x);
      itemDiv.style.setProperty('--offset-y', it.y);
      itemDiv.style.setProperty('--item-size-x', it.sizeX);
      itemDiv.style.setProperty('--item-size-y', it.sizeY);

      var imgDiv = document.createElement('div');
      imgDiv.className = 'item__image';
      imgDiv.setAttribute('role', 'button');
      imgDiv.setAttribute('tabindex', '0');
      imgDiv.setAttribute('aria-label', it.alt || 'Open image');

      var img = document.createElement('img');
      img.src = it.src;
      img.alt = it.alt;
      img.draggable = false;
      img.loading = 'lazy';

      imgDiv.appendChild(img);
      itemDiv.appendChild(imgDiv);
      sphereEl.appendChild(itemDiv);
    });

    stageEl.appendChild(sphereEl);
    mainEl.appendChild(stageEl);

    // Overlays
    var ov1 = document.createElement('div'); ov1.className = 'overlay';
    var ov2 = document.createElement('div'); ov2.className = 'overlay overlay--blur';
    var efTop = document.createElement('div'); efTop.className = 'edge-fade edge-fade--top';
    var efBot = document.createElement('div'); efBot.className = 'edge-fade edge-fade--bottom';
    mainEl.appendChild(ov1); mainEl.appendChild(ov2);
    mainEl.appendChild(efTop); mainEl.appendChild(efBot);

    // Viewer
    var viewerEl = document.createElement('div'); viewerEl.className = 'viewer';
    var scrimEl = document.createElement('div'); scrimEl.className = 'scrim';
    var frameEl = document.createElement('div'); frameEl.className = 'frame';
    viewerEl.appendChild(scrimEl); viewerEl.appendChild(frameEl);
    mainEl.appendChild(viewerEl);

    root.appendChild(mainEl);

    function applyTransform(xD, yD) {
      sphereEl.style.transform = 'translateZ(calc(var(--radius) * -1)) rotateX(' + xD + 'deg) rotateY(' + yD + 'deg)';
    }
    applyTransform(0, 0);

    function lockScroll() { if (scrollLocked) return; scrollLocked = true; document.body.classList.add('dg-scroll-lock'); }
    function unlockScroll() { if (!scrollLocked) return; if (root.getAttribute('data-enlarging') === 'true') return; scrollLocked = false; document.body.classList.remove('dg-scroll-lock'); }

    // Resize
    var ro = new ResizeObserver(function (entries) {
      var cr = entries[0].contentRect;
      var w = Math.max(1, cr.width), h = Math.max(1, cr.height);
      var minDim = Math.min(w, h), maxDim = Math.max(w, h), aspect = w / h;
      var basis = aspect >= 1.3 ? w : minDim;
      var radius = basis * FIT;
      var hGuard = h * 1.35;
      radius = Math.min(radius, hGuard);
      radius = clamp(radius, MIN_RADIUS, MAX_RADIUS);
      radius = Math.round(radius);
      var vPad = Math.max(8, Math.round(minDim * PAD_FACTOR));
      root.style.setProperty('--radius', radius + 'px');
      root.style.setProperty('--viewer-pad', vPad + 'px');
      applyTransform(rotation.x, rotation.y);
    });
    ro.observe(root);

    // Drag
    function stopInertia() { if (inertiaRAF) { cancelAnimationFrame(inertiaRAF); inertiaRAF = null; } }

    function startInertia(vx, vy) {
      var MAX_V = 1.4;
      var vX = clamp(vx, -MAX_V, MAX_V) * 80;
      var vY = clamp(vy, -MAX_V, MAX_V) * 80;
      var frames = 0;
      var d = clamp(DRAG_DAMP, 0, 1);
      var fMul = 0.94 + 0.055 * d;
      var stopTh = 0.015 - 0.01 * d;
      var maxFrames = Math.round(90 + 270 * d);
      function step() {
        vX *= fMul; vY *= fMul;
        if (Math.abs(vX) < stopTh && Math.abs(vY) < stopTh) { inertiaRAF = null; return; }
        if (++frames > maxFrames) { inertiaRAF = null; return; }
        var nx = clamp(rotation.x - vY / 200, -MAX_VERT_ROT, MAX_VERT_ROT);
        var ny = wrapAngleSigned(rotation.y + vX / 200);
        rotation.x = nx; rotation.y = ny;
        applyTransform(nx, ny);
        inertiaRAF = requestAnimationFrame(step);
      }
      stopInertia();
      inertiaRAF = requestAnimationFrame(step);
    }

    mainEl.addEventListener('pointerdown', function (e) {
      if (focusedEl) return;
      stopInertia();
      dragging = true; moved = false;
      startRot = { x: rotation.x, y: rotation.y };
      startPos = { x: e.clientX, y: e.clientY };
      posHistory = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    });

    window.addEventListener('pointermove', function (e) {
      if (!dragging || focusedEl || !startPos) return;
      var dx = e.clientX - startPos.x;
      var dy = e.clientY - startPos.y;
      if (!moved && (dx * dx + dy * dy) > 16) moved = true;
      var nx = clamp(startRot.x - dy / DRAG_SENS, -MAX_VERT_ROT, MAX_VERT_ROT);
      var ny = wrapAngleSigned(startRot.y + dx / DRAG_SENS);
      rotation.x = nx; rotation.y = ny;
      applyTransform(nx, ny);
      posHistory.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (posHistory.length > 5) posHistory.shift();
    });

    window.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false;
      if (posHistory.length >= 2) {
        var last = posHistory[posHistory.length - 1];
        var prev = posHistory[Math.max(0, posHistory.length - 3)];
        var dt = last.t - prev.t;
        if (dt > 0 && dt < 300) {
          var vx = (last.x - prev.x) / dt;
          var vy = (last.y - prev.y) / dt;
          if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) startInertia(vx, vy);
        }
      }
      if (moved) lastDragEndAt = performance.now();
      moved = false;
    });

    // Enlarge
    function openItem(el) {
      if (opening) return;
      opening = true; openStartedAt = performance.now(); lockScroll();
      var parent = el.parentElement;
      focusedEl = el;
      var ox = getDataNumber(parent, 'offsetX', 0);
      var oy = getDataNumber(parent, 'offsetY', 0);
      var sx = getDataNumber(parent, 'sizeX', 2);
      var sy = getDataNumber(parent, 'sizeY', 2);
      var pRot = computeItemBaseRot(ox, oy, sx, sy, SEGMENTS);
      var pY = normalizeAngle(pRot.rotateY);
      var gY = normalizeAngle(rotation.y);
      var rotY = -(pY + gY) % 360;
      if (rotY < -180) rotY += 360;
      var rotX = -pRot.rotateX - rotation.x;
      parent.style.setProperty('--rot-y-delta', rotY + 'deg');
      parent.style.setProperty('--rot-x-delta', rotX + 'deg');

      var refDiv = document.createElement('div');
      refDiv.className = 'item__image item__image--reference';
      refDiv.style.opacity = '0';
      refDiv.style.transform = 'rotateX(' + (-pRot.rotateX) + 'deg) rotateY(' + (-pRot.rotateY) + 'deg)';
      parent.appendChild(refDiv);
      void refDiv.offsetHeight;

      var tR = refDiv.getBoundingClientRect();
      var mR = mainEl.getBoundingClientRect();
      var fR = frameEl.getBoundingClientRect();
      if (!mR || !fR || tR.width <= 0) { opening = false; focusedEl = null; parent.removeChild(refDiv); unlockScroll(); return; }

      originalTilePos = { left: tR.left, top: tR.top, width: tR.width, height: tR.height };
      el.style.visibility = 'hidden'; el.style.zIndex = 0;

      var overlay = document.createElement('div');
      overlay.className = 'enlarge';
      overlay.style.position = 'absolute';
      overlay.style.left = (fR.left - mR.left) + 'px';
      overlay.style.top = (fR.top - mR.top) + 'px';
      overlay.style.width = fR.width + 'px';
      overlay.style.height = fR.height + 'px';
      overlay.style.opacity = '0';
      overlay.style.zIndex = '30';
      overlay.style.willChange = 'transform, opacity';
      overlay.style.transformOrigin = 'top left';
      overlay.style.transition = 'transform ' + ENLARGE_MS + 'ms ease, opacity ' + ENLARGE_MS + 'ms ease';

      var rawSrc = parent.dataset.src || '';
      var oImg = document.createElement('img'); oImg.src = rawSrc;
      overlay.appendChild(oImg); viewerEl.appendChild(overlay);

      var tx0 = tR.left - fR.left, ty0 = tR.top - fR.top;
      var sx0 = tR.width / fR.width, sy0 = tR.height / fR.height;
      sx0 = isFinite(sx0) && sx0 > 0 ? sx0 : 1;
      sy0 = isFinite(sy0) && sy0 > 0 ? sy0 : 1;
      overlay.style.transform = 'translate(' + tx0 + 'px,' + ty0 + 'px) scale(' + sx0 + ',' + sy0 + ')';

      setTimeout(function () {
        if (!overlay.parentElement) return;
        overlay.style.opacity = '1';
        overlay.style.transform = 'translate(0,0) scale(1,1)';
        root.setAttribute('data-enlarging', 'true');
      }, 16);

      var onFirstEnd = function (ev) {
        if (ev.propertyName !== 'transform') return;
        overlay.removeEventListener('transitionend', onFirstEnd);
        var prevT = overlay.style.transition;
        overlay.style.transition = 'none';
        var tw = OPENED_W, th = OPENED_H;
        overlay.style.width = tw; overlay.style.height = th;
        var newR = overlay.getBoundingClientRect();
        overlay.style.width = fR.width + 'px'; overlay.style.height = fR.height + 'px';
        void overlay.offsetWidth;
        overlay.style.transition = 'left ' + ENLARGE_MS + 'ms ease, top ' + ENLARGE_MS + 'ms ease, width ' + ENLARGE_MS + 'ms ease, height ' + ENLARGE_MS + 'ms ease';
        var cL = fR.left - mR.left + (fR.width - newR.width) / 2;
        var cT = fR.top - mR.top + (fR.height - newR.height) / 2;
        requestAnimationFrame(function () {
          overlay.style.left = cL + 'px'; overlay.style.top = cT + 'px';
          overlay.style.width = tw; overlay.style.height = th;
        });
        overlay.addEventListener('transitionend', function () { overlay.style.transition = prevT; }, { once: true });
      };
      overlay.addEventListener('transitionend', onFirstEnd);
    }

    function closeItem() {
      if (performance.now() - openStartedAt < 250) return;
      var el = focusedEl; if (!el) return;
      var parent = el.parentElement;
      var overlay = viewerEl.querySelector('.enlarge');
      if (!overlay) return;
      var refDiv = parent.querySelector('.item__image--reference');
      var oPos = originalTilePos;

      if (!oPos) {
        if (overlay) overlay.remove();
        if (refDiv) refDiv.remove();
        parent.style.setProperty('--rot-y-delta', '0deg');
        parent.style.setProperty('--rot-x-delta', '0deg');
        el.style.visibility = ''; el.style.zIndex = 0;
        focusedEl = null; root.removeAttribute('data-enlarging');
        opening = false; unlockScroll(); return;
      }

      var cRect = overlay.getBoundingClientRect();
      var rRect = root.getBoundingClientRect();
      var oPosRel = { left: oPos.left - rRect.left, top: oPos.top - rRect.top, width: oPos.width, height: oPos.height };
      var oRel = { left: cRect.left - rRect.left, top: cRect.top - rRect.top, width: cRect.width, height: cRect.height };

      var anim = document.createElement('div');
      anim.className = 'enlarge-closing';
      anim.style.cssText = 'position:absolute;left:' + oRel.left + 'px;top:' + oRel.top + 'px;width:' + oRel.width + 'px;height:' + oRel.height + 'px;z-index:9999;border-radius:var(--enlarge-radius,32px);overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:all ' + ENLARGE_MS + 'ms ease-out;pointer-events:none;';
      var origImg = overlay.querySelector('img');
      if (origImg) { var ci = origImg.cloneNode(); ci.style.cssText = 'width:100%;height:100%;object-fit:cover;'; anim.appendChild(ci); }
      overlay.remove(); root.appendChild(anim);
      void anim.getBoundingClientRect();

      requestAnimationFrame(function () {
        anim.style.left = oPosRel.left + 'px'; anim.style.top = oPosRel.top + 'px';
        anim.style.width = oPosRel.width + 'px'; anim.style.height = oPosRel.height + 'px';
        anim.style.opacity = '0';
      });

      anim.addEventListener('transitionend', function () {
        anim.remove(); originalTilePos = null;
        if (refDiv) refDiv.remove();
        parent.style.setProperty('--rot-y-delta', '0deg');
        parent.style.setProperty('--rot-x-delta', '0deg');
        el.style.visibility = ''; el.style.opacity = '1'; el.style.zIndex = 0;
        focusedEl = null; root.removeAttribute('data-enlarging');
        opening = false;
        if (!dragging) document.body.classList.remove('dg-scroll-lock');
      }, { once: true });
    }

    scrimEl.addEventListener('click', closeItem);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeItem(); });

    // Tile click
    mainEl.addEventListener('click', function (e) {
      var tile = e.target.closest('.item__image');
      if (!tile || tile.classList.contains('item__image--reference')) return;
      if (dragging || moved) return;
      if (performance.now() - lastDragEndAt < 80) return;
      if (opening) return;
      openItem(tile);
    });
  }

  // Auto-init
  function init() {
    var containers = document.querySelectorAll('[data-dome-gallery]');
    containers.forEach(function (el) {
      var script = el.querySelector('script[type="application/json"]');
      var imgs = [];
      try { imgs = JSON.parse(script.textContent); } catch (e) { /* ignore */ }
      initDomeGallery(el, imgs);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
