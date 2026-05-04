import { randomUUID } from 'crypto';
import { mkdir, readdir, rename, writeFile } from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const DOWNLOAD_DIR = path.join('/tmp', 'downloads');

function runCommand(command, args, timeoutMs = 1000 * 60 * 8) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      reject(new Error(`${command} is not installed or failed to start: ${error.message}`));
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`${command} timed out after ${Math.floor(timeoutMs / 1000)}s`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(stderr || `${command} failed with code ${code}`));
    });
  });
}

async function appendImageToVideo(videoPath, imagePath, outputPath) {
  const imageVideoPath = `${outputPath}.image-clip.mp4`;

  await runCommand('ffmpeg', [
    '-y', '-loop', '1', '-i', imagePath, '-t', '3', '-vf', 'scale=720:-2,format=yuv420p', '-pix_fmt', 'yuv420p', imageVideoPath
  ]);

  await runCommand('ffmpeg', [
    '-y',
    '-i', videoPath,
    '-i', imageVideoPath,
    '-filter_complex', '[0:v][0:a][1:v]concat=n=2:v=1:a=1[v][a]',
    '-map', '[v]',
    '-map', '[a]',
    outputPath
  ]);
}

export async function readJobFile(jobId, fileName) {
  const safeJobId = path.basename(jobId);
  const safeFileName = path.basename(fileName);
  const filePath = path.join(DOWNLOAD_DIR, safeJobId, safeFileName);
  return filePath;
}

export async function downloadCollection(sourceUrl, endImageFile) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const jobId = randomUUID();
  const jobDir = path.join(DOWNLOAD_DIR, jobId);
  await mkdir(jobDir, { recursive: true });

  let localImagePath = null;
  if (endImageFile) {
    localImagePath = path.join(jobDir, 'end-image.png');
    await writeFile(localImagePath, Buffer.from(await endImageFile.arrayBuffer()));
  }

  const metadataArgs = ['--flat-playlist', '--dump-single-json', sourceUrl];
  const metadataResult = await runCommand('yt-dlp', metadataArgs);
  const metadata = JSON.parse(metadataResult.stdout || '{}');

  const entries = Array.isArray(metadata.entries) && metadata.entries.length
    ? metadata.entries.map((entry) => ({
      id: entry.id,
      title: entry.title || entry.id,
      viewCount: entry.view_count ?? null,
      webpageUrl: entry.url?.startsWith('http') ? entry.url : `https://www.youtube.com/watch?v=${entry.id}`
    }))
    : [{
      id: metadata.id,
      title: metadata.title || metadata.id,
      viewCount: metadata.view_count ?? null,
      webpageUrl: sourceUrl
    }];

  const processed = [];

  for (const item of entries) {
    const baseName = `${item.id}-${randomUUID()}`;
    const outputTemplate = path.join(jobDir, `${baseName}.%(ext)s`);

    await runCommand('yt-dlp', ['-f', 'mp4', '-o', outputTemplate, item.webpageUrl]);

    const files = await readdir(jobDir);
    const downloadedFile = files.find((file) => file.startsWith(baseName));
    if (!downloadedFile) continue;

    const downloadedPath = path.join(jobDir, downloadedFile);

    let finalFileName = downloadedFile;
    if (localImagePath) {
      finalFileName = `${baseName}-final.mp4`;
      const finalPath = path.join(jobDir, finalFileName);
      await appendImageToVideo(downloadedPath, localImagePath, finalPath);
    }

    const cleanFileName = `${item.id}.mp4`;
    await rename(path.join(jobDir, finalFileName), path.join(jobDir, cleanFileName));

    processed.push({
      id: item.id,
      title: item.title,
      viewCount: item.viewCount,
      fileUrl: `/api/files?jobId=${encodeURIComponent(jobId)}&file=${encodeURIComponent(cleanFileName)}`
    });
  }

  return { processed, failed: [] };
}
