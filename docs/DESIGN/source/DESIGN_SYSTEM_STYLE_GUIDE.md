# Asian Taste - Design System & Style Guide

## Brand Overview
**Restaurant Name:** Asian Taste
**Tagline:** Taste of Happiness
**Cuisine:** Vietnamese / Asian
**Service Type:** Dine In & Takeaway & Delivery

---

## Color Palette

### Primary Colors
| Color Name | Hex Code | Usage |
|------------|----------|-------|
| **Deep Maroon/Red** | `#8B3A3A` | Primary brand color, menu backgrounds, CTAs |
| **Dark Brown** | `#3C2A21` | Dark background panels, sections |
| **Warm Brown** | `#D2B48C` | Secondary backgrounds, accents |

### Secondary Colors
| Color Name | Hex Code | Usage |
|------------|----------|-------|
| **Cream/Beige** | `#F5F0E6` | Light backgrounds, paper texture effect |
| **Light Tan** | `#E8DCC8` | Card backgrounds, alternate sections |
| **Medium Brown** | `#8B4513` | Borders, dividers, subtle accents |

### Accent Colors
| Color Name | Hex Code | Usage |
|------------|----------|-------|
| **Golden Yellow** | `#D4AF37` | Highlights, promotional text, deals |
| **Bright Red** | `#C30139` | Urgent CTAs, sale badges, notifications |
| **Vibrant Red** | `#FF0000` | Hot indicators, spicy labels |
| **Flame Orange** | `#FF6B35` | Heat indicators, accent buttons |

### Neutral Colors
| Color Name | Hex Code | Usage |
|------------|----------|-------|
| **Black** | `#000000` | Primary text, logos, high contrast elements |
| **White** | `#FFFFFF` | Text on dark backgrounds, clean areas |
| **Dark Gray** | `#333333` | Secondary text, body copy |
| **Light Gray** | `#E0E0E0` | Borders, subtle dividers |

### Dietary Label Colors
| Label | Color | Usage |
|-------|-------|-------|
| **GF (Gluten Free)** | `#4CAF50` | Green badge for gluten-free items |
| **V (Vegetarian)** | `#8BC34A` | Light green for vegetarian options |
| **Spicy** | `#FF5722` | Orange-red for spicy items |

---

## Typography

### Font Families
```
Primary: Manrope (Google Fonts)
- Modern, geometric sans-serif
- Highly readable at all sizes
- Supports Vietnamese characters

Secondary: Playfair Display
- Elegant serif for headings
- Traditional, sophisticated feel

Body/Functional: Inter
- Clean, neutral sans-serif
- Excellent for UI elements and forms
```

### Type Scale
| Element | Font | Size | Weight | Line Height |
|---------|------|------|--------|-------------|
| **H1 - Page Title** | Manrope | 48px | 700 | 1.2 |
| **H2 - Section Title** | Playfair Display | 36px | 600 | 1.3 |
| **H3 - Card Title** | Manrope | 24px | 600 | 1.4 |
| **H4 - Subsection** | Manrope | 20px | 600 | 1.4 |
| **Body Large** | Manrope | 18px | 400 | 1.5 |
| **Body Base** | Inter | 16px | 400 | 1.5 |
| **Body Small** | Inter | 14px | 400 | 1.5 |
| **Caption** | Inter | 12px | 400 | 1.4 |
| **Button** | Manrope | 16px | 600 | 1 |

### Typography Rules
- **All Caps:** Section headers, navigation items
- **Title Case:** Card titles, dish names
- **Sentence Case:** Descriptions, body text
- **No text transform:** User input fields, form labels

---

## Layout & Spacing

### Spacing Scale (8pt Grid System)
```
xs:  4px   (0.25rem)
sm:  8px   (0.5rem)
md:  16px  (1rem)
lg:  24px  (1.5rem)
xl:  32px  (2rem)
2xl: 48px  (3rem)
3xl: 64px  (4rem)
4xl: 96px  (6rem)
```

### Container Widths
| Container | Max Width | Usage |
|-----------|-----------|-------|
| **Mobile** | 100% | < 640px |
| **Tablet** | 640px | 640px - 768px |
| **Desktop** | 1024px | 768px - 1280px |
| **Wide** | 1280px | > 1280px |

### Section Padding
- **Hero:** 96px top/bottom (desktop), 48px (mobile)
- **Menu Categories:** 64px top/bottom
- **Cards:** 24px internal padding
- **Page:** 24px side margins (mobile)

---

## Components

### Buttons

#### Primary Button
```css
background: #8B3A3A;
color: #FFFFFF;
border-radius: 8px;
padding: 16px 32px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.5px;
```

#### Secondary Button
```css
background: #D2B48C;
color: #3C2A21;
border-radius: 8px;
padding: 16px 32px;
font-weight: 600;
border: 2px solid #3C2A21;
```

#### CTA Button (Promo)
```css
background: linear-gradient(135deg, #C30139, #FF0000);
color: #FFFFFF;
border-radius: 24px;
padding: 16px 40px;
box-shadow: 0 4px 16px rgba(195, 1, 57, 0.3);
```

### Cards

#### Menu Card
```css
background: #FFFFFF;
border-radius: 12px;
padding: 16px;
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
border: 1px solid #E8DCC8;
```

#### Category Card
```css
background: #F5F0E6;
border-radius: 16px;
padding: 24px;
text-align: center;
transition: transform 0.2s, box-shadow 0.2s;
```

#### Dark Card (Featured)
```css
background: #3C2A21;
color: #FFFFFF;
border-radius: 16px;
padding: 24px;
```

