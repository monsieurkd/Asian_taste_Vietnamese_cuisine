# Asian Taste - Menu Display & Landing Page Specifications

## Page Structure Overview

```
┌─────────────────────────────────────────────────────────┐
│                      HEADER (Sticky)                      │
│  Logo | Navigation | Search | Cart | Order Button        │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                      HERO SECTION                        │
│           Background Image + Headline + CTA              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                   ORDERING OPTIONS                       │
│          Delivery | Pickup | Dine-In Toggle              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                   CATEGORY NAVIGATION                    │
│     Popular | Noodles | Rice | Banh Mi | Drinks         │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                      MENU SECTION                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Category   │  │   Category   │  │   Category   │   │
│  │    Card 1    │  │    Card 2    │  │    Card 3    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                   PROMOTIONS / DEALS                     │
│              Super Deal | Combo | Special                │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                      FOOTER                              │
│    Location | Hours | Contact | Social | App Links       │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Header Component

### Desktop Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│  [LOGO]  Home  Menu  About  Contact    [🔍]  [🛒3]  [Order Now]   │
└─────────────────────────────────────────────────────────────────────┘
```

### Mobile Layout
```
┌────────────────────────────────────┐
│  [☰]  [LOGO]        [🔍] [🛒3]     │
└────────────────────────────────────┘
```

### Specifications

| Element | Desktop | Mobile |
|---------|---------|--------|
| **Height** | 72px | 56px |
| **Background** | #FFFFFF | #FFFFFF |
| **Border Bottom** | 1px solid #E8DCC8 | 1px solid #E8DCC8 |
| **Logo Size** | 160px width | 120px width |
| **Nav Item Spacing** | 32px | N/A (drawer) |
| **CTA Button** | Visible | Hidden (scroll to show) |

### States
- **Scrolled:** Adds shadow (0 2px 8px rgba(0,0,0,0.1))
- **Mobile Menu Open:** Full-screen overlay with dark semi-transparent background

---

## 2. Hero Section

### Desktop Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│              [Large Background Image - Parallax]                    │
│                                                                     │
│         THE SECRET IS IN THE SAUCE                                  │
│         Authentic Vietnamese Flavors Made Fresh Daily               │
│                                                                     │
│         [Order Now]    [Explore Menu]                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Specifications

| Property | Desktop | Tablet | Mobile |
|----------|---------|--------|--------|
| **Height** | 600px | 480px | 400px |
| **Padding** | 96px 64px | 64px 32px | 48px 24px |
| **Image Overlay** | rgba(60, 42, 33, 0.4) | rgba(60, 42, 33, 0.5) | rgba(60, 42, 33, 0.6) |
| **Title Size** | 48px | 36px | 28px |
| **Description Size** | 20px | 18px | 16px |

