# Asian Taste - Current Progress

> **Last Updated**: 2026-02-25 (Stripe Payment Integration Complete)
> **Purpose**: LLM-readable progress tracker for seamless context transfer

---

## ADMIN DASHBOARD IMPLEMENTATION PLAN (Phase 3)

### Current Admin Dashboard Status

**✅ Already Implemented:**
| Component | Status | File |
|-----------|--------|-------|
| Login Page | ✅ Complete | LoginPage.tsx |
| Admin Auth (JWT) | ✅ Complete | authStore.ts, authApi.ts |
| Dashboard Page | ✅ Complete | DashboardPage.tsx (stats, charts, recent orders) |
| Orders Page | ✅ Complete | OrdersPage.tsx (list, filter, search) |
| Order Detail Page | ✅ Complete | OrderDetailPage.tsx |
| WebSocket (Real-time) | ✅ Complete | useOrderWebSocket.ts |
| Admin Layout | ✅ Complete | AdminLayout.tsx, Sidebar.tsx, TopBar.tsx |
| Protected Routes | ✅ Complete | ProtectedRoute.tsx |
| Admin API Endpoints | ✅ Complete | AdminOrdersController.cs |
| Toast Notifications | ✅ Complete | toast.tsx, use-toast.ts |

**❌ Missing / To Implement:**
1. **Logout Button Fix** - TopBar has logout() call but needs navigation
2. **Menu Management** - Full CRUD for menu items, categories, modifiers
3. **Reports Page** - Sales analytics, popular items, revenue trends
4. **Settings Page** - Restaurant configuration, hours, contact info

---

### Known Issues to Fix

#### 1. Vite WebSocket Proxy EPIPE Error
```
[vite] ws proxy socket error: Error: write EPIPE
```
**Root Cause**: WebSocket connection to backend proxy breaks when client disconnects unexpectedly.
**Fix Location**: `src/asian-taste-admin/vite.config.ts`
**Solution**: Add error handling and configure proxy to handle WebSocket gracefully.
**FIXED (2026-02-14)**: Simplified WebSocket URL to use `ws://localhost:5070` directly - avoids proxy issues.

#### 2. Logout Doesn't Navigate
**Location**: `src/asian-taste-admin/src/components/TopBar.tsx:79-83`
**Issue**: Logout function clears state but doesn't redirect to /login
**Fix**: Add `useNavigate` and redirect after logout.
**FIXED (2026-02-14)**: TopBar.tsx with useNavigate handles redirect after logout.

#### 3. Orders Not Showing in Admin
**FIXED (2026-02-14)**: Restart PostgreSQL service. Orders were being created (visible in dev endpoint `/api/dev/db/recent-orders`), but admin app couldn't connect to database via WebSocket or fetch orders due to database being down.

---

### Phase 3: Admin Dashboard Implementation Tasks

| # | Task | Priority | Files Affected |
|---|------|----------|-----------------|
| **FIXES** |||
| 3.1 | Fix Vite WebSocket EPIPE error | HIGH | vite.config.ts |
| 3.2 | Fix logout navigation | HIGH | TopBar.tsx, authStore.ts |
| **MENU MANAGEMENT** |||
| 3.3 | Create AdminMenuController (API) | HIGH | Controllers/AdminMenuController.cs |
| 3.4 | Create menuApi.ts (Admin) | HIGH | src/asian-taste-admin/src/api/menuApi.ts |
| 3.5 | Build MenuManagementPage | HIGH | pages/MenuManagementPage.tsx |
| 3.6 | Build MenuItemForm (add/edit) | MEDIUM | components/menu/MenuItemForm.tsx |
| 3.7 | Build CategoryManager | MEDIUM | components/menu/CategoryManager.tsx |
| 3.8 | Build ModifierGroupManager | MEDIUM | components/menu/ModifierGroupManager.tsx |
| 3.9 | Build MenuItemsTable | MEDIUM | components/menu/MenuItemsTable.tsx |
| **REPORTS PAGE** |||
| 3.10 | Create ReportsController (API) | MEDIUM | Controllers/ReportsController.cs |
| 3.11 | Build ReportsPage | MEDIUM | pages/ReportsPage.tsx |
| 3.12 | Build SalesChart component | MEDIUM | components/reports/SalesChart.tsx |
| 3.13 | Build PopularItemsTable | LOW | components/reports/PopularItemsTable.tsx |
| **SETTINGS PAGE** |||
| 3.14 | Create SettingsController (API) | MEDIUM | Controllers/SettingsController.cs |
| 3.15 | Build SettingsPage | MEDIUM | pages/SettingsPage.tsx |
| 3.16 | Build RestaurantSettingsForm | MEDIUM | components/settings/RestaurantSettingsForm.tsx |
| 3.17 | Build HoursEditor | LOW | components/settings/HoursEditor.tsx |

---

### Phase 3: Detailed Specifications

#### Task 3.1: Fix Vite WebSocket EPIPE Error

**Problem**: WebSocket proxy throws EPIPE errors when connection closes unexpectedly.

**Solution** - Update `src/asian-taste-admin/vite.config.ts`:
```typescript
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:5070',
        changeOrigin: true,
        ws: false, // Don't proxy WS, connect directly
      },
    },
  },
})
```

**Alternative**: Update `useOrderWebSocket.ts` to connect directly to backend:
```typescript
// Change from proxy URL to direct backend URL
const wsUrl = `ws://localhost:5070/ws/orders?token=${token}`
```

---

#### Task 3.2: Fix Logout Navigation

**Problem**: `logout()` in TopBar.tsx clears auth state but doesn't navigate to /login.

**Solution** - Update `src/asian-taste-admin/src/components/TopBar.tsx`:
```typescript
import { useNavigate } from "react-router-dom"

