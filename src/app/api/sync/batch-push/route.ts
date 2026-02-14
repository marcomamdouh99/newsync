/**
 * Batch Push API Endpoint
 * Handles multiple sync operations in a single request
 * Optimized for offline-first sync where branches may queue many operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SyncDirection, SyncStatus as PrismaSyncStatus } from '@prisma/client';

// Operation types
const OperationType = {
  CREATE_ORDER: 'CREATE_ORDER',
  UPDATE_ORDER: 'UPDATE_ORDER',
  CREATE_INVENTORY: 'CREATE_INVENTORY',
  UPDATE_INVENTORY: 'UPDATE_INVENTORY',
  CREATE_WASTE: 'CREATE_WASTE',
  CREATE_SHIFT: 'CREATE_SHIFT',
  UPDATE_SHIFT: 'UPDATE_SHIFT',
  UPDATE_USER: 'UPDATE_USER',
} as const;

type OperationTypeType = typeof OperationType[keyof typeof OperationType];

interface SyncOperation {
  type: OperationTypeType;
  data: any;
  timestamp: number;
}

interface BatchPushRequest {
  branchId: string;
  operations: SyncOperation[];
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchPushRequest = await request.json();
    const { branchId, operations } = body;

    if (!branchId) {
      return NextResponse.json(
        { error: 'Branch ID is required' },
        { status: 400 }
      );
    }

    if (!operations || !Array.isArray(operations)) {
      return NextResponse.json(
        { error: 'Operations array is required' },
        { status: 400 }
      );
    }

    // Verify branch exists
    const branch = await db.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      return NextResponse.json(
        { error: 'Branch not found' },
        { status: 404 }
      );
    }

    const results = {
      processed: 0,
      failed: 0,
      failedIds: [] as string[],
      errors: [] as string[],
    };

    // Process operations
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];

      try {
        await processOperation(operation, branchId);
        results.processed++;
      } catch (error) {
        results.failed++;
        results.failedIds.push(`op-${i}`);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`${operation.type}: ${errorMessage}`);
        console.error(`[BatchPush] Failed to process operation ${i}:`, error);
      }
    }

    // Record sync history if any operations were processed
    if (results.processed > 0) {
      await db.syncHistory.create({
        data: {
          branchId,
          direction: SyncDirection.UP,
          status: PrismaSyncStatus.COMPLETED,
          recordsSynced: results.processed,
          startedAt: new Date(operations[0].timestamp),
          completedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: results.failed === 0,
      processed: results.processed,
      failed: results.failed,
      failedIds: results.failedIds,
      errors: results.errors,
    });
  } catch (error) {
    console.error('[BatchPush] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Process individual sync operation
 */
async function processOperation(operation: SyncOperation, branchId: string): Promise<void> {
  switch (operation.type) {
    case OperationType.CREATE_ORDER:
      await createOrder(operation.data, branchId);
      break;

    case OperationType.UPDATE_ORDER:
      await updateOrder(operation.data, branchId);
      break;

    case OperationType.CREATE_INVENTORY:
      await createInventory(operation.data, branchId);
      break;

    case OperationType.UPDATE_INVENTORY:
      await updateInventory(operation.data, branchId);
      break;

    case OperationType.CREATE_WASTE:
      await createWaste(operation.data, branchId);
      break;

    case OperationType.CREATE_SHIFT:
      await createShift(operation.data, branchId);
      break;

    case OperationType.UPDATE_SHIFT:
      await updateShift(operation.data, branchId);
      break;

    case OperationType.UPDATE_USER:
      await updateUser(operation.data);
      break;

    default:
      throw new Error(`Unknown operation type: ${operation.type}`);
  }
}

/**
 * Create order
 */
async function createOrder(data: any, branchId: string): Promise<void> {
  await db.order.create({
    data: {
      id: data.id,
      branchId,
      orderNumber: data.orderNumber,
      customerId: data.customerId || null,
      orderType: data.orderType,
      totalAmount: data.totalAmount,
      status: data.status,
      paymentStatus: data.paymentStatus,
      paymentMethod: data.paymentMethod || null,
      notes: data.notes || null,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      items: {
        create: data.items.map((item: any) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          specialInstructions: item.specialInstructions || null,
        })),
      },
    },
  });
}

/**
 * Update order
 */
async function updateOrder(data: any, branchId: string): Promise<void> {
  // Update order basic info
  await db.order.update({
    where: { id: data.id },
    data: {
      status: data.status,
      paymentStatus: data.paymentStatus,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      updatedAt: new Date(data.updatedAt),
    },
  });

  // Update order items if provided
  if (data.items && Array.isArray(data.items)) {
    // Delete existing items
    await db.orderItem.deleteMany({
      where: { orderId: data.id },
    });

    // Create new items
    await db.orderItem.createMany({
      data: data.items.map((item: any) => ({
        orderId: data.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        specialInstructions: item.specialInstructions,
      })),
    });
  }
}

/**
 * Create inventory
 */
async function createInventory(data: any, branchId: string): Promise<void> {
  await db.inventory.create({
    data: {
      id: data.id,
      branchId,
      ingredientId: data.ingredientId,
      quantity: data.quantity,
      unit: data.unit,
      reorderLevel: data.reorderLevel,
      lastRestockedAt: data.lastRestockedAt ? new Date(data.lastRestockedAt) : null,
      version: data.version || 1,
    },
  });
}

/**
 * Update inventory
 */
async function updateInventory(data: any, branchId: string): Promise<void> {
  await db.inventory.update({
    where: { id: data.id },
    data: {
      quantity: data.quantity,
      lastRestockedAt: data.lastRestockedAt ? new Date(data.lastRestockedAt) : null,
      version: (data.version || 0) + 1,
    },
  });
}

/**
 * Create waste log
 */
async function createWaste(data: any, branchId: string): Promise<void> {
  await db.wasteLog.create({
    data: {
      id: data.id,
      branchId,
      menuItemId: data.menuItemId || null,
      ingredientId: data.ingredientId || null,
      quantity: data.quantity,
      reason: data.reason,
      cost: data.cost || 0,
      notes: data.notes || null,
      recordedBy: data.recordedBy,
      createdAt: new Date(data.createdAt),
    },
  });
}

/**
 * Create shift
 */
async function createShift(data: any, branchId: string): Promise<void> {
  // If this is an offline-created shift with tempId, don't specify id - let Prisma generate one
  const shiftData: any = {
    branchId,
    cashierId: data.cashierId,
    startTime: new Date(data.startTime),
    endTime: data.endTime ? new Date(data.endTime) : null,
    isClosed: data.isClosed || false,
    openingCash: data.openingCash || 0,
    closingCash: data.closingCash || 0,
    notes: data.notes || null,
  };
  
  // Only use provided ID if it's not a temporary ID
  if (!data.id || !data.id.startsWith('temp-')) {
    shiftData.id = data.id;
  }
  
  await db.shift.create({ data: shiftData });
}

/**
 * Update shift
 */
async function updateShift(data: any, branchId: string): Promise<void> {
  await db.shift.update({
    where: { id: data.id },
    data: {
      endTime: data.endTime ? new Date(data.endTime) : null,
      status: data.status,
      closingCash: data.closingCash,
      notes: data.notes,
    },
  });
}

/**
 * Update user (for local changes like password updates)
 */
async function updateUser(data: any): Promise<void> {
  await db.user.update({
    where: { id: data.id },
    data: {
      username: data.username,
      fullName: data.fullName,
      email: data.email || null,
      role: data.role,
      branchId: data.branchId || null,
      isActive: data.isActive,
      updatedAt: new Date(),
    },
  });
}