### Content
- **Headline:** "Taste of Happiness"
- **Subheadline:** "Authentic Vietnamese cuisine made with love and fresh ingredients"
- **Primary CTA:** "Order Now" (#8B3A3A background)
- **Secondary CTA:** "View Menu" (outlined)

---

## 3. Order Type Selector

### Component Design
```
┌─────────────────────────────────────────────────────────────────┐
│    [🚗 Delivery]    [🏪 Pickup]    [🍽️ Dine In]                │
│         Active         Inactive        Inactive                  │
└─────────────────────────────────────────────────────────────────┘
```

### Specifications
- **Type:** Toggle button group
- **Active State:** #8B3A3A background, white text
- **Inactive State:** #F5F0E6 background, #3C2A21 text
- **Border Radius:** 8px per button
- **Padding:** 16px 24px each
- **Icons:** 24px size, left aligned to text

### Behavior
- Updates available menu items based on selection
- Shows/hides delivery fee, minimum order info
- Updates estimated delivery/pickup time display

---

## 4. Category Navigation

### Desktop (Sticky Below Hero)
```
┌─────────────────────────────────────────────────────────────────┐
│  Most Popular 🏆  Noodles 🍜  Rice 🍚  Banh Mi 🥖  Drinks 🥤   │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile (Horizontal Scroll)
```
┌───────────────────────────────────────────────
│  Popular  Noodles  Rice  Banh Mi  Drinks →   │
└───────────────────────────────────────────────
```

### Specifications
- **Background:** #F5F0E6
- **Border:** 1px solid #E8DCC8
- **Height:** 56px
- **Item Padding:** 12px 20px
- **Active Indicator:** Bottom border 3px solid #8B3A3A
- **Hover:** Background changes to #E8DCC8
- **Icons:** 20px size, positioned left of text

### Categories
1. **Most Popular** 🏆 - Top selling items
2. **Noodle Soups** 🍜 - Pho, Hu Tieu, Bun Bo
3. **Rice Bowls** 🍚 - Com Tam, Com Suon
4. **Banh Mi** 🥖 - Vietnamese sandwiches
5. **Starters** 🥢 - Spring rolls, salads
6. **Drinks** 🥤 - Vietnamese coffee, tea, smoothies

---

## 5. Menu Grid Layout

### Grid Specifications
| Screen Size | Columns | Gap | Card Width |
|-------------|---------|-----|------------|
| **Desktop (1280+)** | 3 | 24px | auto |
| **Desktop (1024-1279)** | 3 | 20px | auto |
| **Tablet (768-1023)** | 2 | 16px | auto |
| **Mobile (<768)** | 1 | 16px | 100% |

### Section Header Design
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│                    NOODLE SOUPS                                  │
│               Authentic Vietnamese Pho                            │
│  ───────────────────────────────────────────────────────────     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

- **Background:** #3C2A21 (dark brown)
- **Title Color:** #FFFFFF
- **Subtitle Color:** #D4AF37 (gold)
- **Padding:** 32px 24px
- **Text Align:** Center
- **Divider:** Gold line, 2px height, 200px width

---

## 6. Menu Item Card

### Card Layout
```
┌──────────────────────────────────────────┐
│  ┌────────────────────────────────────┐  │
│  │         [Food Image]               │  │
│  │    (16:9 aspect ratio)             │  │
│  │    [Popular Badge]                 │  │
│  └────────────────────────────────────┘  │
│                                           │
│  [🔥] Beef Pho                            │
│        Traditional rice noodle soup...    │
│                                           │
│  $15.00                      [Add +]     │
└──────────────────────────────────────────┘
```

### Card Specifications

| Element | Properties |
|---------|------------|
| **Background** | #FFFFFF |
| **Border Radius** | 12px |
| **Padding** | 16px |
| **Shadow** | 0 2px 8px rgba(0,0,0,0.08) |
| **Hover Shadow** | 0 8px 24px rgba(0,0,0,0.12) |
| **Hover Transform** | translateY(-4px) |

### Image Section
- **Aspect Ratio:** 16:9
- **Object Fit:** Cover
- **Border Radius:** 8px
- **Background:** #F5F0E6 (placeholder)

### Badges (Top Right Corner)
| Badge | Background | Text | Position |
|-------|------------|------|----------|
| Popular | #D4AF37 | #3C2A21 | Absolute, top: 8px, right: 8px |
| New | #C30139 | #FFFFFF | Absolute, top: 8px, right: 8px |
| Deal | #FF0000 | #FFFFFF | Absolute, top: 8px, right: 8px |

### Title & Description
- **Dish Name:** Manrope, 18px, 600 weight, #3C2A21
- **Description:** Inter, 14px, 400 weight, #666666, max 2 lines
- **Truncation:** Ellipsis for overflow

### Price & Action
- **Price:** Manrope, 20px, 700 weight, #8B3A3A, right aligned
- **Add Button:** 40px height, 80px width, #8B3A3A background, white text
- **Quantity Counter:** Appears after adding (− 1 +)

---

## 7. Promotions Section

### Super Deal Banner
```
┌─────────────────────────────────────────────────────────────────┐
│  🔥    SUPER DEAL    🔥                                        │
│                                                                 │
│        2 Spring Rolls + 1 Drink                                │
│                   Only $5.20                                    │
│                                                                 │
│                     [Add to Order]                              │
└─────────────────────────────────────────────────────────────────┘
```

### Specifications
- **Background:** Linear gradient (135deg, #C30139, #8B3A3A)
- **Text Color:** #FFFFFF
- **Padding:** 32px
- **Border Radius:** 16px
- **Animation:** Subtle pulse on shadow

### Deal Cards Grid
- **Layout:** 3 columns desktop, 1 mobile
- **Card Style:** Dark theme (#3C2A21 background)
- **Price Strikethrough:** For original price
- **Savings Badge:** Green (#4CAF50) showing discount percentage

---

## 8. Quick Add / Cart Drawer

### Drawer Layout
```
┌─────────────────────────────────────────┐
│  Your Order                    [×]      │
│  ─────────────────────────────────────  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Beef Pho              $15.00    │   │
│  │ Extra sprouts                  │   │
│  │            [-] 1 [+]    [🗑]   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Spring Rolls           $5.20    │   │
│  │            [-] 2 [+]    [🗑]   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ─────────────────────────────────────  │
│  Subtotal                $25.20         │
│  Delivery Fee            $5.00          │
│  ─────────────────────────────────────  │
│  Total                   $30.20         │
│                                         │
│         [Proceed to Checkout →]         │
│                                         │
│  🚗 Delivery to: 123 Main St            │
│  ⏱️ Estimated: 25-35 min                │
└─────────────────────────────────────────┘
```

### Specifications
- **Width:** 400px (desktop), 100% (mobile)
- **Max Width:** 100%
- **Background:** #FFFFFF
- **Overlay:** rgba(0, 0, 0, 0.5)
- **Animation:** Slide from right (300ms ease-out)

### Cart Item Component
- **Image:** 60px square, left aligned
- **Details:** Name, customizations
- **Quantity:** - button, number, + button
- **Remove:** Trash icon, right aligned
- **Price:** Right aligned, below quantity

---

## 9. Footer

### Desktop Layout (4 Columns)
```
┌─────────────────────────────────────────────────────────────────────┐
│  [Logo]                                                             │
│  Taste of Happiness                                                │
│                                                                     │
│  Location        Hours           Contact        Follow Us         │
│  123 Main St     Mon-Fri:        Phone:        [FB] [IG] [TT]    │
│  Suburb, State   11am-9pm        (02) 1234                        │
│                  Sat-Sun:        Email:                          │
│                  10am-9pm        info@...                        │
│                                                                     │
│  ────────────────────────────────────────────────────────────────  │
│                                                                     │
│  © 2026 Asian Taste. Privacy | Terms | Accessibility               │
│                                                                     │
│  [App Store]    [Google Play]                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Specifications
- **Background:** #3C2A21
- **Text Color:** #FFFFFF (primary), #D2B48C (secondary)
- **Padding:** 64px 24px
- **Column Gap:** 48px

---

## 10. Mobile Navigation (Bottom Bar)

### Design
```
┌──────────────────────────────────────────┐
│                                           │
│                                           │
│                                           │
│                                           │
│                                           │
│                                           │
├──────────────────────────────────────────┤
│  [🏠 Home]  [📋 Menu]  [🛒 Cart]  [👤 Me] │
└──────────────────────────────────────────┘
```

### Specifications
- **Height:** 64px
- **Background:** #FFFFFF
- **Border Top:** 1px solid #E8DCC8
- **Active Icon:** #8B3A3A
- **Inactive Icon:** #999999
- **Icon Size:** 24px
- **Label:** 10px, below icon

---

## Page Animations

### Hero Animation
- **Fade In:** 500ms delay, 800ms duration
- **Text Slide Up:** 300ms delay, 600ms duration
- **CTA Fade In:** 800ms delay, 500ms duration

### Scroll Animations
- **Menu Cards:** Staggered fade-in-up (100ms delay per card)
- **Trigger:** When 80% of element is visible
- **Duration:** 500ms ease-out

### Micro-interactions
- **Add to Cart:** Button scales down then up (100ms each)
- **Cart Badge:** Bounces when item added
- **Category Switch:** Fade out new, fade in new (200ms)

---

## Loading States

### Skeleton Loader
```
┌──────────────────────────────────────────┐
│  ┌────────────────────────────────────┐  │
│  │  [Image Placeholder - Shimmer]     │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────┐                    │  │
│  │ [Title Shimmer] │                    │  │
│  └────────────────┘                    │  │
│  ┌────────────┐                        │  │
│  │[Text Shimmer]                       │  │
│  └────────────┘                        │  │
└──────────────────────────────────────────┘
```

- **Shimmer Animation:** Linear gradient moving left to right
- **Duration:** 1.5s infinite
- **Base Color:** #F5F0E6
- **Shimmer Color:** #E8DCC8

---

## Responsive Image Guidelines

### Image Sizes
| Type | Mobile | Tablet | Desktop | Format |
|------|--------|--------|---------|--------|
| **Hero** | 800x600 | 1200x600 | 1920x800 | WebP |
| **Menu Item** | 400x225 | 600x338 | 800x450 | WebP |
| **Category** | 300x300 | 400x400 | 500x500 | WebP |
| **Logo** | 120x60 | 160x80 | 200x100 | SVG |

### Image Quality
- **Compression:** 85% quality for WebP
- **Lazy Loading:** All images below fold
- **Placeholder:** Blur-up technique (20px base image)

---

## Accessibility Features

### Keyboard Navigation
- **Tab Order:** Logo → Nav → Search → Categories → Menu Items → Cart
- **Focus Visible:** 2px solid #8B3A3A outline
- **Skip Links:** Skip to main content, Skip to navigation

### Screen Reader
- **ARIA Labels:** All icons with context
- **Live Regions:** Cart updates, order confirmations
- **Alt Text:** Descriptive for all food images
- **Semantic HTML:** Proper heading hierarchy

### Touch Targets
- **Minimum Size:** 44x44px
- **Spacing:** 8px between adjacent targets

---

## Performance Targets

| Metric | Target |
|--------|--------|
| **First Contentful Paint** | < 1.5s |
| **Largest Contentful Paint** | < 2.5s |
| **Time to Interactive** | < 3.5s |
| **Cumulative Layout Shift** | < 0.1 |
| **First Input Delay** | < 100ms |

---

## SEO Meta Tags

```html
<!-- Primary -->
<title>Asian Taste | Authentic Vietnamese Restaurant | Order Online</title>
<meta name="description" content="Order delicious Vietnamese food online from Asian Taste. Fresh pho, banh mi, rice bowls and more. Delivery and pickup available.">
<meta name="keywords" content="Vietnamese restaurant, pho near me, banh mi, Asian food delivery, Vietnamese takeaway">

<!-- Open Graph -->
<meta property="og:title" content="Asian Taste | Taste of Happiness">
<meta property="og:description" content="Authentic Vietnamese cuisine made with love. Order online for delivery or pickup.">
<meta property="og:image" content="https://asiantaste.com/og-image.jpg">
<meta property="og:type" content="restaurant">
<meta property="og:url" content="https://asiantaste.com">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Asian Taste | Authentic Vietnamese Cuisine">
<meta name="twitter:description" content="Fresh, authentic Vietnamese food made with love.">
<meta name="twitter:image" content="https://asiantaste.com/twitter-image.jpg">
```

---

## Copy Guidelines

### Hero Section
- **Headline:** "Taste of Happiness"
- **Subheadline:** "Authentic Vietnamese flavors, made fresh daily with love"

### Category Descriptions
- **Noodle Soups:** "Slow-simmered broths, rice noodles, fresh herbs"
- **Rice Bowls:** "Fragrant jasmine rice with your choice of toppings"
- **Banh Mi:** "Crispy baguette with savory fillings"
- **Starters:** "Perfect beginning to your Vietnamese feast"

### Promotional Copy
- **Super Deal:** "Limited time offer!"
- **Popular:** "Customer favorite"
- **New:** "Just added!"

---

*Last Updated: January 2026*
