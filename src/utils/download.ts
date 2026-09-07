/** Roughly the width we want a downloaded QR PNG to have, in pixels. */
const TARGET_PNG_WIDTH = 1024;

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save a canvas as a PNG, upscaled to something worth printing.
 *
 * The on-screen QR canvas is only a couple of hundred pixels wide, which prints
 * as a blurry square. Scaling by a whole number with image smoothing turned
 * off keeps every QR module a hard-edged block — the result is identical to
 * re-rendering at that size, and a scanner reads it at any distance.
 */
export function downloadCanvasAsPng(
  canvas: HTMLCanvasElement,
  fileName: string,
  background = '#ffffff',
): Promise<void> {
  return new Promise((resolve, reject) => {
    const scale = Math.max(1, Math.round(TARGET_PNG_WIDTH / canvas.width));

    const target = document.createElement('canvas');
    target.width = canvas.width * scale;
    target.height = canvas.height * scale;

    const context = target.getContext('2d');
    if (!context) {
      reject(new Error('Could not get a 2D canvas context for the download.'));
      return;
    }

    context.imageSmoothingEnabled = false;
    // A QR code drawn on transparency turns into a black square in most image
    // viewers, so paint the quiet zone explicitly.
    context.fillStyle = background;
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(canvas, 0, 0, target.width, target.height);

    target.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode the QR code as a PNG.'));
        return;
      }
      saveBlob(blob, fileName);
      resolve();
    }, 'image/png');
  });
}
