import express from "express";
import cors from "cors";
import multer from "multer";
import sharp from "sharp";
import { PNG } from "pngjs";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import heicConvert from "heic-convert";
import * as archiver from "archiver";
import { createWorker } from "tesseract.js";

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Store uploads in memory for security & performance
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max file size
});

// Helper: Convert HEIC/HEIF to JPEG if needed and fallback unsupported PNGs through pngjs
function decodeRawPng(buffer) {
  const png = PNG.sync.read(buffer);
  const channels = png.alpha ? 4 : 3;
  return sharp(Buffer.from(png.data), {
    raw: {
      width: png.width,
      height: png.height,
      channels,
    },
  })
    .png()
    .toBuffer();
}

async function ensureJpegBuffer(file) {
  const contentType = (file.mimetype || "").toLowerCase();
  const fileName = (file.originalname || "").toLowerCase();
  const isHeicOrHeif =
    contentType === "image/heic" ||
    contentType === "image/heif" ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif");

  if (isHeicOrHeif) {
    return await heicConvert({
      buffer: file.buffer,
      format: "JPEG",
      quality: 1.0,
    });
  }

  const isPng = contentType === "image/png" || fileName.endsWith(".png");

  try {
    await sharp(file.buffer, { failOnError: false }).metadata();
    return file.buffer;
  } catch (err) {
    if (isPng) {
      return await decodeRawPng(file.buffer);
    }
    throw err;
  }
}

// Helper: Smart quality compressor using binary search with advanced parameters
async function compressToTarget(buffer, format, targetBytes, originalName, options = {}) {
  const {
    mode = "balanced",
    resolutionScale = 1.0,
    stripMetadata = true,
    preserveTransparency = true,
  } = options;

  let minQ = 5;
  let maxQ = 98;

  if (mode === "quality") {
    minQ = 60;
    maxQ = 98;
  } else if (mode === "compression") {
    minQ = 5;
    maxQ = 50;
  }

  let bestBuffer = null;
  let lastSize = Infinity;
  let iterations = 0;

  let targetFormat = format.toLowerCase();
  if (targetFormat === "jpg") targetFormat = "jpeg";

  // Pre-process: Resize if resolution scale is less than 1.0
  let sharpInstance = sharp(buffer);

  if (resolutionScale < 1.0) {
    const meta = await sharpInstance.metadata();
    const w = Math.max(10, Math.round(meta.width * resolutionScale));
    const h = Math.max(10, Math.round(meta.height * resolutionScale));
    sharpInstance = sharpInstance.resize(w, h, { fit: "inside" });
  }

  // Pre-process: Flatten transparency if transparency is not preserved
  if (!preserveTransparency) {
    sharpInstance = sharpInstance.flatten({ background: "#ffffff" });
  }

  const preProcessedBuffer = await sharpInstance.toBuffer();

  while (iterations < 7) {
    const q = Math.round((minQ + maxQ) / 2);
    let tempInstance = sharp(preProcessedBuffer);

    if (!stripMetadata) {
      tempInstance = tempInstance.withMetadata();
    }

    let temp;
    try {
      if (targetFormat === "png") {
        const paletteColors = mode === "compression" ? 64 : 256;
        temp = await tempInstance
          .png({ quality: q, palette: true, colors: paletteColors, compressionLevel: 9 })
          .toBuffer();
      } else if (targetFormat === "webp") {
        temp = await tempInstance.webp({ quality: q }).toBuffer();
      } else {
        temp = await tempInstance.jpeg({ quality: q, progressive: true }).toBuffer();
      }

      const size = temp.length;
      if (size <= targetBytes) {
        bestBuffer = temp;
        minQ = q + 1; // Try to get higher quality
      } else {
        maxQ = q - 1; // Need more compression
      }

      if (Math.abs(size - targetBytes) / targetBytes < 0.03 || size === lastSize) {
        if (size <= targetBytes) bestBuffer = temp;
        break;
      }
      lastSize = size;
    } catch (e) {
      break;
    }
    iterations++;
  }

  // Fallback for PNG if we couldn't fit the target size
  if ((!bestBuffer || bestBuffer.length > targetBytes) && targetFormat === "png") {
    return compressToTarget(buffer, "webp", targetBytes, originalName, options);
  }

  return bestBuffer || preProcessedBuffer;
}

