'use strict';

(() => {
  const MAX_FILES = 5;
  const MAX_DIMENSION = 1920;
  const WEBP_QUALITY = 0.84;
  const JPEG_QUALITY = 0.86;
  const ACCEPTED_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

  function validateSelection(files, currentCount = 0) {
    const selected = Array.from(files || []);
    if (selected.length + currentCount > MAX_FILES) {
      return { files: [], error: `Puedes subir hasta ${MAX_FILES} fotos a la vez. Quita alguna o elige un lote más pequeño.` };
    }
    const unsupported = selected.filter((file) => !ACCEPTED_TYPES.includes(file.type));
    if (unsupported.length) {
      const names = unsupported.map((file) => file.name || 'archivo sin nombre').join(', ');
      return { files: selected.filter((file) => ACCEPTED_TYPES.includes(file.type)), error: `No podemos usar ${names}. Elige fotos JPG, PNG o WebP.` };
    }
    return { files: selected, error: '' };
  }

  function createStoragePath(uuid = crypto.randomUUID(), mimeType = 'image/webp') {
    const extension = mimeType === 'image/webp' ? 'webp' : 'jpg';
    return `uploads/${uuid}.${extension}`;
  }

  function guestPhotoId(uuid) {
    if (!uuid) throw new Error('A database photo UUID is required');
    return `guest-${uuid}`;
  }

  function progressMessage(stage, position, total) {
    if (stage === 'compressing') return 'Preparando fotos…';
    if (stage === 'uploading') return `Subiendo ${position} de ${total}…`;
    if (stage === 'registering') return total === 1 ? 'Guardando entre las fotos compartidas…' : `Guardando ${position} de ${total} entre las fotos compartidas…`;
    return '';
  }

  function resultCopy(successCount, failureCount) {
    if (!failureCount) return {
      title: '¡Listo!',
      detail: successCount === 1 ? 'Tu foto ya está entre los recuerdos compartidos.' : `Tus ${successCount} fotos ya están entre los recuerdos compartidos.`,
    };
    return {
      title: `${successCount} ${successCount === 1 ? 'foto subida' : 'fotos subidas'}`,
      detail: `${failureCount} ${failureCount === 1 ? 'foto no pudo subirse' : 'fotos no pudieron subirse'}.`,
    };
  }

  function createPhotoPayload({ storagePath, uploaderName, caption, anonymous }) {
    const name = String(uploaderName || '').trim();
    const cleanCaption = String(caption || '').trim();
    if (!storagePath) throw new Error('A storage path is required');
    if (!anonymous && !name) throw new Error('Escribe tu nombre o marca “Sin nombre”.');
    if (!anonymous && name.length > 50) throw new Error('Usa un nombre de hasta 50 caracteres.');
    if (cleanCaption.length > 280) throw new Error('El contexto puede tener hasta 280 caracteres.');
    return {
      storage_path: storagePath,
      uploader_name: anonymous ? null : name,
      caption: cleanCaption || null,
      is_anonymous: Boolean(anonymous),
    };
  }

  function dimensions(width, height) {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode this image')),
      type,
      quality,
    ));
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      } catch (error) {
        // Older implementations may expose createImageBitmap without the
        // orientation option. The HTML image decoder is the reliable fallback.
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function compressImage(file) {
    const decoded = await decodeImage(file);
    try {
      const size = dimensions(decoded.width, decoded.height);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas is unavailable');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(decoded.image, 0, 0, size.width, size.height);
      let blob = await canvasBlob(canvas, 'image/webp', WEBP_QUALITY);
      if (blob.type !== 'image/webp') blob = await canvasBlob(canvas, 'image/jpeg', JPEG_QUALITY);
      if (blob.size > 10 * 1024 * 1024) throw new Error('La foto sigue pesando más de 10 MB después de comprimirla.');
      return { blob, width: size.width, height: size.height, originalSize: file.size };
    } finally {
      decoded.close();
    }
  }

  async function uploadBatch(items, uploadOne, onChange = () => {}) {
    const results = [];
    for (const item of items) {
      if (item.status === 'success') {
        results.push({ item, ok: true, skipped: true });
        continue;
      }
      if (item.retryable === false) {
        results.push({ item, ok: false, skipped: true, error: new Error(item.error) });
        continue;
      }
      try {
        const value = await uploadOne(item, (status) => { item.status = status; onChange(item); });
        item.status = 'success';
        item.saved = value;
        item.error = '';
        results.push({ item, ok: true, value });
      } catch (error) {
        item.status = 'error';
        item.error = error?.message || 'No pudimos subir esta foto.';
        if (error?.noRetry) item.retryable = false;
        results.push({ item, ok: false, error });
      }
      onChange(item);
    }
    return results;
  }

  window.chasPhotoUpload = Object.freeze({
    MAX_FILES, MAX_DIMENSION, WEBP_QUALITY, JPEG_QUALITY, ACCEPTED_TYPES,
    validateSelection, createStoragePath, guestPhotoId, createPhotoPayload,
    progressMessage, resultCopy, dimensions, compressImage, uploadBatch,
  });
})();
