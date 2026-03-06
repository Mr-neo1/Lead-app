import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, initializeDatabase, schema, eq, generateId, now } from '@/lib/turso';
import { verifyToken } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// Change password endpoint
// - Any user can change their own password (requires current password)
// - Admin can change any user's password (without current password)
export async function POST(request) {
  await initializeDatabase();
  const database = db();

  // Authenticate
  const authResult = verifyToken(request);
  if (authResult.error) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
  }

  const currentUser = authResult.user;

  try {
    const { userId, currentPassword, newPassword } = await request.json();

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
    }

    // Determine target user
    const targetUserId = userId || currentUser.id;
    const isChangingOwnPassword = targetUserId === currentUser.id;
    const isAdmin = currentUser.role === ROLES.ADMIN;

    // Only admin can change other users' passwords
    if (!isChangingOwnPassword && !isAdmin) {
      return NextResponse.json({ error: 'You can only change your own password' }, { status: 403 });
    }

    // Find target user
    const [targetUser] = await database.select().from(schema.users)
      .where(eq(schema.users.id, targetUserId)).limit(1);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If changing own password, verify current password
    if (isChangingOwnPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
      }

      const validPassword = bcrypt.compareSync(currentPassword, targetUser.password);
      if (!validPassword) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
      }
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await database.update(schema.users)
      .set({ password: hashedPassword, updatedAt: now() })
      .where(eq(schema.users.id, targetUserId));

    // Log activity
    await database.insert(schema.activities).values({
      id: generateId(),
      userId: currentUser.id,
      action: 'PASSWORD_CHANGED',
      targetType: 'user',
      targetId: targetUserId,
      details: JSON.stringify({
        changedBy: currentUser.name,
        targetUser: targetUser.name,
        isOwnPassword: isChangingOwnPassword,
      }),
      createdAt: now(),
    });

    return NextResponse.json({
      success: true,
      message: isChangingOwnPassword 
        ? 'Your password has been changed successfully' 
        : `Password for ${targetUser.name} has been changed successfully`,
    });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
