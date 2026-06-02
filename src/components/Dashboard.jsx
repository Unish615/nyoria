import React, { useState, useEffect } from "react";
import {
  FileImage,
  FileText,
  Search,
  Star,
  Activity,
  Percent,
  HardDrive,
  Grid,
  FileUp,
  FileSignature,
  Maximize2,
  Trash2,
  Share2,
  FileMinus,
  QrCode,
  Flame,
} from "lucide-react";

export default function Dashboard({ tools, onSelectTool }) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    totalProcessed: 0,
    totalSavedBytes: 0,
    ratio: 0,
  });

  const loadData = () => {
    // Load Favorites
    const favs = JSON.parse(localStorage.getItem("nyoria_favorites") || "[]");
    setFavorites(favs);

    // Load History
    const hist = JSON.parse(localStorage.getItem("nyoria_history") || "[]");
    setHistory(hist);

    // Calculate Stats
    let total = hist.length;
    let saved = 0;
    let originalTotal = 0;
    hist.forEach((h) => {
      if (h.originalSize && h.finalSize && h.originalSize > h.finalSize) {
        saved += (h.originalSize - h.finalSize);
        originalTotal += h.originalSize;
      }
    });

    const ratio = originalTotal > 0 ? Math.round((saved / originalTotal) * 100) : 0;
    setStats({
      totalProcessed: total,
      totalSavedBytes: saved,
      ratio,
    });
  };

  useEffect(() => {
    loadData();
    window.addEventListener("favorites_updated", loadData);
    window.addEventListener("history_updated", loadData);
    return () => {
      window.removeEventListener("favorites_updated", loadData);
      window.removeEventListener("history_updated", loadData);
    };
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return "0 KB";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const clearHistory = () => {
    localStorage.setItem("nyoria_history", "[]");
    loadData();
  };

  const filteredTools = tools.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === "all" || t.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const favoriteTools = tools.filter((t) => favorites.includes(t.id));

  return (
    <div className="resizable-dashboard space-y-8 animate-floatUp">
      {/* Welcome & Stats Row */}
      <div className="grid gap-6 md:grid-cols-4">
        <div className="md:col-span-2 flex flex-col justify-between p-6 rounded-3xl bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent border border-blue-500/20 shadow-glass backdrop-blur-xl">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-[#E5E7EB] dark:text-white sm:text-3xl">
              NYORIA Tools
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              The next-generation, high-performance toolkit for processing your images, PDFs, and files with absolute privacy.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span>Server status:</span>
              <span className="inline-flex items-center gap-1.5">
                <span>Active</span>
                <span className="status-indicator relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center align-middle">
                  <span
                    className="absolute h-8 w-8 rounded-full bg-emerald-400/15 blur-xl opacity-80 motion-safe:animate-[ping_0.28s_ease-in-out_infinite]"
                    aria-hidden="true"
                  />
                  <span
                    className="absolute h-6 w-6 rounded-full bg-emerald-400/20 opacity-55 motion-safe:animate-[pulse_0.24s_ease-in-out_infinite]"
                    aria-hidden="true"
                  />
                  <span
                    className="relative h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.9)] ring-1 ring-green-200/50 animate-[pulse_0.2s_ease-in-out_infinite]"
                    aria-hidden="true"
                  />
                </span>
              </span>
            </span>
          </div>
        </div>

        {/* Stats 1 */}
        <div className="p-6 rounded-3xl bg-[#111827]/40 dark:bg-[#111827]/10 border border-white/12 dark:border-white/10 shadow-glass backdrop-blur-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Total Processed</span>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-cyan-400 dark:text-cyan-400">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold text-[#E5E7EB] dark:text-white">
              {stats.totalProcessed}
            </span>
            <p className="text-xs text-slate-400 mt-1">Actions completed</p>
          </div>
        </div>

        {/* Stats 2 */}
        <div className="p-6 rounded-3xl bg-[#111827]/40 dark:bg-[#111827]/10 border border-white/12 dark:border-white/10 shadow-glass backdrop-blur-xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Disk Space Saved</span>
            <div className="p-2.5 rounded-xl bg-cyan-400/10 text-cyan-400 dark:text-cyan-400">
              <HardDrive className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold text-[#E5E7EB] dark:text-white">
              {formatBytes(stats.totalSavedBytes)}
            </span>
            <p className="text-xs text-slate-400 mt-1">
              Average {stats.ratio}% savings
            </p>
          </div>
        </div>
      </div>

      {/* Favorites Section */}
      {favoriteTools.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-bold text-[#E5E7EB] dark:text-[#E5E7EB]">
            Favorite Tools
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {favoriteTools.map((t) => (
              <div
                key={t.id}
                onClick={() => onSelectTool(t.id)}
                className="group relative cursor-pointer overflow-hidden rounded-3xl border border-amber-400/30 bg-amber-400/5 p-5 shadow-glass transition-all duration-300 hover:-translate-y-1 hover:bg-amber-400/10 hover:border-amber-400/50"
              >
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-2xl bg-amber-400/10 text-amber-500`}>
                    {t.icon}
                  </div>
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                </div>
                <h4 className="mt-4 font-bold text-[#E5E7EB] dark:text-white group-hover:text-amber-400 transition-colors">
                  {t.name}
                </h4>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-400 line-clamp-2">
                  {t.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Toolkit Search & Filtering */}
      <section className="space-y-6">
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <h3 className="text-lg font-bold text-[#E5E7EB] dark:text-[#E5E7EB]">
            All Utility Tools
          </h3>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search tools..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-64 pl-10 pr-4 py-2 text-sm rounded-2xl border border-slate-700 bg-[#111827]/100 outline-none focus:border-cyan-400 dark:border-slate-800 dark:bg-[#111827]/10 dark:focus:border-cyan-400 transition-colors"
              />
            </div>
            {/* Category Tabs */}
            <div className="flex rounded-2xl border border-slate-700 dark:border-slate-800 p-0.5 bg-[#111827]/40 dark:bg-[#111827]/10 overflow-x-auto">
              {[
                { id: "all", label: "All" },
                { id: "image", label: "Image" },
                { id: "pdf", label: "PDF" },
                { id: "utility", label: "Utility" },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeCategory === c.id
                    ? "bg-slate-900 text-white dark:bg-[#111827]/10 dark:text-white"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-950/10 dark:hover:bg-[#111827]/10"
                    }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tools Grid */}
        {filteredTools.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredTools.map((t) => (
              <div
                key={t.id}
                onClick={() => onSelectTool(t.id)}
                className="group relative cursor-pointer overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/60 p-5 shadow-glass transition-all duration-300 hover:-translate-y-1 hover:bg-slate-800 hover:border-cyan-400 dark:border-white/10 dark:bg-[#111827]/10 dark:hover:bg-[#111827]/10 dark:hover:border-cyan-400/50"
              >
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-2xl bg-cyan-400/10 text-cyan-400 dark:text-cyan-400 group-hover:scale-110 transition-transform`}>
                    {t.icon}
                  </div>
                </div>
                <h4 className="mt-4 font-bold text-[#E5E7EB] dark:text-white group-hover:text-cyan-400 dark:group-hover:text-cyan-400 transition-colors">
                  {t.name}
                </h4>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-400 line-clamp-2">
                  {t.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center border border-dashed border-slate-700 dark:border-slate-800 rounded-3xl text-slate-400">
            No tools found matching your search.
          </div>
        )}
      </section>

      {/* History Log Section */}
      {history.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Flame className="w-5 h-5 text-red-400" />
              <h3 className="text-lg font-bold text-[#E5E7EB] dark:text-[#E5E7EB]">
                Recent Processing History
              </h3>
            </div>
            <button
              onClick={clearHistory}
              className="flex items-center space-x-1.5 text-xs font-semibold text-cyan-400 hover:underline"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear History</span>
            </button>
          </div>

          <div className="glass overflow-x-auto border border-white/15">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-6 py-4">Tool</th>
                  <th className="px-6 py-4">Processed File</th>
                  <th className="px-6 py-4">Size Savings</th>
                  <th className="px-6 py-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200 dark:text-slate-400">
                {history.slice(0, 8).map((h, i) => {
                  const saved = h.originalSize - h.finalSize;
                  const savingsPct = h.originalSize > 0 ? Math.round((saved / h.originalSize) * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-[#111827]/10 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                        {h.toolName}
                      </td>
                      <td className="px-6 py-4 max-w-[200px] truncate">{h.fileName}</td>
                      <td className="px-6 py-4">
                        {savingsPct > 0 ? (
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-bold">
                            <span>-{savingsPct}%</span>
                            <span className="text-[10px] opacity-75">
                              ({formatBytes(saved)} saved)
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Processed</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(h.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        - {new Date(h.timestamp).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