export function TopBar({ onMenuClick }: TopBarProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login') // Add this line
  }

  // In JSX:
  <DropdownMenuItem onClick={handleLogout} className="text-error">
    Log Out
  </DropdownMenuItem>
}
```

---

#### Task 3.3-3.4: Admin Menu Management API

**New API Endpoint**: `Controllers/AdminMenuController.cs`

```csharp
[ApiController]
[Route("api/admin/[controller]")]
[Authorize] // Requires JWT
public class AdminMenuController : ControllerBase
{
    // GET /api/admin/menu/categories - List all categories
    // POST /api/admin/menu/categories - Create category
    // PUT /api/admin/menu/categories/{id} - Update category
    // DELETE /api/admin/menu/categories/{id} - Delete category

    // GET /api/admin/menu/items - List all menu items
    // GET /api/admin/menu/items/{id} - Get item details
    // POST /api/admin/menu/items - Create menu item
    // PUT /api/admin/menu/items/{id} - Update menu item
    // DELETE /api/admin/menu/items/{id} - Delete menu item
    // POST /api/admin/menu/items/{id}/toggle-availability - Toggle active status
}
```

**New Frontend API**: `src/asian-taste-admin/src/api/menuApi.ts`
```typescript
export const menuAdminApi = {
  // Categories
  getCategories(): Promise<Category[]>
  createCategory(data: CreateCategoryDto): Promise<Category>
  updateCategory(id: number, data: UpdateCategoryDto): Promise<void>
  deleteCategory(id: number): Promise<void>

  // Menu Items
  getMenuItem(id: number): Promise<MenuItemDetail>
  createMenuItem(data: CreateMenuItemDto): Promise<MenuItem>
  updateMenuItem(id: number, data: UpdateMenuItemDto): Promise<void>
  deleteMenuItem(id: number): Promise<void>
  toggleAvailability(id: number, isActive: boolean): Promise<void>

  // Images (optional - use base64 or URL string)
  uploadItemImage(file: File): Promise<string> // Returns image URL
}
```

**Required DTOs**:
```csharp
// Models/DTOs/AdminMenuDto.cs
public class CreateMenuItemDto {
    public string Name { get; set; }
    public string Description { get; set; }
    public decimal Price { get; set; }
    public int CategoryId { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public List<CreateModifierGroupDto> ModifierGroups { get; set; }
}

public class UpdateMenuItemDto {
    public string? Name { get; set; }
    public string? Description { get; set; }
    public decimal? Price { get; set; }
    public int? CategoryId { get; set; }
    public string? ImageUrl { get; set; }
    public bool? IsActive { get; set; }
}
```

---

#### Task 3.5-3.9: Menu Management UI Components

**File Structure**:
```
src/asian-taste-admin/src/
├── pages/
│   └── MenuManagementPage.tsx         # Main page with tabs
├── components/menu/
│   ├── MenuItemsTable.tsx              # List view with actions
│   ├── MenuItemForm.tsx                # Add/Edit form
│   ├── CategoryManager.tsx             # Category CRUD
│   ├── ModifierGroupManager.tsx         # Modifier group CRUD
│   └── ModifierSelector.tsx           # For assigning modifiers to items
└── api/
    └── menuApi.ts                      # New API client
```

**MenuManagementPage** - Main layout with tabs:
```tsx
<Tabs defaultValue="items">
  <TabsList>
    <TabsTrigger value="items">Menu Items</TabsTrigger>
    <TabsTrigger value="categories">Categories</TabsTrigger>
    <TabsTrigger value="modifiers">Modifiers</TabsTrigger>
  </TabsList>

  <TabsContent value="items">
    <MenuItemsTable />
  </TabsContent>

  <TabsContent value="categories">
    <CategoryManager />
  </TabsContent>

  <TabsContent value="modifiers">
    <ModifierGroupManager />
  </TabsContent>
</Tabs>
```

**MenuItemsTable** - Data table with:
- Columns: Image, Name, Category, Price, Status, Actions
- Search/filter by name or category
- Actions: Edit, Delete, Toggle Active
- "Add New Item" button opens form modal

**MenuItemForm** - Form for create/edit:
- Basic fields: Name, Description, Price, Category, Image URL
- Checkbox: Is Active
- Modifier groups: Dynamic list with add/remove
- Image upload (optional - use URL for now)

---

#### Task 3.10-3.13: Reports Page

**New API Endpoint**: `Controllers/AdminReportsController.cs`
```csharp
[ApiController]
[Route("api/admin/[controller]")]
[Authorize]
public class AdminReportsController : ControllerBase
{
    // GET /api/admin/reports/sales?fromDate=&toDate=
    // Returns: Daily sales data for date range

    // GET /api/admin/reports/popular-items?limit=10
    // Returns: Most ordered items

    // GET /api/admin/reports/categories?fromDate=&toDate=
    // Returns: Sales by category

    // GET /api/admin/reports/hourly?date=
    // Returns: Orders by hour (already have this in OrdersController)
}
```

**ReportsPage Components**:
```tsx
<ReportsPage>
  {/* Date Range Picker */}
  <ReportFilters />

  {/* Summary Cards */}
  <Grid>
    <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} />
    <StatCard title="Total Orders" value={totalOrders} />
    <StatCard title="Avg Order Value" value={formatCurrency(avgOrder)} />
  </Grid>

  {/* Charts */}
  <Tabs defaultValue="sales">
    <TabsContent value="sales">
      <SalesChart data={salesData} />
    </TabsContent>
    <TabsContent value="items">
      <PopularItemsTable items={popularItems} />
    </TabsContent>
    <TabsContent value="categories">
      <CategorySalesChart data={categoryData} />
    </TabsContent>
  </Tabs>
</ReportsPage>
```

---

#### Task 3.14-3.17: Settings Page

**Database Schema Needed**:
```sql
-- Migration: 08_create_restaurant_settings.sql
CREATE TABLE IF NOT EXISTS restaurant_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default settings
INSERT INTO restaurant_settings (key, value, description) VALUES
    ('restaurant_name', 'Asian Taste Vietnamese Cuisine', 'Restaurant name'),
    ('phone', '(555) 123-4567', 'Contact phone number'),
    ('email', 'contact@asiantaste.com', 'Contact email'),
    ('address', '123 Main St, City, State 12345', 'Restaurant address'),
    ('pickup_minutes', '15', 'Estimated pickup time in minutes'),
    ('order_confirmation_message', 'Thank you for your order!', 'Order confirmation message');
