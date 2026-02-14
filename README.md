# ☕ Emperor Coffee POS System

A comprehensive, offline-first Point of Sale system for coffee shop chains with multi-branch support and automatic synchronization.

## ✨ Key Features

### 🌐 Offline-First Architecture
- **Work Offline for Weeks**: Branches can operate completely offline for extended periods
- **Automatic Sync**: All data automatically synchronizes when connection is restored
- **Local Storage**: IndexedDB for storing data locally on each branch device
- **Operation Queue**: Queues all operations while offline and syncs when back online
- **Intelligent Retry**: Failed operations are automatically retried with exponential backoff

### 🏪 Multi-Branch Support
- **Centralized Database**: All branches connect to a single PostgreSQL database (Neon)
- **Branch Isolation**: Each branch operates independently with its own data
- **Role-Based Access**: Admin, Branch Manager, and Cashier roles
- **Real-Time Status**: Live sync status and connection monitoring

### 📱 Full-Featured POS
- **Menu Management**: Complete menu item and category management
- **Order Processing**: Dine-in, takeout, and delivery orders
- **Inventory Tracking**: Real-time inventory with low-stock alerts
- **Shift Management**: Cashier shift tracking with opening/closing balances
- **Waste Tracking**: Track and report waste for cost control
- **Loyalty Program**: Customer loyalty points and rewards
- **Delivery Management**: Delivery area and order tracking
- **Advanced Reports**: Sales, inventory, and performance analytics

### 📲 PWA - Install & Work Offline
- **Installable App**: Install on desktop and mobile devices
- **Offline Access**: Open the app without any internet connection
- **Cached Resources**: All app files cached for instant loading
- **Background Sync**: Syncs automatically when connection available
- **Cross-Platform**: Works on Windows, Mac, Linux, iOS, Android

## 📲 PWA - Progressive Web App

### What is a PWA?

A Progressive Web App (PWA) is a web application that can be installed on your device and works like a native app - even **without internet**!

### 🔥 Why PWA for Offline Branches?

**Traditional Web App Problem:**
```
❌ Without Internet:
Branch Device → Cannot open URL → App doesn't work!
```

**PWA Solution:**
```
✅ Without Internet:
Branch Device → Open Installed App → Works from cache!
```

### 📦 Installing the PWA

#### On Desktop (Chrome/Edge)

1. **Open the app** in Chrome or Edge
2. **Click the install icon** (⊕) in the address bar
3. **Click "Install"** in the popup
4. **App installs** on your computer
5. **Open anytime** - works without internet!

#### On Mobile (Android)

1. **Open the app** in Chrome
2. **Tap menu** (⋮) → "Add to Home Screen" or "Install App"
3. **Tap "Add"** or "Install"**
4. **App icon** appears on home screen
5. **Works offline** - no internet needed!

#### On Mobile (iOS/Safari)

1. **Open the app** in Safari
2. **Tap Share** (⎋) → "Add to Home Screen"
3. **Tap "Add"**
4. **App icon** appears on home screen
5. **Works offline** - no internet needed!

### 🚀 Complete Offline Branch Setup (No Internet Required!)

For branches that have **NO internet at all**, follow this process:

#### Step 1: Prepare Data Export (Online Device)

On any device with internet access:

```bash
# Export branch data
GET https://your-app.vercel.app/api/offline/export?branchId=branch-123&limit=1000
```

Save the response as `branch-123-export.json`

#### Step 2: Transfer Export File

Transfer `branch-123-export.json` to the offline branch device via:
- USB drive
- Email (downloaded before going offline)
- Local network file transfer
- Any offline file transfer method

#### Step 3: Install PWA on Offline Device

1. **Open the app** while you still have internet
2. **Install the PWA** (follow instructions above)
3. **App is now installed** and resources are cached
4. **Disconnect from internet** - app still works!

#### Step 4: Import Data on Offline Device

With the app open (can be offline now):

```javascript
// Open browser console (F12) or create a setup page
const exportData = <paste the JSON content>;

// Import data into IndexedDB
const response = await fetch('/api/offline/import', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: exportData })
});

const result = await response.json();
console.log('Import result:', result);
```

#### Step 5: Start Using Offline

1. **Open the installed PWA** (no internet needed)
2. **Log in** with branch credentials
3. **All data is loaded** from IndexedDB
4. **Process orders, shifts, inventory** - all works offline
5. **When connected** - auto-syncs all data!

