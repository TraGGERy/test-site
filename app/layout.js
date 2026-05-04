export const metadata = {
  title: 'YouTube Shorts Downloader',
  description: 'Download YouTube videos and append an image at the end.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
