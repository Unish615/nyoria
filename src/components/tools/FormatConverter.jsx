import React, { useEffect, useMemo, useState } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import {
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  RefreshCw,
  RefreshCw as Loop,
  SlidersHorizontal,
} from "lucide-react";
import confetti from "canvas-confetti";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { apiRequest } from "../../utils/api";
import { getStoredArray } from "../../utils/storage";
import { getErrorMessage } from "../../utils/errors";

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const IMAGE_FORMATS = {
  png: { label: "PNG", mime: "image/png", ext: "png", supportsQuality: false },
  jpeg: { label: "JPG / JPEG", mime: "image/jpeg", ext: "jpg", supportsQuality: true },
  webp: { label: "WEBP", mime: "image/webp", ext: "webp", supportsQuality: true },
  avif: { label: "AVIF", mime: "image/avif", ext: "avif", supportsQuality: true },
  bmp: { label: "BMP", mime: "image/bmp", ext: "bmp", supportsQuality: false },
};

const RENDER_PRESETS = {
  fast: { label: "Fast", scale: 1.5 },
  balanced: { label: "Balanced", scale: 2.25 },
  quality: { label: "High Quality", scale: 3 },
};

const isPdfFile = (file) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

const isSupportedImageFile = (file) => {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
};

const getFileBaseName = (name) => {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
};

const createFileId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 10);
};

const parsePageRange = (value, totalPages) => {
  if (!value.trim()) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set();
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startValue, endValue] = part.split("-").map((item) => Number(item.trim()));
      if (!Number.isInteger(startValue) || !Number.isInteger(endValue)) {
        throw new Error("Use page ranges like 1-3, 5, 8.");
      }

      const start = Math.max(1, Math.min(startValue, endValue));
      const end = Math.min(totalPages, Math.max(startValue, endValue));
      for (let page = start; page <= end; page += 1) {
        pages.add(page);
      }
    } else {
      const page = Number(part);
      if (!Number.isInteger(page)) {
        throw new Error("Use page ranges like 1-3, 5, 8.");
      }
      if (page >= 1 && page <= totalPages) {
        pages.add(page);
      }
    }
  }

  if (!pages.size) {
    throw new Error(`No pages matched. This PDF has ${totalPages} page${totalPages === 1 ? "" : "s"}.`);
  }

  return Array.from(pages).sort((a, b) => a - b);
};

const canvasToBlob = (canvas, format, quality) =>
  new Promise((resolve, reject) => {
    const config = IMAGE_FORMATS[format];
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`${config.label} export is not supported in this browser.`));
          return;
        }

        if (format !== "png" && blob.type && blob.type !== config.mime) {
          reject(new Error(`${config.label} export is not supported in this browser.`));
          return;
        }

        resolve(blob);
      },
      config.mime,
      config.supportsQuality ? quality : undefined
    );
  });

