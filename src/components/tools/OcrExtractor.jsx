import React, { useState } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, FileText, Check, Copy, FileCode } from "lucide-react";
import confetti from "canvas-confetti";
import { jsPDF } from "jspdf";

export default function OcrExtractor({ onBack }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [language, setLanguage] = useState("eng");
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

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
      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to extract text");
      }

      const data = await response.json();
      setExtractedText(data.text || "No text was detected in the uploaded image.");

      confetti({
        particleCount: 50,
        spread: 30,
      });

      // Update history
      const history = JSON.parse(localStorage.getItem("unish_history") || "[]");
      history.unshift({
        toolName: "OCR Text Extractor",
        fileName: file.name.replace(/\.[^/.]+$/, "") + "_extracted.txt",
        originalSize: file.size,
        finalSize: (data.text || "").length,
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
                </div>
              </div>

              <textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                className="w-full h-48 bg-[#0B0F1A]/80 border border-slate-850 p-4 rounded-2xl text-slate-400 text-xs font-mono focus:border-cyan-400 outline-none leading-relaxed"
              />

              <div className="flex flex-wrap gap-3 mt-3">
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
