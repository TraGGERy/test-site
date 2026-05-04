import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { NextResponse } from 'next/server';
import { readJobFile } from '../../../lib/video';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const file = searchParams.get('file');

  if (!jobId || !file) {
    return NextResponse.json({ error: 'jobId and file are required.' }, { status: 400 });
  }

  try {
    const filePath = await readJobFile(jobId, file);
    await stat(filePath);

    const stream = createReadStream(filePath);
    return new Response(stream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${file}"`
      }
    });
  } catch {
    return NextResponse.json({ error: 'File not found or expired.' }, { status: 404 });
  }
}
