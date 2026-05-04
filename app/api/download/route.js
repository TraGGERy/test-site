import { NextResponse } from 'next/server';
import { downloadCollection } from '../../../lib/video';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isAllowedImageType(file) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const sourceUrl = formData.get('sourceUrl');
    const endImage = formData.get('endImage');
    const mode = formData.get('mode');

    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return NextResponse.json({ error: 'sourceUrl is required.' }, { status: 400 });
    }

    let safeImage = null;
    if (endImage && endImage.size) {
      if (!isAllowedImageType(endImage)) {
        return NextResponse.json({ error: 'Only PNG, JPG, or WEBP images are allowed.' }, { status: 400 });
      }
      if (endImage.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Image size must be 5MB or less.' }, { status: 400 });
      }
      safeImage = endImage;
    }

    const { processed, failed } = await downloadCollection(sourceUrl.trim(), safeImage, mode === 'one' ? 'one' : 'all');
    return NextResponse.json({
      total: processed.length + failed.length,
      success: processed.length,
      failed: failed.length,
      videos: processed,
      errors: failed
    });
  } catch (error) {
    const message = error.message || 'Failed to download videos.';
    const status = /not installed|failed to start|timed out/i.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