// 1. Smart Image Compressor
app.post("/api/compress-image", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const mode = req.body.mode || "balanced";
    const resolutionScale = parseFloat(req.body.resolutionScale || "1.0");
    const stripMetadata = req.body.stripMetadata === "true";
    const preserveTransparency = req.body.preserveTransparency === "true";

    // Read target sizes (JSON array of size strings, e.g., ["100KB", "200KB"])
    let targetSizes = [];
    if (req.body.targetSizes) {
      try {
        targetSizes = JSON.parse(req.body.targetSizes);
      } catch (e) {
        targetSizes = [req.body.targetSizes];
      }
    } else if (req.body.targetSize) {
      targetSizes = [req.body.targetSize];
    }

    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const jpegBuffer = await ensureJpegBuffer(file);

      // Determine output format
      let format = "jpeg";
      if (file.mimetype.includes("png")) format = "png";
      if (file.mimetype.includes("webp")) format = "webp";

      const itemTarget = targetSizes[i] || targetSizes[0] || "";
      let targetBytes = null;

      if (itemTarget) {
        const match = itemTarget.match(/^([\d.]+)\s*(KB|MB)$/i);
        if (match) {
          const val = parseFloat(match[1]);
          const unit = match[2].toUpperCase();
          targetBytes = val * (unit === "MB" ? 1024 * 1024 : 1024);
        }
      }

      let compressedBuffer;
      const options = { mode, resolutionScale, stripMetadata, preserveTransparency };

      if (targetBytes) {
        compressedBuffer = await compressToTarget(jpegBuffer, format, targetBytes, file.originalname, options);
      } else {
        // Simple Mode-based compression without size limit
        let sharpInstance = sharp(jpegBuffer);

        if (resolutionScale < 1.0) {
          const meta = await sharpInstance.metadata();
          sharpInstance = sharpInstance.resize(
            Math.max(10, Math.round(meta.width * resolutionScale)),
            Math.max(10, Math.round(meta.height * resolutionScale)),
            { fit: "inside" }
          );
        }
        if (!preserveTransparency) {
          sharpInstance = sharpInstance.flatten({ background: "#ffffff" });
        }
        if (!stripMetadata) {
          sharpInstance = sharpInstance.withMetadata();
        }

        const defaultQuality = mode === "quality" ? 92 : mode === "compression" ? 35 : 75;

        if (format === "png") {
          compressedBuffer = await sharpInstance.png({ palette: mode !== "quality" }).toBuffer();
        } else if (format === "webp") {
          compressedBuffer = await sharpInstance.webp({ quality: defaultQuality }).toBuffer();
        } else {
          compressedBuffer = await sharpInstance.jpeg({ quality: defaultQuality }).toBuffer();
        }
      }

      const ext = format === "jpeg" ? "jpg" : format;
      const base64Data = compressedBuffer.toString("base64");

      results.push({
        name: file.originalname.substring(0, file.originalname.lastIndexOf(".")) + `_compressed.${ext}`,
        format,
        originalSize: file.buffer.length,
        compressedSize: compressedBuffer.length,
        dataUrl: `data:image/${format};base64,${base64Data}`,
      });
    }

    res.json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Image compression failed: " + error.message });
  }
});

