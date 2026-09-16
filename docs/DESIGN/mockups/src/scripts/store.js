/* ==========================================================================
   Asian Taste — shared store: cart, order type, drawer, toast, statuses.
   Vanilla, no modules. Loads after menu-data.js.
   ========================================================================== */
(function () {
  'use strict';

  var MENU = window.AT_MENU;
  var CART_KEY = 'at_cart_v2';
  var ORDER_KEY = 'at_order_v2';
  var CUSTOMER_KEY = 'at_customer_v1';

  var ORDER_META = {
    delivery: { label: 'Delivery', fee: 5.00, eta: '25–35 min', note: '<strong>Delivered in 25–35 min</strong> · $5.00 delivery fee', fulfil: 'Delivering to your address · 25–35 min', icon: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>' },
    pickup:   { label: 'Pickup',   fee: 0,     eta: '15–20 min', note: '<strong>Ready for pickup</strong> · 329 Henley Beach Rd', fulfil: 'Pickup from 329 Henley Beach Rd', icon: '<path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2"/>' },
    dinein:   { label: 'Dine in',  fee: 0,     eta: '10–15 min', note: '<strong>Dine in</strong> · table service at Brooklyn Park', fulfil: 'Dine in at 329 Henley Beach Rd', icon: '<path d="M7 3v8M7 7h4M17 3c-1.6 1.3-2.2 3-2.2 5 0 1.7.8 2.6 2.2 2.8V21M7 15v6"/>' }
  };

  var STATUSES = [
    { id: 'placed',    label: 'Placed' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'preparing', label: 'Preparing' },
    { id: 'ready',     label: 'Ready' },
    { id: 'delivery',  label: 'Out for delivery' },
    { id: 'completed', label: 'Completed' }
  ];

  var subs = [];
  function emit() { subs.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function money(n) { return '$' + Number(n).toFixed(2); }
  function read(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  var cart = read(CART_KEY, []) || [];
  var orderType = read(ORDER_KEY, 'delivery');
  if (!ORDER_META[orderType]) orderType = 'delivery';

  function keyFor(id, summary) { return id + '|' + (summary || ''); }

  function add(id, opts) {
    opts = opts || {};
    var d = MENU.byId(id); if (!d) return;
    var summary = opts.summary || '';
    var key = keyFor(id, summary);
    var existing = cart.filter(function (l) { return l.key === key; })[0];
    var qty = opts.qty || 1;
    if (existing) { existing.qty += qty; }
    else { cart.push({ key: key, id: id, name: d.name, qty: qty, unitPrice: opts.unitPrice || d.price, summary: summary }); }
    write(CART_KEY, cart); emit();
    toast(d.name + ' added to your order');
  }
  function setQty(key, qty) {
    cart = cart.map(function (l) { return l.key === key ? { key: l.key, id: l.id, name: l.name, summary: l.summary, unitPrice: l.unitPrice, qty: qty } : l; })
               .filter(function (l) { return l.qty > 0; });
    write(CART_KEY, cart); emit();
  }
  function remove(key) { cart = cart.filter(function (l) { return l.key !== key; }); write(CART_KEY, cart); emit(); }
  function clear() { cart = []; write(CART_KEY, cart); emit(); }
  function subtotal() { return cart.reduce(function (s, l) { return s + l.unitPrice * l.qty; }, 0); }
  function count() { return cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function fee() { return cart.length ? ORDER_META[orderType].fee : 0; }
  function total() { return subtotal() + fee(); }
  function setOrderType(t) { if (!ORDER_META[t]) return; orderType = t; write(ORDER_KEY, t); emit(); }
  function onChange(fn) { subs.push(fn); }

  /* ─── customer record (checkout → confirmation → staff console) ────── */
  function customer() { return read(CUSTOMER_KEY, null); }
  function saveCustomer(data) {
    var rec = {};
    var prev = customer() || {};
    Object.keys(prev).forEach(function (k) { rec[k] = prev[k]; });
    Object.keys(data || {}).forEach(function (k) { if (data[k] != null) rec[k] = data[k]; });
    rec.savedAt = Date.now();
    write(CUSTOMER_KEY, rec); emit();
    return rec;
  }

  /* ─── toast ─────────────────────────────────────────────────────────── */
  var toastEl = null, toastTimer = null;
  function toast(msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast'; toastEl.id = 'at-toast';
      toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle('confirm', kind === 'confirm');
    toastEl.classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-open'); }, 2400);
  }

  /* ─── drawer (injected once into #at-drawer-host) ───────────────────── */
  var drawer = null, overlay = null, lastFocus = null;
  var ICON_CART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2L20 8H6"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/></svg>';

  function buildDrawer() {
    var host = document.getElementById('at-drawer-host');
    if (!host || drawer) return;
    host.innerHTML =
      '<div class="overlay" id="at-overlay" hidden></div>' +
      '<aside class="drawer" id="at-drawer" role="dialog" aria-modal="true" aria-label="Your order" aria-hidden="true">' +
        '<div class="drawer-head">' +
          '<div><h2>Your order</h2><p class="meta" id="at-drawer-mode">Delivery · 25–35 min</p></div>' +
          '<button class="icon-btn" data-at-close-cart aria-label="Close your order"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '</div>' +
        '<div class="drawer-body" id="at-drawer-body"></div>' +
        '<div class="drawer-foot">' +
          '<div class="sum-row"><span>Subtotal</span><span class="num" id="at-sub">$0.00</span></div>' +
          '<div class="sum-row" id="at-fee-row"><span>Delivery fee</span><span class="num" id="at-fee">$0.00</span></div>' +
          '<div class="sum-row total"><span>Total</span><span class="num" id="at-total">$0.00</span></div>' +
          '<a class="btn btn-primary" href="checkout.html" id="at-checkout">Proceed to checkout</a>' +
          '<div class="fulfil" id="at-fulfil"></div>' +
        '</div>' +
      '</aside>';
    drawer = document.getElementById('at-drawer');
    overlay = document.getElementById('at-overlay');
    overlay.hidden = false;
    document.getElementById('at-drawer-body').addEventListener('click', onDrawerClick);
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('is-open')) close(); });
    renderDrawer();
  }

  function onDrawerClick(e) {
    var inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]'), del = e.target.closest('[data-del]');
    if (inc || dec) { var k = (inc || dec).dataset[inc ? 'inc' : 'dec']; var line = cart.filter(function (l) { return l.key === k; })[0]; if (line) setQty(k, line.qty + (inc ? 1 : -1)); }
    else if (del) remove(del.dataset.del);
  }

  function renderDrawer() {
    if (!drawer) return;
    var body = document.getElementById('at-drawer-body');
    var meta = ORDER_META[orderType];
    document.getElementById('at-drawer-mode').textContent = meta.label + ' · ' + meta.eta;
    if (!cart.length) {
      body.innerHTML = '<div class="cart-empty">' + ICON_CART + '<p>Your order is empty.</p><p class="meta">Add a few favourites from the menu.</p></div>';
    } else {
      body.innerHTML = cart.map(function (l) {
        return '<div class="cart-item">' +
          '<div><h3>' + l.name + '</h3>' + (l.summary ? '<div class="ci-note">' + l.summary + '</div>' : '') + '</div>' +
          '<div class="ci-price num">' + money(l.unitPrice * l.qty) + '</div>' +
          '<div class="cart-controls">' +
            '<div class="qty">' +
              '<button data-dec="' + l.key + '" aria-label="Remove one ' + l.name + '">−</button>' +
              '<span class="qty-val">' + l.qty + '</span>' +
              '<button data-inc="' + l.key + '" aria-label="Add one more ' + l.name + '">+</button>' +
            '</div>' +
            '<button class="ci-remove" data-del="' + l.key + '">Remove</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }
    document.getElementById('at-sub').textContent = money(subtotal());
    var f = fee();
    document.getElementById('at-fee-row').style.display = f > 0 ? '' : 'none';
    document.getElementById('at-fee').textContent = money(f);
    document.getElementById('at-total').textContent = money(total());
    document.getElementById('at-fulfil').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + meta.icon + '</svg>' + meta.fulfil;
    var co = document.getElementById('at-checkout');
    co.style.pointerEvents = cart.length ? '' : 'none';
    co.style.opacity = cart.length ? '' : '.5';
    co.setAttribute('aria-disabled', cart.length ? 'false' : 'true');
  }

  function open() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.classList.add('is-open'); overlay.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false'); document.body.classList.add('is-locked');
    var closeBtn = drawer.querySelector('[data-at-close-cart]'); if (closeBtn) closeBtn.focus();
  }
  function close() {
    if (!drawer) return;
    drawer.classList.remove('is-open'); overlay.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true'); document.body.classList.remove('is-locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ─── count badges ──────────────────────────────────────────────────── */
  function renderCounts() {
    var n = count();
    document.querySelectorAll('[data-at-cart-count]').forEach(function (el) {
      el.textContent = n; el.hidden = n === 0;
    });
  }

  /* ─── global wiring ─────────────────────────────────────────────────── */
  function init() {
    buildDrawer();
    renderCounts();
    onChange(function () { renderDrawer(); renderCounts(); });

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-at-open-cart]')) { e.preventDefault(); open(); return; }
      if (e.target.closest('[data-at-close-cart]')) { e.preventDefault(); close(); return; }
      var quick = e.target.closest('[data-add]');
      if (quick && !quick.disabled) { add(quick.dataset.add, { summary: quick.dataset.summary || '' }); }
    });

    document.querySelectorAll('.seg-btn[data-order]').forEach(function (b) {
      b.addEventListener('click', function () { setOrderType(b.dataset.order); });
    });
    onChange(function () {
      document.querySelectorAll('.seg-btn[data-order]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.order === orderType));
      });
      var note = document.getElementById('order-note');
      if (note) note.innerHTML = ORDER_META[orderType].note;
    });
    document.querySelectorAll('.seg-btn[data-order]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.order === orderType));
    });
    var note = document.getElementById('order-note');
    if (note) note.innerHTML = ORDER_META[orderType].note;

    var head = document.querySelector('.sitehead');
    if (head) {
      var onScroll = function () { head.classList.toggle('is-scrolled', window.scrollY > 8); };
      window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    }
  }

  window.AT = {
    money: money, ORDER_META: ORDER_META, STATUSES: STATUSES,
    get orderType() { return orderType; }, setOrderType: setOrderType, orderMeta: function () { return ORDER_META[orderType]; },
    cart: function () { return cart.slice(); }, add: add, setQty: setQty, remove: remove, clear: clear,
    subtotal: subtotal, fee: fee, total: total, count: count, onChange: onChange,
    customer: customer, saveCustomer: saveCustomer,
    openDrawer: open, closeDrawer: close, toast: toast
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
