import { NextResponse } from 'next/server';
import { downloadCollection } from '../../../lib/video';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isAllowedCtaType(file) {
  return ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'].includes(file.type);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const sourceUrl = formData.get('sourceUrl');
    const ctaFile = formData.get('ctaFile') || formData.get('endImage');
    const mode = formData.get('mode');

    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return NextResponse.json({ error: 'sourceUrl is required.' }, { status: 400 });
    }

    let safeImage = null;
    if (ctaFile && ctaFile.size) {
      if (!isAllowedCtaType(ctaFile)) {
        return NextResponse.json({ error: 'Only PNG/JPG/WEBP images or MP4/MOV CTA videos are allowed.' }, { status: 400 });
      }
      if (ctaFile.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Image size must be 5MB or less.' }, { status: 400 });
      }
      safeImage = ctaFile;
    }

    const selectedMode = mode === 'one' || mode === 'ten' ? mode : 'all';
    const { processed, failed } = await downloadCollection(sourceUrl.trim(), safeImage, selectedMode);
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
