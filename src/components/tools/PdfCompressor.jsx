import React, { useState } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, FileMinus, Info, Check } from "lucide-react";
import confetti from "canvas-confetti";
import { apiRequest } from "../../utils/api";
import { getStoredArray } from "../../utils/storage";
import { getErrorMessage } from "../../utils/errors";

export default function PdfCompressor({ onBack }) {
  const [file, setFile] = useState(null);
  const [targetSize, setTargetSize] = useState("500");
  const [unit, setUnit] = useState("KB");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleFiles = (fileList) => {
    setError("");
    const selected = fileList[0];
    if (selected && selected.type !== "application/pdf" && !selected.name.endsWith(".pdf")) {
      setError("Please upload a valid PDF document.");
      return;
    }
    setFile(selected);
    setResult(null);
  };

  const processCompress = async () => {
    if (!file || isProcessing) return;
    setIsProcessing(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("targetSize", `${targetSize}${unit}`);

    try {
      const data = await apiRequest("/api/compress-pdf", {
        method: "POST",
        body: formData,
      });
      setResult(data);

      confetti({
        particleCount: 80,
        spread: 60,
      });

      const history = getStoredArray("nyoria_history");
      history.unshift({
        toolName: "PDF Compressor",
        fileName: data.name,
        originalSize: data.originalSize,
        finalSize: data.compressedSize,
        timestamp: Date.now(),
      });
      localStorage.setItem("nyoria_history", JSON.stringify(history.slice(0, 50)));
      window.dispatchEvent(new Event("history_updated"));
    } catch (e) {
      setError(getErrorMessage(e));
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
      id="pdf-compressor"
      title="PDF Compressor"
      description="Compress PDF documents to custom sizes by dynamically optimizing internal image resources."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Workspace */}
        <div className="lg:col-span-2 space-y-6">
          {!file ? (
            <DropZone
              onFilesSelected={handleFiles}
              accept=".pdf,application/pdf"
              subtitle="Upload PDF document to compress"
              multiple={false}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200 dark:text-slate-400">
                  Uploaded Document
                </span>
                <button
                  onClick={() => setFile(null)}
                  className="text-xs text-cyan-400 hover:underline font-semibold"
                >
                  Change File
                </button>
              </div>

              <div className="flex items-center space-x-4 p-4 rounded-3xl border border-white/10 bg-[#111827]/10">
                <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl">
                  <FileMinus className="w-8 h-8" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-semibold truncate text-[#E5E7EB] dark:text-[#E5E7EB]">
                    {file.name}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Original Size: {formatBytes(file.size)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="p-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
              <h4 className="text-sm font-bold text-emerald-500 flex items-center space-x-2">
                <Check className="w-5 h-5" />
                <span>Compression Successful!</span>
              </h4>
              <div className="flex justify-between items-center text-sm text-slate-850 dark:text-slate-300">
                <div>
                  <span className="font-semibold block truncate">{result.name}</span>
                  <span className="text-xs text-slate-400 mt-0.5 block">
                    Before: {formatBytes(result.originalSize)} | After:{" "}
                    {formatBytes(result.compressedSize)}
                  </span>
                </div>
                <a
                  href={result.dataUrl}
                  download={result.name}
                  className="flex items-center space-x-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Compressed PDF</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6">
          <h3 className="text-base font-bold text-white">Compression Parameters</h3>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Target Size Limit</label>
            <div className="flex space-x-2">
              <input
                type="number"
                value={targetSize}
                onChange={(e) => setTargetSize(e.target.value)}
                placeholder="500"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none focus:border-cyan-400"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none"
              >
                <option value="KB">KB</option>
                <option value="MB">MB</option>
              </select>
            </div>
            <div className="flex items-start space-x-2 text-[11px] text-slate-400 mt-1">
              <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>
                Our compressor down-samples embedded images in the PDF structure dynamically to achieve your target file size limit.
              </span>
            </div>
          </div>

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processCompress}
            disabled={!file || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Compressing PDF resources...</span>
              </>
            ) : (
              <span>Compress PDF</span>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
