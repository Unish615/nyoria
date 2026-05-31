import React, { useState, useEffect } from "react";
import { ArrowLeft, Maximize2, Star } from "lucide-react";

export default function ToolWrapper({
  title,
  description,
  id,
  onBack,
  children,
}) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [panelWidth, setPanelWidth] = useState("100");
  const [panelHeight, setPanelHeight] = useState("520");

  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem("unish_favorites") || "[]");
    setIsFavorite(favorites.includes(id));
  }, [id]);

  const toggleFavorite = (e) => {
    e.stopPropagation();
    let favorites = JSON.parse(localStorage.getItem("unish_favorites") || "[]");
    if (favorites.includes(id)) {
      favorites = favorites.filter((f) => f !== id);
      setIsFavorite(false);
    } else {
      favorites.push(id);
      setIsFavorite(true);
    }
    localStorage.setItem("unish_favorites", JSON.stringify(favorites));
    // Emit a custom event to notify Dashboard to refresh stats
    window.dispatchEvent(new Event("favorites_updated"));
  };

  const widthValue = Number(panelWidth);
  const heightValue = Number(panelHeight);
  const safeWidth = Number.isFinite(widthValue)
    ? Math.min(100, Math.max(45, widthValue))
    : 100;
  const safeHeight = Number.isFinite(heightValue)
    ? Math.min(1400, Math.max(320, heightValue))
    : 520;

  return (
    <div className="mx-auto w-full max-w-6xl animate-floatUp space-y-6">
      <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div className="flex min-w-0 items-center space-x-4">
          <button
            onClick={onBack}
            className="flex items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-900/60 p-3 text-slate-200 transition hover:scale-105 hover:bg-slate-800 dark:border-white/10 dark:bg-[#111827]/10 dark:text-slate-400 dark:hover:bg-[#111827]/10"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xl font-bold tracking-tight text-[#E5E7EB] dark:text-[#E5E7EB] sm:text-2xl">
                {title}
              </h2>
              <button
                onClick={toggleFavorite}
                className={`p-1.5 rounded-lg border transition ${
                  isFavorite
                    ? "border-amber-400 bg-amber-400/10 text-amber-500 hover:bg-amber-400/20"
                    : "border-slate-700/80 bg-slate-900/60 text-slate-400 hover:text-amber-500 dark:border-white/10 dark:bg-[#111827]/10 hover:bg-slate-800 dark:hover:bg-[#111827]/10"
                }`}
                title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              >
                <Star className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} />
              </button>
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-400">{description}</p>
          </div>
        </div>

        <div className="resizable-size-control flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/40 p-2 text-xs dark:border-white/10 dark:bg-[#111827]/10">
          <div className="flex items-center gap-1.5 px-1 font-semibold text-slate-400">
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Size</span>
          </div>
          <label className="flex items-center gap-1.5 text-slate-400">
            <span>W</span>
            <input
              type="number"
              min="45"
              max="100"
              value={panelWidth}
              onChange={(e) => setPanelWidth(e.target.value)}
              className="h-8 w-16 rounded-xl border border-slate-700 bg-[#111827] px-2 text-xs text-white outline-none focus:border-cyan-400"
              aria-label="Tool panel width percent"
            />
            <span>%</span>
          </label>
          <label className="flex items-center gap-1.5 text-slate-400">
            <span>H</span>
            <input
              type="number"
              min="320"
              max="1400"
              step="20"
              value={panelHeight}
              onChange={(e) => setPanelHeight(e.target.value)}
              className="h-8 w-20 rounded-xl border border-slate-700 bg-[#111827] px-2 text-xs text-white outline-none focus:border-cyan-400"
              aria-label="Tool panel minimum height"
            />
            <span>px</span>
          </label>
          <button
            type="button"
            onClick={() => {
              setPanelWidth("100");
              setPanelHeight("520");
            }}
            className="h-8 rounded-xl border border-slate-700 bg-[#111827] px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            Reset
          </button>
        </div>
      </div>

      <div
        className="glass resizable-tool-surface overflow-auto p-4 sm:p-6 lg:p-8"
        style={{
          width: `${safeWidth}%`,
          minHeight: `${safeHeight}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