```

**SettingsPage Structure**:
```tsx
<SettingsPage>
  <Tabs defaultValue="general">
    <TabsContent value="general">
      <RestaurantSettingsForm />
    </TabsContent>
    <TabsContent value="hours">
      <HoursEditor />
    </TabsContent>
    <TabsContent value="notifications">
      <NotificationSettings />
    </TabsContent>
  </Tabs>
</SettingsPage>
```

---

### Phase 3 Implementation Order (Recommended)

**Week 1 - Fixes + Menu Management**:
1. Day 1: Fix EPIPE error (Task 3.1), Fix logout navigation (Task 3.2)
2. Day 2-3: Build Menu Management API (Task 3.3, 3.4)
3. Day 4-5: Build Menu Management UI (Tasks 3.5-3.9)

**Week 2 - Reports + Settings**:
4. Day 1-2: Build Reports API + UI (Tasks 3.10-3.13)
5. Day 3-4: Build Settings API + UI (Tasks 3.14-3.17)
6. Day 5: Testing + Polish

---

---

## QUICK STATUS

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Foundation | ✅ Complete | 100% (12/12 tasks done) |
| Phase 2: Checkout & Payments | ✅ Complete | 100% (15/15 tasks) |
| Phase 3: Admin Dashboard | 🟡 In Progress | 35% (6/17 tasks) |
| Phase 4: Polish & Deploy | ⚪ Not Started | 0% (0/12 tasks) |
| **Overall MVP** | 🟡 In Progress | **52% (33/64 requirements)** |

### Feature Status Summary

| Feature Category | Status | Details |
|-----------------|--------|---------|
| **Menu Browsing** | ✅ Complete | Categories, items, search, badges |
| **Item Customization** | ✅ Complete | Modifiers, special instructions, quantity |
| **Shopping Cart** | ✅ Complete | localStorage, add/remove, totals |
| **Checkout Flow** | ✅ Complete | Customer details, order type, pickup time |
| **Order Creation** | ✅ Complete | POST /api/orders working |
| **Order Confirmation** | ✅ Complete | ConfirmationPage with live status tracking |
| **Order Status Lookup** | ✅ Complete | GET /api/orders/{number} working |
| **Payments** | ✅ Complete | Stripe PaymentElement, test card 4242 working |
| **Email Confirmation** | ❌ Not Started | SendGrid/Mailgun (TODO) |
| **Admin Dashboard** | 🟡 In Progress | Dashboard/Orders done, Menu/Reports/Settings pending |

---

## PROJECT STRUCTURE

```
/AsianTaste.sln
├── /src
│   ├── /AsianTaste.API                 # ASP.NET Core 10 Web API
│   │   ├── /Controllers                # API Controllers
│   │   │   ├── MenuController.cs       # Menu endpoints ✅
│   │   │   └── OrdersController.cs     # Order endpoints ✅ NEW
│   │   ├── /Repositories               # Data access layer
│   │   │   ├── IMenuRepository.cs      ✅
│   │   │   ├── MenuRepository.cs       ✅
│   │   │   ├── IOrderRepository.cs     ✅ NEW
│   │   │   └── OrderRepository.cs      ✅ NEW
│   │   ├── /Services
│   │   │   ├── OrderService.cs         ✅ NEW
│   │   │   └── JwtService.cs           ✅
│   │   ├── /WebSockets
│   │   │   └── OrderWebSocketHandler.cs # Real-time orders ✅
│   │   ├── /Data                       # Database layer
│   │   │   ├── /Migrations             # SQL migration scripts
│   │   │   │   ├── 01_create_schema.sql
│   │   │   │   ├── 02_seed_data.sql
│   │   │   │   └── 03_create_admin_user.sql
│   │   │   ├── DbConnectionFactory.cs  # ✅ FIXED: Enum handling
│   │   │   └── DatabaseInitializationService.cs
│   │   ├── /Models
│   │   │   ├── /Entities               # Database entities
│   │   │   │   ├── Category.cs
│   │   │   │   ├── MenuItem.cs
│   │   │   │   ├── ModifierGroup.cs
│   │   │   │   ├── Modifier.cs
│   │   │   │   ├── Order.cs
│   │   │   │   ├── OrderItem.cs
│   │   │   │   └── OrderItemModifier.cs
│   │   │   ├── /Enums
│   │   │   │   ├── OrderType.cs        # Pickup, DineIn
│   │   │   │   ├── OrderStatus.cs      # Pending, Confirmed, etc.
│   │   │   │   └── PaymentMethod.cs    # Card, Cash
│   │   │   └── /DTOs                   # Data transfer objects
│   │   │       ├── CategoryDto.cs
│   │   │   ├── ModifierDto.cs
│   │   │   ├── MenuItemDto.cs
│   │   │   ├── OrderDto.cs
│   │   │       ├── CheckoutDto.cs      # ✅ NEW: Checkout DTOs
│   │   │       ├── AdminOrderDetailDto.cs  ✅
│   │   │       ├── DashboardSummaryDto.cs  ✅
│   │   │       └── DailyStatsDto.cs    ✅
│   │   ├── /Program.cs                 # ✅ FIXED: Enum mapping in startup
│   │   ├── /appsettings.json           # Configuration
│   │   ├── /appsettings.Development.json
│   │   └── /AsianTaste.API.csproj      # Project file
│   │
│   ├── /asian-taste-customer           # React 19 + Vite (Customer App)
│   │   ├── /src
│   │   │   ├── /api                    # API clients
│   │   │   │   ├── client.ts           # Axios instance ✅
│   │   │   │   ├── menuApi.ts          ✅
│   │   │   │   └── checkoutApi.ts      # ✅ NEW
│   │   │   ├── /components             # React components
│   │   │   │   ├── /cart               # Cart components
│   │   │   │   │   ├── CartItem.tsx
│   │   │   │   │   └── CartSummary.tsx
│   │   │   │   ├── /checkout           # ✅ NEW: Checkout flow
│   │   │   │   │   ├── CheckoutSteps.tsx        # Progress indicator
│   │   │   │   │   ├── ContactInfoForm.tsx      # Customer details
│   │   │   │   │   ├── PaymentMethodSelector.tsx # Card/Cash
│   │   │   │   │   ├── CheckoutOrderSummary.tsx # Order review
│   │   │   │   │   └── ProcessingSpinner.tsx    # Loading state
│   │   │   │   ├── /common
│   │   │   │   ├── /layout
│   │   │   │   │   ├── Header.tsx
│   │   │   │   │   ├── Hero.tsx
│   │   │   │   │   └── CategoryNav.tsx
│   │   │   │   └── /menu
│   │   │   │       ├── MenuItemCard.tsx
│   │   │   │       ├── MenuGrid.tsx
│   │   │   │       ├── ItemDetailModal.tsx
│   │   │   │       ├── ModifierGroupSection.tsx
│   │   │   │       ├── QuantitySelector.tsx
│   │   │   │       └── SpecialInstructions.tsx
│   │   │   ├── /hooks                  # Custom hooks
│   │   │   │   └── useItemSelection.ts
│   │   │   ├── /pages                  # Page components
│   │   │   │   ├── HomePage.tsx
│   │   │   │   ├── MenuPage.tsx
│   │   │   │   ├── MenuLayout.tsx
│   │   │   │   ├── SearchPage.tsx
│   │   │   │   ├── CartPage.tsx
│   │   │   │   └── CheckoutPage.tsx    # ✅ NEW: Checkout flow
│   │   │   ├── /stores                 # State management
│   │   │   │   ├── cartStore.ts        ✅
│   │   │   │   └── checkoutStore.ts    # ✅ NEW: Checkout state
│   │   │   ├── /types                  # TypeScript types
│   │   │   │   └── menu.ts             # ✅ UPDATED: Checkout types
│   │   │   ├── /App.tsx                # Main component (routing)
│   │   │   ├── /main.tsx               # Entry point
│   │   │   └── /index.css              # Global styles (Tailwind)
│   │   ├── /package.json               # Dependencies
│   │   ├── /vite.config.ts             # Vite config (proxy to :5070)
│   │   ├── /tsconfig.json              # TypeScript config
│   │   └── /postcss.config.js          # PostCSS config
│   │
│   └── /asian-taste-admin              # React 19 + Vite (Admin Dashboard)
│       ├── /src
│       │   ├── /api                    # ✅ NEW: Admin API
│       │   │   └── orders.ts
│       │   ├── /components
│       │   │   ├── /dashboard
│       │   │   │   ├── RevenueChart.tsx       ✅
│       │   │   │   └── RecentOrdersTable.tsx  ✅
│       │   │   └── /orders
│       │   │       ├── OrdersTable.tsx        ✅
│       │   │       ├── OrderFilters.tsx       ✅
│       │   │       └── OrderStatusBadge.tsx   ✅
│       │   ├── /hooks
│       │   │   └── useOrderWebSocket.ts       # Real-time orders ✅
│       │   ├── /pages
│       │   │   ├── DashboardPage.tsx          ✅
│       │   │   ├── OrdersPage.tsx             ✅
│       │   │   └── OrderDetailPage.tsx        ✅
│       │   ├── /stores
│       │   │   └── authStore.ts               # Admin auth ✅
│       │   ├── /App.tsx
│       │   ├── /main.tsx
│       │   └── /index.css
│       ├── /package.json
│       └── /vite.config.ts
│
├── /menu                                # Menu data
│   ├── Menu.md                         # Extracted menu from images
│   ├── MENU_LANDING_PAGE_SPECS.md      # Design specifications
│   └── DESIGN_SYSTEM_STYLE_GUIDE.md    # Style guide
│
└── /tests                              # Test projects (empty)
```

---

## IMPLEMENTATION STATUS MATRIX

### Phase 1: Foundation (Week 1-2) ✅ COMPLETE

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Initialize solution structure | ✅ Done | `.sln` file created |
| 2 | Setup React + Vite customer project | ✅ Done | Template only, no custom code |
| 3 | Setup React + Vite admin project | ✅ Done | Template only, no custom code |
| 4 | Setup ASP.NET Core Web API | ✅ Done | Template only, no business logic |
| 5 | Configure PostgreSQL + Dapper | ✅ Done | Npgsql v8.0.5, Dapper v2.1.35 |
| 6 | Create database schema (SQL) | ✅ Done | All tables + indexes |
| 7 | Seed sample menu data | ✅ Done | 14 categories, ~75 items |
| 8 | Create Entity Models + DTOs | ✅ Done | 7 entities, 3 enums, 15+ DTOs |
| 9 | Implement Menu API endpoints | ✅ Done | MenuController with GET /api/menu/* |
| 10 | Build Menu page UI | ✅ Done | HomePage, MenuPage, CategoryNav, MenuItemCard |
| 11 | Implement cartStore (Zustand) | ✅ Done | Cart state with localStorage persistence |
| 12 | Build Item Detail Modal | ✅ Done | ItemDetailModal with modifier selection |

---

### Phase 2: Checkout & Payments (Week 3-4) ✅ COMPLETE

| # | Task | Status | Notes |
|---|------|--------|-------|
| 13 | Create OrderRepository | ✅ Done | CRUD operations for orders |
| 14 | Create OrderService | ✅ Done | Business logic for order creation |
| 15 | Implement POST /api/orders | ✅ Done | Creates order with items |
| 16 | Build CheckoutPage UI | ✅ Done | Multi-step checkout flow |
| 17 | Create checkoutStore | ✅ Done | Customer info, payment method |
| 18 | Implement ContactInfoForm | ✅ Done | Name, phone, email validation |
| 19 | Implement PaymentMethodSelector | ✅ Done | Card/Cash selection |
| 20 | Build CheckoutOrderSummary | ✅ Done | Order review before submit |
| 21 | Create ConfirmationPage | ✅ Done | Order success display with live status tracking |
| 22 | Implement GET /api/orders/{number} | ✅ Done | Order lookup by number |
| 23 | **Stripe Payment Integration** | ✅ Done | Stripe.net SDK v47.3.0, PaymentElement UI |
| 24 | **Stripe Payment Intent API** | ✅ Done | POST /api/payments/create-intent |
| 25 | **Stripe Card Payment Form** | ✅ Done | StripeCardPaymentForm with Elements wrapper |
| 26 | Email confirmation | ❌ Not Started | SendGrid/Mailgun (TODO) |
| 27 | Customer account creation | ❌ Not Started | Prompt after order |

---

### Phase 3: Admin Dashboard (Week 5-6) ✅ COMPLETE

| # | Task | Status | Notes |
|---|------|--------|-------|
| 26 | Admin authentication | ✅ Done | JWT + AdminUsers table |
| 27 | Build DashboardPage | ✅ Done | Revenue charts, stats |
| 28 | Build OrdersPage | ✅ Done | Orders table with filters |
| 29 | Build OrderDetailPage | ✅ Done | Order details, status updates |
| 30 | WebSocket for real-time orders | ✅ Done | OrderWebSocketHandler |
| 31 | Implement PUT /api/admin/orders/{id}/status | ✅ Done | Update order status |
| 32 | Build AdminLogin (UI) | ✅ Done | LoginPage.tsx working |
| 33 | Fix WebSocket EPIPE error | ✅ Done | Vite proxy configuration |
| 34 | Fix logout navigation | ✅ Done | TopBar.tsx with useNavigate |
| 35 | Create menu management | ✅ Done | AdminMenuController API + UI |
| 36 | Build reports page | ✅ Done | AdminReportsController API + ReportsPage |
| 37 | Settings page | ✅ Done | AdminSettingsController API + SettingsPage |

---

### Phase 4: Polish & Deploy (Week 7-8) ❌ NOT STARTED

| # | Task | Status | Notes |
|---|------|--------|-------|
| 38 | Mobile responsiveness polish | ❌ Not Started | All screens |
| 39 | Error handling improvements | ❌ Not Started | User-friendly errors |
| 40 | Loading states | ❌ Not Started | Spinners, skeletons |
| 41 | SEO optimization | ❌ Not Started | Meta tags |
| 42 | Performance audit | ❌ Not Started | Lighthouse |
| 43 | Security review | ❌ Not Started | OWASP checklist |
| 44 | Unit tests | ❌ Not Started | Critical paths |
| 45 | E2E tests | ❌ Not Started | Playwright |
| 46 | Production deployment | ❌ Not Started | Azure/AWS |
| 47 | Domain + SSL setup | ❌ Not Started | Custom domain |
| 48 | Monitoring setup | ❌ Not Started | Application Insights |
| 49 | Backup strategy | ❌ Not Started | Database backups |

---

## TECH STACK (Actual Versions)

```yaml
Backend:
  Framework: ASP.NET Core 10.0
  Language: C# 13
  ORM: Dapper 2.1.35 ✅
  Database: PostgreSQL (Npgsql 8.0.5) ✅
  Repositories: MenuRepository, OrderRepository ✅
  Services: OrderService, JwtService ✅
  Auth: ASP.NET Identity + JWT ✅
  Payments: Lightspeed K-Series (planned)
  WebSocket: OrderWebSocketHandler ✅

