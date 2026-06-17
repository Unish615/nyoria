import React, { useState, useEffect, useRef } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, Layers, Move, BookOpen, Trash2 } from "lucide-react";
import confetti from "canvas-confetti";
import { apiRequest } from "../../utils/api";
import { getStoredArray } from "../../utils/storage";

// Helper: Load PDF.js dynamically
const loadPdfJs = () => {
  return new Promise((resolve) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    document.head.appendChild(script);
  });
};

export default function PdfMerger({ onBack }) {
  const [files, setFiles] = useState([]);
  const [pages, setPages] = useState([]); // Flat list of pages: { id, fileIndex, pageIndex, previewUrl }
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const dragItemIndex = useRef();
  const dragOverItemIndex = useRef();

  const handleFiles = async (fileList) => {
    setError("");
    const incoming = Array.from(fileList).filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (!incoming.length) {
      setError("Please upload valid PDF files.");
      return;
    }

    setIsLoadingPages(true);
    try {
      const pdfjs = await loadPdfJs();
      const nextFiles = [...files];
      const nextPages = [...pages];

      for (const file of incoming) {
        const fileIndex = nextFiles.length;
        nextFiles.push(file);

        // Read and extract page thumbnails using PDF.js
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const pageCount = pdf.numPages;

        for (let i = 1; i <= pageCount; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.3 });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({ canvasContext: context, viewport }).promise;
          const previewUrl = canvas.toDataURL();

          nextPages.push({
            id: `${fileIndex}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            fileIndex,
            fileName: file.name,
            pageIndex: i - 1, // 0-indexed for pdf-lib backend
            previewUrl,
            selected: true,
          });
        }
      }

      setFiles(nextFiles);
      setPages(nextPages);
      setResult(null);
    } catch (e) {
      setError("Failed to parse PDF file pages. " + e.message);
    } finally {
      setIsLoadingPages(false);
    }
  };

  const handlePageSort = () => {
    const pagesCopy = [...pages];
    const draggedItem = pagesCopy[dragItemIndex.current];
    pagesCopy.splice(dragItemIndex.current, 1);
    pagesCopy.splice(dragOverItemIndex.current, 0, draggedItem);
    dragItemIndex.current = null;
    dragOverItemIndex.current = null;
    setPages(pagesCopy);
  };

  const togglePageSelect = (id) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  };

  const removeFile = (fileIdx) => {
    // Remove the file and all its pages
    setFiles((prev) => prev.filter((_, idx) => idx !== fileIdx));
    setPages((prev) => prev.filter((p) => p.fileIndex !== fileIdx));
    setResult(null);
  };

  const processMerge = async () => {
    const activePages = pages.filter((p) => p.selected);
    if (activePages.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    files.forEach((f) => {
      formData.append("pdfs", f);
    });

    // Send page order map to backend: [{ fileIndex: X, pageIndex: Y }]
    const orderMap = activePages.map((p) => ({
      fileIndex: p.fileIndex,
      pageIndex: p.pageIndex,
    }));
    formData.append("pageOrder", JSON.stringify(orderMap));

    try {
      const data = await apiRequest("/api/merge-pdf", {
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
        toolName: "PDF Merger",
        fileName: data.name,
        originalSize: files.reduce((acc, cur) => acc + cur.size, 0),
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
      id="pdf-merger"
      title="PDF Merger & Page Rearranger"
      description="Merge multiple PDFs, filter specific pages, and drag and drop individual pages to rearrange the final document."
      onBack={onBack}
    >
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <DropZone
              onFilesSelected={handleFiles}
              accept=".pdf,application/pdf"
              subtitle="Upload PDFs here to load pages"
              className="py-6 min-h-[120px]"
            />
          </div>

          <div className="p-5 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-4 text-white">
            <h4 className="font-bold flex items-center space-x-2 text-sm">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span>Loaded Documents ({files.length})</span>
            </h4>
            {files.length > 0 ? (
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center bg-slate-800 p-2 rounded-xl text-xs"
                  >
                    <span className="truncate w-3/4">{file.name}</span>
                    <button
                      onClick={() => removeFile(idx)}
                      className="text-cyan-400 hover:text-cyan-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No PDFs uploaded yet.</p>
            )}

            {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

            <button
              onClick={processMerge}
              disabled={pages.filter((p) => p.selected).length === 0 || isProcessing}
              className="w-full flex items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Merging PDF streams...</span>
                </>
              ) : (
                <span>Merge PDF Pages</span>
              )}
            </button>
          </div>
        </div>

        {/* PDF Page Sorting Arena */}
        {isLoadingPages ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="text-sm text-slate-400">Extracting PDF document pages...</p>
          </div>
        ) : pages.length > 0 ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <span className="text-sm font-bold text-[#E5E7EB] dark:text-slate-300">
                Rearrange & Toggle Pages
              </span>
              <span className="text-xs text-slate-400">
                Selected {pages.filter((p) => p.selected).length} / {pages.length} pages
              </span>
            </div>

            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {pages.map((page, idx) => (
                <div
                  key={page.id}
                  draggable
                  onDragStart={() => (dragItemIndex.current = idx)}
                  onDragEnter={() => (dragOverItemIndex.current = idx)}
                  onDragEnd={handlePageSort}
                  onDragOver={(e) => e.preventDefault()}
                  className={`group relative overflow-hidden rounded-2xl border p-2 transition-all duration-300 ${page.selected
                      ? "border-cyan-400/50 bg-cyan-400/5 hover:border-cyan-400"
                      : "border-slate-350 bg-slate-950/10 dark:border-slate-800 dark:bg-[#111827]/10 opacity-60"
                    } cursor-grab active:cursor-grabbing`}
                >
                  <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#111827] border border-slate-700 dark:border-slate-800">
                    <img
                      src={page.previewUrl}
                      alt={`Page ${page.pageIndex + 1}`}
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-[#111827]/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <Move className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#E5E7EB] dark:text-slate-300">
                      Page {page.pageIndex + 1}
                    </span>
                    <input
                      type="checkbox"
                      checked={page.selected}
                      onChange={() => togglePageSelect(page.id)}
                      className="h-4.5 w-4.5 rounded-lg border-slate-350 accent-cyan-400"
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-1">
                    {page.fileName}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {result && (
          <div className="p-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
            <h4 className="text-sm font-bold text-emerald-500">PDF Merged Successfully!</h4>
            <div className="flex justify-between items-center text-sm text-[#E5E7EB] dark:text-slate-300">
              <div>
                <span className="font-semibold truncate">{result.name}</span>
                <span className="text-xs text-slate-400 block">
                  Final Size: {formatBytes(result.size)}
                </span>
              </div>
              <a
                href={result.dataUrl}
                download={result.name}
                className="flex items-center space-x-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download Merged PDF</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </ToolWrapper>
  );
}
