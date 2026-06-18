import React, { useMemo, useState } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, FileText, Check, Copy, FileCode, Search, Trash2 } from "lucide-react";
import confetti from "canvas-confetti";
import { jsPDF } from "jspdf";
import { apiRequest } from "../../utils/api";
import { getStoredArray } from "../../utils/storage";
import { getErrorMessage } from "../../utils/errors";

export default function OcrExtractor({ onBack }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [language, setLanguage] = useState("eng");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [preserveLineBreaks, setPreserveLineBreaks] = useState(true);
  const [cleanSpacing, setCleanSpacing] = useState(true);

  const textStats = useMemo(() => {
    const trimmed = extractedText.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const lines = trimmed ? trimmed.split(/\n/).filter((line) => line.trim()).length : 0;
    const matches =
      searchTerm.trim() && trimmed
        ? (trimmed.match(new RegExp(searchTerm.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length
        : 0;

    return {
      characters: extractedText.length,
      words,
      lines,
      matches,
      readingMinutes: Math.max(1, Math.ceil(words / 220)),
    };
  }, [extractedText, searchTerm]);

  const normalizeText = (text) => {
    let nextText = text.replace(/\r\n?/g, "\n");

    if (cleanSpacing) {
      nextText = nextText
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");
    }

    if (!preserveLineBreaks) {
      nextText = nextText
        .replace(/-\n/g, "")
        .replace(/\n+/g, " ")
        .replace(/\s{2,}/g, " ");
    }

    return nextText.trim();
  };

  const handleFiles = (fileList) => {
    setError("");
    const selected = fileList[0];
    if (selected && !selected.type.startsWith("image/")) {
      setError("Please upload a valid image file.");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setExtractedText("");
    setSearchTerm("");
  };

  const processOcr = async () => {
    if (!file || isProcessing) return;
    setIsProcessing(true);
    setError("");
    setExtractedText("");

    const formData = new FormData();
    formData.append("image", file);
    formData.append("lang", language);

    try {
      const data = await apiRequest("/api/ocr", {
        method: "POST",
        body: formData,
      });
      const text = data.text?.trim()
        ? normalizeText(data.text)
        : "No text was detected in the uploaded image.";
      setExtractedText(text);

      confetti({
        particleCount: 50,
        spread: 30,
      });

      // Update history
      const history = getStoredArray("nyoria_history");
      history.unshift({
        toolName: "OCR Text Extractor",
        fileName: file.name.replace(/\.[^/.]+$/, "") + "_extracted.txt",
        originalSize: file.size,
        finalSize: (data.text || "").length,
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyCleanup = () => {
    setExtractedText((text) => normalizeText(text));
  };

  const clearResult = () => {
    setExtractedText("");
    setSearchTerm("");
  };

  const downloadAsTxt = () => {
    const blob = new Blob([extractedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name.replace(/\.[^/.]+$/, "")}_extracted.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsPdf = () => {
    const doc = new jsPDF();
    // Wrap text lines to fit in PDF pages
    const splitText = doc.splitTextToSize(extractedText, 180);
    doc.text(splitText, 15, 20);
    doc.save(`${file?.name.replace(/\.[^/.]+$/, "")}_extracted.pdf`);
  };

  const downloadAsJson = () => {
    const payload = {
      sourceFile: file?.name || null,
      language,
      stats: textStats,
      text: extractedText,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name.replace(/\.[^/.]+$/, "")}_ocr.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ToolWrapper
      id="ocr"
      title="OCR Text Extractor"
      description="Scan digital text characters directly from uploaded image documents using optical character recognition."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3 animate-floatUp">
        {/* Workspace */}
        <div className="lg:col-span-2 space-y-6">
          {!file ? (
            <DropZone
              onFilesSelected={handleFiles}
              accept="image/*"
              subtitle="Upload document photo or screenshot"
              multiple={false}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200 dark:text-slate-400">
                  Document Target
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview("");
                    setExtractedText("");
                    setSearchTerm("");
                  }}
                  className="text-xs text-cyan-400 hover:underline font-semibold"
                >
                  Change File
                </button>
              </div>

              <div className="relative border border-white/10 bg-[#0B0F1A] p-4 rounded-3xl flex justify-center items-center overflow-auto min-h-72">
                <img
                  src={preview}
                  alt="Document"
                  className="max-h-72 object-contain rounded-xl border border-slate-800"
                />
              </div>
            </div>
          )}

          {/* OCR text display box */}
          {extractedText && (
            <div className="space-y-3 p-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 animate-floatUp">
              <div className="flex justify-between items-center pb-2 border-b border-emerald-500/10">
                <span className="text-xs font-bold text-emerald-500 flex items-center space-x-1.5">
                  <Check className="w-4 h-4" />
                  <span>Text Scanned Successfully</span>
                </span>
                <div className="flex space-x-2">
                  <button
                    onClick={copyToClipboard}
                    className="p-1.5 text-slate-400 hover:text-slate-300 hover:bg-[#111827]/10 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                    title="Copy to Clipboard"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                  <button
                    onClick={clearResult}
                    className="p-1.5 text-slate-400 hover:text-slate-300 hover:bg-[#111827]/10 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                    title="Clear extracted text"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                {[
                  ["Words", textStats.words],
                  ["Characters", textStats.characters],
                  ["Lines", textStats.lines],
                  ["Read time", `${textStats.readingMinutes} min`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-[#111827]/10 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-1 text-sm font-bold text-[#E5E7EB] dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search extracted text..."
                  className="w-full rounded-2xl border border-slate-700 bg-[#111827] py-2 pl-10 pr-24 text-xs text-white outline-none focus:border-cyan-400"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400">
                  {searchTerm ? `${textStats.matches} matches` : "Ready"}
                </span>
              </div>

              <textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                className="w-full h-48 bg-[#0B0F1A]/80 border border-slate-850 p-4 rounded-2xl text-slate-400 text-xs font-mono focus:border-cyan-400 outline-none leading-relaxed"
              />

              <div className="flex flex-wrap gap-3 mt-3">
                <button
                  onClick={applyCleanup}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-[#111827] hover:bg-slate-800 text-white rounded-xl text-xs font-bold border border-slate-700 transition"
                >
                  <RefreshCw className="w-4 h-4 text-cyan-400" />
                  <span>Apply Cleanup</span>
                </button>
                <button
                  onClick={downloadAsTxt}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-[#111827] hover:bg-slate-800 text-white rounded-xl text-xs font-bold border border-slate-700 transition"
                >
                  <FileCode className="w-4 h-4 text-cyan-400" />
                  <span>Download Text (.TXT)</span>
                </button>
                <button
                  onClick={downloadAsPdf}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF Document</span>
                </button>
                <button
                  onClick={downloadAsJson}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-[#111827] hover:bg-slate-800 text-white rounded-xl text-xs font-bold border border-slate-700 transition"
                >
                  <FileCode className="w-4 h-4 text-cyan-400" />
                  <span>Download JSON</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <span>OCR Settings</span>
          </h3>

          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Document Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none text-xs"
            >
              <option value="eng">English</option>
              <option value="spa">Spanish (Español)</option>
              <option value="fra">French (Français)</option>
              <option value="deu">German (Deutsch)</option>
            </select>
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-[#111827]/10 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Text Cleanup</h4>
            <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
              <span>Clean extra spacing</span>
              <input
                type="checkbox"
                checked={cleanSpacing}
                onChange={(e) => setCleanSpacing(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 accent-cyan-400"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-300">
              <span>Preserve line breaks</span>
              <input
                type="checkbox"
                checked={preserveLineBreaks}
                onChange={(e) => setPreserveLineBreaks(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 accent-cyan-400"
              />
            </label>
          </div>

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processOcr}
            disabled={!file || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3.5 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Scanning document nodes...</span>
              </>
            ) : (
              <span>Extract Text</span>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
