import React, { useState } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, RefreshCw as Loop, Check, Info } from "lucide-react";
import confetti from "canvas-confetti";

export default function FormatConverter({ onBack }) {
  const [files, setFiles] = useState([]);
  const [targetFormat, setTargetFormat] = useState("png");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const handleFiles = (fileList) => {
    setError("");
    const incoming = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/") || f.name.toLowerCase().endsWith(".heic")
    );
    if (!incoming.length) {
      setError("Please upload valid image files.");
      return;
    }
    setFiles(incoming.map((f) => ({
      file: f,
      id: Math.random().toString(36).substring(2, 9),
      preview: URL.createObjectURL(f),
    })));
    setResults([]);
  };

  const processConvert = async () => {
    if (!files.length || isProcessing) return;
    setIsProcessing(true);
    setError("");
    setResults([]);

    const formData = new FormData();
    files.forEach((f) => {
      formData.append("images", f.file);
    });
    formData.append("targetFormat", targetFormat);
    formData.append("zip", "false"); // We will download individual items or zip on client, or fetch base64

    try {
      const response = await fetch("/api/convert-format", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to convert formats");
      }

      const data = await response.json();
      setResults(data.results);

      confetti({
        particleCount: 70,
        spread: 50,
      });

      // Update history
      const history = JSON.parse(localStorage.getItem("unish_history") || "[]");
      data.results.forEach((r) => {
        history.unshift({
          toolName: "Format Converter",
          fileName: r.name,
          originalSize: r.originalSize,
          finalSize: r.convertedSize,
          timestamp: Date.now(),
        });
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
    if (bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <ToolWrapper
      id="converter"
      title="Image Format Converter"
      description="Convert images instantly between JPG, PNG, WEBP, BMP, and HEIC in batches."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Arena */}
        <div className="lg:col-span-2 space-y-6">
          {!files.length ? (
            <DropZone
              onFilesSelected={handleFiles}
              accept="image/*,.heic"
              subtitle="Supports JPG, PNG, WEBP, BMP, and HEIC files"
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200 dark:text-slate-400">
                  Files Selected ({files.length})
                </span>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs text-cyan-400 hover:underline font-semibold"
                >
                  Clear All
                </button>
              </div>

              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/10 p-2 animate-floatUp"
                  >
                    <img
                      src={f.preview}
                      alt={f.file.name}
                      className="h-28 w-full object-cover rounded-xl"
                    />
                    <div className="mt-2 text-xs truncate font-medium text-[#E5E7EB] dark:text-slate-300">
                      {f.file.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {formatBytes(f.file.size)}
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
                <span>Conversion Completed!</span>
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col justify-between"
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-bold truncate text-[#E5E7EB] dark:text-[#E5E7EB]">
                        {r.name}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Original: {formatBytes(r.originalSize)} | Output: {formatBytes(r.convertedSize)}
                      </div>
                    </div>
                    <a
                      href={r.dataUrl}
                      download={r.name}
                      className="flex items-center justify-center space-x-1.5 w-full mt-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download {targetFormat.toUpperCase()}</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Loop className="w-5 h-5 text-cyan-400" />
            <span>Target Output Format</span>
          </h3>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Select Format</label>
            <select
              value={targetFormat}
              onChange={(e) => {
                setTargetFormat(e.target.value);
                setResults([]);
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none"
            >
              <option value="png">PNG (Portable Network Graphics)</option>
              <option value="jpeg">JPG / JPEG (Joint Photographic Experts)</option>
              <option value="webp">WEBP (Google Image Format)</option>
              <option value="bmp">BMP (Windows Bitmap File)</option>
            </select>
          </div>

          <div className="flex items-start space-x-2 text-[11px] text-slate-400">
            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <span>
              Our batch engine processes files concurrently. Converting raw image formats to web-optimized configurations reduces page weight and improves loading speeds.
            </span>
          </div>

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processConvert}
            disabled={!files.length || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Converting formats...</span>
              </>
            ) : (
              <span>Convert Images</span>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
