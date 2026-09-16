/* ==========================================================================
   Asian Taste — admin mock data + shared rail/topbar chrome.
   Static demo data only; nothing here talks to a server.
   ========================================================================== */
(function () {
  'use strict';

  var M = window.AT_MENU || { byId: function () {}, money: function (n) { return '$' + n.toFixed(2); } };
  function money(n) { return '$' + Number(n).toFixed(2); }

  var STATUS_META = {
    placed:    { label: 'Placed',    desc: 'Waiting for the kitchen to accept', cls: 'status-placed' },
    confirmed: { label: 'Confirmed', desc: 'Accepted, not started yet',        cls: 'status-confirmed' },
    preparing: { label: 'Preparing', desc: 'On the wok right now',             cls: 'status-preparing' },
    ready:     { label: 'Ready',     desc: 'Packed and waiting',               cls: 'status-ready' },
    delivery:  { label: 'Out for delivery', desc: 'With the driver',           cls: 'status-delivery' },
    completed: { label: 'Completed', desc: 'Handed over',                      cls: 'status-completed' },
    cancelled: { label: 'Cancelled', desc: 'Stopped or refunded',              cls: 'status-cancelled' }
  };

  function O(id, customer, phone, type, status, placed, mins, items, address, note) {
    var total = items.reduce(function (s, i) { return s + i.qty * i.price; }, 0);
    var fee = type === 'delivery' ? 5 : 0;
    return {
      id: id, customer: customer, phone: phone, type: type, status: status,
      placed: placed, mins: mins, items: items, address: address, note: note || '',
      subtotal: total, fee: fee, total: total + fee
    };
  }

  var ORDERS = [
    O('AT-4821', 'Linh Tran',   '0412 345 678', 'delivery', 'preparing', '12:24', 6,
      [{ name: 'Pho Beef', qty: 2, price: 15.90 }, { name: 'Cold Rolls (4)', qty: 1, price: 8.50 }],
      '12 Example Street, Brooklyn Park SA 5032', 'No coriander in the pho'),
    O('AT-4820', 'Marcus Webb', '0433 812 004', 'pickup', 'ready', '12:18', 14,
      [{ name: 'Crispy Pork Banh Mi', qty: 3, price: 8.50 }, { name: 'Snack Super Deal', qty: 1, price: 5.20 }],
      '329 Henley Beach Rd, Brooklyn Park', ''),
    O('AT-4819', 'Priya Nair',  '0455 220 118', 'delivery', 'confirmed', '12:15', 3,
      [{ name: 'Laksa Combination', qty: 2, price: 17.50 }, { name: 'Satay Skewers (3)', qty: 1, price: 7.80 }],
      '8 Riverview Court, Brooklyn Park SA 5032', 'Extra chilli on the side'),
    O('AT-4818', 'Daniel Okafor','0401 776 552', 'dinein', 'preparing', '12:11', 11,
      [{ name: 'Salt & Pepper Squid', qty: 1, price: 18.50 }, { name: 'Chicken Thai Green Curry', qty: 1, price: 17.50 }, { name: 'Steamed rice', qty: 2, price: 3.50 }],
      'Table 4 · 329 Henley Beach Rd', 'Table by the window'),
    O('AT-4817', 'Sophie Nguyen','0421 990 313','delivery', 'placed', '12:09', 1,
      [{ name: 'Grilled Chicken Banh Mi', qty: 2, price: 8.20 }, { name: 'Prawn Spring Rolls (3)', qty: 1, price: 6.00 }],
      '44 Anzac Highway, Brooklyn Park SA 5032', ''),
    O('AT-4816', 'Ahmed Hassan','0466 118 902', 'pickup', 'completed', '11:52', 38,
      [{ name: 'Veg Tofu Hotpot', qty: 1, price: 16.50 }, { name: 'Vegan Curry (Green/Yellow)', qty: 1, price: 16.50 }],
      '329 Henley Beach Rd, Brooklyn Park', 'Vegan — no oyster sauce'),
    O('AT-4815', 'Grace Lim',   '0432 551 780', 'delivery', 'delivery', '11:48', 24,
      [{ name: 'Combination Banh Mi', qty: 4, price: 9.00 }, { name: 'Cold Rolls (4)', qty: 2, price: 8.50 }],
      '2 Ship Street, Brooklyn Park SA 5032', 'Leave at the front door'),
    O('AT-4814', 'Tom Whitfield','0418 402 221','dinein', 'completed', '11:40', 46,
      [{ name: 'Beef Pho', qty: 1, price: 15.90 }, { name: 'Spring Rolls (3)', qty: 1, price: 5.80 }, { name: 'Homemade lemon drink', qty: 1, price: 4.50 }],
      'Table 9 · 329 Henley Beach Rd', ''),
    O('AT-4813', 'Mei Chen',    '0450 663 149', 'pickup', 'cancelled', '11:31', 55,
      [{ name: 'Sweet Corn Soup', qty: 2, price: 7.80 }],
      '329 Henley Beach Rd, Brooklyn Park', 'Customer cancelled — soup sold out'),
    O('AT-4812', 'Jade Papadopoulos','0499 214 003','delivery', 'completed', '11:26', 62,
      [{ name: 'Rice Bowl Combination', qty: 2, price: 17.50 }, { name: 'Salt & Pepper Chicken', qty: 1, price: 17.50 }],
      '19 Marlborough Street, Brooklyn Park SA 5032', ''),
    O('AT-4811', 'Ben Carter',  '0402 887 615', 'delivery', 'completed', '11:14', 74,
      [{ name: 'Wonton Noodle Soup', qty: 3, price: 15.50 }],
      '5 Kintore Avenue, Brooklyn Park SA 5032', ''),
    O('AT-4810', 'Aisha Rahman','0431 552 908', 'dinein', 'completed', '11:02', 86,
      [{ name: 'Chicken Malaysian Curry', qty: 2, price: 17.50 }, { name: 'Special Fried Rice', qty: 1, price: 15.50 }],
      'Table 2 · 329 Henley Beach Rd', 'High chair needed')
  ];

  /* ─── live order placed on the storefront ────────────────────────────
     checkout.html writes at_customer_v1; if one exists we surface it as the
     newest ticket so staff see the real name rather than only mock data. */
  function liveOrder() {
    var c;
    try { c = JSON.parse(localStorage.getItem('at_customer_v1')); } catch (e) { return null; }
    if (!c || !c.name) return null;
    var lines = (c.items || []).map(function (l) { return { name: l.name, qty: l.qty, price: l.unitPrice }; });
    if (!lines.length) return null;
    var sub = lines.reduce(function (s, i) { return s + i.qty * i.price; }, 0);
    var fee = c.type === 'delivery' ? 5 : 0;
    var now = new Date();
    var hhmm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    return {
      id: c.no || 'AT-NEW', customer: c.name, phone: c.phone || '—', type: c.type || 'delivery',
      status: 'placed', placed: hhmm, mins: 0, items: lines,
      address: c.address || '329 Henley Beach Rd, Brooklyn Park SA 5032',
      note: c.note || '', subtotal: sub, fee: fee, total: sub + fee, isLive: true
    };
  }

  var byId = {};
  ORDERS.forEach(function (o) { byId[o.id] = o; });
  var live = liveOrder();
  if (live) { ORDERS = [live].concat(ORDERS); byId[live.id] = live; }

  function active() { return ORDERS.filter(function (o) { return o.status !== 'completed' && o.status !== 'cancelled'; }); }

  function stats() {
    var a = active();
    var revenue = ORDERS.filter(function (o) { return o.status === 'completed'; }).reduce(function (s, o) { return s + o.total; }, 0);
    return {
      live: a.length,
      placed: ORDERS.filter(function (o) { return o.status === 'placed'; }).length,
      preparing: ORDERS.filter(function (o) { return o.status === 'preparing'; }).length,
      ready: ORDERS.filter(function (o) { return o.status === 'ready' || o.status === 'delivery'; }).length,
      completed: ORDERS.filter(function (o) { return o.status === 'completed'; }).length,
      cancelled: ORDERS.filter(function (o) { return o.status === 'cancelled'; }).length,
      revenue: revenue,
      avgPrep: 14
    };
  }

  function pill(status) {
    var m = STATUS_META[status] || STATUS_META.placed;
    return '<span class="status-pill ' + m.cls + '"><span class="sdot"></span>' + m.label + '</span>';
  }
  function typeLabel(t) { return t === 'delivery' ? 'Delivery' : t === 'pickup' ? 'Pickup' : 'Dine in'; }
  function itemsSummary(o) {
    return o.items.map(function (i) { return i.qty + '× ' + i.name; }).join(', ');
  }
  function initials(n) { return n.split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); }

  /* ─── chrome ─────────────────────────────────────────────────────────── */
  var ICONS = {
    mark: '<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z"/><path d="M9 7.5c0-1.3 1.1-1.7 1.1-2.8M12.5 7.5c0-1.3 1.1-1.7 1.1-2.8"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    board: '<path d="M4 5h16v14H4z"/><path d="M4 10h16M10 10v9"/>',
    menu: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM11 4h7.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11"/>',
    out: '<path d="M14 4h5v16h-5"/><path d="M4 12h10M11 8l4 4-4 4"/>',
    chev: '<path d="m6 9.5 6 5.5 6-5.5"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M12 3.6v2.1M12 18.3v2.1M5.1 7.6l1.8 1.1M17.1 15.3l1.8 1.1M5.1 16.4l1.8-1.1M17.1 8.7l1.8-1.1"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.7a2.4 2.4 0 1 1 3.3 2.2c-.7.4-1 .9-1 1.6v.4"/><circle cx="12" cy="16.7" r="1"/>'
  };
  function svg(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }

  var NAV = [
    { id: 'dashboard', label: 'Dashboard', href: 'admin-dashboard.html', icon: ICONS.grid },
    { id: 'orders', label: 'Orders', href: 'admin-orders.html', icon: ICONS.list },
    { id: 'kitchen', label: 'Kitchen board', href: 'admin-dashboard.html#board', icon: ICONS.board },
    { id: 'menu', label: 'Menu', href: 'admin-menu.html', icon: ICONS.menu }
  ];

  function renderRail() {
    var host = document.getElementById('admin-rail');
    if (!host) return;
    var page = document.body.dataset.page || '';
    var items = NAV.map(function (n) {
      var current = page === n.id || (page === 'dashboard' && n.id === 'dashboard');
      return '<a href="' + n.href + '"' + (current ? ' aria-current="page"' : '') + '>' + svg(n.icon) + '<span>' + n.label + '</span></a>';
    }).join('');
    host.innerHTML =
      '<a class="brand" href="admin-dashboard.html">' +
        '<span class="brand-mark">' + svg(ICONS.mark) + '</span>' +
        '<span class="brand-text"><span class="brand-name">Asian Taste</span><span class="brand-tag">Staff console</span></span>' +
      '</a>' +
      '<nav class="admin-nav" aria-label="Staff sections">' + items + '</nav>' +
      '<div class="admin-rail-foot">' +
        '<span class="live-dot">Kitchen online</span>' +
        '<div class="admin-account" id="admin-account">' +
          '<button class="admin-account-btn" type="button" id="admin-account-btn" aria-expanded="false" aria-haspopup="menu" aria-controls="admin-account-menu">' +
            '<span class="avatar">' + initials('Minh Tran') + '</span>' +
            '<span class="ac-text"><strong>Minh Tran</strong><span class="ac-role">Manager · Brooklyn Park</span></span>' +
            '<span class="ac-chev">' + svg(ICONS.chev) + '</span>' +
          '</button>' +
          '<div class="admin-account-menu" id="admin-account-menu" role="menu" hidden>' +
            '<a role="menuitem" href="admin-dashboard.html#settings">' + svg(ICONS.cog) + 'Account settings</a>' +
            '<a role="menuitem" href="admin-dashboard.html#help">' + svg(ICONS.help) + 'Help &amp; support</a>' +
            '<button role="menuitem" type="button" class="is-danger" data-admin-signout>' + svg(ICONS.out) + 'Sign out</button>' +
          '</div>' +
        '</div>' +
        '<a class="admin-back" href="menu.html">' + svg(ICONS.out) + '<span>Back to site</span></a>' +
      '</div>';
  }

  function wireAccount() {
    var wrap = document.getElementById('admin-account');
    var btn = document.getElementById('admin-account-btn');
    var menu = document.getElementById('admin-account-menu');
    if (!wrap || !btn || !menu) return;
    function setOpen(open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) menu.removeAttribute('hidden'); else menu.setAttribute('hidden', '');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(btn.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { setOpen(false); btn.focus(); }
    });
    var signout = menu.querySelector('[data-admin-signout]');
    if (signout) signout.addEventListener('click', function () { window.location.href = 'admin-login.html'; });
  }

  function renderTop() {
    var host = document.getElementById('admin-top');
    if (!host) return;
    host.innerHTML =
      '<div>' +
        '<h1>' + (document.body.dataset.title || 'Dashboard') + '</h1>' +
        '<p class="sub">' + (document.body.dataset.sub || '') + '</p>' +
      '</div>' +
      '<div class="admin-top-actions">' +
        '<span class="pill pill-neutral">Mon 14 Sep · 12:30</span>' +
        '<span class="status-pill status-ready"><span class="sdot"></span>Open · closes 9pm</span>' +
      '</div>';
  }

  renderRail();
  wireAccount();
  renderTop();

  window.AT_ADMIN = {
    money: money, ORDERS: ORDERS, orders: function () { return ORDERS.slice(); }, byId: function (id) { return byId[id]; },
    active: active, stats: stats, statusMeta: STATUS_META, pill: pill, typeLabel: typeLabel,
    itemsSummary: itemsSummary, initials: initials, STATUS_ORDER: ['placed', 'confirmed', 'preparing', 'ready', 'delivery', 'completed']
  };
})();
