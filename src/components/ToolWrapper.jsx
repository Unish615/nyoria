import React, { useState, useEffect } from "react";
import { ArrowLeft, Star } from "lucide-react";

export default function ToolWrapper({
  title,
  description,
  id,
  onBack,
  children,
}) {
  const [isFavorite, setIsFavorite] = useState(false);

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

  return (
    <div className="mx-auto w-full max-w-6xl animate-floatUp space-y-6">
      <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="flex items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-900/60 p-3 text-slate-200 transition hover:scale-105 hover:bg-slate-800 dark:border-white/10 dark:bg-[#111827]/10 dark:text-slate-400 dark:hover:bg-[#111827]/10"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
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
      </div>

      <div className="glass overflow-hidden p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}
