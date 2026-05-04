import { NextResponse } from 'next/server';
import { downloadCollection } from '@/lib/video';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const sourceUrl = formData.get('sourceUrl');
    const endImage = formData.get('endImage');

    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return NextResponse.json({ error: 'sourceUrl is required.' }, { status: 400 });
    }

    const videos = await downloadCollection(sourceUrl, endImage && endImage.size ? endImage : null);
    return NextResponse.json({ total: videos.length, videos });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to download videos.' }, { status: 500 });
  }
}
