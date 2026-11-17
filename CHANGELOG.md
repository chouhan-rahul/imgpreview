# 📝 Change Log

All notable changes to the **Img Preview** extension will be documented in this file.

## [0.1.0] - 2026-11-11

### 🎉 Initial Release

- **🖼️ Gutter Previews:** High-performance image thumbnails displayed directly in the editor gutter.
- **🔍 Rich Hover Tooltips:** Detailed image previews with pixel dimensions (width × height), file size, image format, and a quick **Reveal in File Explorer** action.
- **⚡ Lightweight Architecture:** Optimized single-file bundle with no background daemons or unnecessary idle CPU overhead.
- **🌐 Broad Format Support:** SVG, WebP, PNG, JPEG, JPG, GIF, AVIF, BMP, ICO, TIFF, and APNG.
- **📂 Advanced Path Resolution:**
  - Relative paths (`./assets/image.png`, `../images/icon.svg`).
  - Framework aliases (`@/`, `~/`) for Next.js, Vite, and Vue projects.
  - Workspace root and `/public` static asset paths.
  - Data URIs (`data:image/svg+xml;...`, `data:image/png;base64,...`).
  - Remote HTTP/HTTPS images with local caching.
- **🚀 Performance Optimizations:**
  - Debounced document scanning to minimize typing interruptions.
  - Image decoration pooling to reduce repeated object allocation.
  - Header-only byte streaming for image dimension extraction without loading entire files into memory.
- **⌨️ Commands & Context Menu Actions:**
  - `Img Preview: Toggle Gutter Previews` – Enable or disable gutter thumbnails.
  - `Img Preview: Clear Image Cache` – Clear cached remote images and Data URIs.
  - `Img Preview: Copy Image as Data URI (Base64)` – Convert referenced images into Base64 Data URIs and copy them to the clipboard from the editor context menu or Command Palette.
- **📊 Status Bar Integration:** Displays the real-time count of detected images (`$(file-media) X images`) with a one-click shortcut to toggle gutter previews.
- **⚙️ Customization Settings:** Configurable debounce delay, maximum file size, gutter thumbnail scaling mode, and supported image extensions.