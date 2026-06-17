import path from "path";
import fs from "fs/promises";
import { createServer as createHttpServer } from "http";
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
const HOST = process.env.HOST || "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production";
const httpServer = createHttpServer(app);

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, port: Number(PORT), host: HOST });
});

function parseJsonArrayField(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

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

  let sharpInstance = sharp(buffer);

  if (resolutionScale < 1.0) {
    const meta = await sharpInstance.metadata();
    const w = Math.max(10, Math.round(meta.width * resolutionScale));
    const h = Math.max(10, Math.round(meta.height * resolutionScale));
    sharpInstance = sharpInstance.resize(w, h, { fit: "inside" });
  }

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
        minQ = q + 1;
      } else {
        maxQ = q - 1;
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

  if ((!bestBuffer || bestBuffer.length > targetBytes) && targetFormat === "png") {
    return compressToTarget(buffer, "webp", targetBytes, originalName, options);
  }

  return bestBuffer || preProcessedBuffer;
}

app.post("/api/compress-image", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const mode = req.body.mode || "balanced";
    const resolutionScale = parseFloat(req.body.resolutionScale || "1.0");
    const stripMetadata = req.body.stripMetadata === "true";
    const preserveTransparency = req.body.preserveTransparency === "true";

    let targetSizes = parseJsonArrayField(req.body.targetSizes);
    if (targetSizes.length === 0 && req.body.targetSizes) {
      targetSizes = [req.body.targetSizes];
    } else if (targetSizes.length === 0 && req.body.targetSize) {
      targetSizes = [req.body.targetSize];
    }

    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const jpegBuffer = await ensureJpegBuffer(file);

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

app.post("/api/merge-images", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ error: "Upload at least 2 images to merge" });
    }

    const direction = req.body.direction || "vertical";
    const spacing = parseInt(req.body.spacing || "0");
    const backgroundColor = req.body.backgroundColor || "#ffffff";
    const exportFormat = req.body.exportFormat || "jpeg";

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

    const imageMetas = [];
    for (const buf of processedBuffers) {
      const meta = await sharp(buf).metadata();
      imageMetas.push({ buffer: buf, width: meta.width, height: meta.height });
    }

    let finalWidth = 0;
    let finalHeight = 0;
    const composites = [];

    if (direction === "vertical") {
      finalWidth = imageMetas[0].width;
      let currentY = 0;
      for (let i = 0; i < imageMetas.length; i++) {
        const img = imageMetas[i];
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
      finalHeight = imageMetas[0].height;
      let currentX = 0;
      for (let i = 0; i < imageMetas.length; i++) {
        const img = imageMetas[i];
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

app.post("/api/merge-pdf", upload.array("pdfs"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No PDF files uploaded" });
    }

    const pageOrder = parseJsonArrayField(req.body.pageOrder, null);
    const mergedPdf = await PDFDocument.create();
    const pdfDocs = [];

    for (const file of req.files) {
      const doc = await PDFDocument.load(file.buffer);
      pdfDocs.push(doc);
    }

    if (pageOrder && pageOrder.length > 0) {
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

app.post("/api/image-to-pdf", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const pageSize = req.body.pageSize || "a4";
    const orientation = req.body.orientation || "portrait";
    const quality = parseInt(req.body.quality || "80");
    const margin = parseInt(req.body.margin || "0");

    const pdfDoc = await PDFDocument.create();
    const PAGE_SIZES = {
      a4: [595.28, 841.89],
      letter: [612.0, 792.0],
    };

    for (const file of req.files) {
      const jpegBuffer = await ensureJpegBuffer(file);
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

app.post("/api/compress-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF uploaded" });
    }

    const targetSize = req.body.targetSize;
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

    for (const [, obj] of resources) {
      if (obj instanceof PDFRawStream) {
        const dict = obj.dict;
        const subtype = dict.get(PDFName.of("Subtype"));
        if (subtype === PDFName.of("Image")) {
          try {
            const rawBytes = obj.contents;
            const compressed = await sharp(rawBytes)
              .jpeg({ quality: 50, progressive: true })
              .toBuffer();

            obj.contents = compressed;
            dict.set(PDFName.of("Length"), pdfDoc.context.number(compressed.length));
            dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
          } catch (err) {}
        }
      }
    }

    let pdfBytes = await pdfDoc.save();

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
              const meta = await sharp(rawBytes).metadata();
              const compressed = await sharp(rawBytes)
                .resize(Math.round(meta.width * 0.6))
                .jpeg({ quality: 30 })
                .toBuffer();

              obj.contents = compressed;
              dict.set(PDFName.of("Length"), secondDoc.context.number(compressed.length));
              dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
            } catch (err) {}
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

app.post("/api/convert-format", upload.array("images"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const targetFormat = req.body.targetFormat || "png";
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
      res.setHeader("Content-Disposition", "attachment; filename=converted-images.zip");
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

app.post("/api/watermark", upload.fields([{ name: "image", maxCount: 1 }, { name: "logo", maxCount: 1 }]), async (req, res) => {
  try {
    const mainFile = req.files["image"] ? req.files["image"][0] : null;
    const logoFile = req.files["logo"] ? req.files["logo"][0] : null;

    if (!mainFile) {
      return res.status(400).json({ error: "Main image is required" });
    }

    const type = req.body.type || "text";
    const opacity = parseFloat(req.body.opacity || "0.5");
    const rotation = parseFloat(req.body.rotation || "0");
    const position = req.body.position || "center";
    const sizePercent = parseFloat(req.body.size || "20");
    const mainBuffer = await ensureJpegBuffer(mainFile);
    const mainMeta = await sharp(mainBuffer).metadata();
    const mainW = mainMeta.width;
    const mainH = mainMeta.height;

    let compositeElement = null;

    if (type === "text") {
      const text = req.body.text || "NYORIA Tools";
      const color = req.body.textColor || "#ffffff";
      const size = Math.round(mainW * (sizePercent / 100) * 0.25);

      const svgW = mainW;
      const svgH = mainH;
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
      if (!logoFile) {
        return res.status(400).json({ error: "Logo image file is required for logo watermark" });
      }

      const logoBuffer = await ensureJpegBuffer(logoFile);
      const logoMeta = await sharp(logoBuffer).metadata();
      const targetLogoW = Math.round(mainW * (sizePercent / 100));
      const targetLogoH = Math.round(logoMeta.height * (targetLogoW / logoMeta.width));
      let logoSharp = sharp(logoBuffer).resize(targetLogoW, targetLogoH);

      if (rotation !== 0) {
        logoSharp = logoSharp.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
      }

      let watermarkImg = await logoSharp.png().toBuffer();

      let left = Math.round((mainW - targetLogoW) / 2);
      let top = Math.round((mainH - targetLogoH) / 2);

      const margin = 20;
      if (position === "top-left") { left = margin; top = margin; }
      else if (position === "top-right") { left = mainW - targetLogoW - margin; top = margin; }
      else if (position === "bottom-left") { left = margin; top = mainH - targetLogoH - margin; }
      else if (position === "bottom-right") { left = mainW - targetLogoW - margin; top = mainH - targetLogoH - margin; }

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

app.use("/api", (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

await configureFrontend(httpServer);

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

httpServer.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use on ${HOST}.`);
    console.error(`Run: lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
    console.error("Then stop the listed process, or start with another port:");
    console.error("PORT=5002 npm run dev");
    process.exit(1);
  }

  console.error("Server failed to start:", error);
  process.exit(1);
});

httpServer.listen(PORT, HOST, () => {
  console.log(`NYORIA Tools running on http://${HOST}:${PORT}`);
});

async function configureFrontend(server) {
  if (isProduction) {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.use((req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
    return;
  }

  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: {
        server,
      },
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try {
      const indexPath = path.join(process.cwd(), "index.html");
      const template = await fs.readFile(indexPath, "utf-8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}
