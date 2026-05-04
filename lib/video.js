import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import ytdl from 'ytdl-core';
import ytpl from 'ytpl';

const DOWNLOAD_DIR = path.join('/tmp', 'downloads');

async function pipeToFile(stream, outputPath) {
  await new Promise((resolve, reject) => {
    const writer = createWriteStream(outputPath);
    stream.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
    stream.on('error', reject);
  });
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url || '');
}

async function resolveEntries(sourceUrl, mode) {
  if (ytpl.validateID(sourceUrl) || /[?&]list=/.test(sourceUrl)) {
    const playlist = await ytpl(sourceUrl, { pages: mode === 'one' ? 1 : 10 });
    const items = mode === 'one' ? playlist.items.slice(0, 1) : playlist.items;
    return items.map((item) => ({
      id: item.id,
      title: item.title || item.id,
      viewCount: item.views ? Number(String(item.views).replace(/[^0-9]/g, '')) : null,
      url: item.shortUrl || `https://www.youtube.com/watch?v=${item.id}`
    }));
  }

  const info = await ytdl.getInfo(sourceUrl);
  return [{
    id: info.videoDetails.videoId,
    title: info.videoDetails.title,
    viewCount: Number(info.videoDetails.viewCount || 0),
    url: sourceUrl
  }];
}

export async function readJobFile(jobId, fileName) {
  const safeJobId = path.basename(jobId);
  const safeFileName = path.basename(fileName);
  return path.join(DOWNLOAD_DIR, safeJobId, safeFileName);
}

export async function downloadCollection(sourceUrl, endImageFile, mode = 'all') {
  if (!isYouTubeUrl(sourceUrl)) {
    throw new Error('Please provide a valid YouTube URL.');
  }

  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const jobId = randomUUID();
  const jobDir = path.join(DOWNLOAD_DIR, jobId);
  await mkdir(jobDir, { recursive: true });

  if (endImageFile) {
    const imagePath = path.join(jobDir, 'end-image-uploaded-not-applied.txt');
    await writeFile(imagePath, 'Image was uploaded, but image append requires ffmpeg which is unavailable in this runtime.');
  }

  const entries = await resolveEntries(sourceUrl, mode);
  const processed = [];
  const failed = [];

  for (const item of entries) {
    try {
      const safeId = item.id.replace(/[^a-zA-Z0-9-_]/g, '_');
      const fileName = `${safeId}.mp4`;
      const outputPath = path.join(jobDir, fileName);
      const stream = ytdl(item.url, { quality: 'highest', filter: 'audioandvideo' });
      await pipeToFile(stream, outputPath);

      processed.push({
        id: item.id,
        title: item.title,
        viewCount: item.viewCount,
        fileUrl: `/api/files?jobId=${encodeURIComponent(jobId)}&file=${encodeURIComponent(fileName)}`
      });
    } catch (error) {
      failed.push({ id: item.id, title: item.title, reason: error.message || 'Failed to download video.' });
    }

    if (mode === 'one') break;
  }

  return { processed, failed };
}