// 2. Image Merger
app.post("/api/merge-images", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ error: "Upload at least 2 images to merge" });
    }

    const direction = req.body.direction || "vertical"; // vertical or horizontal
    const spacing = parseInt(req.body.spacing || "0");
    const backgroundColor = req.body.backgroundColor || "#ffffff";
    const exportFormat = req.body.exportFormat || "jpeg";
    const targetSize = req.body.targetSize; // optional size limit

    // Process all images to standard formats
    const processedBuffers = [];
    for (const file of req.files) {
      const buf = await ensureJpegBuffer(file);
      try {
        await sharp(buf, { failOnError: false }).metadata();
      } catch (err) {
        return res.status(400).json({
          error: `Unsupported image format for file ${file.originalname}. Please upload JPG, PNG, WEBP, BMP, HEIC, or HEIF images.`,
        });
      }
      processedBuffers.push(buf);
    }

    // Load metadatas
    const imageMetas = [];
    for (const buf of processedBuffers) {
      const meta = await sharp(buf).metadata();
      imageMetas.push({ buffer: buf, width: meta.width, height: meta.height });
    }

    let finalWidth = 0;
    let finalHeight = 0;
    const composites = [];

    if (direction === "vertical") {
      // Find standard width (average or first width)
      finalWidth = imageMetas[0].width;

      let currentY = 0;
      for (let i = 0; i < imageMetas.length; i++) {
        const img = imageMetas[i];
        // Resize to finalWidth preserving aspect ratio
        const scale = finalWidth / img.width;
        const newHeight = Math.round(img.height * scale);

        const resizedBuf = await sharp(img.buffer, { failOnError: false })
          .resize(finalWidth, newHeight)
          .toBuffer();

        composites.push({
          input: resizedBuf,
          top: currentY,
          left: 0,
        });

        currentY += newHeight + (i < imageMetas.length - 1 ? spacing : 0);
      }
      finalHeight = currentY;
    } else {
      // Horizontal merger
      // Find standard height
      finalHeight = imageMetas[0].height;

      let currentX = 0;
      for (let i = 0; i < imageMetas.length; i++) {
        const img = imageMetas[i];
        // Resize to finalHeight preserving aspect ratio
        const scale = finalHeight / img.height;
        const newWidth = Math.round(img.width * scale);

        const resizedBuf = await sharp(img.buffer, { failOnError: false })
          .resize(newWidth, finalHeight)
          .toBuffer();

        composites.push({
          input: resizedBuf,
          top: 0,
          left: currentX,
        });

        currentX += newWidth + (i < imageMetas.length - 1 ? spacing : 0);
      }
      finalWidth = currentX;
    }

    // Create base canvas
    let canvas = sharp({
      create: {
        width: finalWidth,
        height: finalHeight,
        channels: 4,
        background: backgroundColor,
      },
    });

    let mergedBuffer = await canvas.composite(composites).png().toBuffer();

    if (exportFormat === "webp") {
      mergedBuffer = await sharp(mergedBuffer, { failOnError: false }).webp().toBuffer();
    } else if (exportFormat !== "png") {
      mergedBuffer = await sharp(mergedBuffer, { failOnError: false }).jpeg().toBuffer();
    }

    // Apply target size compression if specified
    if (targetSize) {
      const match = targetSize.match(/^([\d.]+)\s*(KB|MB)$/i);
      if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        const targetBytes = val * (unit === "MB" ? 1024 * 1024 : 1024);
        mergedBuffer = await compressToTarget(mergedBuffer, exportFormat, targetBytes, "merged." + exportFormat);
      }
    }

    const base64Data = mergedBuffer.toString("base64");
    res.json({
      name: `merged-${Date.now()}.${exportFormat}`,
      format: exportFormat,
      size: mergedBuffer.length,
      dataUrl: `data:image/${exportFormat};base64,${base64Data}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Image merging failed: " + error.message });
  }
});

// 3. PDF Merger & Rearranger
app.post("/api/merge-pdf", upload.array("pdfs"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No PDF files uploaded" });
    }

    const pageOrder = req.body.pageOrder ? JSON.parse(req.body.pageOrder) : null;
    // pageOrder format: [{ fileIndex: 0, pageIndex: 1 }, { fileIndex: 1, pageIndex: 0 }]

    const mergedPdf = await PDFDocument.create();

    // Load all documents
    const pdfDocs = [];
    for (const file of req.files) {
      const doc = await PDFDocument.load(file.buffer);
      pdfDocs.push(doc);
    }

    if (pageOrder && pageOrder.length > 0) {
      // Dynamic page merging
      for (const item of pageOrder) {
        const fileIdx = parseInt(item.fileIndex);
        const pageIdx = parseInt(item.pageIndex);

        if (fileIdx >= 0 && fileIdx < pdfDocs.length) {
          const srcDoc = pdfDocs[fileIdx];
          if (pageIdx >= 0 && pageIdx < srcDoc.getPageCount()) {
            const [copiedPage] = await mergedPdf.copyPages(srcDoc, [pageIdx]);
            mergedPdf.addPage(copiedPage);
          }
        }
      }
    } else {
      // Bulk merge all pages in order
      for (const srcDoc of pdfDocs) {
        const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach((page) => mergedPdf.addPage(page));
      }
    }

    const pdfBytes = await mergedPdf.save();
    const base64Data = Buffer.from(pdfBytes).toString("base64");

    res.json({
      name: `merged-${Date.now()}.pdf`,
      size: pdfBytes.length,
      dataUrl: `data:application/pdf;base64,${base64Data}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "PDF merging failed: " + error.message });
  }
});