### 🔄 How PWA Offline Works

```
┌─────────────────────────────────────────────────────────────┐
│                   PWA OFFLINE WORKFLOW                       │
└─────────────────────────────────────────────────────────────┘

Step 1: Install PWA (One-Time, Online)
┌─────────────────┐    Install    ┌──────────────────────────┐
│  Web Browser    │──────────────►│  Installed PWA (Cached)  │
│  (Online)       │               │  - All JS/CSS/Images    │
│                 │               │  - Service Worker       │
└─────────────────┘               └──────────────────────────┘
                                          │
                                          │ Works Offline
                                          ▼
Step 2: Use Offline (No Internet)
┌─────────────────────────────────────────────────────────────┐
│                    PWA (Offline Mode)                        │
│                                                             │
│  ✅ App loads from cache                                     │
│  ✅ Login works (cached data)                                │
│  ✅ Process orders, inventory, shifts                       │
│  ✅ All data stored in IndexedDB                            │
│  ✅ Operations queued for sync                              │
└─────────────────────────────────────────────────────────────┘
                                          │
                                          │ Reconnect Later
                                          ▼
Step 3: Auto-Sync (When Online)
┌─────────────────┐    Auto-Sync   ┌──────────────────────────┐
│  PWA Online     │──────────────►│  Central Server          │
│                 │               │  - Push queued ops      │
│                 │               │  - Pull latest data      │
│                 │               │  - Resolve conflicts     │
└─────────────────┘               └──────────────────────────┘
```

### 📊 What Gets Cached?

**Service Worker caches these resources:**
- ✅ HTML pages
- ✅ JavaScript bundles
- ✅ CSS stylesheets
- ✅ Images and icons
- ✅ Fonts
- ✅ App manifest

**IndexedDB stores this data:**
- ✅ Menu items, categories
- ✅ Ingredients, inventory
- ✅ Users
- ✅ Orders (pulled + created offline)
- ✅ Shifts (pulled + created offline)
- ✅ Waste logs (pulled + created offline)
- ✅ Queued operations for sync

### 🎯 PWA Features

| Feature | Description |
|---------|-------------|
| **Installable** | Add to home screen/desktop |
| **Offline Mode** | Works without internet |
| **Auto-Update** | Updates when online |
| **Fast Loading** | Cached resources load instantly |
| **Push Notifications** | (Future) Sync notifications |
| **Background Sync** | (Future) Sync in background |

### 🔧 PWA Configuration

**Service Worker** (`public/sw.js`):
- Caches static assets
- Network-first for HTML
- Cache-first for JS/CSS/images
- Skips API routes (dynamic data)
- Handles offline fallbacks

**PWA Manifest** (`public/manifest.json`):
```json
{
  "name": "Emperor Coffee POS",
  "short_name": "Emperor POS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#059669",
  "icons": [...]
}
```

### 📱 Device Compatibility

| Device | Browser | Install Method | Offline Support |
|--------|---------|----------------|-----------------|
| **Windows** | Chrome/Edge | Address bar install | ✅ Full |
| **Windows** | Firefox | Install support | ⚠️ Limited |
| **Mac** | Chrome/Edge | Address bar install | ✅ Full |
| **Mac** | Safari | Add to Dock | ✅ Full |
| **Android** | Chrome | Menu → Install | ✅ Full |
| **iOS** | Safari | Share → Add to Home | ✅ Full |
| **iPadOS** | Safari | Share → Add to Home | ✅ Full |

### 🚨 Important Notes

1. **First Install Requires Internet**
   - You need internet ONCE to install the PWA
   - After installation, works completely offline

2. **Export/Import for Complete Offline Setup**
   - Use `/api/offline/export` to get initial data
   - Use `/api/offline/import` to load data
   - Do this while device is still accessible

3. **Cached Resources Update When Online**
   - App resources (JS, CSS) update when online
   - Service worker updates automatically
   - User may need to refresh for updates

4. **IndexedDB Persists**
   - All data stays in browser storage
   - Survives browser close/reopen
   - Survives device restart
   - Cleared only manually or by browser

## 🏗️ Technology Stack

### Core Framework
- **Next.js 16** - React framework with App Router
- **TypeScript 5** - Type-safe development
- **Prisma ORM** - Database operations with PostgreSQL (Neon)
- **Tailwind CSS 4** - Utility-first styling
- **shadcn/ui** - High-quality UI components

