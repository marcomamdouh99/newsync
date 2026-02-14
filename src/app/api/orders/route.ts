import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateRequest, orderCreateSchema, formatZodErrors } from '@/lib/validators';
import { parsePaginationParams, buildPaginatedResponse, defaultPagination } from '@/lib/pagination';

/**
 * Get or create "Loyalty Discounts" cost category for a branch
 */
async function getLoyaltyDiscountCostCategory(branchId: string) {
  let costCategory = await db.costCategory.findFirst({
    where: {
      name: 'Loyalty Discounts',
      branchId, // Only get branch-specific category
    },
  });

  if (!costCategory) {
    // Create the loyalty discounts category for this branch
    costCategory = await db.costCategory.create({
      data: {
        name: 'Loyalty Discounts',
        description: 'Discounts redeemed from customer loyalty points',
        icon: 'Gift',
        sortOrder: 999, // Show at the bottom
        isActive: true,
        branchId, // Make it branch-specific
      },
    });
  }

  return costCategory;
}

/**
 * Create a loyalty discount cost record for a branch
 */
async function createLoyaltyDiscountCost(
  branchId: string,
  discountAmount: number,
  orderNumber: number,
  orderId: string,
  customerId?: string | null,
  shiftId?: string | null
) {
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  const costCategory = await getLoyaltyDiscountCostCategory(branchId);

  await db.branchCost.create({
    data: {
      branchId,
      costCategoryId: costCategory.id,
      shiftId, // Link to shift for accurate reporting
      amount: discountAmount,
      period: currentPeriod,
      notes: `Loyalty points redeemed on Order #${orderNumber}${customerId ? ` for customer ${customerId}` : ''}`,
    },
  });
}

/**
 * Safely deduct inventory with atomic operation to prevent race conditions
 * Uses optimistic concurrency control for SQLite
 */
