import React, { useState, useEffect } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import {
  Download,
  Info,
  Check,
  RefreshCw,
  Sliders,
  Sparkles,
  Zap,
  Eye,
  X,
  FileArchive,
  Edit2,
  Trash2,
} from "lucide-react";
import confetti from "canvas-confetti";
import { apiRequest } from "../../utils/api";
import { getStoredArray } from "../../utils/storage";

export default function ImageCompressor({ onBack }) {
  const [files, setFiles] = useState([]);
  const [globalTarget, setGlobalTarget] = useState("100");
  const [globalUnit, setGlobalUnit] = useState("KB");
  const [applyToAll, setApplyToAll] = useState(true);

  // Compression Settings
  const [mode, setMode] = useState("balanced"); // balanced, quality, compression, custom
  const [resolutionScale, setResolutionScale] = useState(100); // 10% - 100%
  const [stripMetadata, setStripMetadata] = useState(true);
  const [preserveTransparency, setPreserveTransparency] = useState(true);

  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  // Preview / Comparison Modal state
  const [activeCompareItem, setActiveCompareItem] = useState(null); // { originalUrl, compressedUrl, originalSize, compressedSize, name }
  const [sliderPosition, setSliderPosition] = useState(50);

  const handleFiles = (fileList) => {
    setError("");
    const incoming = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/") || f.name.toLowerCase().endsWith(".heic")
    );
    if (!incoming.length) {
      setError("Please upload valid image files (JPG, PNG, WEBP, HEIC).");
      return;
    }
    const mapped = incoming.map((f) => ({
      file: f,
      id: Math.random().toString(36).substring(2, 9),
      preview: URL.createObjectURL(f),
      targetSize: globalTarget,
      unit: globalUnit,
      customName: f.name.substring(0, f.name.lastIndexOf(".")),
    }));
    setFiles((prev) => [...prev, ...mapped]);
    setResults([]);
  };

  const handleTargetChange = (id, val) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, targetSize: val } : f))
    );
  };

  const handleUnitChange = (id, val) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, unit: val } : f))
    );
  };

  const handleCustomNameChange = (id, val) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, customName: val } : f))
    );
  };

  const removeFile = (id) => {
    setFiles((prev) => {
      const match = prev.find((f) => f.id === id);
      if (match) URL.revokeObjectURL(match.preview);
      return prev.filter((f) => f.id !== id);
    });
    setResults([]);
  };

  const processCompress = async () => {
    if (!files.length || isProcessing) return;
    setIsProcessing(true);
    setError("");
    setResults([]);

    const formData = new FormData();
    files.forEach((f) => {
      formData.append("images", f.file);
    });

    // Compile target sizes list corresponding to files order
    const targets = files.map((f) => {
      const sizeStr = applyToAll ? `${globalTarget}${globalUnit}` : `${f.targetSize}${f.unit}`;
      return sizeStr;
    });

    formData.append("targetSizes", JSON.stringify(targets));
    formData.append("mode", mode);
    formData.append("resolutionScale", (resolutionScale / 100).toFixed(2));
    formData.append("stripMetadata", stripMetadata ? "true" : "false");
    formData.append("preserveTransparency", preserveTransparency ? "true" : "false");

    try {
      const data = await apiRequest("/api/compress-image", {
        method: "POST",
        body: formData,
      });

      // Merge customized output file names if present
      const processedResults = data.results.map((r, idx) => {
        const customName = files[idx].customName;
        const ext = r.name.substring(r.name.lastIndexOf("."));
        return {
          ...r,
          name: customName ? `${customName}${ext}` : r.name,
          originalPreview: files[idx].preview,
        };
      });

      setResults(processedResults);

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 },
      });

      // Update history
      const history = getStoredArray("nyoria_history");
      processedResults.forEach((r) => {
        history.unshift({
          toolName: "Custom Size Image Compressor",
          fileName: r.name,
          originalSize: r.originalSize,
          finalSize: r.compressedSize,
          timestamp: Date.now(),
        });
      });
      localStorage.setItem("nyoria_history", JSON.stringify(history.slice(0, 50)));
      window.dispatchEvent(new Event("history_updated"));
    } catch (e) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAllZip = async () => {
    // Generate ZIP of files client-side using a dynamic link download logic or download each
    // For browser compatibility and ease, we trigger parallel downloading of all processed results
    results.forEach((r) => {
      const a = document.createElement("a");
      a.href = r.dataUrl;
      a.download = r.name;
      a.click();
    });
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Preview Slider handler
  const handleSliderMove = (e) => {
    if (!activeCompareItem) return;
    const container = document.getElementById("compare-slider-container");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
    setSliderPosition(pct);
  };

  return (
    <ToolWrapper
      id="compressor"
      title="Advanced Custom Size Image Compressor"
      description="Compress image files down to exact target limits (KB/MB) using an iterative quality search algorithm."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Workspace Card (Left) */}
        <div className="lg:col-span-2 space-y-6">
          {!files.length ? (
            <DropZone
              onFilesSelected={handleFiles}
              accept="image/*,.heic"
              subtitle="Supports JPG, JPEG, PNG, WEBP, and HEIC files"
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#E5E7EB] dark:text-slate-300">
                  Images Queue ({files.length})
                </span>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs text-cyan-400 hover:underline font-semibold"
                >
                  Clear All
                </button>
              </div>

              {/* Batched files cards */}
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border border-white/10 bg-[#111827]/10 gap-4"
                  >
                    <div className="flex items-center space-x-3 w-full sm:w-1/2">
                      <img
                        src={f.preview}
                        alt="Preview"
                        className="w-14 h-14 object-cover rounded-xl border border-slate-750 flex-shrink-0"
                      />
                      <div className="truncate flex-1 space-y-1">
                        <div className="flex items-center space-x-1">
                          <input
                            type="text"
                            value={f.customName}
                            onChange={(e) => handleCustomNameChange(f.id, e.target.value)}
                            className="bg-transparent border-b border-dashed border-slate-600 focus:border-cyan-400 outline-none text-xs font-semibold text-[#E5E7EB] dark:text-[#E5E7EB] max-w-[140px] truncate"
                          />
                          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Original: {formatBytes(f.file.size)}
                        </div>
                      </div>
                    </div>

                    {/* Target size details */}
                    {!applyToAll && (
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] text-slate-400 font-medium">Target Size:</span>
                        <input
                          type="number"
                          value={f.targetSize}
                          onChange={(e) => handleTargetChange(f.id, e.target.value)}
                          className="w-16 px-2.5 py-1 rounded-lg border border-slate-350 dark:border-slate-800 bg-transparent text-xs text-[#E5E7EB] dark:text-white outline-none focus:border-cyan-400"
                        />
                        <select
                          value={f.unit}
                          onChange={(e) => handleUnitChange(f.id, e.target.value)}
                          className="px-2 py-1 rounded-lg border border-slate-350 dark:border-slate-800 bg-transparent text-xs text-[#E5E7EB] dark:text-white outline-none"
                        >
                          <option value="KB">KB</option>
                          <option value="MB">MB</option>
                        </select>
                      </div>
                    )}

                    <button
                      onClick={() => removeFile(f.id)}
                      className="text-slate-400 hover:text-cyan-400 p-1"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results Grid */}
          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-white/10">
                <h4 className="text-sm font-bold text-[#E5E7EB] dark:text-slate-300 flex items-center space-x-2">
                  <Check className="w-5 h-5 text-emerald-500" />
                  <span>Compression Complete!</span>
                </h4>
                {results.length > 1 && (
                  <button
                    onClick={handleDownloadAllZip}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    <FileArchive className="w-4 h-4" />
                    <span>Download All Results</span>
                  </button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {results.map((r, i) => {
                  const saved = r.originalSize - r.compressedSize;
                  const savingsPct = Math.max(0, Math.round((saved / r.originalSize) * 100));
                  return (
                    <div
                      key={i}
                      className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 space-y-3"
                    >
                      <div className="flex justify-between items-start">
                        <div className="text-xs font-bold truncate text-[#E5E7EB] dark:text-[#E5E7EB] max-w-[70%]">
                          {r.name}
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 font-bold">
                          -{savingsPct}% Size
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400">
                        <span>Original: {formatBytes(r.originalSize)}</span>
                        <span className="font-bold text-[#E5E7EB] dark:text-white">
                          Compressed: {formatBytes(r.compressedSize)}
                        </span>
                      </div>

                      <div className="flex space-x-2">
                        <button
                          onClick={() =>
                            setActiveCompareItem({
                              originalUrl: r.originalPreview,
                              compressedUrl: r.dataUrl,
                              originalSize: r.originalSize,
                              compressedSize: r.compressedSize,
                              name: r.name,
                            })
                          }
                          className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-[#111827] hover:bg-slate-800 border border-slate-700 text-white rounded-xl text-xs font-semibold transition"
                        >
                          <Eye className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Compare Pixels</span>
                        </button>
                        <a
                          href={r.dataUrl}
                          download={r.name}
                          className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Compression Engine Control Panel (Right) */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6 text-white">
          <h3 className="text-base font-bold flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span>Compression Engine</span>
          </h3>

          {/* Mode Selector */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Optimization Mode</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: "balanced", label: "Balanced", desc: "Best quality/size ratio" },
                { id: "quality", label: "Max Quality", desc: "Highest pixel fidelity" },
                { id: "compression", label: "Max Compress", desc: "Smallest possible file" },
                { id: "custom", label: "Custom Details", desc: "Manual settings" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setMode(m.id);
                    setResults([]);
                  }}
                  className={`p-3 rounded-xl border text-left flex flex-col transition ${mode === m.id
                    ? "border-cyan-400 bg-cyan-400/10 text-white"
                    : "border-slate-800 bg-[#0B0F1A]/20 text-slate-400 hover:border-slate-700 hover:text-white"
                    }`}
                >
                  <span className="font-bold">{m.label}</span>
                  <span className="text-[9px] text-slate-400 font-medium mt-0.5">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Global Target Settings */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400 font-semibold">Target Size Limits</label>
              <button
                onClick={() => setApplyToAll((v) => !v)}
                className="text-[10px] text-cyan-400 hover:underline font-bold"
              >
                {applyToAll ? "Set Custom Per Image" : "Apply One Size to All"}
              </button>
            </div>

            {applyToAll && (
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={globalTarget}
                  onChange={(e) => {
                    setGlobalTarget(e.target.value);
                    setResults([]);
                  }}
                  className="w-full px-4 py-2 rounded-xl border border-slate-750 bg-[#0B0F1A] text-white outline-none focus:border-cyan-400 text-xs font-mono"
                />
                <select
                  value={globalUnit}
                  onChange={(e) => {
                    setGlobalUnit(e.target.value);
                    setResults([]);
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-750 bg-[#0B0F1A] text-white outline-none text-xs"
                >
                  <option value="KB">KB</option>
                  <option value="MB">MB</option>
                </select>
              </div>
            )}
          </div>

          {/* Advanced Sliders (only if mode === custom) */}
          {mode === "custom" && (
            <div className="space-y-4 pt-3 border-t border-slate-800 animate-floatUp">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-400">
                  <label>Resolution Scale</label>
                  <span>{resolutionScale}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={resolutionScale}
                  onChange={(e) => {
                    setResolutionScale(parseInt(e.target.value));
                    setResults([]);
                  }}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    id="strip"
                    checked={stripMetadata}
                    onChange={(e) => {
                      setStripMetadata(e.target.checked);
                      setResults([]);
                    }}
                    className="h-4.5 w-4.5 rounded accent-cyan-400"
                  />
                  <label htmlFor="strip" className="text-xs text-slate-400 select-none">
                    Remove Metadata (EXIF details)
                  </label>
                </div>

                <div className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    id="trans"
                    checked={preserveTransparency}
                    onChange={(e) => {
                      setPreserveTransparency(e.target.checked);
                      setResults([]);
                    }}
                    className="h-4.5 w-4.5 rounded accent-cyan-400"
                  />
                  <label htmlFor="trans" className="text-xs text-slate-400 select-none">
                    Preserve Alpha Transparency
                  </label>
                </div>
              </div>
            </div>
          )}

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processCompress}
            disabled={!files.length || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3.5 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Running iterative optimization...</span>
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                <span>Run Compressor</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Slide Compare Dialog Modal */}
      {activeCompareItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-floatUp">
          <div className="bg-slate-900 border border-white/10 rounded-[32px] w-full max-w-4xl p-6 relative flex flex-col max-h-[90vh]">

            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <div>
                <h4 className="text-lg font-bold text-white">Compare Pixels</h4>
                <p className="text-xs text-slate-400">
                  Slide slider handle back & forth to verify original vs optimized quality bounds.
                </p>
              </div>
              <button
                onClick={() => setActiveCompareItem(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Slider comparison arena */}
            <div
              id="compare-slider-container"
              onMouseMove={handleSliderMove}
              onTouchMove={(e) => {
                if (e.touches[0]) handleSliderMove(e.touches[0]);
              }}
              className="relative flex-1 rounded-2xl bg-[#0B0F1A] overflow-hidden select-none border border-slate-850 mt-4 h-96 flex items-center justify-center cursor-ew-resize"
            >
              {/* Original (Left Background Image) */}
              <img
                src={activeCompareItem.originalUrl}
                alt="Original"
                className="absolute max-h-full max-w-full object-contain pointer-events-none"
              />

              {/* Compressed (Right overlay layer with clip-path) */}
              <div
                className="absolute inset-0 flex items-center justify-center overflow-hidden"
                style={{
                  clipPath: `polygon(${sliderPosition}% 0, 100% 0, 100% 100%, ${sliderPosition}% 100%)`,
                }}
              >
                <img
                  src={activeCompareItem.compressedUrl}
                  alt="Compressed"
                  className="max-h-full max-w-full object-contain pointer-events-none"
                />
              </div>

              {/* Slider Line Divider */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 pointer-events-none"
                style={{ left: `${sliderPosition}%` }}
              >
                {/* Drag Handle */}
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-cyan-400 text-slate-950 font-bold flex items-center justify-center shadow-lg border-2 border-white select-none">
                  ↔
                </div>
              </div>

              {/* Absolute Labels */}
              <span className="absolute bottom-4 left-4 px-3 py-1 rounded bg-black/60 text-[10px] text-slate-400 pointer-events-none">
                Original ({formatBytes(activeCompareItem.originalSize)})
              </span>
              <span className="absolute bottom-4 right-4 px-3 py-1 rounded bg-black/60 text-[10px] text-cyan-400 pointer-events-none">
                Compressed ({formatBytes(activeCompareItem.compressedSize)})
              </span>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800 mt-4 text-xs text-slate-400">
              <span>{activeCompareItem.name}</span>
            </div>
          </div>
        </div>
      )}
    </ToolWrapper>
  );
}
