import React, { useState, useEffect, useRef } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, Scissors, Check, Sliders, Pipette } from "lucide-react";
import confetti from "canvas-confetti";
import { getStoredArray } from "../../utils/storage";

export default function BgRemover({ onBack }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [tolerance, setTolerance] = useState(30);
  const [feather, setFeather] = useState(5);
  const [keyColor, setKeyColor] = useState({ r: 255, g: 255, b: 255 }); // Default white
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");

  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  const handleFiles = (fileList) => {
    setError("");
    const selected = fileList[0];
    if (selected && !selected.type.startsWith("image/")) {
      setError("Please upload a valid image file.");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResultUrl("");
  };

  // Inspect corners of image to guess background color
  const autoDetectBackground = () => {
    if (!canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = imgRef.current;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Sample the 4 corners
    const corners = [
      getPixel(data, 0, 0, canvas.width),
      getPixel(data, canvas.width - 1, 0, canvas.width),
      getPixel(data, 0, canvas.height - 1, 0),
      getPixel(data, canvas.width - 1, canvas.height - 1, canvas.width),
    ];

    // Average the corners
    let r = 0, g = 0, b = 0;
    corners.forEach((c) => {
      r += c.r;
      g += c.g;
      b += c.b;
    });
    setKeyColor({
      r: Math.round(r / 4),
      g: Math.round(g / 4),
      b: Math.round(b / 4),
    });
  };

  const getPixel = (data, x, y, width) => {
    const idx = (y * width + x) * 4;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  };

  useEffect(() => {
    if (preview) {
      // Small timeout to ensure image element is loaded
      const timer = setTimeout(() => {
        autoDetectBackground();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [preview]);

  const handleCanvasClick = (e) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);

    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(x, y, 1, 1);
    const data = imgData.data;
    setKeyColor({ r: data[0], g: data[1], b: data[2] });
    setResultUrl("");
  };

  const removeBackground = () => {
    if (!canvasRef.current || !imgRef.current) return;
    setIsProcessing(true);

    setTimeout(() => {
      try {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const img = imgRef.current;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        const { r: kr, g: kg, b: kb } = keyColor;
        const tol = tolerance * 2.55; // Map 0-100 to 0-255

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Euclidean distance of colors
          const dist = Math.sqrt(
            Math.pow(r - kr, 2) + Math.pow(g - kg, 2) + Math.pow(b - kb, 2)
          );

          if (dist < tol) {
            // Apply soft feathering edge transitions
            if (feather > 0 && dist > tol - feather * 2) {
              const alphaRatio = (dist - (tol - feather * 2)) / (feather * 2);
              data[i + 3] = Math.round(alphaRatio * 255);
            } else {
              data[i + 3] = 0; // Transparent
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        setResultUrl(dataUrl);

        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });

        // Add to history
        const history = getStoredArray("nyoria_history");
        history.unshift({
          toolName: "Background Remover",
          fileName: file.name.replace(/\.[^/.]+$/, "") + "_no_bg.png",
          originalSize: file.size,
          finalSize: Math.round(dataUrl.length * 0.75), // Estimate base64 bytes
          timestamp: Date.now(),
        });
        localStorage.setItem("nyoria_history", JSON.stringify(history.slice(0, 50)));
        window.dispatchEvent(new Event("history_updated"));
      } catch (err) {
        setError("Background extraction failed. " + err.message);
      } finally {
        setIsProcessing(false);
      }
    }, 400);
  };

  return (
    <ToolWrapper
      id="bg-remover"
      title="AI-Style Background Remover"
      description="Erase background elements instantly. Click anywhere on the image to key out specific colors with precision tolerance control."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Arena */}
        <div className="lg:col-span-2 space-y-6">
          {!file ? (
            <DropZone
              onFilesSelected={handleFiles}
              accept="image/*"
              subtitle="Upload image to isolate subject"
              multiple={false}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200 dark:text-slate-400">
                  {resultUrl ? "Isolations Canvas (Transparent)" : "Source Canvas (Click to pick color)"}
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview("");
                    setResultUrl("");
                  }}
                  className="text-xs text-cyan-400 hover:underline font-semibold"
                >
                  Change Image
                </button>
              </div>

              <div className="relative border border-dashed border-white/10 bg-[#0B0F1A] p-4 rounded-3xl flex justify-center items-center overflow-auto min-h-72">
                {/* Hidden canvas for image modifications */}
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className={`max-h-96 object-contain rounded-xl cursor-crosshair border ${resultUrl ? "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 8 8%22><rect width=%224%22 height=%224%22 fill=%22%23ccc%22/><rect x=%224%22 y=%224%22 width=%224%22 height=%224%22 fill=%22%23ccc%22/><rect x=%224%22 width=%224%22 height=%224%22 fill=%22%23fff%22/><rect y=%224%22 width=%224%22 height=%224%22 fill=%22%23fff%22/></svg>')] bg-repeat" : "border-slate-800"
                    }`}
                  style={{ display: resultUrl ? "block" : "none" }}
                />

                {!resultUrl && (
                  <img
                    ref={imgRef}
                    src={preview}
                    alt="Source"
                    onClick={handleCanvasClick}
                    className="max-h-96 object-contain rounded-xl cursor-crosshair border border-slate-800"
                  />
                )}
              </div>
            </div>
          )}

          {resultUrl && (
            <div className="p-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 flex justify-between items-center text-sm">
              <div className="space-y-1">
                <span className="font-semibold text-emerald-500 flex items-center space-x-1.5">
                  <Check className="w-4 h-4" />
                  <span>Isolated Object Extracted!</span>
                </span>
                <span className="text-xs text-slate-400 block">
                  Export format: Portable Network Graphics (PNG) with alpha channel transparency.
                </span>
              </div>
              <a
                href={resultUrl}
                download={`${file?.name.replace(/\.[^/.]+$/, "")}_no_bg.png`}
                className="flex items-center space-x-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </a>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <span>Chroma Parameters</span>
          </h3>

          {/* Color Key Display */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Active Key Color</label>
            <div className="flex items-center space-x-3 p-3 bg-[#0B0F1A] rounded-2xl border border-slate-800">
              <div
                className="w-8 h-8 rounded-lg border border-slate-700 shadow"
                style={{
                  backgroundColor: `rgb(${keyColor.r}, ${keyColor.g}, ${keyColor.b})`,
                }}
              />
              <span className="text-xs text-slate-400 font-bold">
                rgb({keyColor.r}, {keyColor.g}, {keyColor.b})
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Click on the original image above to pick a specific color node to erase.
            </p>
          </div>

          {/* Tolerance */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <label>Tolerance Range</label>
              <span>{tolerance}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={tolerance}
              onChange={(e) => {
                setTolerance(parseInt(e.target.value));
                setResultUrl("");
              }}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Feathering */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <label>Feather Blur Edges</label>
              <span>{feather}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              value={feather}
              onChange={(e) => {
                setFeather(parseInt(e.target.value));
                setResultUrl("");
              }}
              className="w-full accent-cyan-400"
            />
          </div>

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={removeBackground}
            disabled={!file || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3.5 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Erasing backgrounds...</span>
              </>
            ) : (
              <>
                <Scissors className="w-5 h-5" />
                <span>Remove Background</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