### Badges

| Type | Background | Text | Border Radius |
|------|------------|------|---------------|
| **Popular** | #D4AF37 | #3C2A21 | 12px |
| **New** | #C30139 | #FFFFFF | 4px |
| **GF** | #4CAF50 | #FFFFFF | 4px |
| **Spicy** | #FF5722 | #FFFFFF | 4px |
| **Deal** | #FF0000 | #FFFFFF | 20px (pill) |

---

## Visual Design Principles

### 1. Warm & Welcoming
- Use earthy, warm colors (browns, creams, reds)
- Create a cozy, traditional Asian restaurant atmosphere
- Balance modern cleanliness with cultural authenticity

### 2. High Readability
- Strong contrast between text and backgrounds
- Clear typography hierarchy
- Right-aligned prices for easy scanning
- Generous whitespace

### 3. Visual Hierarchy
- Section headers > Dish names > Descriptions > Prices
- Use color, size, and weight to establish importance
- Group related items visually
- Use dividers and spacing to separate sections

### 4. Mobile-First
- All components designed for mobile first
- Touch-friendly button sizes (min 44px height)
- Responsive typography scaling
- Collapsible categories for small screens

### 5. Appetizing Presentation
- High-quality food photography
- Warm, appetizing color temperature
- Subtle shadows for depth
- Rounded corners for friendly feel

---

## UI Patterns

### Navigation
- **Sticky header** with logo and main navigation
- **Hamburger menu** on mobile (< 768px)
- **Category quick links** with smooth scroll
- **Cart icon** with item count badge

### Menu Display
- **Grid layout** for menu items (2-3 columns desktop, 1 mobile)
- **Filter by category** with pill-shaped buttons
- **Search bar** with icon
- **Sort options** (Popular, Price, Name)

### Product Card
- **Food image** at top (16:9 or 4:3 aspect ratio)
- **Dish name** (bold, larger)
- **Description** (smaller, lighter)
- **Price** (right-aligned, accent color)
- **Add to cart button** (primary, full width)
- **Dietary badges** (top right corner)

### Cart Drawer
- **Slide from right** animation
- **Semi-transparent overlay**
- **Item list** with quantity controls
- **Order summary** section
- **Checkout button** (sticky at bottom)

---

## Animation & Interactions

### Micro-interactions
- **Button hover:** Scale up 2-3%, shadow increase
- **Card hover:** Lift up 4px, shadow enhance
- **Image hover:** Subtle zoom 5%
- **Ripple effect** on button clicks

### Page Transitions
- **Fade in:** 300ms ease-out
- **Slide up:** 300ms ease-out
- **Page load:** Staggered reveal (100ms delays)

### Loading States
- **Skeleton screens** for menu items
- **Spinning loader** with brand color
- **Progressive image loading** with blur-up

---

## Accessibility

### Color Contrast
- All text meets WCAG AA standards (4.5:1 minimum)
- Interactive elements have 3:1 minimum contrast
- Focus indicators visible on all interactive elements

### Keyboard Navigation
- All functionality accessible via keyboard
- Visible focus states
- Logical tab order
- Skip to main content link

### Screen Reader Support
- Semantic HTML elements
- ARIA labels where needed
- Alt text for all images
- Descriptive link text

---

## Icon System

### Icon Library
- **Heroicons** (primary)
- **Lucide Icons** (secondary)
- SVG format for all icons

### Common Icons
- Shopping cart, user, search, menu, close, check, star, heart, phone, location, clock, fire (spicy), leaf (vegetarian), gluten-free

---

## Responsive Breakpoints

```css
/* Mobile First Approach */

/* Mobile: default */
/* Tablet: 640px */
/* Desktop: 1024px */
/* Wide: 1280px */
```

---

## File Naming Convention

```
/images/
  /hero/
    hero-banner.jpg
    hero-banner-mobile.jpg
  /menu/
    {category}-{dish-name}.jpg
  /icons/
    {icon-name}.svg
  /logo/
    logo-primary.svg
    logo-secondary.svg
```

---

## CSS Variables Reference

```css
:root {
  /* Colors */
  --color-primary: #8B3A3A;
  --color-primary-dark: #6B2A2A;
  --color-secondary: #3C2A21;
  --color-accent: #D4AF37;
  --color-accent-red: #C30139;
  --color-cream: #F5F0E6;
  --color-tan: #E8DCC8;
  --color-brown-light: #D2B48C;

  /* Text */
  --text-primary: #000000;
  --text-secondary: #333333;
  --text-on-dark: #FFFFFF;
  --text-muted: #666666;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 300ms ease;
  --transition-slow: 500ms ease;
}
```

---

## Voice & Tone

### Brand Voice
- Warm and welcoming
- Authentic and honest
- Passionate about food
- Family-oriented
- Casual but professional

### Copy Guidelines
- Use simple, clear language
- Highlight freshness and quality
- Mention "made from scratch" where applicable
- Include Vietnamese terms with explanations
- Use sensory language (taste, aroma, texture)

---

## Deliverables Checklist

- [ ] Color palette export (ASE, CSS, SCSS)
- [ ] Typography kit (fonts, sizes, weights)
- [ ] Component library (buttons, cards, forms)
- [ ] Icon set (SVG, PNG)
- [ ] Logo variations (primary, secondary, icon-only)
- [ ] Image guidelines (specs, treatments)
- [ ] Responsive mockups (mobile, tablet, desktop)
- [ ] Design tokens documentation
- [ ] Animation examples
- [ ] Accessibility checklist

---

*Last Updated: January 2026*
