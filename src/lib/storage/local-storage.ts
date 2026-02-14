/**
 * Local Storage Service using IndexedDB for Offline-First POS System
 * Stores critical data locally when branch is offline
 */

// Database name and version
const DB_NAME = 'EmperorCoffeePOS';
const DB_VERSION = 3; // Incremented to add new stores (branches, delivery areas, customers, etc.)

// Store names
const STORES = {
  OPERATIONS: 'operations', // Queue of pending sync operations
  ORDERS: 'orders',
  INVENTORY: 'inventory',
  MENU_ITEMS: 'menu_items',
  INGREDIENTS: 'ingredients',
  CATEGORIES: 'categories',
  USERS: 'users',
  SYNC_STATE: 'sync_state',
  WASTE_LOGS: 'waste_logs',
  SHIFTS: 'shifts',
  BRANCHES: 'branches',
  DELIVERY_AREAS: 'delivery_areas',
  CUSTOMERS: 'customers',
  COURIERS: 'couriers',
  CUSTOMER_ADDRESSES: 'customer_addresses',
} as const;

type StoreName = typeof STORES[keyof typeof STORES];

// Operation types for sync queue
export enum OperationType {
  CREATE_ORDER = 'CREATE_ORDER',
  UPDATE_ORDER = 'UPDATE_ORDER',
  CREATE_INVENTORY = 'CREATE_INVENTORY',
  UPDATE_INVENTORY = 'UPDATE_INVENTORY',
  CREATE_WASTE = 'CREATE_WASTE',
  CREATE_SHIFT = 'CREATE_SHIFT',
  UPDATE_SHIFT = 'UPDATE_SHIFT',
  UPDATE_USER = 'UPDATE_USER',
  CREATE_CUSTOMER = 'CREATE_CUSTOMER',
  UPDATE_CUSTOMER = 'UPDATE_CUSTOMER',
  CREATE_CUSTOMER_ADDRESS = 'CREATE_CUSTOMER_ADDRESS',
  CREATE_COURIER = 'CREATE_COURIER',
  UPDATE_COURIER = 'UPDATE_COURIER',
  CREATE_DELIVERY_AREA = 'CREATE_DELIVERY_AREA',
  UPDATE_DELIVERY_AREA = 'UPDATE_DELIVERY_AREA',
}

// Sync operation interface
export interface SyncOperation {
  id: string;
  type: OperationType;
  data: any;
  timestamp: number;
  retryCount: number;
  branchId: string;
}

// Sync state interface
export interface SyncState {
  lastPullTimestamp: number;
  lastPushTimestamp: number;
  pendingOperations: number;
  isOnline: boolean;
  branchId: string;
  lastPullFailed?: boolean;
}