// 4. Image To PDF & 11. Screenshot to PDF
app.post("/api/image-to-pdf", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const pageSize = req.body.pageSize || "a4"; // a4, letter, autofit
    const orientation = req.body.orientation || "portrait"; // portrait, landscape
    const quality = parseInt(req.body.quality || "80");
    const margin = parseInt(req.body.margin || "0");

    const pdfDoc = await PDFDocument.create();

    const PAGE_SIZES = {
      a4: [595.28, 841.89], // Points (72 points/inch)
      letter: [612.0, 792.0],
    };

    for (const file of req.files) {
      const jpegBuffer = await ensureJpegBuffer(file);

      // Optimize image first using Sharp
      const optImageBuffer = await sharp(jpegBuffer)
        .jpeg({ quality })
        .toBuffer();

      const imageMeta = await sharp(optImageBuffer).metadata();
      const imgW = imageMeta.width;
      const imgH = imageMeta.height;

      let pageW = 0;
      let pageH = 0;

      if (pageSize === "autofit") {
        pageW = imgW + margin * 2;
        pageH = imgH + margin * 2;
      } else {
        const baseSize = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
        pageW = orientation === "portrait" ? baseSize[0] : baseSize[1];
        pageH = orientation === "portrait" ? baseSize[1] : baseSize[0];
      }

      const page = pdfDoc.addPage([pageW, pageH]);
      const embedImage = await pdfDoc.embedJpg(optImageBuffer);

      // Fit image in margins
      const maxDrawW = pageW - margin * 2;
      const maxDrawH = pageH - margin * 2;

      let drawW = maxDrawW;
      let drawH = maxDrawH;
      const imgRatio = imgW / imgH;
      const pageRatio = maxDrawW / maxDrawH;

      if (imgRatio > pageRatio) {
        drawH = maxDrawW / imgRatio;
      } else {
        drawW = maxDrawH * imgRatio;
      }

      const x = margin + (maxDrawW - drawW) / 2;
      const y = margin + (maxDrawH - drawH) / 2;

      page.drawImage(embedImage, {
        x,
        y,
        width: drawW,
        height: drawH,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const base64Data = Buffer.from(pdfBytes).toString("base64");

    res.json({
      name: `converted-${Date.now()}.pdf`,
      size: pdfBytes.length,
      dataUrl: `data:application/pdf;base64,${base64Data}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Image to PDF conversion failed: " + error.message });
  }
});

// 5. PDF Compressor (Smart compression via image optimization)
app.post("/api/compress-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF uploaded" });
    }

    const targetSize = req.body.targetSize; // e.g. "500KB" or "2MB"
    let targetBytes = null;
    if (targetSize) {
      const match = targetSize.match(/^([\d.]+)\s*(KB|MB)$/i);
      if (match) {
        const val = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        targetBytes = val * (unit === "MB" ? 1024 * 1024 : 1024);
      }
    }

    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const resources = pdfDoc.context.enumerateIndirectObjects();

    // Find all raw stream image objects and compress them
    for (const [, obj] of resources) {
      if (obj instanceof PDFRawStream) {
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of("Subtype"));
        if (subtype === PDFName.of("Image")) {
          // Re-compress the image inside the PDF to lower JPEG quality
          try {
            const rawBytes = obj.contents;
            const compressed = await sharp(rawBytes)
              .jpeg({ quality: 50, progressive: true })
              .toBuffer();

            obj.contents = compressed;
            dict.set(PDFName.of("Length"), pdfDoc.context.number(compressed.length));
            dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
          } catch (err) {
            // Ignore format errors (skip non-raster formats)
          }
        }
      }
    }

    let pdfBytes = await pdfDoc.save();

    // Check size, if still too large and target size is given, attempt a heavier compression
    if (targetBytes && pdfBytes.length > targetBytes) {
      const secondDoc = await PDFDocument.load(pdfBytes);
      const resObjects = secondDoc.context.enumerateIndirectObjects();
      for (const [, obj] of resObjects) {
        if (obj instanceof PDFRawStream) {
          const dict = obj.dict;
          const subtype = dict.get(PDFName.of("Subtype"));
          if (subtype === PDFName.of("Image")) {
            try {
              const rawBytes = obj.contents;
              // Resize image by 50% and quality 35% for aggressive compress
              const metadata = await sharp(rawBytes).metadata();
              const compressed = await sharp(rawBytes)
                .resize(Math.round(metadata.width * 0.6))
                .jpeg({ quality: 30 })
                .toBuffer();

              obj.contents = compressed;
              dict.set(PDFName.of("Length"), secondDoc.context.number(compressed.length));
              dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
            } catch (err) { }
          }
        }
      }
      pdfBytes = await secondDoc.save();
    }

    const base64Data = Buffer.from(pdfBytes).toString("base64");
    res.json({
      name: `${req.file.originalname.replace(".pdf", "")}_compressed.pdf`,
      originalSize: req.file.buffer.length,
      compressedSize: pdfBytes.length,
      dataUrl: `data:application/pdf;base64,${base64Data}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "PDF compression failed: " + error.message });
  }
});

// 6. Image Resizer
app.post("/api/resize-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const width = req.body.width ? parseInt(req.body.width) : null;
    const height = req.body.height ? parseInt(req.body.height) : null;
    const percentage = req.body.percentage ? parseFloat(req.body.percentage) : null;
    const lockAspectRatio = req.body.lockAspectRatio === "true";

    const jpegBuffer = await ensureJpegBuffer(req.file);
    const metadata = await sharp(jpegBuffer).metadata();

    let targetW = width;
    let targetH = height;

    if (percentage) {
      targetW = Math.round(metadata.width * (percentage / 100));
      targetH = Math.round(metadata.height * (percentage / 100));
    }

    let sharpInstance = sharp(jpegBuffer);

    if (targetW || targetH) {
      sharpInstance = sharpInstance.resize({
        width: targetW || undefined,
        height: targetH || undefined,
        fit: lockAspectRatio ? "inside" : "fill",
      });
    }

    const resizedBuffer = await sharpInstance.toBuffer();
    const format = metadata.format || "jpeg";
    const base64Data = resizedBuffer.toString("base64");

    res.json({
      name: `resized-${Date.now()}.${format === "jpeg" ? "jpg" : format}`,
      format,
      width: targetW || metadata.width,
      height: targetH || metadata.height,
      size: resizedBuffer.length,
      dataUrl: `data:image/${format};base64,${base64Data}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Image resizing failed: " + error.message });
  }
});

// 8. Image Format Converter
app.post("/api/convert-format", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const targetFormat = req.body.targetFormat || "png"; // png, jpeg, webp, bmp
    const results = [];

    for (const file of req.files) {
      const jpegBuffer = await ensureJpegBuffer(file);
      let converted;

      if (targetFormat === "bmp") {
        converted = await sharp(jpegBuffer).bmp().toBuffer();
      } else {
        converted = await sharp(jpegBuffer)
          .toFormat(targetFormat === "jpg" ? "jpeg" : targetFormat)
          .toBuffer();
      }

      const ext = targetFormat === "jpeg" ? "jpg" : targetFormat;
      const mimeType = targetFormat === "bmp"
        ? "image/bmp"
        : targetFormat === "jpg" || targetFormat === "jpeg"
          ? "image/jpeg"
          : `image/${targetFormat}`;
      const base64Data = converted.toString("base64");

      results.push({
        name: file.originalname.substring(0, file.originalname.lastIndexOf(".")) + `.${ext}`,
        format: targetFormat,
        originalSize: file.buffer.length,
        convertedSize: converted.length,
        dataUrl: `data:${mimeType};base64,${base64Data}`,
      });
    }

    if (req.files.length > 1 && req.body.zip === "true") {
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename=converted-images.zip`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      for (const item of results) {
        const itemBuffer = Buffer.from(item.dataUrl.split(",")[1], "base64");
        archive.append(itemBuffer, { name: item.name });
      }

      await archive.finalize();
    } else {
      res.json({ results });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Format conversion failed: " + error.message });
  }
});

// 9. Watermark Tool
app.post("/api/watermark", upload.fields([{ name: "image", maxCount: 1 }, { name: "logo", maxCount: 1 }]), async (req, res) => {
  try {
    const mainFile = req.files["image"] ? req.files["image"][0] : null;
    const logoFile = req.files["logo"] ? req.files["logo"][0] : null;

    if (!mainFile) {
      return res.status(400).json({ error: "Main image is required" });
    }

    const type = req.body.type || "text"; // text or logo
    const opacity = parseFloat(req.body.opacity || "0.5");
    const rotation = parseFloat(req.body.rotation || "0");
    const position = req.body.position || "center"; // center, top-left, top-right, bottom-left, bottom-right, tile
    const sizePercent = parseFloat(req.body.size || "20"); // percent of main image width

    const mainBuffer = await ensureJpegBuffer(mainFile);
    const mainMeta = await sharp(mainBuffer).metadata();
    const mainW = mainMeta.width;
    const mainH = mainMeta.height;

    let compositeElement = null;

    if (type === "text") {
      const text = req.body.text || "UNISH Tools";
      const color = req.body.textColor || "#ffffff";
      const size = Math.round(mainW * (sizePercent / 100) * 0.25); // auto scale font size

      // Build rotated text SVG overlay
      const svgW = mainW;
      const svgH = mainH;
      const xPos = "50%";
      const yPos = "50%";

      let svgContent = `
        <svg width="${svgW}" height="${svgH}">
          <style>
            .watermark {
              fill: ${color};
              font-size: ${size}px;
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              font-weight: bold;
              opacity: ${opacity};
              text-anchor: middle;
              dominant-baseline: middle;
            }
          </style>
      `;

      if (position === "tile") {
        svgContent += `<g>`;
        for (let x = 100; x < svgW; x += size * 4) {
          for (let y = 100; y < svgH; y += size * 3) {
            svgContent += `<text x="${x}" y="${y}" transform="rotate(${rotation}, ${x}, ${y})" class="watermark">${text}</text>`;
          }
        }
        svgContent += `</g>`;
      } else {
        // Absolute positions
        let tx = svgW / 2;
        let ty = svgH / 2;

        if (position === "top-left") { tx = size * 2; ty = size * 2; }
        else if (position === "top-right") { tx = svgW - size * 2; ty = size * 2; }
        else if (position === "bottom-left") { tx = size * 2; ty = svgH - size * 2; }
        else if (position === "bottom-right") { tx = svgW - size * 2; ty = svgH - size * 2; }

        svgContent += `<text x="${tx}" y="${ty}" transform="rotate(${rotation}, ${tx}, ${ty})" class="watermark">${text}</text>`;
      }

      svgContent += `</svg>`;

      compositeElement = {
        input: Buffer.from(svgContent),
        top: 0,
        left: 0,
      };
    } else {
      // Logo Watermark
      if (!logoFile) {
        return res.status(400).json({ error: "Logo image file is required for logo watermark" });
      }

      const logoBuffer = await ensureJpegBuffer(logoFile);
      const logoMeta = await sharp(logoBuffer).metadata();

      // Scale logo width relative to main image
      const targetLogoW = Math.round(mainW * (sizePercent / 100));
      const targetLogoH = Math.round(logoMeta.height * (targetLogoW / logoMeta.width));

      // Resize logo and apply opacity/rotation
      let logoSharp = sharp(logoBuffer).resize(targetLogoW, targetLogoH);

      if (rotation !== 0) {
        logoSharp = logoSharp.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
      }

      // Convert logo to png and apply alpha opacity channel
      let watermarkImg = await logoSharp.png().toBuffer();

      // Composite position coordinates
      let left = Math.round((mainW - targetLogoW) / 2);
      let top = Math.round((mainH - targetLogoH) / 2);

      const margin = 20;
      if (position === "top-left") { left = margin; top = margin; }
      else if (position === "top-right") { left = mainW - targetLogoW - margin; top = margin; }
      else if (position === "bottom-left") { left = margin; top = mainH - targetLogoH - margin; }
      else if (position === "bottom-right") { left = mainW - targetLogoW - margin; top = mainH - targetLogoH - margin; }

      // Adjust alpha channel using linear operation for opacity
      const opacityAdjustedLogo = await sharp(watermarkImg)
        .linear(1, 0)
        .ensureAlpha(opacity)
        .toBuffer();

      compositeElement = {
        input: opacityAdjustedLogo,
        top,
        left,
      };
    }

    const watermarkedBuffer = await sharp(mainBuffer)
      .composite([compositeElement])
      .toBuffer();

    const base64Data = watermarkedBuffer.toString("base64");
    const format = mainMeta.format || "jpeg";

    res.json({
      name: `watermarked-${Date.now()}.${format === "jpeg" ? "jpg" : format}`,
      format,
      size: watermarkedBuffer.length,
      dataUrl: `data:image/${format};base64,${base64Data}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Watermark failed: " + error.message });
  }
});

// 10. OCR Text Extractor
app.post("/api/ocr", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    const supportedLanguages = new Set(["eng", "spa", "fra", "deu"]);
    const lang = supportedLanguages.has(req.body.lang) ? req.body.lang : "eng";
    const jpegBuffer = await ensureJpegBuffer(req.file);

    const worker = await createWorker(lang);
    let text = "";
    try {
      const result = await worker.recognize(jpegBuffer);
      text = result.data.text;
    } finally {
      await worker.terminate();
    }

    res.json({ text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "OCR extraction failed: " + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`UNISH Tools backend listening on port ${PORT}`);
});
