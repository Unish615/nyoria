import React, { useState, useRef } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, Layers, Move, Plus } from "lucide-react";
import confetti from "canvas-confetti";

export default function ImageMerger({ onBack }) {
  const [images, setImages] = useState([]);
  const [direction, setDirection] = useState("vertical");
  const [spacing, setSpacing] = useState(10);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [exportFormat, setExportFormat] = useState("jpeg");
  const [targetSize, setTargetSize] = useState("");
  const [unit, setUnit] = useState("KB");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const dragItemIndex = useRef();
  const dragOverItemIndex = useRef();

  const handleFiles = (fileList) => {
    setError("");
    const incoming = Array.from(fileList).filter((f) => {
      const lowerName = f.name.toLowerCase();
      return (
        f.type.startsWith("image/") ||
        lowerName.endsWith(".jpg") ||
        lowerName.endsWith(".jpeg") ||
        lowerName.endsWith(".png") ||
        lowerName.endsWith(".webp") ||
        lowerName.endsWith(".bmp") ||
        lowerName.endsWith(".avif") ||
        lowerName.endsWith(".heic") ||
        lowerName.endsWith(".heif")
      );
    });
    if (!incoming.length) {
      setError("Please upload valid image files.");
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

  const processMerge = async () => {
    if (images.length < 2 || isProcessing) return;
    setIsProcessing(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    images.forEach((img) => {
      formData.append("images", img.file);
    });
    formData.append("direction", direction);
    formData.append("spacing", spacing);
    formData.append("backgroundColor", backgroundColor);
    formData.append("exportFormat", exportFormat);
    if (targetSize) {
      formData.append("targetSize", `${targetSize}${unit}`);
    }

    try {
      const response = await fetch("/api/merge-images", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to merge images");
      }

      const data = await response.json();
      setResult(data);

      confetti({
        particleCount: 70,
        spread: 50,
      });

      // Update local storage history
      const history = JSON.parse(localStorage.getItem("nyoria_history") || "[]");
      history.unshift({
        toolName: "Image Merger",
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
      id="merger"
      title="Image Merger"
      description="Merge multiple images vertically or horizontally with custom spacing, background colors, and output size control."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Workspace panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-200 dark:text-slate-400">
              Canvas Workspace
            </span>
            {images.length > 0 && (
              <button
                onClick={() => setImages([])}
                className="text-xs text-cyan-400 hover:underline font-semibold"
              >
                Clear Canvas
              </button>
            )}
          </div>

          <DropZone
            onFilesSelected={handleFiles}
            accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.avif,.heic,.heif"
            allowFolders={true}
            subtitle="Drop image files or folders here to add them to your canvas grid"
            className="py-6 min-h-[120px]"
          />

          {images.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Drag cards to change merging sequence:
              </p>
              <div
                className={`grid gap-4 ${direction === "vertical" ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"
                  }`}
              >
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={() => (dragItemIndex.current = idx)}
                    onDragEnter={() => (dragOverItemIndex.current = idx)}
                    onDragEnd={handleSort}
                    onDragOver={(e) => e.preventDefault()}
                    className="group relative flex items-center justify-between p-3 rounded-2xl border border-white/10 bg-[#111827]/10 cursor-grab active:cursor-grabbing hover:border-cyan-400/50"
                  >
                    <div className="flex items-center space-x-3 w-4/5">
                      <Move className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <img
                        src={img.preview}
                        alt="Preview"
                        className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                      />
                      <div className="truncate text-xs text-[#E5E7EB] dark:text-slate-300">
                        {img.file.name}
                      </div>
                    </div>
                    <button
                      onClick={() => removeImage(img.id)}
                      className="p-1 text-slate-400 hover:text-cyan-400 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="p-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 space-y-4">
              <h4 className="text-sm font-bold text-emerald-500">Merged Successfully!</h4>
              <div className="flex flex-col sm:flex-row items-center sm:space-x-6 space-y-4 sm:space-y-0">
                <img
                  src={result.dataUrl}
                  alt="Merged result"
                  className="max-h-60 rounded-xl object-contain border border-white/10"
                />
                <div className="space-y-2 flex-1 text-sm text-slate-200 dark:text-slate-400">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {result.name}
                  </div>
                  <div>Final Size: {formatBytes(result.size)}</div>
                  <a
                    href={result.dataUrl}
                    download={result.name}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Merged Image</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Options panel */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <span>Merger Parameters</span>
          </h3>

          {/* Direction */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Direction</label>
            <div className="grid grid-cols-2 gap-2">
              {["vertical", "horizontal"].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDirection(d);
                    setResult(null);
                  }}
                  className={`py-2 rounded-xl text-xs font-bold capitalize transition-all ${direction === d
                    ? "bg-cyan-400 text-white shadow-lg"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-750"
                    }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Spacing */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <label>Spacing</label>
              <span>{spacing}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={spacing}
              onChange={(e) => {
                setSpacing(parseInt(e.target.value));
                setResult(null);
              }}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Background Color</label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => {
                  setBackgroundColor(e.target.value);
                  setResult(null);
                }}
                className="w-10 h-10 rounded-lg cursor-pointer border border-slate-700 bg-transparent"
              />
              <input
                type="text"
                value={backgroundColor}
                onChange={(e) => {
                  setBackgroundColor(e.target.value);
                  setResult(null);
                }}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-700 bg-[#111827] text-white outline-none focus:border-cyan-400 text-xs"
              />
            </div>
          </div>

          {/* Export Settings */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Export Format</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none"
            >
              <option value="jpeg">JPG</option>
              <option value="png">PNG</option>
              <option value="webp">WEBP</option>
            </select>
          </div>

          {/* Target Size Limit */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">
              Optional Max Size Limit (e.g. 500KB)
            </label>
            <div className="flex space-x-2">
              <input
                type="number"
                value={targetSize}
                onChange={(e) => setTargetSize(e.target.value)}
                placeholder="No limit"
                className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none focus:border-cyan-400 text-xs"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none text-xs"
              >
                <option value="KB">KB</option>
                <option value="MB">MB</option>
              </select>
            </div>
          </div>

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processMerge}
            disabled={images.length < 2 || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Assembling Canvas...</span>
              </>
            ) : (
              <span>Merge Images</span>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
