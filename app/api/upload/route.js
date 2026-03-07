import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, now } from '@/lib/turso';
import { requireAuth, requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Maximum file size (500KB after base64)
const MAX_FILE_SIZE = 500 * 1024;

// Upload profile picture
export async function POST(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const targetUserId = formData.get('userId'); // Optional: admin can upload for another user

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check size
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `Image too large. Maximum size is ${MAX_FILE_SIZE / 1024}KB` 
      }, { status: 400 });
    }

    // Convert to base64 data URL
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    // Determine which user to update
    let userId = auth.user.id;
    
    // Admin can update another user's picture
    if (targetUserId && targetUserId !== auth.user.id) {
      const adminAuth = requireAdmin(request);
      if (adminAuth.error) {
        return NextResponse.json({ error: 'Only admins can update other users' }, { status: 403 });
      }
      userId = targetUserId;
    }

    // Update user profile picture
    await database.update(schema.users)
      .set({ 
        profilePicture: dataUrl,
        updatedAt: now()
      })
      .where(eq(schema.users.id, userId));

    return NextResponse.json({ 
      success: true, 
      profilePicture: dataUrl,
      message: 'Profile picture updated'
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}

// Delete profile picture
export async function DELETE(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');

    // Determine which user to update
    let userId = auth.user.id;
    
    // Admin can delete another user's picture
    if (targetUserId && targetUserId !== auth.user.id) {
      const adminAuth = requireAdmin(request);
      if (adminAuth.error) {
        return NextResponse.json({ error: 'Only admins can update other users' }, { status: 403 });
      }
      userId = targetUserId;
    }

    // Remove profile picture
    await database.update(schema.users)
      .set({ 
        profilePicture: null,
        updatedAt: now()
      })
      .where(eq(schema.users.id, userId));

    return NextResponse.json({ 
      success: true, 
      message: 'Profile picture removed'
    });
  } catch (error) {
    console.error('Delete picture error:', error);
    return NextResponse.json({ error: 'Failed to remove picture' }, { status: 500 });
  }
}
