import imageCompression from 'browser-image-compression';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

export function validateMedicalImage(file: File): void {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error('Unsupported image format. Please use JPEG, PNG, WEBP, or HEIC.');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image is too large. Maximum size is 10 MB before compression.');
  }
}

export async function compressMedicalImage(file: File): Promise<File> {
  validateMedicalImage(file);

  const compressed = await imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    initialQuality: 0.8,
  });

  return compressed;
}
