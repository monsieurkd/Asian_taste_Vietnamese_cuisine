/* ==========================================================================
   Asian Taste — shared chrome: header, mobile bar, footer, drawer host.
   Set <body data-page="menu"> and optionally data-chrome="minimal".
   ========================================================================== */
(function () {
  'use strict';

  var PAGE = document.body.dataset.page || '';
  var MINIMAL = document.body.dataset.chrome === 'minimal';

  var ICONS = {
    mark: '<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z"/><path d="M9 7.5c0-1.3 1.1-1.7 1.1-2.8M12.5 7.5c0-1.3 1.1-1.7 1.1-2.8"/>',
    cart: '<path d="M3 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2L20 8H6"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM11 4h7.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H11"/>',
    tag: '<path d="M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7z"/><circle cx="8" cy="8" r="1.4"/>',
    track: '<path d="M12 3a9 9 0 0 0-9 9v7h5v-6H5"/><path d="M21 19v-7a9 9 0 0 0-9-9"/><circle cx="12" cy="12" r="3"/>',
    home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
  };
  function svg(paths, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + paths + '</svg>';
  }

  var NAV = [
    { id: 'home', label: 'Home', href: 'home.html' },
    { id: 'menu', label: 'Menu', href: 'menu.html' },
    { id: 'deals', label: 'Deals', href: 'menu.html#deals' },
    { id: 'story', label: 'Our story', href: 'menu.html#story' },
    { id: 'states', label: 'Order help', href: 'states.html' }
  ];

  function brand() {
    return '<a class="brand" href="index.html" data-od-id="brand">' +
      '<span class="brand-mark">' + svg(ICONS.mark) + '</span>' +
      '<span class="brand-text"><span class="brand-name">Asian Taste</span><span class="brand-tag">Vietnamese kitchen</span></span>' +
    '</a>';
  }

  function cartButton(label) {
    return '<button class="icon-btn cart-btn" data-at-open-cart data-od-id="header-cart" aria-label="Open your order">' +
      svg(ICONS.cart) + '<span class="cart-count" data-at-cart-count hidden>0</span></button>';
  }

  function renderHeader() {
    var host = document.getElementById('site-chrome');
    if (!host) return;
    var active = PAGE;
    if (MINIMAL) {
      host.innerHTML =
        '<header class="sitehead" data-od-id="sitehead"><div class="container sitehead-inner">' +
          brand() +
          '<span class="pill pill-neutral" style="margin-inline:auto">' + svg(ICONS.lock, ' width="13" height="13" style="width:13px;height:13px"') + ' Secure checkout</span>' +
          '<div class="sitehead-actions">' +
            '<a class="btn btn-ghost head-order" href="' + (active === 'checkout' ? 'cart.html' : 'menu.html') + '">' + svg(ICONS.back, ' width="15" height="15" style="width:15px;height:15px"') + (active === 'checkout' ? ' Back to order' : ' Back to menu') + '</a>' +
            cartButton() +
          '</div>' +
        '</div></header>';
      return;
    }
    var nav = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (active === n.id ? ' aria-current="page"' : '') + '>' + n.label + '</a>';
    }).join('');
    host.innerHTML =
      '<header class="sitehead" data-od-id="sitehead"><div class="container sitehead-inner">' +
        brand() +
        '<nav aria-label="Primary">' + nav + '</nav>' +
        '<div class="sitehead-actions">' +
          '<a class="btn btn-secondary head-order" href="menu.html#menu" data-od-id="header-order">Order online</a>' +
          cartButton() +
        '</div>' +
      '</div></header>';
  }

  function renderMobileBar() {
    var items = [
      { id: 'menu', label: 'Menu', href: 'menu.html', icon: ICONS.book },
      { id: 'deals', label: 'Deals', href: 'menu.html#deals', icon: ICONS.tag },
      { id: 'cart', label: 'Your order', action: 'open-cart', icon: ICONS.cart },
      { id: 'track', label: 'Track', href: 'confirmation.html', icon: ICONS.track }
    ];
    var html = items.map(function (i) {
      if (i.action === 'open-cart') {
        return '<a href="#" data-at-open-cart' + (PAGE === 'cart' ? ' aria-current="page"' : '') + '>' + svg(i.icon) + i.label + '</a>';
      }
      var isActive = PAGE === i.id || (PAGE === 'menu' && i.id === 'menu');
      return '<a href="' + i.href + '"' + (isActive ? ' aria-current="page"' : '') + '>' + svg(i.icon) + i.label + '</a>';
    }).join('');
    var bar = document.createElement('nav');
    bar.className = 'mobilebar'; bar.setAttribute('aria-label', 'Quick links');
    bar.innerHTML = html;
    document.body.appendChild(bar);
  }

  function renderFooter() {
    var host = document.getElementById('site-footer');
    if (!host || MINIMAL) return;
    host.innerHTML =
      '<footer class="sitefoot on-dark" id="visit" data-od-id="footer"><div class="container">' +
        '<div class="sitefoot-grid">' +
          '<div>' + brand() + '<p class="brandline">Taste of Happiness.</p>' +
            '<p style="margin-top:14px;max-width:34ch">Fresh, family-style Vietnamese cooking in Brooklyn Park — dine in, takeaway or delivery.</p></div>' +
          '<div><h4>Find us</h4><ul><li>329 Henley Beach Rd</li><li>Brooklyn Park, Adelaide SA 5032</li><li>Open 7 days · 10am–9pm</li></ul></div>' +
          '<div><h4>Service</h4><ul><li><a href="menu.html#menu">Dine in</a></li><li><a href="menu.html#menu">Takeaway</a></li><li><a href="menu.html#menu">Delivery</a></li><li><a href="states.html">Order help</a></li></ul></div>' +
          '<div><h4>Explore</h4><ul><li><a href="menu.html#menu">Noodle soups</a></li><li><a href="menu.html#menu">Banh mi</a></li><li><a href="menu.html#deals">Super deals</a></li><li><a href="admin-dashboard.html">Staff · kitchen board</a></li></ul></div>' +
        '</div>' +
        '<div class="foot-bottom"><span>© 2026 Asian Taste · Brooklyn Park, Adelaide</span><span>Gluten-free · Vegan options · Spice level 1–5</span></div>' +
      '</div></footer>';
  }

  /* Publish the real header height so sticky rails and section bars can sit
     exactly beneath it — a hard-coded 72px drifts as soon as the header wraps. */
  function syncHeadHeight() {
    var head = document.querySelector('.sitehead');
    if (!head) return;
    document.documentElement.style.setProperty('--head-h', Math.round(head.offsetHeight) + 'px');
  }
  function watchHeadHeight() {
    syncHeadHeight();
    if (window.ResizeObserver) new ResizeObserver(syncHeadHeight).observe(document.querySelector('.sitehead'));
    window.addEventListener('resize', syncHeadHeight);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncHeadHeight);
    window.addEventListener('load', syncHeadHeight);
  }

  renderHeader();
  renderFooter();
  renderMobileBar();
  watchHeadHeight();
  var host = document.createElement('div');
  host.id = 'at-drawer-host';
  document.body.appendChild(host);
})();
