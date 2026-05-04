'use client';

import { useState } from 'react';

export default function HomePage() {
  const [sourceUrl, setSourceUrl] = useState('');
  const [image, setImage] = useState(null);
  const [mode, setMode] = useState('all');
  const [status, setStatus] = useState('');
  const [results, setResults] = useState([]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setStatus('Downloading videos. This can take some time...');
    setResults([]);

    const formData = new FormData();
    formData.append('sourceUrl', sourceUrl);
    if (image) formData.append('endImage', image);
    formData.append('mode', mode);

    const response = await fetch('/api/download', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      setStatus(data.error || 'Something went wrong.');
      return;
    }

    setStatus(`Done. Processed ${data.total} video(s).`);
    setResults(data.videos || []);
  };

  return (
    <main style={{ maxWidth: 850, margin: '40px auto', fontFamily: 'Arial, sans-serif' }}>
      <h1>YouTube Bulk Downloader (with Views)</h1>
      <p>
        Paste a YouTube URL (single video, Shorts, playlist, or channel). The app downloads all detected videos and
        shows each video&apos;s view count.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
        <input
          required
          type="url"
          placeholder="https://www.youtube.com/@channel/videos or playlist/video URL"
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          style={{ padding: 10 }}
        />

        <input type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] || null)} />

        <select value={mode} onChange={(event) => setMode(event.target.value)} style={{ padding: 10 }} >
          <option value="all">All videos</option>
          <option value="one">One video only</option>
        </select>

        <button type="submit" style={{ padding: 10, cursor: 'pointer' }}>
          Download Videos
        </button>
      </form>

      {status ? <p style={{ marginTop: 16 }}>{status}</p> : null}

      {results.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <h2>Downloads</h2>
          <ul style={{ lineHeight: 1.9 }}>
            {results.map((video) => (
              <li key={video.id}>
                <strong>{video.title}</strong> — Views: {video.viewCount ?? 'N/A'} —{' '}
                <a href={video.fileUrl} download>
                  Download file
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
