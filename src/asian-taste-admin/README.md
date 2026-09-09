# Asian Taste - Admin Dashboard

Restaurant management dashboard for Asian Taste Vietnamese Cuisine.

## Features

- **Dashboard**: Real-time overview of today's revenue, active orders, and order statistics
- **Order Management**: View, filter, and manage all orders
- **Order Details**: Detailed order view with item list, customer info, and status updates
- **Real-time Updates**: WebSocket notifications for new orders and status changes
- **Status Management**: Update order status (Pending → Confirmed → Preparing → Ready → Completed)

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router v7
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+
- Backend API running on `http://localhost:5000`

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The admin dashboard will be available at `http://localhost:5174`

### Build

```bash
npm run build
```

## Default Login Credentials

- **Username**: `admin`
- **Password**: `Admin123!`

## API Endpoints Used

- `POST /api/auth/login` - Admin authentication
- `GET /api/admin/orders` - Get all orders with filters
- `GET /api/admin/orders/{id}` - Get order details
- `GET /api/admin/orders/summary` - Get dashboard statistics
- `PUT /api/admin/orders/{id}/status` - Update order status
- `WS /ws/orders` - WebSocket for real-time updates

## Folder Structure

```
src/
├── api/              # API client and endpoints
├── components/       # React components
│   ├── dashboard/    # Dashboard-specific components
│   ├── orders/       # Order management components
│   └── ui/           # shadcn/ui base components
├── hooks/            # Custom React hooks
├── layouts/          # Layout components
├── lib/              # Utility functions
├── pages/            # Page components
├── stores/           # Zustand state stores
├── types/            # TypeScript type definitions
└── main.tsx          # App entry point
```

## Status Flow

Orders follow this status progression:

```
Pending → Confirmed → Preparing → Ready → Completed
    ↓
Cancelled (can be cancelled from any status)
```

## Real-time Notifications

The dashboard connects to a WebSocket endpoint for real-time updates:

- **New Order**: Toast notification + sound when a new order is placed
- **Status Update**: Auto-refresh when order status changes
- **Dashboard Update**: Live statistics refresh
