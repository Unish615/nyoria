import React, { useState } from "react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";
import { Download, RefreshCw, FileSignature, Check, Type, Image } from "lucide-react";
import confetti from "canvas-confetti";

export default function WatermarkTool({ onBack }) {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [watermarkType, setWatermarkType] = useState("text"); // text, logo

  // Text Watermark Options
  const [text, setText] = useState("NYORIA Tools");
  const [textColor, setTextColor] = useState("#ffffff");

  // Logo Watermark Options
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");

  // Shared Options
  const [opacity, setOpacity] = useState(0.5);
  const [rotation, setRotation] = useState(45);
  const [position, setPosition] = useState("tile"); // center, top-left, top-right, bottom-left, bottom-right, tile
  const [size, setSize] = useState(25); // percentage of width

  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleMainFile = (fileList) => {
    setError("");
    const selected = fileList[0];
    if (selected && !selected.type.startsWith("image/")) {
      setError("Please upload a valid image file.");
      return;
    }
    setImage(selected);
    setImagePreview(URL.createObjectURL(selected));
    setResult(null);
  };

  const handleLogoFile = (fileList) => {
    setError("");
    const selected = fileList[0];
    if (selected && !selected.type.startsWith("image/")) {
      setError("Please upload a valid logo image.");
      return;
    }
    setLogo(selected);
    setLogoPreview(URL.createObjectURL(selected));
    setResult(null);
  };

  const processWatermark = async () => {
    if (!image || isProcessing) return;
    setIsProcessing(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("image", image);
    formData.append("type", watermarkType);
    formData.append("opacity", opacity);
    formData.append("rotation", rotation);
    formData.append("position", position);
    formData.append("size", size);

    if (watermarkType === "text") {
      formData.append("text", text);
      formData.append("textColor", textColor);
    } else {
      if (!logo) {
        setError("Please upload a logo image to watermark.");
        setIsProcessing(false);
        return;
      }
      formData.append("logo", logo);
    }

    try {
      const response = await fetch("/api/watermark", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to add watermark");
      }

      const data = await response.json();
      setResult(data);

      confetti({
        particleCount: 50,
        spread: 40,
      });

      // Update history
      const history = JSON.parse(localStorage.getItem("nyoria_history") || "[]");
      history.unshift({
        toolName: "Watermark Tool",
        fileName: data.name,
        originalSize: image.size,
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
      id="watermark"
      title="Watermark Designer"
      description="Apply high-quality text or image (logo) watermarks onto your digital assets with custom layouts."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Arena */}
        <div className="lg:col-span-2 space-y-6">
          {!image ? (
            <DropZone
              onFilesSelected={handleMainFile}
              accept="image/*"
              subtitle="Upload main canvas image"
              multiple={false}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200 dark:text-slate-400">
                  Canvas Preview
                </span>
                <button
                  onClick={() => {
                    setImage(null);
                    setImagePreview("");
                    setResult(null);
                  }}
                  className="text-xs text-cyan-400 hover:underline font-semibold"
                >
                  Change Image
                </button>
              </div>

              <div className="relative border border-white/10 bg-[#0B0F1A] p-4 rounded-3xl flex justify-center items-center overflow-auto min-h-72">
                <img
                  src={result ? result.dataUrl : imagePreview}
                  alt="Watermark result"
                  className="max-h-96 object-contain rounded-xl border border-slate-800"
                />
              </div>
            </div>
          )}

          {result && (
            <div className="p-5 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 flex justify-between items-center text-sm">
              <div className="space-y-1">
                <span className="font-semibold text-emerald-500 flex items-center space-x-1.5">
                  <Check className="w-4 h-4" />
                  <span>Watermarked Image Ready!</span>
                </span>
                <span className="text-xs text-slate-400 block">
                  Format: {result.format.toUpperCase()} | Size: {formatBytes(result.size)}
                </span>
              </div>
              <a
                href={result.dataUrl}
                download={result.name}
                className="flex items-center space-x-1.5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download Watermarked</span>
              </a>
            </div>
          )}
        </div>

        {/* Options Panel */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <FileSignature className="w-5 h-5 text-cyan-400" />
            <span>Watermark Options</span>
          </h3>

          <div className="flex rounded-xl border border-slate-700 p-0.5 bg-[#0B0F1A]">
            {[
              { id: "text", label: "Text Layer", icon: <Type className="w-3.5 h-3.5 mr-1.5" /> },
              { id: "logo", label: "Logo/Image", icon: <Image className="w-3.5 h-3.5 mr-1.5" /> },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setWatermarkType(m.id);
                  setResult(null);
                }}
                className={`w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${watermarkType === m.id
                    ? "bg-cyan-400 text-white"
                    : "text-slate-400 hover:text-white"
                  }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

          {watermarkType === "text" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold">Watermark Text</label>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setResult(null);
                  }}
                  className="w-full px-4 py-2 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none focus:border-cyan-400 text-xs"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold">Text Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => {
                      setTextColor(e.target.value);
                      setResult(null);
                    }}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-slate-700 bg-transparent"
                  />
                  <input
                    type="text"
                    value={textColor}
                    onChange={(e) => {
                      setTextColor(e.target.value);
                      setResult(null);
                    }}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-700 bg-[#111827] text-white outline-none text-xs"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-xs text-slate-400 font-semibold">Upload Logo Image</label>
              {!logo ? (
                <DropZone
                  onFilesSelected={handleLogoFile}
                  accept="image/*"
                  subtitle="Transparent PNG logo recommended"
                  multiple={false}
                  className="py-4 min-h-[100px] text-xs bg-[#0B0F1A]/20 border-slate-800"
                />
              ) : (
                <div className="flex items-center justify-between p-2 rounded-xl bg-[#0B0F1A] border border-slate-850">
                  <div className="flex items-center space-x-2 truncate w-3/4">
                    <img
                      src={logoPreview}
                      alt="Logo"
                      className="w-8 h-8 object-cover rounded-lg border border-slate-800"
                    />
                    <span className="text-[11px] text-slate-400 truncate">{logo.name}</span>
                  </div>
                  <button
                    onClick={() => {
                      setLogo(null);
                      setLogoPreview("");
                    }}
                    className="text-xs text-cyan-400 hover:text-cyan-400 px-2"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Position Selector */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold">Position Layout</label>
            <select
              value={position}
              onChange={(e) => {
                setPosition(e.target.value);
                setResult(null);
              }}
              className="w-full px-4 py-2 rounded-xl border border-slate-700 bg-[#111827] text-white outline-none text-xs"
            >
              <option value="tile">Tile (Repeat Everywhere)</option>
              <option value="center">Center</option>
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
            </select>
          </div>

          {/* Opacity */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <label>Opacity / Transparency</label>
              <span>{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => {
                setOpacity(parseFloat(e.target.value));
                setResult(null);
              }}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Rotation */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <label>Angle Rotation</label>
              <span>{rotation}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={rotation}
              onChange={(e) => {
                setRotation(parseInt(e.target.value));
                setResult(null);
              }}
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Size */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <label>Watermark Scale Size</label>
              <span>{size}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="90"
              value={size}
              onChange={(e) => {
                setSize(parseInt(e.target.value));
                setResult(null);
              }}
              className="w-full accent-cyan-400"
            />
          </div>

          {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

          <button
            onClick={processWatermark}
            disabled={!image || isProcessing}
            className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Applying overlay...</span>
              </>
            ) : (
              <span>Apply Watermark</span>
            )}
          </button>
        </div>
      </div>
    </ToolWrapper>
  );
}