### Offline-First Features
- **IndexedDB** - Local data storage
- **Service Workers** - Offline app caching
- **PWA** - Installable application
- **Operation Queue** - Offline operation buffering
- **Auto-Sync Manager** - Intelligent synchronization

### Authentication & Security
- **NextAuth.js v4** - Authentication
- **bcryptjs** - Password hashing
- **Role-Based Access Control** - Admin/Manager/Cashier roles

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or Bun
- PostgreSQL database (Neon recommended)
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/syncon.git
cd syncon

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env and add your DATABASE_URL

# Push database schema
bun run db:push

# Seed database (optional)
bun run db:seed

# Start development server
bun run dev
```

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"
```

### Default Credentials

- **Admin**: `admin` / `admin123`
- **Manager**: `manager1` / `manager123`
- **Cashier**: `cashier1` / `cashier123`

## 📡 Offline-First Architecture

### How It Works

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Branch POS    │         │  Offline Manager │         │  Central Server │
│                 │         │                  │         │   (PostgreSQL)  │
│  - Orders       │◄────────┤  - Queue Ops     │────────►│  - All Data     │
│  - Inventory    │  Local  │  - Auto Sync     │  Sync   │  - Sync History │
│  - Menu         │  Storage│  - Retry Logic   │  API    │  - Conflicts    │
│  - Shifts       │         │  - Status Track  │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
        │                            │                            │
        │ IndexedDB                  │ Online/Offline             │
        └────────────────────────────┴────────────────────────────┘
```

### Offline Workflow

1. **Online Mode**
   - All operations immediately sync to central server
   - Data fetched from API and cached locally
   - Status shows "Online" with green indicator

2. **Offline Mode**
   - Operations queued locally in IndexedDB
   - Data served from local cache
   - Status shows "Offline" with red indicator
   - User can continue all operations normally

3. **Reconnection**
   - Offline Manager detects connection restored
   - Auto-sync triggers immediately
   - Queued operations pushed in batches
   - Latest data pulled from server
   - Status updates to "Syncing..." then "Online"

### Operation Queue

The system queues these operations when offline:
- **CREATE_ORDER** - New orders
- **UPDATE_ORDER** - Order status changes
- **CREATE_INVENTORY** - Inventory additions
- **UPDATE_INVENTORY** - Inventory adjustments
- **CREATE_WASTE** - Waste logs
- **CREATE_SHIFT** - New shifts
- **UPDATE_SHIFT** - Shift updates
- **UPDATE_USER** - User profile changes

### Sync Configuration

```typescript
// Configured in src/lib/offline/offline-manager.ts
const CONFIG = {
  MAX_RETRY_ATTEMPTS: 3,        // Retry failed operations 3 times
  SYNC_INTERVAL: 30000,         // Auto-sync every 30 seconds
  RETRY_DELAY: 5000,            // Wait 5 seconds between retries
  BATCH_SIZE: 50,               // Process 50 operations per batch
};
```

## 🔄 Synchronization APIs

### Pull Sync (Server → Branch)

Downloads updated data from central server:
- Menu items and categories
- Ingredients and recipes
- User information
- Pricing updates

```bash
POST /api/sync/pull
{
  "branchId": "branch-123",
  "force": false  // Force full sync
}
```

### Push Sync (Branch → Server)

Uploads branch data to central server:
- Orders
- Inventory changes
- Waste logs
- Shift records

```bash
POST /api/sync/push
{
  "branchId": "branch-123",
  "dryRun": false  // Preview changes without applying
}
```

### Batch Push (Optimized for Offline)

Processes multiple queued operations in one request:

```bash
POST /api/sync/batch-push
{
  "branchId": "branch-123",
  "operations": [
    {
      "type": "CREATE_ORDER",
      "data": { ... },
      "timestamp": 1234567890
    },
    ...
  ]
}
```

### Sync Status

Get current sync status and pending operations:

```bash
POST /api/sync/status
{
  "branchId": "branch-123"
}
```

### Sync History

View synchronization history:

```bash
GET /api/sync/history?branchId=branch-123&limit=50
```

## 🧩 Using Offline Features

### Initialize Offline Manager

```typescript
import { offlineManager } from '@/lib/offline/offline-manager';

// Initialize with branch ID
await offlineManager.initialize(branchId);
```

### Monitor Sync Status

```typescript
import { OfflineStatusIndicator } from '@/components/offline-status-indicator';

