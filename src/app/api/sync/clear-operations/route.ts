import { NextRequest, NextResponse } from 'next/server';
import { localStorageService } from '@/lib/storage/local-storage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { operationTypes, branchId } = body;

    if (!branchId) {
      return NextResponse.json(
        { error: 'Branch ID is required' },
        { status: 400 }
      );
    }

    await localStorageService.init();

    // Get all operations
    const allOperations = await localStorageService.getAllOperations();

    // Filter operations to clear
    const operationsToClear = allOperations.filter((op: any) => {
      // Filter by branchId
      if (op.branchId !== branchId) return false;

      // Filter by operation types if specified
      if (operationTypes && Array.isArray(operationTypes)) {
        return operationTypes.includes(op.type);
      }

      return true;
    });

    // Clear the operations
    for (const op of operationsToClear) {
      await localStorageService.deleteOperation(op.id);
    }

    return NextResponse.json({
      success: true,
      clearedCount: operationsToClear.length,
      message: `Cleared ${operationsToClear.length} operations`,
    });
  } catch (error) {
    console.error('[ClearOperations] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear operations',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
