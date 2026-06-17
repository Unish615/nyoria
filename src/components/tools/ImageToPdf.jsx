import React, { useState, useRef } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, FileText, Move, Plus } from "lucide-react";
import confetti from "canvas-confetti";
import { apiRequest } from "../../utils/api";

export default function ImageToPdf({ onBack }) {
  const [images, setImages] = useState([]);
  const [pageSize, setPageSize] = useState("a4");
  const [orientation, setOrientation] = useState("portrait");
  const [margin, setMargin] = useState(0);
  const [quality, setQuality] = useState(80);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const dragItemIndex = useRef();
  const dragOverItemIndex = useRef();

  const handleFiles = (fileList) => {
    setError("");
    const incoming = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/") || f.name.toLowerCase().endsWith(".heic")
    );
    if (!incoming.length) {
      setError("Please upload valid images (JPG, PNG, WEBP, HEIC).");
      return;
    }
    const nextImages = incoming.map((f) => ({
      file: f,
      id: Math.random().toString(36).substring(2, 9),
      preview: URL.createObjectURL(f),
    }));
    setImages((prev) => [...prev, ...nextImages]);
    setResult(null);
  };

  const handleSort = () => {
    const listCopy = [...images];
    const draggedItemContent = listCopy[dragItemIndex.current];
    listCopy.splice(dragItemIndex.current, 1);
    listCopy.splice(dragOverItemIndex.current, 0, draggedItemContent);
    dragItemIndex.current = null;
    dragOverItemIndex.current = null;
    setImages(listCopy);
  };

  const removeImage = (id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    setResult(null);
  };

  const processConvert = async () => {
    if (!images.length || isProcessing) return;
    setIsProcessing(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    images.forEach((img) => {
      formData.append("images", img.file);
    });
    formData.append("pageSize", pageSize);
    formData.append("orientation", orientation);
    formData.append("margin", margin);
    formData.append("quality", quality);

    try {
      const data = await apiRequest("/api/image-to-pdf", {
        method: "POST",
        body: formData,
      });
      setResult(data);

      confetti({
        particleCount: 80,
        spread: 60,
      });

      const history = JSON.parse(localStorage.getItem("nyoria_history") || "[]");
      history.unshift({
        toolName: "Image to PDF",
        fileName: data.name,
        originalSize: images.reduce((acc, cur) => acc + cur.file.size, 0),
        finalSize: data.size,
        timestamp: Date.now(),
      });
      localStorage.setItem("nyoria_history", JSON.stringify(history.slice(0, 50)));
      window.dispatchEvent(new Event("history_updated"));
    } catch (e) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 KB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <ToolWrapper
      id="image-to-pdf"
      title="Image to PDF Converter"
      description="Convert images to PDF documents instantly. Supports drag-and-drop page ordering, page presets, and margins."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main work area */}
        <div className="lg:col-span-2 space-y-6">
          <DropZone
            onFilesSelected={handleFiles}
            accept="image/*,.heic"
            subtitle="Supports JPG, JPEG, PNG, WEBP, and HEIC files"
            className="py-6 min-h-[120px]"
          />

          {images.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-white/10">
                <span className="text-sm font-bold text-[#E5E7EB] dark:text-slate-300">
                  Image Sequence ({images.length})
                </span>
                <button
                  onClick={() => setImages([])}
                  className="text-xs text-cyan-400 hover:underline font-semibold"
                >
                  Clear All
                </button>
              </div>

              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={() => (dragItemIndex.current = idx)}
                    onDragEnter={() => (dragOverItemIndex.current = idx)}
                    onDragEnd={handleSort}
                    onDragOver={(e) => e.preventDefault()}
                    className="group relative overflow-hidden rounded-2xl border border-white/15 bg-[#111827]/10 p-3 hover:border-cyan-400/50 cursor-grab active:cursor-grabbing"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-slate-800">
                      <img
                        src={img.preview}
                        alt="Thumbnail"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute left-2.5 top-2.5 rounded-lg bg-black/60 px-2 py-0.5 text-xs text-white">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-[#E5E7EB] dark:text-slate-300">
                      <span className="truncate w-3/4">{img.file.name}</span>
                      <button
                        onClick={() => removeImage(img.id)}
                        className="text-cyan-400 hover:text-cyan-400 font-bold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="p-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
              <h4 className="text-sm font-bold text-emerald-500">PDF Created Successfully!</h4>
              <div className="flex justify-between items-center text-sm text-[#E5E7EB] dark:text-slate-300">
                <div>
                  <span className="font-semibold truncate">{result.name}</span>
                  <span className="text-xs text-slate-400 block">
                    File Size: {formatBytes(result.size)}
                  </span>
                </div>
                <a
                  href={result.dataUrl}
                  download={result.name}
                  className="flex items-center space-x-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF Document</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Options Panel */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <span>PDF Output Settings</span>
          </h3>

          {/* Page Size */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Page Size Preset</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none"
            >
              <option value="a4">A4 (210 x 297 mm)</option>
              <option value="letter">Letter (8.5 x 11 in)</option>
              <option value="autofit">Auto Fit (Match Image Dimensions)</option>
            </select>
          </div>

          {/* Page Orientation */}
          {pageSize !== "autofit" && (
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-semibold">Orientation</label>
              <div className="grid grid-cols-2 gap-2">
                {["portrait", "landscape"].map((o) => (
                  <button
                    key={o}
                    onClick={() => setOrientation(o)}
                    className={`py-2 rounded-xl text-xs font-bold capitalize transition-all ${orientation === o
                      ? "bg-cyan-400 text-white shadow-lg"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-750"
                      }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Margin */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <label>Page Margins</label>
              <span>{margin}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={margin}
              onChange={(e) => setMargin(parseInt(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Compression / Quality */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <label>Image Quality Preset</label>
              <span>{quality}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processConvert}
            disabled={!images.length || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Assembling PDF pages...</span>
              </>
            ) : (
              <span>Convert to PDF</span>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
