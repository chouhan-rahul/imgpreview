const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { imageSize } = require('image-size');

describe('Img Preview Test Suite', () => {

  // 1. Extension Icon Validation
  describe('Extension Icon Validation', () => {
    it('should find and validate the extension icon referenced in package.json', () => {
      const pkgPath = path.resolve(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      assert(pkg.icon, 'package.json must specify an "icon" field');

      const iconPath = path.resolve(__dirname, '..', pkg.icon);
      assert(fs.existsSync(iconPath), `Icon file must exist at ${pkg.icon}`);

      const iconBuffer = fs.readFileSync(iconPath);
      const iconDims = imageSize(iconBuffer);

      assert.strictEqual(iconDims.type, 'png', 'Icon must be in PNG format');
      assert(iconDims.width > 0 && iconDims.height > 0, 'Icon must have positive dimensions');
      assert.strictEqual(iconDims.width, iconDims.height, 'Icon must be a square aspect ratio');
    });
  });

  // 2. Vector Image (SVG) Inspection
  describe('Vector Image (SVG) Parsing', () => {
    it('should parse explicit width and height from SVG buffer', () => {
      const sampleSvg = `<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" fill="#4E71FF"/></svg>`;
      const buffer = Buffer.from(sampleSvg, 'utf-8');
      const dims = imageSize(buffer);

      assert.strictEqual(dims.type, 'svg', 'Format should be recognized as SVG');
      assert.strictEqual(dims.width, 128, 'Parsed width should match attribute');
      assert.strictEqual(dims.height, 128, 'Parsed height should match attribute');
    });

    it('should parse viewBox dimensions when width/height attributes are omitted', () => {
      const viewBoxSvg = `<svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg"><circle cx="120" cy="90" r="50"/></svg>`;
      const buffer = Buffer.from(viewBoxSvg, 'utf-8');
      const dims = imageSize(buffer);

      assert.strictEqual(dims.type, 'svg', 'Format should be recognized as SVG');
      assert.strictEqual(dims.width, 240, 'Width should be derived from viewBox');
      assert.strictEqual(dims.height, 180, 'Height should be derived from viewBox');
    });
  });

  // 3. Document Scanner & Path Recognition (Self-Contained)
  describe('Document Scanner & Path Recognition', () => {
    const extPattern = 'png|jpg|jpeg|gif|svg|webp|bmp|ico|avif|tiff|tif|apng';

    it('should detect relative, parent, and framework alias paths in code', () => {
      const mockCode = `
        import logo from './assets/logo.svg';
        const banner = require('../images/banner.webp');
        const icon = '@/components/hero.png';
        const avatar = '~/static/avatar.avif';
      `;

      const quotedRegex = new RegExp(
        `(['"\`])([^'"\`\\r\\n]+?\\.(?:${extPattern})(?:\\?[^'"\`\\s\\)]*)?)\\1`,
        'gi'
      );
      const matches = [];
      let match;
      while ((match = quotedRegex.exec(mockCode)) !== null) {
        matches.push(match[2]);
      }

      assert(matches.includes('./assets/logo.svg'), 'Should detect ./assets/logo.svg');
      assert(matches.includes('../images/banner.webp'), 'Should detect ../images/banner.webp');
      assert(matches.includes('@/components/hero.png'), 'Should detect @/ alias path');
      assert(matches.includes('~/static/avatar.avif'), 'Should detect ~/ alias path');
    });

    it('should detect CSS url(...) with and without quotes', () => {
      const mockCss = `
        .hero { background-image: url('./bg.jpg'); }
        .card { background: url("../icons/card.svg"); }
        .bare { background: url(unquoted.png); }
      `;

      const cssUrlRegex = /url\(\s*(['"]?)([^'"\`\)]+?)\1\s*\)/gi;
      const urls = [];
      let match;
      while ((match = cssUrlRegex.exec(mockCss)) !== null) {
        urls.push(match[2]);
      }

      assert(urls.includes('./bg.jpg'), 'Should detect single quoted CSS url');
      assert(urls.includes('../icons/card.svg'), 'Should detect double quoted CSS url');
      assert(urls.includes('unquoted.png'), 'Should detect unquoted CSS url');
    });

    it('should detect Markdown image syntax', () => {
      const mockMarkdown = `
        ![Project Logo](./assets/logo.png)
        ![Remote Banner](https://cdn.example.com/banner.webp?w=800)
      `;

      const mdRegex = /!\[[^\]]*\]\(\s*(['"]?)([^'"\`\s\)]+)\1[^\)]*\)/gi;
      const images = [];
      let match;
      while ((match = mdRegex.exec(mockMarkdown)) !== null) {
        images.push(match[2]);
      }

      assert(images.includes('./assets/logo.png'), 'Should extract local markdown image path');
      assert(images.some((i) => i.includes('cdn.example.com/banner.webp')), 'Should extract remote markdown image');
    });

    it('should detect Base64 and UTF-8 Data URIs', () => {
      const base64Uri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const svgDataUri = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='10' fill='%23F59E0B'/></svg>";

      const mockHtml = `
        <img src="${base64Uri}" alt="Base64" />
        <img src="${svgDataUri}" alt="SVG" />
      `;

      const quotedDataUriRegex = /(['"`])(data:image\/[a-zA-Z0-9\+\-\.]+;?[a-zA-Z0-9=\+\-;]*,[\s\S]*?)\1/gi;
      const foundUris = [];
      let match;
      while ((match = quotedDataUriRegex.exec(mockHtml)) !== null) {
        foundUris.push(match[2]);
      }

      assert.strictEqual(foundUris.length, 2, 'Should detect both Data URIs');
      assert(foundUris[0].startsWith('data:image/png;base64,'), 'Should detect Base64 PNG');
      assert(foundUris[1].startsWith('data:image/svg+xml'), 'Should detect UTF-8 SVG');
    });

    it('should detect remote image URLs with query parameters and known CDNs', () => {
      const mockRemote = `
        const unsplash = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=400&auto=format&fit=crop";
        const picsum = "https://picsum.photos/400/300.jpg";
        const placeholder = "https://placehold.co/200x120/png";
        const webpQuery = "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=200&fm=webp";
        const bareUnsplash = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=200";
      `;

      const remoteUrlRegex = new RegExp(`https?:\\/\\/[^\\s'"\`\\)<>]+[\\./](?:${extPattern})(?:\\?[^\\s'"\`\\)<>]*)?`, 'gi');
      const knownImageCdnRegex = /https?:\/\/(?:images\.unsplash\.com|picsum\.photos|placehold\.co|via\.placeholder\.com|placekitten\.com|dummyimage\.com|images\.pexels\.com|cdn\.pixabay\.com)\/[^\s'"\`\)<>]+/gi;
      const remoteQueryRegex = /https?:\/\/[^\s'"\`\)<>]+\?(?:[^\s'"\`\)<>]*&(?:amp;)?)?(?:auto=format|(?:format|fm|ext)=(?:jpg|jpeg|png|webp|avif|svg))[^\s'"\`\)<>]*/gi;

      const directMatches = mockRemote.match(remoteUrlRegex) || [];
      const cdnMatches = mockRemote.match(knownImageCdnRegex) || [];
      const queryMatches = mockRemote.match(remoteQueryRegex) || [];

      assert(directMatches.some((u) => u.includes('picsum.photos/400/300.jpg')), 'Should match direct image URL');
      assert(directMatches.some((u) => u.includes('placehold.co/200x120/png')), 'Should match URL ending in /png');
      assert(queryMatches.some((u) => u.includes('fm=webp')), 'Should match image with fm=webp formatting');
      assert(cdnMatches.some((u) => u.includes('photo-1500530855697-b586d89ba3ee?w=200')), 'Should match known Unsplash CDN URL');
    });

    it('should detect multi-line HTML src attributes', () => {
      const mockMultiLine = `
        <img
          src="https://placehold.co/200x120/png"
          alt="Placeholder PNG">
        <img
          src="./local/banner.webp"
          alt="Banner">
      `;

      const srcAttrRegex = new RegExp(
        `\\bsrc=(["'])(data:image\\/[^'"]+|https?:\\/\\/[^'"]+|[^'"\\r\\n]+?[\\./](?:${extPattern})(?:\\?[^'"\\s\\)]*)?)\\1`,
        'gi'
      );

      const foundSrcs = [];
      let match;
      while ((match = srcAttrRegex.exec(mockMultiLine)) !== null) {
        foundSrcs.push(match[2]);
      }

      assert.strictEqual(foundSrcs.length, 2, 'Should detect both multi-line src attributes');
      assert.strictEqual(foundSrcs[0], 'https://placehold.co/200x120/png');
      assert.strictEqual(foundSrcs[1], './local/banner.webp');
    });
  });

  // 4. Bounded Hover Geometry Calculation
  describe('Hover Geometry & Aspect-Ratio Scaling', () => {
    it('should constrain large 4K images to compact fixed bounds without distortion', () => {
      const maxWidth = 180;
      const maxHeight = 90;

      // 4K UHD landscape: 3840 x 2160
      const origWidth = 3840;
      const origHeight = 2160;

      const scale = Math.min(maxWidth / origWidth, maxHeight / origHeight);
      const scaledWidth = Math.round(origWidth * scale);
      const scaledHeight = Math.round(origHeight * scale);

      assert(scaledWidth <= maxWidth, 'Scaled width must not exceed max bound');
      assert(scaledHeight <= maxHeight, 'Scaled height must not exceed max bound');
      assert.strictEqual(scaledWidth, 160, 'Landscape image should fit proportionally');
      assert.strictEqual(scaledHeight, 90, 'Height should scale proportionally');
    });

    it('should upscale small icons (e.g. 24x24) to fill preview box clearly on hover', () => {
      const maxWidth = 180;
      const maxHeight = 90;

      // Small 24x24 icon
      const origWidth = 24;
      const origHeight = 24;

      const scale = Math.min(maxWidth / origWidth, maxHeight / origHeight);
      const scaledWidth = Math.round(origWidth * scale);
      const scaledHeight = Math.round(origHeight * scale);

      assert(scaledWidth <= maxWidth, 'Scaled width must not exceed max bound');
      assert(scaledHeight <= maxHeight, 'Scaled height must not exceed max bound');
      assert.strictEqual(scaledWidth, 90, 'Small square icon should scale to 90px width');
      assert.strictEqual(scaledHeight, 90, 'Small square icon should scale to 90px height');
    });
  });
});
