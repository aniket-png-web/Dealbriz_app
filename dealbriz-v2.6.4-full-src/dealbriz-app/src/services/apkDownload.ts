/**
 * APK Download Service
 * Ensures the compiled 4.3 MB Android APK binary is directly streamed
 * and downloaded as a genuine application/vnd.android.package-archive file,
 * preventing sandboxed iframe truncation or HTML fallback pages.
 */

export function getApkDirectUrl(): string {
  // Must be the public site: inside the APK window.location.origin is
  // https://localhost, which serves nothing.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.endsWith('dealbriz.com') || host.endsWith('dealbriz.in')) {
      return `${window.location.origin}/dealbriz.apk`;
    }
  }
  return 'https://dealbriz.com/dealbriz.apk';
}

export async function downloadApkBlob(
  onProgress?: (loadedBytes: number, totalBytes: number, percent: number) => void
): Promise<{ success: boolean; size?: number; error?: string }> {
  try {
    const res = await fetch(getApkDirectUrl(), {
      cache: 'no-cache',
      headers: {
        Accept: 'application/vnd.android.package-archive, application/octet-stream, */*',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch APK: HTTP ${res.status}`);
    }

    const contentLength = res.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 4418612;

    let blob: Blob;

    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          if (onProgress) {
            const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
            onProgress(received, total, percent);
          }
        }
      }

      blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
    } else {
      blob = await res.blob();
    }

    // Verify received size is genuine APK binary
    if (blob.size < 1000000) {
      console.warn(`Downloaded file size is suspiciously small: ${blob.size} bytes`);
    }

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'dealbriz.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 15000);

    return { success: true, size: blob.size };
  } catch (err: any) {
    console.error('In-memory APK blob download error, falling back to direct link:', err);

    // Fallback direct link
    const fallbackLink = document.createElement('a');
    fallbackLink.href = getApkDirectUrl();
    fallbackLink.target = '_blank';
    fallbackLink.rel = 'noopener noreferrer';
    fallbackLink.download = 'dealbriz.apk';
    document.body.appendChild(fallbackLink);
    fallbackLink.click();
    document.body.removeChild(fallbackLink);

    return { success: false, error: err?.message };
  }
}