class LocalStorageService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB database
   */
  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      // Just open the database - IndexedDB will handle version upgrades via onupgradeneeded
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[LocalStorage] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[LocalStorage] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        console.log('[LocalStorage] Database upgrade needed, creating object stores...');
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores with indexes
        Object.values(STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            console.log('[LocalStorage] Creating store:', storeName);
            const store = db.createObjectStore(storeName, { keyPath: 'id' });

            // Add timestamp index for operations
            if (storeName === STORES.OPERATIONS) {
              store.createIndex('timestamp', 'timestamp', { unique: false });
              store.createIndex('type', 'type', { unique: false });
            }
            // Add branchId index for filtering
            if (storeName === STORES.ORDERS || storeName === STORES.INVENTORY) {
              store.createIndex('branchId', 'branchId', { unique: false });
            }
          }
        });

        console.log('[LocalStorage] All object stores created');
      };
    });

    return this.initPromise;
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInit(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  /**
   * Generic add/update operation
   */
  private async put(storeName: StoreName, data: any): Promise<void> {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic get operation
   */
  private async get<T>(storeName: StoreName, id: string): Promise<T | null> {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic getAll operation
   */
  private async getAll<T>(storeName: StoreName): Promise<T[]> {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic delete operation
   */
  private async delete(storeName: StoreName, id: string): Promise<void> {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear entire store
   */
  private async clear(storeName: StoreName): Promise<void> {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============ Sync Operations ============

  /**
   * Add operation to sync queue
   */
  async addOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    const fullOperation: SyncOperation = {
      ...operation,
      id: `${operation.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0,
    };
    await this.put(STORES.OPERATIONS, fullOperation);
  }

  /**
   * Get all pending operations
   */
  async getPendingOperations(): Promise<SyncOperation[]> {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORES.OPERATIONS, 'readonly');
      const store = transaction.objectStore(STORES.OPERATIONS);
      const index = store.index('timestamp');
      const request = index.getAll();

      request.onsuccess = () => {
        const operations = request.result || [];
        // Sort by timestamp
        operations.sort((a, b) => a.timestamp - b.timestamp);
        resolve(operations);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all operations (alias for getPendingOperations)
   */
  async getAllOperations(): Promise<SyncOperation[]> {
    return this.getPendingOperations();
  }

  /**
   * Delete operation by ID (alias for removeOperation)
   */
  async deleteOperation(operationId: string): Promise<void> {
    return this.removeOperation(operationId);
  }

  /**
   * Get operations by type
   */
  async getOperationsByType(type: OperationType): Promise<SyncOperation[]> {
    await this.ensureInit();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORES.OPERATIONS, 'readonly');
      const store = transaction.objectStore(STORES.OPERATIONS);
      const index = store.index('type');
      const request = index.getAll(type);

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update operation (e.g., increment retry count)
   */
  async updateOperation(operation: SyncOperation): Promise<void> {
    await this.put(STORES.OPERATIONS, operation);
  }

  /**
   * Remove operation from queue
   */
  async removeOperation(operationId: string): Promise<void> {
    await this.delete(STORES.OPERATIONS, operationId);
  }

  /**
   * Clear all operations
   */
  async clearOperations(): Promise<void> {
    await this.clear(STORES.OPERATIONS);
  }

  // ============ Data Storage ============

  /**
   * Store order locally
   */
  async saveOrder(order: any): Promise<void> {
    await this.put(STORES.ORDERS, order);
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<any> {
    return this.get(STORES.ORDERS, orderId);
  }

  /**
   * Get all orders
   */
  async getAllOrders(): Promise<any[]> {
    return this.getAll(STORES.ORDERS);
  }

  /**
   * Store inventory locally
   */
  async saveInventory(inventory: any): Promise<void> {
    await this.put(STORES.INVENTORY, inventory);
  }

  /**
   * Get all inventory
   */
  async getAllInventory(): Promise<any[]> {
    return this.getAll(STORES.INVENTORY);
  }

  /**
   * Store menu items locally
   */
  async saveMenuItem(menuItem: any): Promise<void> {
    await this.put(STORES.MENU_ITEMS, menuItem);
  }

  /**
   * Get all menu items
   */
  async getAllMenuItems(): Promise<any[]> {
    return this.getAll(STORES.MENU_ITEMS);
  }

  /**
   * Store ingredients locally
   */
  async saveIngredient(ingredient: any): Promise<void> {
    await this.put(STORES.INGREDIENTS, ingredient);
  }

  /**
   * Get all ingredients
   */
  async getAllIngredients(): Promise<any[]> {
    return this.getAll(STORES.INGREDIENTS);
  }

  /**
   * Store categories locally
   */
  async saveCategory(category: any): Promise<void> {
    await this.put(STORES.CATEGORIES, category);
  }

  /**
   * Get all categories
   */
  async getAllCategories(): Promise<any[]> {
    return this.getAll(STORES.CATEGORIES);
  }

  /**
   * Store users locally
   */
  async saveUser(user: any): Promise<void> {
    await this.put(STORES.USERS, user);
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<any[]> {
    return this.getAll(STORES.USERS);
  }

  /**
   * Store waste log locally
   */
  async saveWasteLog(wasteLog: any): Promise<void> {
    await this.put(STORES.WASTE_LOGS, wasteLog);
  }

  /**
   * Get all waste logs
   */
  async getAllWasteLogs(): Promise<any[]> {
    return this.getAll(STORES.WASTE_LOGS);
  }

  /**
   * Store shift locally
   */
  async saveShift(shift: any): Promise<void> {
    await this.put(STORES.SHIFTS, shift);
  }

  /**
   * Get all shifts
   */
  async getAllShifts(): Promise<any[]> {
    return this.getAll(STORES.SHIFTS);
  }

  // ============ New Offline Stores ============

  /**
   * Store branch locally
   */
  async saveBranch(branch: any): Promise<void> {
    await this.put(STORES.BRANCHES, branch);
  }

  /**
   * Get all branches
   */
  async getAllBranches(): Promise<any[]> {
    return this.getAll(STORES.BRANCHES);
  }

  /**
   * Store delivery area locally
   */
  async saveDeliveryArea(area: any): Promise<void> {
    await this.put(STORES.DELIVERY_AREAS, area);
  }

  /**
   * Get all delivery areas
   */
  async getAllDeliveryAreas(): Promise<any[]> {
    return this.getAll(STORES.DELIVERY_AREAS);
  }

  /**
   * Store customer locally
   */
  async saveCustomer(customer: any): Promise<void> {
    await this.put(STORES.CUSTOMERS, customer);
  }

  /**
   * Get all customers
   */
  async getAllCustomers(): Promise<any[]> {
    return this.getAll(STORES.CUSTOMERS);
  }

  /**
   * Get customer by phone
   */
  async getCustomerByPhone(phone: string): Promise<any | null> {
    const customers = await this.getAllCustomers();
    return customers.find((c: any) => c.phone === phone) || null;
  }

  /**
   * Store customer address locally
   */
  async saveCustomerAddress(address: any): Promise<void> {
    await this.put(STORES.CUSTOMER_ADDRESSES, address);
  }

  /**
   * Get all customer addresses
   */
  async getAllCustomerAddresses(): Promise<any[]> {
    return this.getAll(STORES.CUSTOMER_ADDRESSES);
  }

  /**
   * Get customer addresses by customer ID
   */
  async getCustomerAddressesByCustomerId(customerId: string): Promise<any[]> {
    const addresses = await this.getAllCustomerAddresses();
    return addresses.filter((a: any) => a.customerId === customerId);
  }

  /**
   * Store courier locally
   */
  async saveCourier(courier: any): Promise<void> {
    await this.put(STORES.COURIERS, courier);
  }

  /**
   * Get all couriers
   */
  async getAllCouriers(): Promise<any[]> {
    return this.getAll(STORES.COURIERS);
  }

  /**
   * Get couriers by branch ID
   */
  async getCouriersByBranchId(branchId: string): Promise<any[]> {
    const couriers = await this.getAllCouriers();
    return couriers.filter((c: any) => c.branchId === branchId);
  }

  // ============ Sync State ============

  /**
   * Get current sync state
   */
  async getSyncState(): Promise<SyncState | null> {
    const state = await this.get<SyncState>(STORES.SYNC_STATE, 'current');
    return state;
  }

  /**
   * Update sync state
   */
  async updateSyncState(updates: Partial<SyncState>): Promise<void> {
    const currentState = await this.getSyncState();
    const newState: SyncState & { id: string } = {
      id: 'current', // Fixed key for sync state
      lastPullTimestamp: currentState?.lastPullTimestamp || 0,
      lastPushTimestamp: currentState?.lastPushTimestamp || 0,
      pendingOperations: currentState?.pendingOperations || 0,
      isOnline: navigator.onLine,
      branchId: currentState?.branchId || '',
      ...updates,
    };
    await this.put(STORES.SYNC_STATE, newState);
  }

  /**
   * Get pending operations count
   */
  async getPendingOperationsCount(): Promise<number> {
    const operations = await this.getPendingOperations();
    return operations.length;
  }

  // ============ Batch Operations ============

  /**
   * Batch save menu items
   */
  async batchSaveMenuItems(items: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.MENU_ITEMS, 'readwrite');
    const store = transaction.objectStore(STORES.MENU_ITEMS);

    items.forEach(item => {
      store.put(item);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save ingredients
   */
  async batchSaveIngredients(ingredients: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.INGREDIENTS, 'readwrite');
    const store = transaction.objectStore(STORES.INGREDIENTS);

    ingredients.forEach(ingredient => {
      store.put(ingredient);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save categories
   */
  async batchSaveCategories(categories: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.CATEGORIES, 'readwrite');
    const store = transaction.objectStore(STORES.CATEGORIES);

    categories.forEach(category => {
      store.put(category);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save users
   */
  async batchSaveUsers(users: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.USERS, 'readwrite');
    const store = transaction.objectStore(STORES.USERS);

    users.forEach(user => {
      store.put(user);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save orders
   */
  async batchSaveOrders(orders: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.ORDERS, 'readwrite');
    const store = transaction.objectStore(STORES.ORDERS);

    orders.forEach(order => {
      store.put(order);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save shifts
   */
  async batchSaveShifts(shifts: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.SHIFTS, 'readwrite');
    const store = transaction.objectStore(STORES.SHIFTS);

    shifts.forEach(shift => {
      store.put(shift);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save waste logs
   */
  async batchSaveWasteLogs(wasteLogs: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.WASTE_LOGS, 'readwrite');
    const store = transaction.objectStore(STORES.WASTE_LOGS);

    wasteLogs.forEach(wasteLog => {
      store.put(wasteLog);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save branches
   */
  async batchSaveBranches(branches: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.BRANCHES, 'readwrite');
    const store = transaction.objectStore(STORES.BRANCHES);

    branches.forEach(branch => {
      store.put(branch);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save delivery areas
   */
  async batchSaveDeliveryAreas(areas: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.DELIVERY_AREAS, 'readwrite');
    const store = transaction.objectStore(STORES.DELIVERY_AREAS);

    areas.forEach(area => {
      store.put(area);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save customers
   */
  async batchSaveCustomers(customers: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.CUSTOMERS, 'readwrite');
    const store = transaction.objectStore(STORES.CUSTOMERS);

    customers.forEach(customer => {
      store.put(customer);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save customer addresses
   */
  async batchSaveCustomerAddresses(addresses: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.CUSTOMER_ADDRESSES, 'readwrite');
    const store = transaction.objectStore(STORES.CUSTOMER_ADDRESSES);

    addresses.forEach(address => {
      store.put(address);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Batch save couriers
   */
  async batchSaveCouriers(couriers: any[]): Promise<void> {
    await this.ensureInit();
    const transaction = this.db!.transaction(STORES.COURIERS, 'readwrite');
    const store = transaction.objectStore(STORES.COURIERS);

    couriers.forEach(courier => {
      store.put(courier);
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Clear all data (for reset)
   */
  async clearAllData(): Promise<void> {
    await Promise.all([
      this.clear(STORES.ORDERS),
      this.clear(STORES.INVENTORY),
      this.clear(STORES.MENU_ITEMS),
      this.clear(STORES.INGREDIENTS),
      this.clear(STORES.CATEGORIES),
      this.clear(STORES.USERS),
      this.clear(STORES.WASTE_LOGS),
      this.clear(STORES.SHIFTS),
      this.clear(STORES.BRANCHES),
      this.clear(STORES.DELIVERY_AREAS),
      this.clear(STORES.CUSTOMERS),
      this.clear(STORES.CUSTOMER_ADDRESSES),
      this.clear(STORES.COURIERS),
      this.clear(STORES.OPERATIONS),
      this.clear(STORES.SYNC_STATE),
    ]);
  }

  /**
   * Get storage usage estimate
   */
  async getStorageUsage(): Promise<{ used: number; operations: number; orders: number }> {
    const [operations, orders] = await Promise.all([
      this.getPendingOperations(),
      this.getAllOrders(),
    ]);

    return {
      used: operations.length + orders.length,
      operations: operations.length,
      orders: orders.length,
    };
  }

  /**
   * Import data from export (for offline setup)
   */
  async importData(importData: any): Promise<void> {
    console.log('[LocalStorage] Importing data...');

    const promises = [];

    if (importData.categories && importData.categories.length > 0) {
      promises.push(this.batchSaveCategories(importData.categories));
    }
    if (importData.menuItems && importData.menuItems.length > 0) {
      promises.push(this.batchSaveMenuItems(importData.menuItems));
    }
    if (importData.ingredients && importData.ingredients.length > 0) {
      promises.push(this.batchSaveIngredients(importData.ingredients));
    }
    if (importData.users && importData.users.length > 0) {
      promises.push(this.batchSaveUsers(importData.users));
    }
    if (importData.orders && importData.orders.length > 0) {
      promises.push(this.batchSaveOrders(importData.orders));
    }
    if (importData.shifts && importData.shifts.length > 0) {
      promises.push(this.batchSaveShifts(importData.shifts));
    }
    if (importData.wasteLogs && importData.wasteLogs.length > 0) {
      promises.push(this.batchSaveWasteLogs(importData.wasteLogs));
    }
    if (importData.branches && importData.branches.length > 0) {
      promises.push(this.batchSaveBranches(importData.branches));
    }
    if (importData.deliveryAreas && importData.deliveryAreas.length > 0) {
      promises.push(this.batchSaveDeliveryAreas(importData.deliveryAreas));
    }
    if (importData.customers && importData.customers.length > 0) {
      promises.push(this.batchSaveCustomers(importData.customers));
    }
    if (importData.customerAddresses && importData.customerAddresses.length > 0) {
      promises.push(this.batchSaveCustomerAddresses(importData.customerAddresses));
    }
    if (importData.couriers && importData.couriers.length > 0) {
      promises.push(this.batchSaveCouriers(importData.couriers));
    }

    await Promise.all(promises);

    console.log('[LocalStorage] Data import complete');

    // Update sync state
    if (importData.branch) {
      await this.updateSyncState({
        branchId: importData.branch.id,
        lastPullTimestamp: Date.now(),
      });
    }
  }

  /**
   * Export all data (for backup/transfer)
   */
  async exportAllData(): Promise<any> {
    console.log('[LocalStorage] Exporting all data...');

    const [
      categories,
      menuItems,
      ingredients,
      users,
      orders,
      shifts,
      wasteLogs,
      branches,
      deliveryAreas,
      customers,
      customerAddresses,
      couriers,
      syncState
    ] = await Promise.all([
      this.getAllCategories(),
      this.getAllMenuItems(),
      this.getAllIngredients(),
      this.getAllUsers(),
      this.getAllOrders(),
      this.getAllShifts(),
      this.getAllWasteLogs(),
      this.getAllBranches(),
      this.getAllDeliveryAreas(),
      this.getAllCustomers(),
      this.getAllCustomerAddresses(),
      this.getAllCouriers(),
      this.getSyncState()
    ]);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      branch: syncState ? { id: syncState.branchId } : null,
      data: {
        categories,
        menuItems,
        ingredients,
        users,
        orders,
        shifts,
        wasteLogs,
        branches,
        deliveryAreas,
        customers,
        customerAddresses,
        couriers
      }
    };
  }
}

// Export singleton instance
export const localStorageService = new LocalStorageService();