export default function FormatConverter({ onBack }) {
  const [files, setFiles] = useState([]);
  const [targetFormat, setTargetFormat] = useState("png");
  const [renderPreset, setRenderPreset] = useState("balanced");
  const [quality, setQuality] = useState(0.92);
  const [pageRange, setPageRange] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const selectedStats = useMemo(() => {
    const pdfCount = files.filter((item) => item.kind === "pdf").length;
    return {
      pdfCount,
      imageCount: files.length - pdfCount,
      hasPdf: pdfCount > 0,
      hasImage: pdfCount < files.length,
    };
  }, [files]);

  useEffect(() => {
    return () => {
      files.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
    };
  }, [files]);

  useEffect(() => {
    return () => {
      results.forEach((item) => {
        if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
      });
    };
  }, [results]);

  const resetSelection = () => {
    setFiles([]);
    setResults([]);
    setError("");
    setProgress("");
  };

  const handleFiles = (fileList) => {
    setError("");
    setProgress("");

    const incoming = Array.from(fileList).filter((file) => isSupportedImageFile(file) || isPdfFile(file));
    if (!incoming.length) {
      setError("Please upload valid image or PDF files.");
      return;
    }

    setFiles(
      incoming.map((file) => ({
        file,
        id: createFileId(),
        kind: isPdfFile(file) ? "pdf" : "image",
        preview: isPdfFile(file) ? "" : URL.createObjectURL(file),
      }))
    );
    setResults([]);
  };

  const convertImages = async (imageItems) => {
    if (!imageItems.length) return [];

    const formData = new FormData();
    imageItems.forEach((item) => {
      formData.append("images", item.file);
    });
    formData.append("targetFormat", targetFormat);
    formData.append("zip", "false");

    setProgress(`Converting ${imageItems.length} image${imageItems.length === 1 ? "" : "s"}...`);

    const data = await apiRequest("/api/convert-format", {
      method: "POST",
      body: formData,
    });
    return data.results.map((item) => ({
      ...item,
      sourceType: "image",
      previewUrl: item.dataUrl,
    }));
  };

  const convertPdfPages = async (pdfItems) => {
    if (!pdfItems.length) return [];
    if (targetFormat === "bmp") {
      throw new Error("PDF to BMP is not supported in-browser. Choose PNG, JPG, WEBP, or AVIF.");
    }

    const convertedPages = [];
    const exportQuality = Math.min(1, Math.max(0.1, quality));
    const scale = RENDER_PRESETS[renderPreset].scale;

    for (const item of pdfItems) {
      const arrayBuffer = await item.file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const pages = parsePageRange(pageRange, pdf.numPages);

      for (let index = 0; index < pages.length; index += 1) {
        const pageNumber = pages[index];
        setProgress(
          `Rendering ${item.file.name}: page ${pageNumber} of ${pdf.numPages}`
        );

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        context.save();
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();

        await page.render({ canvasContext: context, viewport }).promise;

        const blob = await canvasToBlob(canvas, targetFormat, exportQuality);
        const objectUrl = URL.createObjectURL(blob);
        const pageLabel = String(pageNumber).padStart(3, "0");
        const config = IMAGE_FORMATS[targetFormat];

        convertedPages.push({
          name: `${getFileBaseName(item.file.name)}-page-${pageLabel}.${config.ext}`,
          format: targetFormat,
          originalSize: item.file.size,
          convertedSize: blob.size,
          dataUrl: objectUrl,
          objectUrl,
          previewUrl: objectUrl,
          sourceType: "pdf",
          width: canvas.width,
          height: canvas.height,
        });

        if (typeof page.cleanup === "function") {
          page.cleanup();
        }
      }

      if (typeof pdf.cleanup === "function") {
        await pdf.cleanup();
      }
      if (typeof pdf.destroy === "function") {
        await pdf.destroy();
      }
    }

    return convertedPages;
  };

  const processConvert = async () => {
    if (!files.length || isProcessing) return;
    setIsProcessing(true);
    setError("");
    setResults([]);

    try {
      const imageItems = files.filter((item) => item.kind === "image");
      const pdfItems = files.filter((item) => item.kind === "pdf");
      const converted = [
        ...(await convertImages(imageItems)),
        ...(await convertPdfPages(pdfItems)),
      ];

      setResults(converted);
      setProgress("");

      confetti({
        particleCount: 70,
        spread: 50,
      });

      const history = getStoredArray("nyoria_history");
      converted.forEach((result) => {
        history.unshift({
          toolName: "Format Converter",
          fileName: result.name,
          originalSize: result.originalSize,
          finalSize: result.convertedSize,
          timestamp: Date.now(),
        });
      });
      localStorage.setItem("nyoria_history", JSON.stringify(history.slice(0, 50)));
      window.dispatchEvent(new Event("history_updated"));
    } catch (e) {
      setError(getErrorMessage(e));
      setProgress("");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 KB";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <ToolWrapper
      id="converter"
      title="Format Converter"
      description="Convert images and turn PDF pages into PNG, JPG, WEBP, AVIF, or BMP outputs."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {!files.length ? (
            <DropZone
              onFilesSelected={handleFiles}
              accept="image/*,.heic,.heif,.pdf,application/pdf"
              subtitle="Supports JPG, PNG, WEBP, BMP, HEIC, HEIF, and PDF files"
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-sm font-semibold text-slate-200 dark:text-slate-400">
                    Files Selected ({files.length})
                  </span>
                  <p className="text-xs text-slate-500">
                    {selectedStats.imageCount} image{selectedStats.imageCount === 1 ? "" : "s"} · {selectedStats.pdfCount} PDF{selectedStats.pdfCount === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  onClick={resetSelection}
                  className="text-xs text-cyan-400 hover:underline font-semibold"
                >
                  Clear All
                </button>
              </div>

              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                {files.map((item) => (
                  <div
                    key={item.id}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/10 p-2 animate-floatUp"
                  >
                    {item.kind === "pdf" ? (
                      <div className="flex h-28 w-full items-center justify-center rounded-xl bg-slate-950/50 text-cyan-300">
                        <FileText className="h-9 w-9" />
                      </div>
                    ) : (
                      <img
                        src={item.preview}
                        alt={item.file.name}
                        className="h-28 w-full object-cover rounded-xl"
                      />
                    )}
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#E5E7EB] dark:text-slate-300">
                      {item.kind === "pdf" ? (
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-cyan-300" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5 flex-shrink-0 text-emerald-300" />
                      )}
                      <span className="truncate">{item.file.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {formatBytes(item.file.size)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-[#E5E7EB] dark:text-slate-300 flex items-center space-x-2">
                <Check className="w-5 h-5 text-emerald-500" />
                <span>Conversion Completed</span>
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                {results.map((result, index) => (
                  <div
                    key={`${result.name}-${index}`}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"
                  >
                    {result.previewUrl && (
                      <img
                        src={result.previewUrl}
                        alt={result.name}
                        className="mb-3 h-32 w-full rounded-xl bg-white object-contain"
                      />
                    )}
                    <div className="space-y-1">
                      <div className="text-xs font-bold truncate text-[#E5E7EB] dark:text-[#E5E7EB]">
                        {result.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Original: {formatBytes(result.originalSize)} | Output: {formatBytes(result.convertedSize)}
                        {result.width && result.height ? ` | ${result.width}×${result.height}` : ""}
                      </div>
                    </div>
                    <a
                      href={result.dataUrl}
                      download={result.name}
                      className="mt-3 flex w-full items-center justify-center space-x-1.5 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-600"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download {IMAGE_FORMATS[targetFormat].label}</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6 rounded-3xl border border-white/10 bg-[#111827]/70 p-6">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Loop className="w-5 h-5 text-cyan-400" />
            <span>Output Format</span>
          </h3>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Select Format</label>
            <select
              value={targetFormat}
              onChange={(e) => {
                setTargetFormat(e.target.value);
                setResults([]);
                setError("");
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none"
            >
              <option value="png">PNG (sharp text and transparency)</option>
              <option value="jpeg">JPG / JPEG (small photo files)</option>
              <option value="webp">WEBP (modern web image)</option>
              <option value="avif">AVIF (next-gen compression)</option>
              <option value="bmp">BMP (image uploads only)</option>
            </select>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/20 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
              <span>PDF Rendering</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {Object.entries(RENDER_PRESETS).map(([value, preset]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRenderPreset(value);
                    setResults([]);
                  }}
                  className={`rounded-xl border px-2 py-2 text-xs font-bold transition ${renderPreset === value
                      ? "border-cyan-400 bg-cyan-400/15 text-cyan-200"
                      : "border-slate-700 bg-[#111827] text-slate-300 hover:border-cyan-400/60"
                    }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-semibold text-slate-400">Pages</span>
              <input
                value={pageRange}
                onChange={(e) => {
                  setPageRange(e.target.value);
                  setResults([]);
                }}
                placeholder="All pages or 1-3, 5"
                className="w-full rounded-xl border border-slate-700 bg-[#111827] px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
              />
            </label>

            {IMAGE_FORMATS[targetFormat].supportsQuality && (
              <label className="block space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>Image Quality</span>
                  <span>{Math.round(quality * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1"
                  step="0.02"
                  value={quality}
                  onChange={(e) => {
                    setQuality(Number(e.target.value));
                    setResults([]);
                  }}
                  className="w-full accent-cyan-400"
                />
              </label>
            )}
          </div>

          <div className="flex items-start space-x-2 text-[11px] text-slate-400">
            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <span>
              PDF pages render locally in your browser for fast, private output. Image uploads still use the optimized batch engine for HEIC and BMP support.
            </span>
          </div>

          {progress && (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200">
              {progress}
            </div>
          )}

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processConvert}
            disabled={!files.length || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Converting...</span>
              </>
            ) : (
              <span>Convert Files</span>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