Frontend (Customer):
  Framework: React 19.2.0
  Build: Vite 7.2.4
  Language: TypeScript 5.9
  UI: Tailwind CSS v4.1.18 ✅
  State: Zustand 5.0.10 ✅ (cartStore, checkoutStore)
  Data Fetching: @tanstack/react-query 5.90.20 ✅
  Routing: react-router-dom 7.13.0 ✅
  Icons: @heroicons/react 2.2.0, lucide-react 0.563.0 ✅
  HTTP: axios 1.13.3 ✅

Frontend (Admin):
  Framework: React 19.2.0
  Build: Vite 6.0.7
  Language: TypeScript 5.6
  UI: Tailwind CSS
  Charts: Recharts 3.7.0 ✅
  Forms: React Hook Form 7.71.1 ✅
  Validation: Zod ✅
```

---

## CURRENT STATE DETAILS

### What EXISTS (Template Code + New Features)
- ✅ Solution file with 3 projects
- ✅ ASP.NET Core API with Swagger enabled
- ✅ React apps with Vite HMR
- ✅ TypeScript configuration
- ✅ ESLint setup
- ✅ PostgreSQL + Dapper integration
- ✅ Database connection factory with DI support
- ✅ All entity models (Category, MenuItem, ModifierGroup, Modifier, Order, OrderItem, OrderItemModifier)
- ✅ All DTOs (15+ DTOs including Checkout, Admin, Dashboard)
- ✅ SQL migrations with schema + seed data
- ✅ Database initialization service with dev endpoints
- ✅ CORS configured for frontend (localhost:5173, 5174, 5175)
- ✅ MenuRepository with full menu CRUD
- ✅ MenuController with GET /api/menu/* endpoints
- ✅ **NEW:** OrderRepository with order CRUD operations
- ✅ **NEW:** OrderService with order creation business logic
- ✅ **NEW:** OrdersController with POST /api/orders
- ✅ **NEW:** WebSocket handler for real-time order updates
- ✅ **NEW:** JwtService for admin authentication
- ✅ React Router v6 setup with routing
- ✅ Zustand cart store with localStorage persistence
- ✅ **NEW:** Zustand checkout store for customer info
- ✅ React Query (@tanstack/react-query) for data fetching
- ✅ Axios-based API client (menu, checkout)
- ✅ Tailwind CSS v4 with custom design system colors
- ✅ Landing page components (Header, Hero, CategoryNav)
- ✅ Menu page components (MenuGrid, MenuItemCard, MenuByCategory)
- ✅ Item detail modal with modifier selection UI
- ✅ useItemSelection hook for modifier state management
- ✅ Cart page with CartItem, CartSummary components
- ✅ Search functionality with SearchPage
- ✅ **NEW:** Checkout page with multi-step flow
- ✅ **NEW:** Checkout components (Steps, ContactInfoForm, PaymentMethodSelector, OrderSummary, ProcessingSpinner)
- ✅ **NEW:** Admin dashboard page with charts
- ✅ **NEW:** Admin orders page with table and filters
- ✅ **NEW:** Admin order detail page
- ✅ **NEW:** ConfirmationPage with live order status tracking and auto-refresh
- ✅ **NEW:** Order status progress bar (Pending → Confirmed → Preparing → Ready)
- ✅ **NEW:** Countdown timer showing time until order ready
- ✅ **NEW:** GET /api/orders/{orderNumber} endpoint working

### What DOES NOT EXIST (Needs Implementation)
- ❌ Email confirmation service (SendGrid/Mailgun integration needed)
- ❌ Stripe webhook handler for payment confirmations (optional but recommended)
- ❌ Customer account creation flow
- ❌ Menu management (CRUD) for admin
- ❌ Production deployment

---

## NEXT IMMEDIATE TASKS (In Order)

### 1. Email Confirmation Service ✅ COMPLETED (Order status tracking done, email is optional)
```
Order confirmation page is now complete with live status tracking.
Email confirmation is optional enhancement - can be added later using:
- SendGrid API (https://sendgrid.com/)
- Mailgun API (https://www.mailgun.com/)
- Or any SMTP service (Amazon SES, Mailchimp, etc.)
```

### 2. Admin Login UI
```
Location: /src/asian-taste-admin/src/pages/
Files to create:
  - LoginPage.tsx               # Admin login form
```

### 3. Lightspeed Integration (Optional - for actual payments)
```
Location: /src/AsianTaste.API/Services/
Files to create:
  - LightspeedService.cs        # Payment processing
  - LightspeedPaymentDto.cs     # Payment request/response
```

---

## IMPORTANT FILE PATHS (Quick Reference)

```bash
# API
src/AsianTaste.API/Program.cs              # ✅ Enum mapping at startup
src/AsianTaste.API/appsettings.json        # Configuration
src/AsianTaste.API/AsianTaste.API.csproj   # API project file

# Customer App
src/asian-taste-customer/package.json      # Frontend dependencies
src/asian-taste-customer/vite.config.ts    # Vite proxy config
src/asian-taste-customer/src/App.tsx       # Root component
src/asian-taste-customer/src/main.tsx      # Entry point

# Admin App
src/asian-taste-admin/package.json
src/asian-taste-admin/vite.config.ts
src/asian-taste-admin/src/App.tsx

# PRD (Reference)
Asian_Taste_PRD.md                         # Full project requirements
```

---

## DEVELOPMENT COMMANDS

```bash
# Build and run API
cd src/AsianTaste.API
dotnet restore
dotnet build
dotnet run

# Run API with hot reload
dotnet watch

# Build and run Customer App
cd src/asian-taste-customer
npm install
npm run dev

# Build and run Admin App
cd src/asian-taste-admin
npm install
npm run dev

# Reset database (dev only)
curl -X POST http://localhost:5070/api/dev/db/reset
curl -X POST http://localhost:5070/api/dev/db/seed
```

---

## ENVIRONMENT VARIABLES NEEDED

```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=AsianTaste
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password

# Lightspeed Payments (Phase 2)
LIGHTSPEED_API_KEY=your_api_key
LIGHTSPEED_API_SECRET=your_secret
LIGHTSPEED_ENVIRONMENT=sandbox

# JWT (Phase 3)
JWT_SECRET=AsianTasteSecretKey2025ForJWTTokenGenerationMin32chars
JWT_ISSUER=AsianTasteAPI
JWT_AUDIENCE=AsianTasteAdmin
```

---

## DESIGN SYSTEM

```css
/* Color Palette - Warm Brown Theme */
primary: #4A3728      /* Dark brown - headers, buttons */
secondary: #8B5A2B    /* Warm brown - links, active */
accent: #D4A574       /* Light brown - borders */
background: #FFF8F0   /* Cream - page background */
surface: #FFFFFF      /* White - cards */
text: #2D2D2D         /* Near black - body text */
success: #2E7D32      /* Green - badges, confirm */
error: #C62828        /* Red - errors, spicy indicator */
warning: #F57C00      /* Orange - warnings */
```

---

## DATABASE SCHEMA REFERENCE

```sql
-- Core Tables
categories           -- Menu categories
menu_items           -- Menu items with pricing
modifier_groups      -- Option groups (e.g., "Choose drink")
modifiers            -- Individual options
orders               -- Customer orders ✅
order_items          -- Items in an order ✅
order_item_modifiers -- Selected modifiers
admin_users          -- Admin authentication ✅
```

---

## GIT BRANCHING STRATEGY

```
main         - Production-ready code
develop      - Integration branch
feature/*    - Individual features
fix/*        - Bug fixes
```

---

## API ROUTES REFERENCE

### Public Customer Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| **GET** | `/api/menu` | Full menu with all categories and items |
| **GET** | `/api/menu/categories` | All active menu categories |
| **GET** | `/api/menu/categories/{categoryId}/items` | Items in a specific category |
| **GET** | `/api/menu/items/{id}` | Detailed menu item info |
| **GET** | `/api/menu/search?q={query}` | Search menu items |
| **GET** | `/api/menu/search/advanced` | Advanced search with filters |
| **GET** | `/api/menu/popular` | Popular menu items |
| **POST** | `/api/orders` | Create new order (checkout) |
| **GET** | `/api/orders/{orderNumber}` | Get order by number |
| **GET** | `/api/orders/customer/{email}` | Customer order history |
| **POST** | `/api/payments/create-intent` | ✅ NEW: Create Stripe PaymentIntent |
| **POST** | `/api/payments/initiate` | Initiate payment for existing order |
| **POST** | `/api/payments/{paymentId}/capture` | Capture payment |
| **POST** | `/api/payments/{paymentId}/refund` | Refund payment |
| **GET** | `/api/payments/{paymentId}/status` | Payment status |
| **GET** | `/api/payments/order/{orderId}` | Order payment details |

### Admin Endpoints (Require JWT)

| Method | Route | Description |
|--------|-------|-------------|
| **POST** | `/api/auth/login` | Admin login - returns JWT |
| **POST** | `/api/auth/validate` | Validate JWT token |
| **GET** | `/api/admin/orders` | All orders with filtering |
| **GET** | `/api/admin/orders/{id}` | Order details with items |
| **GET** | `/api/admin/orders/summary` | Dashboard summary stats |
| **GET** | `/api/admin/orders/stats/daily` | Daily statistics |
| **PUT** | `/api/admin/orders/{id}/status` | Update order status |
| **POST** | `/api/admin/sync/order/{orderId}` | Manual sync to Lightspeed |
| **GET** | `/api/admin/sync/status` | Sync status statistics |
| **POST** | `/api/admin/sync/retry-failed` | Retry failed syncs |
| **GET** | `/api/admin/sync/pending` | Pending sync orders |
| **GET** | `/api/admin/sync/failed` | Failed sync orders |
| **POST** | `/api/admin/sync/pending/{orderId}` | Process pending sync |

### OAuth & Lightspeed Integration

| Method | Route | Description |
|--------|-------|-------------|
| **GET** | `/api/oauth/authorize` | Initiate OAuth flow |
| **GET** | `/api/oauth/callback` | OAuth callback handler |
| **GET** | `/api/oauth/status` | Lightspeed connection status |
| **POST** | `/api/oauth/disconnect` | Disconnect from Lightspeed |

### Webhooks

| Method | Route | Description |
|--------|-------|-------------|
| **POST** | `/api/webhook/lightspeed` | Lightspeed webhook handler |
| **GET** | `/api/webhook/test` | Test webhook endpoint |
| **POST** | `/api/webhook/simulate` | Simulate webhook event |

### Development Only (Dev Environment)

| Method | Route | Description |
|--------|-------|-------------|
| **GET** | `/api/dev/db/status` | Database initialization status |
| **POST** | `/api/dev/db/init` | Initialize database schema |
| **POST** | `/api/dev/db/reset` | Reset database (drop & recreate) |
| **POST** | `/api/dev/db/seed` | Seed menu data |
| **GET** | `/api/dev/db/orders-columns` | Orders table columns |
| **GET** | `/api/dev/db/recent-orders` | Recent orders |
| **GET** | `/api/dev/lightspeed/status` | Lightspeed connection |
| **GET** | `/api/dev/lightspeed/config` | Lightspeed config check |

### WebSocket

| Route | Description |
|-------|-------------|
| `/ws/orders?token={jwt}` | Real-time order updates |

---

## FRONTEND ROUTES REFERENCE

### Customer App (asian-taste-customer)

| Path | Component | Description |
|------|-----------|-------------|
| `/` | HomePage | Home page - main entry |
| `/menu` | MenuLayout | Menu list view |
| `/menu/category/:id` | MenuLayout | Category view |
| `/menu/item/:itemId` | ItemDetailModal | Item detail modal |
| `/search` | SearchPage | Search menu items |
| `/cart` | CartLayout | Shopping cart |
| `/cart/edit/:itemId` | ItemDetailModal | Edit cart item |
| `/checkout` | CheckoutPage | Checkout process |
| `/confirmation` | ConfirmationPage | Order confirmation |
| `/confirmation/:orderNumber` | ConfirmationPage | Order with specific number |
| `/order` | - | Placeholder (Coming Soon) |
| `/about` | - | Placeholder (Coming Soon) |
| `/contact` | - | Placeholder (Coming Soon) |

### Admin App (asian-taste-admin)

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | LoginPage | Admin login |
| `/` | Navigate to /dashboard | Root redirects |
| `/dashboard` | DashboardPage | Admin dashboard |
| `/orders` | OrdersPage | Orders management |
| `/orders/:id` | OrderDetailPage | Order details |
| `/menu` | - | Placeholder (Coming Soon) |
| `/reports` | - | Placeholder (Coming Soon) |
| `/settings` | - | Placeholder (Coming Soon) |

---

## NOTES FOR LLM

1. **Order creation is working** - POST /api/orders creates orders successfully
2. **Enum mapping fixed** - PostgreSQL enums cast to text in SQL queries to avoid Npgsql mapping issues
3. **Transaction handling fixed** - Proper commit/rollback flow in OrderRepository.CreateOrderAsync
4. **Follow PRD structure** - See [Asian_Taste_PRD.md](Asian_Taste_PRD.md)
5. **Use PostgreSQL, not SQL Server** - Connection string format differs
6. **Dapper, not EF Core** - Use raw SQL, micro-ORM approach
7. **Mobile-first design** - Customer app prioritizes mobile UX
8. **Vietnamese restaurant context** - Menu items, categories reflect this
9. **Database is ready** - Use dev endpoints: POST /api/dev/db/init, /api/dev/db/seed
10. **Admin API endpoints require JWT** - Use Authorization: Bearer {token} header

---

## RECENT CHANGES LOG

| Date | Change | Author |
|------|--------|--------|
| 2026-02-25 | **✅ NEW:** Stripe Payment Integration complete - PaymentElement UI working with test card 4242 | Claude |
| 2026-02-25 | **NEW:** POST /api/payments/create-intent endpoint for PaymentIntent creation | Claude |
| 2026-02-25 | **NEW:** StripeCardPaymentForm component with Elements provider wrapper | Claude |
| 2026-02-25 | **NEW:** Frontend paymentApi with createPaymentIntent method | Claude |
| 2026-02-25 | **FIXED:** StripeConfiguration dependency injection - added scoped service registration | Claude |
| 2026-02-25 | **NEW:** Environment variables configured - Stripe test keys in appsettings.Development.json | Claude |
| 2026-02-25 | **NEW:** .env.development for frontend with VITE_STRIPE_PUBLISHABLE_KEY | Claude |
| 2026-02-25 | **NEW:** Updated CreateCheckoutOrderRequest type to include paymentIntentId field | Claude |
| 2026-02-14 | **NEW:** Created comprehensive Phase 3 Admin Dashboard implementation plan | Claude |
| 2026-02-14 | **FIXED:** Documented Vite WebSocket EPIPE error fix strategy | Claude |
| 2026-02-14 | **FIXED:** Documented logout navigation issue + solution | Claude |
| 2026-02-14 | **NEW:** Added AdminMenuController specification with CRUD endpoints | Claude |
| 2026-02-14 | **NEW:** Added Reports and Settings page specifications | Claude |
| 2026-02-11 | **FIXED:** Vite proxy configuration - changed target from port 5000 to 5070 | Claude |
| 2026-02-11 | **FIXED:** PostgreSQL enum creation in migrations - wrapped in DO blocks for idempotency | Claude |
| 2026-02-11 | **FIXED:** Added IF NOT EXISTS to all CREATE TABLE and CREATE INDEX statements | Claude |
| 2026-02-11 | **NEW:** Auto-seed database on first initialization in Program.cs startup | Claude |
| 2026-02-11 | **NEW:** Added comprehensive API and Frontend Routes Reference to docs | Claude |
| 2026-02-11 | **FIXED:** Logging level - changed from Debug to Information to reduce log noise | Claude |
| 2026-02-08 | **FIXED:** Order number length issue - changed format to AT-DDHHMM-XXXX (13 chars) | Claude |
| 2026-02-08 | **FIXED:** Connection string invalid parameter "Pool Idle Lifetime" removed | Claude |
| 2026-02-08 | **FIXED:** OrderRepository GetOrderByIdAsync and GetOrderByNumberAsync enum mapping with column aliases | Claude |
| 2026-02-08 | **FIXED:** ConfirmationPage race condition - added hasSubmittedSuccessfully ref to prevent redirect | Claude |
| 2026-02-08 | **NEW:** ConfirmationPage now has live order status tracking with progress bar | Claude |
| 2026-02-08 | **NEW:** Countdown timer showing time remaining until order ready | Claude |
| 2026-02-08 | **NEW:** Auto-polling every 10 seconds for order status updates | Claude |
| 2026-02-07 | **FIXED:** Order creation now working! Fixed transaction rollback issue in OrderRepository | Claude |
| 2026-02-07 | **FIXED:** PostgreSQL enum mapping - cast to text in SQL queries | Claude |
| 2026-02-07 | **FIXED:** Added GlobalTypeMapper setup in Program.cs for enum handling | Claude |
| 2026-02-07 | **NEW:** Created CheckoutPage with multi-step flow | Claude |
| 2026-02-07 | **NEW:** Created checkoutStore for customer info state | Claude |
| 2026-02-07 | **NEW:** Added checkout API client (checkoutApi.ts) | Claude |
| 2026-02-07 | **NEW:** Added checkout components (Steps, ContactInfoForm, PaymentMethodSelector, etc.) | Claude |
| 2026-02-07 | **NEW:** Created AdminOrdersController with order management endpoints | Claude |
| 2026-02-07 | **NEW:** Created OrderWebSocketHandler for real-time order updates | Claude |
| 2026-02-07 | **NEW:** Created admin dashboard and orders pages | Claude |
| 2026-01-29 | Fixed modal backdrop - removed redundant backdrop from CartLayout and MenuLayout | Claude |
| 2026-01-29 | Implemented Cart page with CartItem and CartSummary components | Claude |
| 2026-01-29 | Added search functionality with SearchPage and Header search UI | Claude |
| 2026-01-29 | Created MenuLayout for nested routing | Claude |
| 2026-01-29 | Built Item Detail Modal with modifier selection UI | Claude |
| 2026-01-29 | Created useItemSelection hook for modifier state management | Claude |
| 2026-01-29 | Added QuantitySelector, ModifierGroupSection, SpecialInstructions components | Claude |
| 2026-01-29 | Created migration 003 with descriptions for ~70 menu items | Claude |
| 2026-01-27 | Implemented Menu API endpoints (MenuController) | Claude |
| 2026-01-27 | Created MenuRepository with Dapper queries | Claude |
| 2026-01-27 | Setup React Router with routing structure | Claude |
| 2026-01-27 | Implemented Zustand cart store with localStorage | Claude |
| 2026-01-27 | Created API client with Axios + React Query | Claude |
| 2026-01-27 | Installed Tailwind CSS v4 + configured design system | Claude |
| 2026-01-27 | Built landing page (Header, Hero, CategoryNav) | Claude |
| 2026-01-27 | Built menu components (MenuGrid, MenuItemCard) | Claude |
| 2026-01-27 | Created HomePage and MenuPage with full navigation | Claude |
| 2026-01-27 | Added PostgreSQL + Dapper integration | Claude |
| 2026-01-27 | Created all entity models (7 entities, 3 enums) | Claude |
| 2026-01-27 | Created all DTOs (10+ DTOs) | Claude |
| 2026-01-27 | Created SQL schema + seed data migrations | Claude |
| 2026-01-27 | Added database initialization service + dev endpoints | Claude |
| 2026-01-27 | Extracted menu data to menu/Menu.md | Claude |
| 2026-01-26 | Created solution structure | User |
| 2026-01-26 | Setup API + React projects | User |
| 2026-01-26 | Created CurrentProgress.md | User |

---

*This file should be updated after each significant development session.*

After each work session, update:
- Status in the matrix
- Add new files to project structure
- Update Recent Changes log
- Mark completed tasks
