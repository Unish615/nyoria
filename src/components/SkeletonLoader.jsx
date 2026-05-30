import React from "react";

export function FileCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-[#111827]/10 p-4 animate-pulse">
      <div className="h-40 w-full rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="mt-3 flex items-center justify-between">
        <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-1/5 rounded bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="mt-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

export function ProcessingSkeleton() {
  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-[#111827]/10 p-6 animate-pulse">
      <div className="flex items-center space-x-4">
        <div className="h-12 w-12 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
      <div className="h-2 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="flex justify-between">
        <div className="h-3 w-1/6 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-1/12 rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}
