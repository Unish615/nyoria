import React, { useState, useEffect } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, Maximize2, Check } from "lucide-react";
import confetti from "canvas-confetti";

const SOCIAL_PRESETS = [
  { name: "Instagram Square", width: 1080, height: 1080 },
  { name: "Instagram Story", width: 1080, height: 1920 },
  { name: "YouTube Thumbnail", width: 1280, height: 720 },
  { name: "Twitter Banner", width: 1500, height: 500 },
];

export default function ImageResizer({ onBack }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [resizeMode, setResizeMode] = useState("dimensions"); // dimensions, percentage, preset
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [percentage, setPercentage] = useState(50);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [lockRatio, setLockRatio] = useState(true);
  const [originalDimensions, setOriginalDimensions] = useState({ w: 0, h: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleFiles = (fileList) => {
    setError("");
    const selected = fileList[0];
    if (selected && !selected.type.startsWith("image/")) {
      setError("Please upload a valid image file.");
      return;
    }
    
    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreview(url);
    setResult(null);

    // Get original dimensions
    const img = new Image();
    img.onload = () => {
      setOriginalDimensions({ w: img.width, h: img.height });
      setWidth(img.width);
      setHeight(img.height);
    };
    img.src = url;
  };

  const handleWidthChange = (val) => {
    setWidth(val);
    if (val !== "" && lockRatio && originalDimensions.w > 0) {
      const ratio = originalDimensions.h / originalDimensions.w;
      setHeight(Math.round(val * ratio) || "");
    }
  };

  const handleHeightChange = (val) => {
    setHeight(val);
    if (val !== "" && lockRatio && originalDimensions.h > 0) {
      const ratio = originalDimensions.w / originalDimensions.h;
      setWidth(Math.round(val * ratio) || "");
    }
  };

  const applyPreset = (preset) => {
    setSelectedPreset(preset);
    setWidth(preset.width);
    setHeight(preset.height);
    setResult(null);
  };

  const processResize = async () => {
    if (!file || isProcessing) return;
    setIsProcessing(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("image", file);
    if (resizeMode === "dimensions" || resizeMode === "preset") {
      formData.append("width", width);
      formData.append("height", height);
      formData.append("lockAspectRatio", lockRatio);
    } else {
      formData.append("percentage", percentage);
    }

    try {
      const response = await fetch("/api/resize-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to resize image");
      }

      const data = await response.json();
      setResult(data);

      confetti({
        particleCount: 60,
        spread: 40,
      });

      const history = JSON.parse(localStorage.getItem("unish_history") || "[]");
      history.unshift({
        toolName: "Image Resizer",
        fileName: data.name,
        originalSize: file.size,
        finalSize: data.size,
        timestamp: Date.now(),
      });
      localStorage.setItem("unish_history", JSON.stringify(history.slice(0, 50)));
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
      id="resizer"
      title="Image Resizer"
      description="Resize images using specific pixel heights/widths, overall percentage scales, or popular social media templates."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Work Area */}
        <div className="lg:col-span-2 space-y-6">
          {!file ? (
            <DropZone
              onFilesSelected={handleFiles}
              accept="image/*"
              subtitle="Upload image to resize"
              multiple={false}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200 dark:text-slate-400">
                  Image Preview
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview("");
                  }}
                  className="text-xs text-cyan-400 hover:underline font-semibold"
                >
                  Change Image
                </button>
              </div>

              <div className="relative border border-white/10 bg-[#0B0F1A] p-4 rounded-3xl flex justify-center items-center">
                <img
                  src={preview}
                  alt="Original Preview"
                  className="max-h-72 object-contain rounded-xl"
                />
              </div>
            </div>
          )}

          {result && (
            <div className="p-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 space-y-4">
              <h4 className="text-sm font-bold text-emerald-500 flex items-center space-x-2">
                <Check className="w-5 h-5" />
                <span>Resized Successfully!</span>
              </h4>
              <div className="flex flex-col sm:flex-row items-center sm:space-x-6 space-y-4 sm:space-y-0">
                <img
                  src={result.dataUrl}
                  alt="Resized"
                  className="max-h-60 rounded-xl object-contain border border-white/10"
                />
                <div className="space-y-2 flex-1 text-sm text-slate-200 dark:text-slate-400">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {result.name}
                  </div>
                  <div>Final Size: {formatBytes(result.size)}</div>
                  <div>
                    Dimensions: {result.width} x {result.height}px
                  </div>
                  <a
                    href={result.dataUrl}
                    download={result.name}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Resized Image</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Maximize2 className="w-5 h-5 text-cyan-400" />
            <span>Resize Settings</span>
          </h3>

          <div className="flex rounded-xl border border-slate-700 p-0.5 bg-[#0B0F1A]">
            {[
              { id: "dimensions", label: "Dimensions" },
              { id: "percentage", label: "Percentage" },
              { id: "preset", label: "Presets" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setResizeMode(m.id);
                  setResult(null);
                }}
                className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  resizeMode === m.id
                    ? "bg-cyan-400 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {resizeMode === "dimensions" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold">Width (px)</label>
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => handleWidthChange(e.target.value === "" ? "" : parseInt(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold">Height (px)</label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => handleHeightChange(e.target.value === "" ? "" : parseInt(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2.5">
                <input
                  type="checkbox"
                  id="lock"
                  checked={lockRatio}
                  onChange={(e) => setLockRatio(e.target.checked)}
                  className="h-4.5 w-4.5 rounded accent-cyan-400"
                />
                <label htmlFor="lock" className="text-xs text-slate-400 cursor-pointer">
                  Lock Aspect Ratio
                </label>
              </div>
            </div>
          )}

          {resizeMode === "percentage" && (
            <div className="space-y-3">
              <div className="flex justify-between text-xs font-semibold text-slate-400">
                <label>Scaling Ratio</label>
                <span>{percentage}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="200"
                value={percentage}
                onChange={(e) => {
                  setPercentage(parseInt(e.target.value));
                  setResult(null);
                }}
                className="w-full accent-cyan-400"
              />
            </div>
          )}

          {resizeMode === "preset" && (
            <div className="space-y-3">
              <label className="text-xs text-slate-400 font-semibold">Select Social Layout</label>
              <div className="grid gap-2">
                {SOCIAL_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className={`text-left p-3 rounded-xl border transition-all text-xs font-medium ${
                      selectedPreset?.name === preset.name
                        ? "border-cyan-400 bg-cyan-400/10 text-white"
                        : "border-slate-850 bg-[#111827]/30 text-slate-400 hover:border-slate-700 hover:text-white"
                    }`}
                  >
                    <div>{preset.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {preset.width} x {preset.height} px
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processResize}
            disabled={!file || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Adjusting bounds...</span>
              </>
            ) : (
              <span>Resize Image</span>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
