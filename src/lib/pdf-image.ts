const cache = new Map<string, string>();

export function loadPdfImage(url: string): Promise<string> {
  if (!url) return Promise.resolve("");
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const MAX = 800;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const jpeg = canvas.toDataURL("image/jpeg", 0.85);
        cache.set(url, jpeg);
        resolve(jpeg);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}