async function safeInventoryDeduct(
  tx: any,
  branchId: string,
  ingredientId: string,
  quantityToDeduct: number,
  orderId: string,
  createdBy: string,
  ingredientName: string
) {
  const quantityToDeductAbs = Math.abs(quantityToDeduct);

  // Check current stock first
  const inventory = await tx.branchInventory.findUnique({
    where: {
      branchId_ingredientId: {
        branchId,
        ingredientId,
      },
    },
  });

  const currentStock = inventory?.currentStock || 0;

  if (currentStock < quantityToDeductAbs) {
    throw new Error(
      `Insufficient inventory for ${ingredientName}. Current stock: ${currentStock}, Required: ${quantityToDeductAbs}`
    );
  }

  // Update inventory
  const stockBefore = currentStock;
  const stockAfter = currentStock - quantityToDeductAbs;

  await tx.branchInventory.update({
    where: {
      branchId_ingredientId: {
        branchId,
        ingredientId,
      },
    },
    data: {
      currentStock: stockAfter,
      lastModifiedAt: new Date(),
    },
  });

  // Create inventory transaction record
  await tx.inventoryTransaction.create({
    data: {
      branchId,
      ingredientId,
      transactionType: 'SALE',
      quantityChange: -quantityToDeductAbs,
      stockBefore,
      stockAfter,
      orderId,
      createdBy,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Validate request with Zod
    const validationResult = validateRequest(orderCreateSchema, await request.json());

    if (!validationResult.success) {
      console.error('Order validation failed:', validationResult.errors);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: formatZodErrors(validationResult.errors)
        },
        { status: 400 }
      );
    }

    const {
      branchId,
      cashierId,
      items,
      paymentMethod,
      orderType,
      deliveryAddress,
      deliveryAreaId,
      deliveryFee,
      customerId,
      customerAddressId,
      customerPhone,
      customerName,
      courierId,
      loyaltyPointsRedeemed,
      loyaltyDiscount,
      orderNumber
    } = validationResult.data;

    // Get next order number if not provided
    let finalOrderNumber = orderNumber;
    if (!finalOrderNumber) {
      const lastOrder = await db.order.findFirst({
        where: { branchId },
        orderBy: { orderNumber: 'desc' },
      });
      finalOrderNumber = (lastOrder?.orderNumber || 0) + 1;
    }

    // Get cashier info
    const cashier = await db.user.findUnique({
      where: { id: cashierId },
    });

    if (!cashier) {
      return NextResponse.json(
        { error: 'Cashier not found' },
        { status: 404 }
      );
    }

    // For cashiers, check if they have an open shift
    if (cashier.role === 'CASHIER') {
      const openShift = await db.shift.findFirst({
        where: {
          cashierId,
          isClosed: false,
        },
      });

      if (!openShift) {
        return NextResponse.json(
          { error: 'No active shift found. Please open a shift first.' },
          { status: 400 }
        );
      }

      // Verify that open shift is for the same branch
      if (openShift.branchId !== branchId) {
        return NextResponse.json(
          { error: 'Active shift is for a different branch' },
          { status: 400 }
        );
      }
    }

    // Calculate order totals and validate menu items
    let subtotal = 0;
    const orderItemsToCreate = [];
    const inventoryDeductions = [];

    for (const item of items) {
      // Get menu item with variants
      const menuItem = await db.menuItem.findUnique({
        where: { id: item.menuItemId },
        include: {
          recipes: {
            include: {
              ingredient: true,
            },
          },
          categoryRel: true,
          ...(item.menuItemVariantId ? {
            variants: {
              include: {
                variantType: true,
                variantOption: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          } : {}),
        },
      });

      if (!menuItem) {
        return NextResponse.json(
          { error: `Menu item not found: ${item.menuItemId}` },
          { status: 404 }
        );
      }

      if (!menuItem.isActive) {
        return NextResponse.json(
          { error: `Menu item ${menuItem.name} is not available` },
          { status: 400 }
        );
      }

      // Handle variant pricing if provided
      let finalPrice = menuItem.price;
      let variantName = null;
      let variantId = null;

      if (item.menuItemVariantId) {
        const variant = await db.menuItemVariant.findUnique({
          where: { id: item.menuItemVariantId },
          include: {
            variantType: true,
            variantOption: true,
          },
        });

        if (variant) {
          finalPrice = menuItem.price + variant.priceModifier;
          variantName = `${variant.variantType.name}: ${variant.variantOption.name}`;
          variantId = variant.id;
        }
      }

      const itemSubtotal = finalPrice * item.quantity;
      subtotal += itemSubtotal;

      orderItemsToCreate.push({
        menuItemId: menuItem.id,
        itemName: menuItem.name,
        quantity: item.quantity,
        unitPrice: finalPrice,
        subtotal: itemSubtotal,
        recipeVersion: menuItem.version,
        menuItemVariantId: variantId,
        variantName,
      });

      // Calculate inventory deductions based on recipes
      // Filter recipes: if variant selected, only use variant-specific recipes; otherwise use base recipes
      const relevantRecipes = menuItem.recipes.filter(
        recipe => recipe.menuItemVariantId === (item.menuItemVariantId || null)
      );

      for (const recipe of relevantRecipes) {
        const totalDeduction = recipe.quantityRequired * item.quantity;
        inventoryDeductions.push({
          ingredientId: recipe.ingredient.id,
          ingredientName: recipe.ingredient.name,
          quantityChange: -totalDeduction,
          unit: recipe.unit,
        });
      }
    }

    const totalAmount = subtotal + (deliveryFee || 0) - (loyaltyDiscount || 0);

    // Get current shift for cashiers
    let currentShiftId = null;
    if (cashier.role === 'CASHIER') {
      const openShift = await db.shift.findFirst({
        where: {
          cashierId,
          isClosed: false,
        },
      });
      if (openShift) {
        currentShiftId = openShift.id;
      }
    }

    // Generate transaction hash for tamper detection
    const transactionHash = Buffer.from(
      `${branchId}-${finalOrderNumber}-${totalAmount}-${cashierId}-${Date.now()}`
    ).toString('base64');

    // Create order with inventory deduction
    const order = await db.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          id: `${branchId}-${finalOrderNumber}-${Date.now()}`,
          branchId,
          orderNumber: finalOrderNumber,
          orderTimestamp: new Date(),
          cashierId,
          subtotal,
          totalAmount,
          paymentMethod,
          orderType: orderType || 'dine-in',
          deliveryAddress: deliveryAddress || null,
          deliveryAreaId: deliveryAreaId || null,
          deliveryFee: deliveryFee || 0,
          customerId: customerId || null,
          customerAddressId: customerAddressId || null,
          courierId: courierId || null,
          transactionHash,
          synced: false,
          shiftId: currentShiftId,
        },
      });

      // Create order items and capture created records
      const createdOrderItems = [];
      for (const item of orderItemsToCreate) {
        const createdItem = await tx.orderItem.create({
          data: {
            ...item,
            orderId: newOrder.id,
          },
        });
        createdOrderItems.push(createdItem);
      }

      // Deduct inventory with atomic operations to prevent race conditions
      for (const deduction of inventoryDeductions) {
        await safeInventoryDeduct(
          tx,
          branchId,
          deduction.ingredientId,
          deduction.quantityChange,
          newOrder.id,
          cashierId,
          deduction.ingredientName
        );
      }

      return { order: newOrder, items: createdOrderItems };
    }).catch((transactionError) => {
      console.error('Transaction failed:', transactionError);
      throw transactionError;
    });

    // Get branch for response
    const branch = await db.branch.findUnique({
      where: { id: branchId },
    });

    // Increment customer address order count if delivery order with address
    if (customerAddressId && orderType === 'delivery') {
      try {
        await db.customerAddress.update({
          where: { id: customerAddressId },
          data: {
            orderCount: {
              increment: 1,
            },
          },
        });
      } catch (error) {
        console.error('Failed to update customer address order count:', error);
        // Don't fail the order if address update fails
      }
    }

    // Update customer statistics
    if (customerId) {
      try {
        // Calculate loyalty points (1 point per 100 EGP spent = 0.01 points per EGP)
        const pointsEarned = subtotal / 100;
        const netPointsChange = pointsEarned - (loyaltyPointsRedeemed || 0);

        await db.customer.update({
          where: { id: customerId },
          data: {
            totalSpent: {
              increment: subtotal,
            },
            orderCount: {
              increment: 1,
            },
            loyaltyPoints: {
              increment: netPointsChange,
            },
          },
        });

        // Create loyalty transaction record for earned points
        if (pointsEarned > 0) {
          try {
            await db.loyaltyTransaction.create({
              data: {
                customerId,
                points: pointsEarned,
                type: 'EARNED',
                orderId: order.order.id,
                amount: subtotal,
                notes: `Order #${finalOrderNumber}`,
              },
            });
          } catch (ltError) {
            console.error('Failed to create loyalty transaction:', ltError);
            // Don't fail the order if loyalty transaction fails
          }
        }

        // Create loyalty transaction record for redeemed points
        if (loyaltyPointsRedeemed && loyaltyPointsRedeemed > 0) {
          try {
            await db.loyaltyTransaction.create({
              data: {
                customerId,
                points: -loyaltyPointsRedeemed, // Negative because it's being deducted
                type: 'REDEEMED',
                orderId: order.order.id,
                amount: loyaltyDiscount,
                notes: `Redeemed on Order #${finalOrderNumber}`,
              },
            });

            // Create cost record for loyalty discount
            // This tracks the discount as a cost so:
            // - Revenue shows gross sales (300 EGP)
            // - Cost shows discount (30 EGP)
            // - Net profit is correct
            // - Cash collection matches
            try {
              await createLoyaltyDiscountCost(
                branchId,
                loyaltyDiscount,
                finalOrderNumber,
                order.order.id,
                customerId,
                currentShiftId
              );
            } catch (costError) {
              console.error('Failed to create loyalty discount cost:', costError);
              // Don't fail order if cost creation fails
            }
          } catch (ltError) {
            console.error('Failed to create redemption transaction:', ltError);
            // Don't fail the order if loyalty transaction fails
          }
        }

        // Update customer tier based on total spent
        const updatedCustomer = await db.customer.findUnique({
          where: { id: customerId },
        });

        if (updatedCustomer) {
          let newTier = 'BRONZE';
          // Update tier thresholds based on total spent (in EGP)
          if (updatedCustomer.totalSpent >= 10000) {
            newTier = 'PLATINUM';
          } else if (updatedCustomer.totalSpent >= 5000) {
            newTier = 'GOLD';
          } else if (updatedCustomer.totalSpent >= 2000) {
            newTier = 'SILVER';
          }

          if (updatedCustomer.tier !== newTier) {
            try {
              await db.customer.update({
                where: { id: customerId },
                data: { tier: newTier },
              });
            } catch (tierError) {
              console.error('Failed to update customer tier:', tierError);
              // Don't fail the order if tier update fails
            }
          }
        }
      } catch (customerError) {
        console.error('Failed to update customer statistics:', customerError);
        // Don't fail the order if customer update fails
      }
    }

    const responseOrder = order.order;

    return NextResponse.json({
      success: true,
      order: {
        id: responseOrder.id,
        branchId: responseOrder.branchId,
        orderNumber: responseOrder.orderNumber,
        orderTimestamp: responseOrder.orderTimestamp.toISOString(),
        totalAmount: responseOrder.totalAmount,
        subtotal: responseOrder.subtotal,
        paymentMethod: responseOrder.paymentMethod,
        orderType: responseOrder.orderType,
        deliveryFee: responseOrder.deliveryFee,
        deliveryAddress: responseOrder.deliveryAddress,
        deliveryAreaId: responseOrder.deliveryAreaId,
        isRefunded: responseOrder.isRefunded,
        refundReason: responseOrder.refundReason,
        transactionHash: responseOrder.transactionHash,
        synced: responseOrder.synced,
        shiftId: responseOrder.shiftId,
        createdAt: responseOrder.createdAt.toISOString(),
        updatedAt: responseOrder.updatedAt.toISOString(),
        cashierId: cashier.id,
        cashier: {
          id: cashier.id,
          username: cashier.username,
          name: cashier.name,
        },
        customerPhone: customerPhone || null,
        customerName: customerName || null,
        loyaltyPointsRedeemed: loyaltyPointsRedeemed || null,
        loyaltyDiscount: loyaltyDiscount || null,
        items: order.items.map(item => ({
          id: item.id,
          menuItemId: item.menuItemId,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          recipeVersion: item.recipeVersion,
          menuItemVariantId: item.menuItemVariantId,
          variantName: item.variantName,
          createdAt: item.createdAt.toISOString(),
        })),
        branch: branch ? {
          id: branch.id,
          branchName: branch.branchName,
        } : null,
      },
      message: 'Order processed successfully',
    });
  } catch (error: any) {
    console.error('Order processing error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);

    // Log to error tracking service in production
    // await logErrorToService(error, {
    //   endpoint: '/api/orders',
    //   userId,
    //   action: 'order.create',
    //   entityType: 'Order',
    //   entityId: newOrder?.id,
    //   error,
    // })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process order',
        details: error.message,
        errorName: error.name,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
    if (branchId && branchId !== 'all') {
      where.branchId = branchId;
    }

    if (startDate || endDate) {
      where.orderTimestamp = {};
      if (startDate) {
        where.orderTimestamp.gte = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of the day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.orderTimestamp.lte = endDateTime;
      }
    }

    const orders = await db.order.findMany({
      where,
      orderBy: { orderTimestamp: 'desc' },
      take: limit,
      skip: offset,
      include: {
        items: {
          include: {
            menuItem: {
              select: { id: true, name: true, category: true, price: true },
            },
          },
        },
        cashier: {
          select: { username: true, name: true },
        },
        branch: {
          select: { branchName: true },
        },
      },
    });

    const total = await db.order.count({
      where,
    });

    return NextResponse.json({
      orders,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + orders.length < total,
      },
    });
  } catch (error: any) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
