import React, { useEffect, useState } from "react";
import {
  Moon,
  Sun,
  FileImage,
  Layers,
  FileText,
  Maximize2,
  Scissors,
  Repeat,
  FileSignature,
  FileSearch,
  Camera,
  QrCode,
  FileMinus,
} from "lucide-react";

// Components
import Dashboard from "./components/Dashboard";
import ImageCompressor from "./components/tools/ImageCompressor";
import ImageMerger from "./components/tools/ImageMerger";
import PdfMerger from "./components/tools/PdfMerger";
import ImageToPdf from "./components/tools/ImageToPdf";
import PdfCompressor from "./components/tools/PdfCompressor";
import ImageResizer from "./components/tools/ImageResizer";
import FormatConverter from "./components/tools/FormatConverter";
import WatermarkTool from "./components/tools/WatermarkTool";
import OcrExtractor from "./components/tools/OcrExtractor";
import PdfEditor from "./components/tools/PdfEditor";
import QrGenerator from "./components/tools/QrGenerator";

const TOOLS = [
  {
    id: "compressor",
    name: "Smart Image Compressor",
    description: "Compress images down to custom size limits (KB/MB) with intelligent quality boundary optimization.",
    category: "image",
    icon: <FileImage className="w-5 h-5" />,
  },
  {
    id: "resizer",
    name: "Image Resizer",
    description: "Resize images using specific pixel heights/widths, percentage scaling, or popular social media templates.",
    category: "image",
    icon: <Maximize2 className="w-5 h-5" />,
  },
  {
    id: "merger",
    name: "Image Merger",
    description: "Combine multiple images vertically or horizontally with adjustable spacing and background colors.",
    category: "image",
    icon: <Layers className="w-5 h-5" />,
  },
  {
    id: "converter",
    name: "Format Converter",
    description: "Bulk convert images and export PDF pages as PNG, JPG, WEBP, AVIF, or BMP files.",
    category: "image",
    icon: <Repeat className="w-5 h-5" />,
  },
  {
    id: "watermark",
    name: "Watermark Designer",
    description: "Layer text styles or image logos onto your assets with custom transparency and rotation grids.",
    category: "image",
    icon: <FileSignature className="w-5 h-5" />,
  },
  {
    id: "ocr",
    name: "OCR Text Extractor",
    description: "Scan digital text characters directly from uploaded image documents using optical character recognition.",
    category: "image",
    icon: <FileSearch className="w-5 h-5" />,
  },
  {
    id: "pdf-merger",
    name: "PDF Merger",
    description: "Combine multiple PDF streams and reorder individual pages visually.",
    category: "pdf",
    icon: <Layers className="w-5 h-5" />,
  },
  {
    id: "pdf-compressor",
    name: "PDF Compressor",
    description: "Optimize PDF files by compressing internal resources and downscaling graphics.",
    category: "pdf",
    icon: <FileMinus className="w-5 h-5" />,
  },
  {
    id: "image-to-pdf",
    name: "Image to PDF",
    description: "Transform image sets into formatted documents (A4/Letter/Auto-fit) in batches.",
    category: "pdf",
    icon: <FileText className="w-5 h-5" />,
  },
  {
    id: "pdf-editor",
    name: "PDF Editor",
    description: "Edit PDF pages with text, images, highlights, freehand drawing, page rotation, and export.",
    category: "pdf",
    icon: <Layers className="w-5 h-5" />,
  },
  {
    id: "qr-generator",
    name: "QR Code Generator",
    description: "Generate customized QR codes for URLs, SSIDs, contacts, or texts instantly.",
    category: "utility",
    icon: <QrCode className="w-5 h-5" />,
  },
];

export default function App() {
  const [activeTool, setActiveTool] = useState(null);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("nyoria_dark_mode");
    if (saved !== null) return saved === "true";
    return true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("nyoria_dark_mode", String(isDark));
  }, [isDark]);

  const renderActiveTool = () => {
    const onBack = () => setActiveTool(null);
    switch (activeTool) {
      case "compressor":
        return <ImageCompressor onBack={onBack} />;
      case "resizer":
        return <ImageResizer onBack={onBack} />;
      case "merger":
        return <ImageMerger onBack={onBack} />;
      case "converter":
        return <FormatConverter onBack={onBack} />;
      case "watermark":
        return <WatermarkTool onBack={onBack} />;
      case "ocr":
        return <OcrExtractor onBack={onBack} />;
      case "pdf-merger":
        return <PdfMerger onBack={onBack} />;
      case "pdf-compressor":
        return <PdfCompressor onBack={onBack} />;
      case "image-to-pdf":
        return <ImageToPdf onBack={onBack} />;
      case "pdf-editor":
        return <PdfEditor onBack={onBack} />;
      case "qr-generator":
        return <QrGenerator onBack={onBack} />;
      default:
        return <Dashboard tools={TOOLS} onSelectTool={setActiveTool} />;
    }
  };

  return (
    <div className={`neutral-theme ${isDark ? "theme-dark dark" : ""} relative min-h-screen overflow-x-hidden p-4 transition-colors duration-300 sm:p-6`}>

      {/* Decorative neutral grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-[350px] h-[350px] bg-[#F9FAFB] blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[350px] h-[350px] bg-[#F3F4F6] blur-[100px] pointer-events-none" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">

        {/* Header */}
        <header className="glass flex items-center justify-between px-6 py-4 shadow-glass">
          <div
            onClick={() => setActiveTool(null)}
            className="group flex cursor-pointer items-start gap-3"
            role="button"
            tabIndex={0}
            aria-label="Go to dashboard"
          >
            <span className="status-indicator relative mt-[0.42rem] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
              <span
                className="absolute h-8 w-8 rounded-full bg-[rgba(34,197,94,0.14)] blur-xl opacity-80 motion-safe:animate-[ping_0.45s_ease-in-out_infinite]"
                aria-hidden="true"
              />
              <span
                className="absolute h-6 w-6 rounded-full bg-[rgba(34,197,94,0.2)] opacity-55 motion-safe:animate-[pulse_0.4s_ease-in-out_infinite]"
                aria-hidden="true"
              />
              <span
                className="relative h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.9)] ring-1 ring-green-200/50 animate-[pulse_0.35s_ease-in-out_infinite]"
                aria-hidden="true"
              />
            </span>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">
                  NYORIA Tools
                </h1>
              </div>
              <p className="text-[10px] sm:text-xs inline-flex items-center gap-1.5">
                <span>Ultra-fast.</span>
                <span>Secure. Zero Server Storage.</span>
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500 animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.9)]"
                  aria-hidden="true"
                />
              </p>
            </div>
          </div>

          <button
            className="rounded-2xl p-2.5 transition hover:scale-105"
            onClick={() => setIsDark((v) => !v)}
            type="button"
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        {/* Main Content */}
        <main className="min-h-[70vh]">
          {renderActiveTool()}
        </main>

        {/* Footer */}
        <footer className="py-6 border-t border-slate-700 dark:border-slate-800 text-center text-xs text-slate-400">
          <p>© {new Date().getFullYear()} NYORIA Tools. All file processing runs locally in memory and is deleted instantly.</p>
        </footer>
      </div>
    </div>
  );
}
