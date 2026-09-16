/* ==========================================================================
   Asian Taste — menu dataset
   Source of truth: ../Menu.md (the repo's menu). 14 categories, all items.
   Prices are AUD as published. `options` describe real choices printed on the
   menu (protein, cooking method, rice type) — nothing invented.
   ========================================================================== */
(function () {
  'use strict';

  var CATEGORIES = [
    { id: 'starters',  label: 'Starters',          desc: 'Perfect beginning to your Vietnamese feast' },
    { id: 'banhmi',    label: 'Banh Mi',           desc: 'Crispy baguette with savoury fillings' },
    { id: 'noodles',   label: 'Noodle Soups',      desc: 'Slow-simmered broths, rice noodles, fresh herbs' },
    { id: 'salads',    label: 'Noodle Bowl Salads',desc: 'Rice noodles, fresh herbs, nuoc cham' },
    { id: 'stirfry',   label: 'Noodle Stir-Fry',   desc: 'Wok-tossed noodles, cooked to order' },
    { id: 'ricebowl',  label: 'Rice Bowls',        desc: 'Fragrant jasmine rice with your choice of topping' },
    { id: 'rice',      label: 'Rice Dishes',       desc: 'Classic wok-tossed rice plates' },
    { id: 'chicken',   label: 'Chicken Dishes',    desc: 'Wok-fried chicken with fresh vegetables' },
    { id: 'pork',      label: 'Pork Dishes',       desc: 'Crispy and sweet-and-sour pork' },
    { id: 'saltpepper',label: 'Salt & Pepper',     desc: 'Crisp salt-and-pepper favourites' },
    { id: 'beef',      label: 'Beef Dishes',       desc: 'Wok-fried beef with fresh vegetables' },
    { id: 'seafood',   label: 'Seafood Dishes',    desc: 'Prawns, fish and seafood hotpots' },
    { id: 'veg',       label: 'Vegetable Dishes',  desc: 'Vegetable and tofu plates' },
    { id: 'deals',     label: 'Super Deals',       desc: 'Limited time offers' }
  ];

  var TAGS = {
    gf:    { label: 'GF',    dot: 'dot-gf' },
    vegan: { label: 'Vegan', dot: 'dot-vegan' },
    spicy: { label: 'Spicy', dot: 'dot-spicy' }
  };

  /* reusable option groups built from the printed menu choices */
  var PROTEIN4 = { id: 'protein', label: 'Choose your filling', type: 'radio', required: true, choices: [
    { id: 'chicken', label: 'Chicken' }, { id: 'prawn', label: 'Prawn' },
    { id: 'tofu', label: 'Tofu' }, { id: 'pork', label: 'Pork' } ] };
  var RICE_CHOICE = { id: 'rice', label: 'Choose your rice', type: 'radio', required: true, choices: [
    { id: 'steamed', label: 'Steamed rice', delta: 0 },
    { id: 'fried', label: 'Fried rice', delta: 1.50 },
    { id: 'basil', label: 'Spicy basil fried rice', delta: 1.80 },
    { id: 'japanese', label: 'Japanese fried rice', delta: 1.80 } ] };
  var SPICE = { id: 'spice', label: 'Spice level', type: 'range', min: 1, max: 5, value: 3,
    hint: 'Mild 1 → very spicy 5. Default 3.' };
  var VEGAN = { id: 'vegan', label: 'Make it vegan / vegetarian', type: 'checkbox', choices: [
    { id: 'plant', label: 'Use plant-based protein and sauce', note: 'Available on any dish on request' } ] };
  var METHOD2 = function (a, b) { return { id: 'method', label: 'Choose your style', type: 'radio', required: true, choices: [
    { id: a[0], label: a[1] }, { id: b[0], label: b[1] } ] }; };

  var DISHES = [
    /* ── STARTERS ───────────────────────────────────────────────────── */
    { id: 'cold-rolls', name: 'Cold Rolls (4)', desc: 'Hand-rolled rice paper with fresh herbs and hoisin dip.', price: 8.50, cats: ['starters', 'popular'], tags: ['gf'], options: [PROTEIN4, SPICE, VEGAN], image: 'assets/dishes/rice-paper-rolls.jpg' },
    { id: 'dim-sim', name: 'Homemade Dim Sim (3)', desc: 'Made in house, filled with chicken or pork.', price: 6.00, cats: ['starters'], tags: [], options: [METHOD2(['steamed', 'Steamed'], ['fried', 'Fried']), { id: 'fill', label: 'Choose your filling', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'pork', label: 'Pork' }] }], image: 'assets/dishes/dimsim-3.jpg' },
    { id: 'satay-skewers', name: 'Satay Skewers (3)', desc: 'Grilled and glazed in peanut satay.', price: 7.80, cats: ['starters', 'popular'], tags: ['gf'], options: [{ id: 'protein', label: 'Choose your skewer', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'beef', label: 'Beef' }] }, SPICE], image: null },
    { id: 'spring-rolls', name: 'Spring Rolls (3)', desc: 'Crispy rolls, fried to order.', price: 5.80, cats: ['starters'], tags: [], options: [{ id: 'fill', label: 'Choose your filling', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'veg', label: 'Vegetable' }] }, SPICE], image: 'assets/dishes/spring-rolls.jpg' },
    { id: 'prawn-spring-rolls', name: 'Prawn Spring Rolls (3)', desc: 'Crispy rolls filled with prawn.', price: 6.00, cats: ['starters'], tags: [], options: [SPICE], image: null },
    { id: 'wonton', name: 'Homemade Wonton', desc: 'Folded in house, served your way.', price: 6.50, cats: ['starters'], tags: [], options: [{ id: 'serve', label: 'How would you like them?', type: 'radio', required: true, choices: [{ id: 'steamed', label: 'Steamed' }, { id: 'fried', label: 'Fried' }, { id: 'soup', label: 'In soup' }] }], image: null },
    { id: 'laksa-soup', name: 'Laksa Soup', desc: 'Rich coconut laksa broth.', price: 7.80, cats: ['starters'], tags: ['gf'], options: [{ id: 'protein', label: 'Choose your protein', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'veg', label: 'Vegetable' }] }, SPICE, VEGAN], image: null },
    { id: 'sweet-corn-soup', name: 'Sweet Corn Soup', desc: 'Silky, gently sweet soup.', price: 7.80, cats: ['starters'], tags: [], options: [{ id: 'protein', label: 'Choose your protein', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'veg', label: 'Vegetable' }] }], image: null },

    /* ── BANH MI ────────────────────────────────────────────────────── */
    { id: 'banhmi-tofu', name: 'Tofu Banh Mi', desc: 'Crispy baguette, tofu, pickled vegetables and fresh herbs.', price: 8.00, cats: ['banhmi'], tags: ['vegan'], options: [SPICE], image: null },
    { id: 'banhmi-red-pork', name: 'Red Pork Banh Mi', desc: 'Crispy baguette with red pork and pickled vegetables.', price: 8.00, cats: ['banhmi'], tags: [], options: [SPICE], image: null },
    { id: 'banhmi-grilled-chicken', name: 'Grilled Chicken Banh Mi', desc: 'Crispy baguette, grilled chicken, coriander and chilli.', price: 8.20, cats: ['banhmi', 'popular'], tags: [], options: [SPICE], image: null },
    { id: 'banhmi-lemongrass-chicken', name: 'Lemongrass Chicken Banh Mi', desc: 'Lemongrass chicken in a crisp baguette.', price: 8.50, cats: ['banhmi'], tags: [], options: [SPICE], image: null },
    { id: 'banhmi-crispy-pork', name: 'Crispy Pork Banh Mi', desc: 'Roast pork, pâté, pickled vegetables and fresh herbs.', price: 8.50, cats: ['banhmi', 'popular'], tags: [], options: [SPICE] },
    { id: 'banhmi-satay-chicken', name: 'Satay Chicken Banh Mi', desc: 'Satay chicken in a crisp baguette.', price: 8.50, cats: ['banhmi'], tags: ['spicy'], options: [SPICE], image: null },
    { id: 'banhmi-lemongrass-beef', name: 'Lemongrass Beef Banh Mi', desc: 'Lemongrass beef in a crisp baguette.', price: 8.50, cats: ['banhmi'], tags: [], options: [SPICE], image: null },
    { id: 'banhmi-combination', name: 'Combination Banh Mi', desc: 'The lot — a little of everything in a crisp baguette.', price: 9.00, cats: ['banhmi'], tags: [], options: [SPICE], image: null },

    /* ── NOODLE SOUPS ───────────────────────────────────────────────── */
    { id: 'pho-beef', name: 'Pho — Beef Noodle Soup', desc: 'Slow-simmered beef broth with rice noodles and fresh herbs.', price: 15.50, cats: ['noodles', 'popular'], tags: ['gf'], note: 'Combination $16.50', image: 'assets/dishes/pho-beef-noodle-soup.jpg',
      options: [{ id: 'cut', label: 'Choose your beef', type: 'radio', required: true, choices: [{ id: 'rare', label: 'Rare beef' }, { id: 'brisket', label: 'Brisket' }, { id: 'ball', label: 'Beef balls' }, { id: 'combo', label: 'Combination (all three)', delta: 1.00 }] }, SPICE] },
    { id: 'spicy-beef-noodle', name: 'Spicy Beef Noodle Soup', desc: 'Fragrant, chilli-hot beef noodle soup.', price: 16.50, cats: ['noodles'], tags: ['spicy'], options: [SPICE], image: null },
    { id: 'chicken-noodle-soup', name: 'Chicken Noodle Soup', desc: 'Clear aromatic broth with your choice of chicken.', price: 15.50, cats: ['noodles'], tags: ['gf'], options: [{ id: 'cut', label: 'Choose your chicken', type: 'radio', required: true, choices: [{ id: 'grilled', label: 'Grilled chicken' }, { id: 'steamed', label: 'Steamed chicken' }] }, SPICE] },
    { id: 'wonton-noodle-soup', name: 'Wonton Noodle Soup', desc: 'Homemade wontons in a clear broth with noodles.', price: 15.50, cats: ['noodles'], tags: [], options: [SPICE], image: null },
    { id: 'laksa-vegan', name: 'Laksa Noodle Soup — Vegan', desc: 'Coconut laksa broth with plant-based protein.', price: 15.50, cats: ['noodles', 'popular'], tags: ['vegan', 'spicy'], options: [SPICE], image: null },
    { id: 'laksa-chicken', name: 'Laksa Noodle Soup — Chicken', desc: 'Rich coconut laksa broth with chicken and noodles.', price: 16.50, cats: ['noodles', 'popular'], tags: ['spicy'], options: [SPICE] },
    { id: 'laksa-crispy-pork', name: 'Laksa Noodle Soup — Crispy Pork', desc: 'Coconut laksa broth with crisp roast pork.', price: 16.50, cats: ['noodles'], tags: ['spicy'], options: [SPICE], image: null },
    { id: 'laksa-seafood', name: 'Laksa Noodle Soup — Seafood', desc: 'Coconut laksa broth with mixed seafood.', price: 17.00, cats: ['noodles'], tags: ['spicy'], options: [SPICE], image: null },
    { id: 'laksa-combination', name: 'Laksa Noodle Soup — Combination', desc: 'Coconut laksa broth with the works.', price: 17.50, cats: ['noodles'], tags: ['spicy'], options: [SPICE], image: null },

    /* ── NOODLE BOWL SALADS ─────────────────────────────────────────── */
    { id: 'salad-tofu', name: 'Tofu Noodle Bowl Salad', desc: 'Rice noodles, fresh herbs and nuoc cham with tofu.', price: 15.00, cats: ['salads'], tags: ['gf', 'vegan'], options: [METHOD2(['crispy', 'Crispy tofu'], ['lemongrass', 'Lemongrass tofu']), SPICE], image: null },
    { id: 'salad-spring-rolls', name: 'Spring Roll Noodle Bowl Salad', desc: 'Rice noodles, fresh herbs and nuoc cham with spring rolls.', price: 15.00, cats: ['salads'], tags: [], options: [{ id: 'fill', label: 'Choose your filling', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'veg', label: 'Vegetable' }] }, SPICE], image: null },
    { id: 'salad-chicken', name: 'Chicken Noodle Bowl Salad', desc: 'Rice noodles, fresh herbs and nuoc cham with chicken.', price: 15.20, cats: ['salads'], tags: ['gf'], options: [{ id: 'cut', label: 'Choose your chicken', type: 'radio', required: true, choices: [{ id: 'grilled', label: 'Grilled' }, { id: 'lemongrass', label: 'Lemongrass' }, { id: 'spicy', label: 'Spicy' }] }, SPICE] },
    { id: 'salad-crispy-pork', name: 'Crispy Pork Noodle Bowl Salad', desc: 'Rice noodles, fresh herbs and nuoc cham with crisp pork.', price: 15.50, cats: ['salads'], tags: ['gf'], options: [SPICE], image: 'assets/dishes/crispy-roasted-pork-noodle-bowl-salad.jpg' },
    { id: 'salad-beef', name: 'Beef Noodle Bowl Salad', desc: 'Rice noodles, fresh herbs and nuoc cham with beef.', price: 15.50, cats: ['salads'], tags: ['gf'], options: [METHOD2(['lemongrass', 'Lemongrass beef'], ['soy', 'Soy-pepper beef']), SPICE], image: null },
    { id: 'salad-combination', name: 'Combination Noodle Bowl Salad', desc: 'Rice noodles, fresh herbs and nuoc cham with the works.', price: 16.20, cats: ['salads'], tags: [], options: [SPICE], image: 'assets/dishes/combination-noodle-bowl-salad.jpg' },

    /* ── NOODLE STIR-FRY ────────────────────────────────────────────── */
    { id: 'pad-thai', name: 'Pad Thai', desc: 'Rice noodles wok-tossed with tamarind, egg and peanuts.', price: 16.00, cats: ['stirfry', 'popular'], tags: [], options: [{ id: 'protein', label: 'Choose your protein', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'veg', label: 'Vegetable' }, { id: 'prawn', label: 'Prawn' }] }, SPICE, VEGAN], image: 'assets/dishes/pad-thai.jpg' },
    { id: 'singapore-noodle', name: 'Singapore Noodles', desc: 'Curried rice noodles.', price: 16.00, cats: ['stirfry'], tags: ['spicy'], options: [{ id: 'protein', label: 'Choose your protein', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'prawn', label: 'Prawn' }, { id: 'veg', label: 'Vegetable' }] }, SPICE], image: null },
    { id: 'mongolian-noodle', name: 'Mongolian Noodles', desc: 'Wok-tossed with a savoury Mongolian sauce.', price: 16.00, cats: ['stirfry'], tags: [], options: [{ id: 'protein', label: 'Choose your protein', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'beef', label: 'Beef' }, { id: 'veg', label: 'Vegetable' }] }, { id: 'noodle', label: 'Choose your noodle', type: 'radio', required: true, choices: [{ id: 'hokkien', label: 'Hokkien noodle' }, { id: 'rice', label: 'Rice noodle' }] }, SPICE], image: null },
    { id: 'korean-glass-noodle', name: 'Korean Glass Noodle', desc: 'Glass noodles with vegetables and your choice of protein.', price: 16.00, cats: ['stirfry'], tags: [], note: 'Low carb', options: [{ id: 'protein', label: 'Choose your protein', type: 'radio', required: true, choices: [{ id: 'veg', label: 'Vegetable' }, { id: 'beef', label: 'Beef' }, { id: 'prawn', label: 'Prawn' }] }, SPICE], image: null },
    { id: 'egg-noodle-vegan', name: 'Wok-tossed Soft Egg Noodle — Vegan', desc: 'Soft egg noodles tossed in the wok with vegetables.', price: 16.80, cats: ['stirfry'], tags: ['vegan'], options: [SPICE], image: null },
    { id: 'egg-noodle-chicken-beef', name: 'Wok-tossed Soft Egg Noodle — Chicken or Beef', desc: 'Soft egg noodles tossed in the wok with your choice of protein.', price: 17.80, cats: ['stirfry'], tags: [], options: [{ id: 'protein', label: 'Choose your protein', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Chicken' }, { id: 'beef', label: 'Beef' }] }, SPICE], image: null },
    { id: 'egg-noodle-seafood', name: 'Wok-tossed Soft Egg Noodle — Seafood', desc: 'Soft egg noodles tossed in the wok with seafood.', price: 19.20, cats: ['stirfry'], tags: [], options: [SPICE], image: null },
    { id: 'egg-noodle-combination', name: 'Wok-tossed Soft Egg Noodle — Combination', desc: 'Soft egg noodles tossed in the wok with the works.', price: 19.50, cats: ['stirfry'], tags: [], options: [SPICE], image: null },

    /* ── RICE BOWLS ─────────────────────────────────────────────────── */
    { id: 'bowl-lemongrass-tofu', name: 'Lemongrass Tofu Rice Bowl', desc: 'Jasmine rice bowl with lemongrass tofu.', price: 14.50, cats: ['ricebowl'], tags: ['vegan'], options: [RICE_CHOICE, SPICE], image: null },
    { id: 'bowl-crispy-chicken-pork', name: 'Crispy Chicken or Pork Rice Bowl', desc: 'Jasmine rice bowl with crisp chicken or pork.', price: 14.80, cats: ['ricebowl'], tags: [], options: [{ id: 'protein', label: 'Choose your protein', type: 'radio', required: true, choices: [{ id: 'chicken', label: 'Crispy chicken' }, { id: 'pork', label: 'Crispy pork' }] }, RICE_CHOICE, SPICE], image: null },
    { id: 'bowl-satay-chicken', name: 'Satay Chicken Rice Bowl', desc: 'Jasmine rice bowl with satay chicken.', price: 14.80, cats: ['ricebowl', 'popular'], tags: [], options: [RICE_CHOICE, SPICE], image: null },
    { id: 'bowl-spicy-chicken', name: 'Spicy Chicken Rice Bowl', desc: 'Jasmine rice bowl with spicy chicken.', price: 14.80, cats: ['ricebowl'], tags: ['spicy'], options: [RICE_CHOICE, SPICE], image: null },
    { id: 'bowl-garlic-butter-chicken', name: 'Garlic Butter Chicken Rice Bowl', desc: 'Jasmine rice bowl with garlic butter chicken.', price: 14.80, cats: ['ricebowl'], tags: [], options: [RICE_CHOICE, SPICE], image: null },
    { id: 'bowl-soy-pepper-beef', name: 'Soy-Pepper Beef Rice Bowl', desc: 'Jasmine rice bowl with soy-pepper beef.', price: 14.80, cats: ['ricebowl'], tags: [], options: [RICE_CHOICE, SPICE], image: null },
    { id: 'bowl-sunny-egg-pork', name: 'Sunny Egg & Crispy Pork Rice Bowl', desc: 'Jasmine rice bowl with crispy pork and a sunny egg.', price: 15.80, cats: ['ricebowl', 'popular'], tags: [], options: [RICE_CHOICE, SPICE], image: null },
    { id: 'bowl-curry', name: 'Curry Rice Bowl', desc: 'Jasmine rice bowl with green or yellow curry.', price: 16.00, cats: ['ricebowl'], tags: ['spicy'], options: [{ id: 'curry', label: 'Choose your curry', type: 'radio', required: true, choices: [{ id: 'green', label: 'Green curry' }, { id: 'yellow', label: 'Yellow curry' }] }, RICE_CHOICE, SPICE], image: null },

    /* ── RICE DISHES ────────────────────────────────────────────────── */
    { id: 'steamed-rice', name: 'Steamed Rice', desc: 'A bowl of steamed jasmine rice.', price: 2.00, cats: ['rice'], tags: [], options: [], image: null },
    { id: 'fried-rice', name: 'Fried Rice', desc: 'Classic wok-tossed fried rice.', price: 11.50, cats: ['rice'], tags: ['gf'], options: [SPICE], image: null },
    { id: 'spicy-basil-fried-rice', name: 'Spicy Basil Fried Rice', desc: 'Fragrant basil and chilli fried rice.', price: 12.50, cats: ['rice'], tags: ['gf', 'spicy'], options: [SPICE], image: null },
    { id: 'japanese-fried-rice', name: 'Japanese Fried Rice', desc: 'Mild, savoury Japanese-style fried rice.', price: 12.50, cats: ['rice'], tags: [], options: [SPICE], image: null },
    { id: 'rice-hotpot', name: 'Asian Taste Rice Hotpot', desc: 'Our house hotpot, served bubbling to the table.', price: 17.90, cats: ['rice', 'popular'], tags: [], options: [SPICE], image: null },

    /* ── CHICKEN DISHES ─────────────────────────────────────────────── */
    { id: 'chicken-cashew', name: 'Mix Veg Cashew Nut Chicken', desc: 'Chicken and mixed vegetables with roasted cashews.', price: 19.00, cats: ['chicken'], tags: [], options: [SPICE], image: null },
    { id: 'chicken-satay', name: 'Mix Veg in Creamy Satay Sauce', desc: 'Chicken and mixed vegetables in a creamy satay sauce.', price: 19.00, cats: ['chicken'], tags: ['gf'], options: [SPICE], image: null },
    { id: 'chicken-malaysian-curry', name: 'Mix Veg in Malaysian Curry', desc: 'Chicken and mixed vegetables in Malaysian curry.', price: 19.00, cats: ['chicken'], tags: ['gf', 'spicy'], options: [SPICE], image: null },
    { id: 'chicken-chilli-basil', name: 'Mix Veg with Spicy Chilli Basil', desc: 'Chicken and mixed vegetables with spicy chilli basil.', price: 19.00, cats: ['chicken'], tags: ['gf', 'spicy'], options: [SPICE], image: null },
    { id: 'honey-chicken', name: 'Honey Chicken', desc: 'Crisp chicken in a sticky honey glaze.', price: 18.00, cats: ['chicken'], tags: ['gf'], options: [SPICE], image: null },
    { id: 'chicken-thai-green-curry', name: 'Mix Veg in Thai Green Curry', desc: 'Chicken and mixed vegetables in Thai green curry.', price: 19.00, cats: ['chicken'], tags: ['spicy'], options: [SPICE], image: null },

    /* ── PORK DISHES ────────────────────────────────────────────────── */
    { id: 'vietnamese-crispy-pork', name: 'Vietnamese Crispy Pork', desc: 'Roast crispy pork, Vietnamese style.', price: 18.50, cats: ['pork'], tags: [], options: [SPICE], image: null },
    { id: 'sweet-sour-pork', name: 'Sweet & Sour Pork', desc: 'Crisp pork tossed in a sweet-and-sour sauce.', price: 18.50, cats: ['pork'], tags: [], options: [SPICE], image: null },

    /* ── SALT & PEPPER ──────────────────────────────────────────────── */
    { id: 'saltpepper-tofu', name: 'Salt & Pepper Tofu', desc: 'Crisp tofu tossed with salt, pepper and chilli.', price: 16.50, cats: ['saltpepper'], tags: ['gf', 'vegan'], options: [SPICE], image: null },
    { id: 'saltpepper-chicken', name: 'Salt & Pepper Chicken', desc: 'Crisp chicken tossed with salt, pepper and chilli.', price: 18.00, cats: ['saltpepper'], tags: ['gf'], options: [SPICE], image: null },
    { id: 'saltpepper-squid', name: 'Salt & Pepper Squid or Fish', desc: 'Crisp squid or fish with salt, pepper and chilli.', price: 18.50, cats: ['saltpepper'], tags: ['gf'], options: [{ id: 'protein', label: 'Choose your protein', type: 'radio', required: true, choices: [{ id: 'squid', label: 'Squid' }, { id: 'fish', label: 'Fish' }] }, SPICE], image: null },
    { id: 'saltpepper-prawn', name: 'Salt & Pepper Prawn', desc: 'Crisp prawns with salt, pepper and chilli.', price: 19.80, cats: ['saltpepper'], tags: ['gf'], options: [SPICE], image: null },
    { id: 'saltpepper-combination', name: 'Salt & Pepper Combination', desc: 'Tofu, chicken, squid and prawn with salt and pepper.', price: 21.50, cats: ['saltpepper', 'popular'], tags: ['gf'], options: [SPICE], image: null },

    /* ── BEEF DISHES ────────────────────────────────────────────────── */
    { id: 'beef-cashew', name: 'Mix Veg Cashew Nut Beef', desc: 'Beef and mixed vegetables with roasted cashews.', price: 19.80, cats: ['beef'], tags: [], options: [SPICE], image: null },
    { id: 'beef-black-bean', name: 'Mix Veg in Black Bean Sauce', desc: 'Beef and mixed vegetables in black bean sauce.', price: 19.80, cats: ['beef'], tags: ['gf'], options: [SPICE], image: null },
    { id: 'beef-mongolian', name: 'Mix Veg in Mongolian Sauce', desc: 'Beef and mixed vegetables in Mongolian sauce.', price: 19.80, cats: ['beef'], tags: ['gf'], options: [SPICE], image: null },
    { id: 'beef-chilli-basil', name: 'Mix Veg with Spicy Chilli Basil (Beef)', desc: 'Beef and mixed vegetables with spicy chilli basil.', price: 19.80, cats: ['beef'], tags: ['gf', 'spicy'], options: [SPICE], image: null },
    { id: 'beef-black-pepper', name: 'Mix Veg with Black Pepper', desc: 'Beef and mixed vegetables with black pepper.', price: 19.80, cats: ['beef'], tags: [], options: [SPICE], image: null },

    /* ── SEAFOOD DISHES ─────────────────────────────────────────────── */
    { id: 'seafood-ginger-hotpot', name: 'Combo Seafood Ginger Hotpot', desc: 'Mixed seafood hotpot with ginger.', price: 20.80, cats: ['seafood'], tags: [], options: [SPICE], image: null },
    { id: 'prawn-hotpot', name: 'Prawn Hotpot in Asian Spices', desc: 'Prawns in a hotpot with Asian spices.', price: 20.80, cats: ['seafood'], tags: ['gf'], options: [SPICE], image: null },
    { id: 'creamy-garlic-prawn', name: 'Creamy Garlic Prawn', desc: 'Prawns in a creamy garlic sauce.', price: 20.80, cats: ['seafood'], tags: [], options: [SPICE], image: null },
    { id: 'prawn-curry', name: 'Prawn Curry (Green/Yellow)', desc: 'Prawns in green or yellow curry.', price: 20.80, cats: ['seafood'], tags: ['gf', 'spicy'], options: [{ id: 'curry', label: 'Choose your curry', type: 'radio', required: true, choices: [{ id: 'green', label: 'Green curry' }, { id: 'yellow', label: 'Yellow curry' }] }, SPICE], image: null },

    /* ── VEGETABLE DISHES ───────────────────────────────────────────── */
    { id: 'veg-cashew', name: 'Mix Veg Cashew Nut', desc: 'Mixed vegetables with roasted cashews.', price: 15.00, cats: ['veg'], tags: [], options: [SPICE, VEGAN], image: null },
    { id: 'green-bean-soy-garlic', name: 'Green Bean in Soy and Garlic', desc: 'Green beans tossed in soy and garlic.', price: 15.50, cats: ['veg'], tags: [], options: [SPICE, VEGAN], image: null },
    { id: 'veg-tofu-hotpot', name: 'Veg Tofu Hotpot', desc: 'Tofu and vegetables in a hotpot.', price: 16.50, cats: ['veg'], tags: ['vegan'], options: [SPICE], image: null },
    { id: 'tofu-chilli-lemongrass', name: 'Tofu Chilli Lemongrass', desc: 'Tofu with chilli and lemongrass.', price: 15.00, cats: ['veg'], tags: ['vegan', 'spicy'], options: [SPICE], image: null },
    { id: 'bokchoy-oyster-garlic', name: 'Steamed Bokchoy in Oyster Garlic Sauce', desc: 'Steamed bokchoy in oyster and garlic sauce.', price: 15.00, cats: ['veg'], tags: [], options: [SPICE], image: null },
    { id: 'vegan-curry', name: 'Vegan Curry (Green/Yellow)', desc: 'Vegan curry with mixed vegetables.', price: 16.50, cats: ['veg'], tags: ['vegan', 'spicy'], options: [{ id: 'curry', label: 'Choose your curry', type: 'radio', required: true, choices: [{ id: 'green', label: 'Green curry' }, { id: 'yellow', label: 'Yellow curry' }] }, SPICE], image: null },

    /* ── SUPER DEALS ────────────────────────────────────────────────── */
    { id: 'snack-deal', name: 'Snack Super Deal', desc: '2 spring rolls + 1 drink. Available on orders from $7.80.', price: 5.20, cats: ['deals', 'popular'], tags: [], options: [{ id: 'drink', label: 'Choose your drink', type: 'radio', required: true, choices: [{ id: 'coke', label: 'Coke' }, { id: 'lemon', label: 'Homemade lemon drink' }, { id: 'water', label: 'Bottled water' }] }, SPICE], image: null }
  ];

  /* ── real marketplace signals ───────────────────────────────────────
     Captured from the live Uber Eats store page for Asian Taste
     (see uber-eats-study.md). `rank` is the platform's "most liked"
     position; `rating` is the displayed %liked (number of ratings).
     Store-level score is 4.7 from 3,000+ ratings. */
  var STORE_RATING = { score: '4.7', count: '3,000+' };

  var LIKED = { 'pho-beef': 1, 'dim-sim': 2, 'spring-rolls': 3 };

  var RATINGS = {
    'pho-beef':            { pct: 93,  count: 566 },
    'banhmi-crispy-pork':  { pct: 92,  count: 415 },
    'salad-combination':   { pct: 94,  count: 255 },
    'salad-crispy-pork':   { pct: 92,  count: 192 },
    'banhmi-combination':  { pct: 93,  count: 173 },
    'banhmi-lemongrass-chicken': { pct: 90, count: 128 },
    'chicken-noodle-soup': { pct: 92,  count: 104 },
    'banhmi-grilled-chicken': { pct: 91, count: 82 },
    'banhmi-tofu':         { pct: 92,  count: 79 },
    'snack-deal':          { pct: 96,  count: 58 },
    'banhmi-satay-chicken':{ pct: 93,  count: 45 },
    'banhmi-lemongrass-beef': { pct: 100, count: 8 }
  };

  /* Intrinsic pixel size of every bundled photo, so a renderer can put real
     width/height on the <img> and the page never reflows as photos decode. */
  var IMG_DIM = {
    'assets/dishes/pho-beef-noodle-soup.jpg': [550, 440],
    'assets/dishes/rice-paper-rolls.jpg': [550, 768],
    'assets/dishes/dimsim-3.jpg': [550, 699],
    'assets/dishes/spring-rolls.jpg': [550, 440],
    'assets/dishes/pad-thai.jpg': [550, 440],
    'assets/dishes/combination-noodle-bowl-salad.jpg': [550, 440],
    'assets/dishes/crispy-roasted-pork-noodle-bowl-salad.jpg': [550, 453]
  };

  var byId = {};
  DISHES.forEach(function (d) { byId[d.id] = d; });

  function countIn(cat) {
    if (cat === 'all') return DISHES.length;
    return DISHES.filter(function (d) { return d.cats.indexOf(cat) !== -1; }).length;
  }

  window.AT_MENU = {
    categories: CATEGORIES,
    dishes: DISHES,
    tags: TAGS,
    storeRating: STORE_RATING,
    likedOf: function (id) { return LIKED[id] || 0; },
    ratingOf: function (id) { return RATINGS[id] || null; },
    byId: function (id) { return byId[id]; },
    imageDim: function (path) { return IMG_DIM[path] || null; },
    countIn: countIn,
    priceOf: function (d, optData) {
      var total = d.price;
      (d.options || []).forEach(function (g) {
        if (g.type === 'range') return;
        var v = optData && optData[g.id];
        var picked = [];
        if (Array.isArray(v)) picked = v; else if (v != null) picked = [v];
        picked.forEach(function (cid) {
          (g.choices || []).forEach(function (c) { if (c.id === cid && c.delta) total += c.delta; });
        });
      });
      return total;
    }
  };
})();
