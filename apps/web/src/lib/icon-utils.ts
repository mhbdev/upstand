export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

export const MAX_RAW_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateImageFile(file: File): ValidationResult {
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error:
        "Unsupported file format. Please select a PNG, JPEG, WebP, GIF, or SVG image.",
    };
  }

  if (file.size > MAX_RAW_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: "Selected file exceeds the maximum size limit of 2MB.",
    };
  }

  return { valid: true };
}

/**
 * Resizes raster images using HTML Canvas to a max dimension (default 256px)
 * and returns a compressed WebP/PNG Data URI. Passes SVGs through as Data URIs.
 */
export async function compressAndConvertToDataUri(
  file: File,
  maxDimension = 256,
): Promise<string> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Handle SVG directly
  if (file.type.toLowerCase().includes("svg")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read SVG file"));
      reader.readAsDataURL(file);
    });
  }

  // Handle raster images (PNG, JPEG, WebP, GIF)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get 2D canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first for ultra-light compression, fallback to PNG
        let dataUrl = canvas.toDataURL("image/webp", 0.85);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/png");
        }

        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error("Failed to load image into canvas"));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

// Preset Icon Options for Projects & Resources
export const PRESET_ICON_OPTIONS = [
  { id: "preset:folder", label: "Folder", emoji: "📁" },
  { id: "preset:rocket", label: "Rocket", emoji: "🚀" },
  { id: "preset:sparkles", label: "Sparkles", emoji: "✨" },
  { id: "preset:database", label: "Database", emoji: "🗄️" },
  { id: "preset:server", label: "Server", emoji: "🖥️" },
  { id: "preset:cloud", label: "Cloud", emoji: "☁️" },
  { id: "preset:code", label: "Code", emoji: "💻" },
  { id: "preset:cpu", label: "Processor", emoji: "⚡" },
  { id: "preset:shield", label: "Security", emoji: "🛡️" },
  { id: "preset:terminal", label: "Terminal", emoji: "📟" },
  { id: "preset:globe", label: "Globe", emoji: "🌐" },
  { id: "preset:box", label: "Package", emoji: "📦" },
];