// In your component
<OfflineStatusIndicator branchId={user.branchId} />
```

### Use Offline Data Hook

```typescript
import { useOfflineData } from '@/lib/offline/use-offline-data';

// Fetch data that works offline
const { data, loading, error, isOffline, refetch } = useOfflineData({
  apiEndpoint: '/api/menu-items',
  storageKey: 'menu-items',
  transform: (response) => response.menuItems,
});
```

### Queue Offline Operations

```typescript
import { offlineManager, OperationType } from '@/lib/offline/offline-manager';

// Queue operation (works offline too)
await offlineManager.queueOperation(OperationType.CREATE_ORDER, {
  orderId: 'ord-123',
  items: [...],
  totalAmount: 25.50,
});
```

### Manual Force Sync

```typescript
// Trigger immediate sync
const result = await offlineManager.forceSync();
console.log(`Processed: ${result.operationsProcessed}`);
console.log(`Failed: ${result.operationsFailed}`);
```

## 📊 Data Storage

### IndexedDB Stores

The system uses IndexedDB with these stores:

| Store Name | Purpose |
|------------|---------|
| `operations` | Queued sync operations |
| `orders` | Local order cache |
| `inventory` | Local inventory cache |
| `menu_items` | Local menu cache |
| `ingredients` | Local ingredient cache |
| `categories` | Local category cache |
| `users` | Local user cache |
| `sync_state` | Sync status and metadata |
| `waste_logs` | Local waste log cache |
| `shifts` | Local shift cache |

### Storage Limits

- **IndexedDB**: ~50-80% of available disk space
- **Browser Storage**: Varies by browser (typically 50MB-2GB)
- **Recommendation**: Clear old data periodically if offline for extended periods

## 🔧 Troubleshooting

### Sync Not Working

1. **Check Connection Status**
   ```typescript
   const isOnline = offlineManager.isCurrentlyOnline();
   console.log('Online:', isOnline);
   ```

2. **View Pending Operations**
   ```typescript
   const count = await offlineManager.getPendingOperationsCount();
   console.log('Pending operations:', count);
   ```

3. **Force Sync**
   ```typescript
   const result = await offlineManager.forceSync();
   console.log('Sync result:', result);
   ```

### Data Not Appearing

1. **Check Local Storage**
   ```typescript
   const items = await localStorageService.getAllMenuItems();
   console.log('Local items:', items.length);
   ```

2. **Clear Cache and Refetch**
   ```typescript
   await localStorageService.clearAllData();
   await offlineManager.forceSync();
   ```

### Large Backlog After Long Offline Period

If a branch has been offline for weeks with many operations:

1. **Sync will process in batches** (50 operations at a time)
2. **Progress is saved** - can be interrupted and resumed
3. **No data loss** - operations remain queued until successful
4. **Monitor progress** via the status indicator

## 🚀 Deployment

### Vercel Deployment

1. **Set Environment Variables**
   - `DATABASE_URL` - Your Neon PostgreSQL connection string
   - `NEXTAUTH_URL` - Your Vercel domain
   - `NEXTAUTH_SECRET` - Generate a secure secret

2. **Deploy**
   ```bash
   git push origin main
   ```

3. **Seed Database**
   ```bash
   # Trigger seed endpoint from deployed app
   POST https://your-app.vercel.app/api/setup/seed
   ```

### Database Setup (Neon)

1. Create a Neon account at [neon.tech](https://neon.tech)
2. Create a new PostgreSQL database
3. Copy the connection string
4. Add to `.env` as `DATABASE_URL`

## 📚 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── sync/
│   │   │   ├── status/route.ts
│   │   │   ├── pull/route.ts
│   │   │   ├── push/route.ts
│   │   │   ├── batch-push/route.ts
│   │   │   ├── history/route.ts
│   │   │   └── conflicts/route.ts
│   │   └── ...
│   ├── page.tsx
│   └── layout.tsx
├── components/
│   ├── offline-status-indicator.tsx
│   ├── sync-dashboard.tsx
│   ├── conflict-resolution-dialog.tsx
│   └── ...
├── lib/
│   ├── offline/
│   │   ├── offline-manager.ts
│   │   └── use-offline-data.ts
│   ├── storage/
│   │   └── local-storage.ts
│   ├── sync-utils.ts
│   ├── db.ts
│   └── auth-context.ts
└── ...
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
- Open an issue on GitHub
- Check the documentation
- Review the troubleshooting section

---

Built with ❤️ for coffee shop chains. Works offline, syncs automatically. ☕
