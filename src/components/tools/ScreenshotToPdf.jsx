import React, { useState, useRef } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, Layers, Move, Check, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";
import { apiRequest } from "../../utils/api";
import { getStoredArray } from "../../utils/storage";

export default function ScreenshotToPdf({ onBack }) {
  const [images, setImages] = useState([]);
  const [margin, setMargin] = useState(0);
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
      setError("Please upload valid screenshots.");
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
    formData.append("pageSize", "autofit"); // Force autofit for screenshots
    formData.append("margin", margin);
    formData.append("quality", 90);

    try {
      const data = await apiRequest("/api/image-to-pdf", {
        method: "POST",
        body: formData,
      });
      setResult(data);

      confetti({
        particleCount: 70,
        spread: 50,
      });

      // Update history
      const history = getStoredArray("nyoria_history");
      history.unshift({
        toolName: "Screenshot to PDF",
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
      id="screenshot-to-pdf"
      title="Screenshot to PDF Converter"
      description="Combine multiple device screenshots into a single PDF document. Auto-aligns page sizes dynamically to fit dimensions."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Workspace */}
        <div className="lg:col-span-2 space-y-6">
          <DropZone
            onFilesSelected={handleFiles}
            accept="image/*"
            subtitle="Upload screenshots from your files or clipboard uploads"
            className="py-6 min-h-[120px]"
          />

          {images.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-sm font-bold text-[#E5E7EB] dark:text-slate-300">
                  Screenshots Stack ({images.length})
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
                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/10 p-3 hover:border-cyan-400/55 cursor-grab active:cursor-grabbing animate-floatUp"
                  >
                    <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-[#0B0F1A] flex justify-center items-center">
                      <img
                        src={img.preview}
                        alt="Screenshot thumbnail"
                        className="max-h-full max-w-full object-contain"
                      />
                      <span className="absolute left-2.5 top-2.5 rounded-lg bg-black/60 px-2 py-0.5 text-xs text-white">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-[#E5E7EB] dark:text-slate-300">
                      <span className="truncate w-3/4 text-[11px]">{img.file.name}</span>
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
              <h4 className="text-sm font-bold text-emerald-500 flex items-center space-x-2">
                <Check className="w-5 h-5" />
                <span>PDF Compiled Successfully!</span>
              </h4>
              <div className="flex justify-between items-center text-sm text-slate-850 dark:text-slate-300">
                <div>
                  <span className="font-semibold block truncate">{result.name}</span>
                  <span className="text-xs text-slate-400 mt-0.5 block">
                    File Size: {formatBytes(result.size)}
                  </span>
                </div>
                <a
                  href={result.dataUrl}
                  download={result.name}
                  className="flex items-center space-x-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span>Auto-Align Options</span>
          </h3>

          <div className="p-4 bg-[#0B0F1A]/80 rounded-2xl border border-slate-800 space-y-2 text-xs text-slate-400">
            <div className="font-semibold text-white">Device-Responsive Scaling</div>
            <p>
              Auto-Align will inspect dimensions of each screenshot and map them directly to a custom PDF page canvas size, avoiding letterboxing.
            </p>
          </div>

          {/* Margin */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <label>Page Margins (Padding)</label>
              <span>{margin}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              value={margin}
              onChange={(e) => setMargin(parseInt(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processConvert}
            disabled={!images.length || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Generating custom pages...</span>
              </>
            ) : (
              <span>Compile Screenshots</span>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
