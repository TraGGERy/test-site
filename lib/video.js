import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ytdl from 'ytdl-core';
import ytpl from 'ytpl';

const DOWNLOAD_DIR = path.join('/tmp', 'downloads');

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(command, args);
    let stderr = '';
    p.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    p.on('error', (e) => reject(new Error(`${command} unavailable: ${e.message}`)));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `${command} failed with ${code}`));
    });
  });
}

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

async function resolveChannelShorts(sourceUrl, mode) {
  const response = await fetch(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error('Could not open YouTube channel shorts page.');
  const html = await response.text();
  const ids = [...html.matchAll(/(?:shorts\/|watch\?v=)([a-zA-Z0-9_-]{11})/g)].map((m) => m[1]);
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) throw new Error(`No videos found on this channel URL: ${sourceUrl}`);
  const max = mode === 'one' ? 1 : mode === 'ten' ? 10 : 30;
  return uniqueIds.slice(0, max).map((id) => ({ id, title: `Video ${id}`, viewCount: null, url: `https://www.youtube.com/watch?v=${id}` }));
}

async function resolveEntries(sourceUrl, mode) {
  if (/(youtube\.com\/@[^/]+\/shorts)/i.test(sourceUrl) || /(youtube\.com\/channel\/[^/]+\/shorts)/i.test(sourceUrl)) {
    return resolveChannelShorts(sourceUrl, mode);
  }

  if (ytpl.validateID(sourceUrl) || /[?&]list=/.test(sourceUrl)) {
    const playlist = await ytpl(sourceUrl, { pages: 10 });
    const max = mode === 'one' ? 1 : mode === 'ten' ? 10 : playlist.items.length;
    return playlist.items.slice(0, max).map((item) => ({
      id: item.id,
      title: item.title || item.id,
      viewCount: item.views ? Number(String(item.views).replace(/[^0-9]/g, '')) : null,
      url: item.shortUrl || `https://www.youtube.com/watch?v=${item.id}`
    }));
  }

  const info = await ytdl.getInfo(sourceUrl);
  return [{ id: info.videoDetails.videoId, title: info.videoDetails.title, viewCount: Number(info.videoDetails.viewCount || 0), url: sourceUrl }];
}

async function appendCtaClip(videoPath, ctaPath, outputPath) {
  await runCommand('ffmpeg', [
    '-y', '-i', videoPath, '-i', ctaPath,
    '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]',
    '-map', '[v]', '-map', '[a]', outputPath
  ]);
}

export async function readJobFile(jobId, fileName) {
  return path.join(DOWNLOAD_DIR, path.basename(jobId), path.basename(fileName));
}

export async function downloadCollection(sourceUrl, ctaFile, mode = 'all') {
  if (!isYouTubeUrl(sourceUrl)) throw new Error('Please provide a valid YouTube URL.');

  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const jobId = randomUUID();
  const jobDir = path.join(DOWNLOAD_DIR, jobId);
  await mkdir(jobDir, { recursive: true });

  let ctaPath = null;
  if (ctaFile) {
    ctaPath = path.join(jobDir, `cta-${Date.now()}.mp4`);
    await writeFile(ctaPath, Buffer.from(await ctaFile.arrayBuffer()));
  }

  const entries = await resolveEntries(sourceUrl, mode);
  const processed = [];
  const failed = [];

  for (const item of entries) {
    try {
      const safeId = item.id.replace(/[^a-zA-Z0-9-_]/g, '_');
      const basePath = path.join(jobDir, `${safeId}.mp4`);
      const stream = ytdl(item.url, { quality: 'highest', filter: 'audioandvideo' });
      await pipeToFile(stream, basePath);

      let finalName = `${safeId}.mp4`;
      if (ctaPath) {
        finalName = `${safeId}-cta.mp4`;
        await appendCtaClip(basePath, ctaPath, path.join(jobDir, finalName));
      }

      processed.push({
        id: item.id,
        title: item.title,
        viewCount: item.viewCount,
        fileUrl: `/api/files?jobId=${encodeURIComponent(jobId)}&file=${encodeURIComponent(finalName)}`
      });
    } catch (error) {
      failed.push({ id: item.id, title: item.title, reason: error.message || 'Failed to download video.' });
    }
  }

  return { processed, failed };
}
