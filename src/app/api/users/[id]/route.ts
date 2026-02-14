import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

// PATCH - Update user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // In Next.js 16, params is a Promise and must be awaited
    const { id } = await params;

    const body = await request.json();
    const { username, email, name, role, branchId, requesterId, requesterRole } = body;

    // Verify requester exists
    const requester = await db.user.findUnique({
      where: { id: requesterId },
    });

    if (!requester) {
      return NextResponse.json(
        { success: false, error: 'Requester not found' },
        { status: 404 }
      );
    }

    // Get user to update
    const userToUpdate = await db.user.findUnique({
      where: { id },
    });

    if (!userToUpdate) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check permissions based on role
    const canEdit = requesterRole === 'ADMIN' ||
      (requesterRole === 'BRANCH_MANAGER' &&
       userToUpdate.role === 'CASHIER' &&
       userToUpdate.branchId === requester.branchId) ||
      (requesterRole === 'BRANCH_MANAGER' && id === requesterId);

    if (!canEdit) {
      return NextResponse.json(
        { success: false, error: 'Permission denied' },
        { status: 403 }
      );
    }

    // Check username uniqueness if being changed
    if (username && username !== userToUpdate.username) {
      const existingUser = await db.user.findFirst({
        where: {
          username,
          id: { not: id },
        },
      });

      if (existingUser) {
        return NextResponse.json(
          { success: false, error: 'Username already exists' },
          { status: 400 }
        );
      }
    }

    // Check email uniqueness if being changed
    if (email && email !== userToUpdate.email) {
      const existingEmail = await db.user.findFirst({
        where: {
          email,
          id: { not: id },
        },
      });

      if (existingEmail) {
        return NextResponse.json(
          { success: false, error: 'Email already exists' },
          { status: 400 }
        );
      }
    }

    // Branch Manager can only change cashiers in their branch or themselves
    if (requesterRole === 'BRANCH_MANAGER' && role && role !== 'CASHIER') {
      return NextResponse.json(
        { success: false, error: 'Branch Managers can only create/update Cashier accounts' },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: any = {};

    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (name !== undefined) updateData.name = name;

    // Only admins can change roles
    if (requesterRole === 'ADMIN' && role) {
      updateData.role = role;
      // Update branchId based on role
      if (role === 'ADMIN') {
        updateData.branchId = null;
      } else if (branchId) {
        updateData.branchId = branchId;
      }
    }

    // Update user
    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        branchId: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE - Delete user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // In Next.js 16, params is a Promise and must be awaited
    const { id } = await params;

    const { searchParams } = new URL(request.url);
    const requesterId = searchParams.get('requesterId');
    const requesterRole = searchParams.get('requesterRole');

    // Verify requester exists
    const requester = await db.user.findUnique({
      where: { id: requesterId },
    });

    if (!requester) {
      return NextResponse.json(
        { success: false, error: 'Requester not found' },
        { status: 404 }
      );
    }

    // Get user to delete
    const userToDelete = await db.user.findUnique({
      where: { id },
    });

    if (!userToDelete) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent self-deletion
    if (id === requesterId) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Check permissions
    const canDelete = requesterRole === 'ADMIN' ||
      (requesterRole === 'BRANCH_MANAGER' &&
       userToDelete.role === 'CASHIER' &&
       userToDelete.branchId === requester.branchId);

    if (!canDelete) {
      return NextResponse.json(
        { success: false, error: 'Permission denied' },
        { status: 403 }
      );
    }

    // Delete user
    await db.user.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
