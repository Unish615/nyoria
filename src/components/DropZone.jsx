import React, { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

function readAllDirectoryEntries(reader) {
  return new Promise((resolve) => {
    const entries = [];
    const read = () => {
      reader.readEntries((results) => {
        if (!results.length) {
          resolve(entries);
        } else {
          entries.push(...results);
          read();
        }
      });
    };
    read();
  });
}

function collectFilesFromEntry(entry) {
  return new Promise((resolve) => {
    if (!entry) return resolve([]);

    if (entry.isFile) {
      entry.file(
        (file) => resolve([file]),
        () => resolve([])
      );
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      readAllDirectoryEntries(reader).then(async (entries) => {
        const nestedFiles = await Promise.all(entries.map(collectFilesFromEntry));
        resolve(nestedFiles.flat());
      });
    } else {
      resolve([]);
    }
  });
}

export default function DropZone({
  onFilesSelected,
  accept = "*",
  multiple = true,
  allowFolders = false,
  subtitle = "Supports all file formats",
  className = "",
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const dt = e.dataTransfer;
    if (allowFolders && dt.items && dt.items.length > 0) {
      const files = [];
      const promises = Array.from(dt.items).map((item) => {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : item.getAsEntry && item.getAsEntry();
        if (entry) {
          return collectFilesFromEntry(entry).then((nestedFiles) => {
            files.push(...nestedFiles);
          });
        }
        return Promise.resolve();
      });
      await Promise.all(promises);
      if (files.length > 0) {
        onFilesSelected(files);
        return;
      }
    }

    if (dt.files && dt.files.length > 0) {
      onFilesSelected(dt.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = "";
    }
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFilePicker();
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={openFilePicker}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      className={`group relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-300 ${isDragging
          ? "border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
          : "border-slate-300 bg-[#111827]/40 hover:border-cyan-400 hover:bg-slate-900/60 dark:border-slate-800 dark:bg-[#111827]/10 dark:hover:border-cyan-400/50 dark:hover:bg-[#111827]/10"
        } ${className}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={handleFileInput}
        className="sr-only"
        tabIndex={-1}
        {...(allowFolders ? { webkitdirectory: true, directory: true } : {})}
      />
      <div className="pointer-events-none flex flex-col items-center justify-center space-y-3">
        <div className={`p-4 rounded-full bg-slate-950/10 dark:bg-slate-900 transition-transform duration-300 group-hover:-translate-y-1 ${isDragging ? "bg-cyan-400 text-white dark:bg-cyan-400" : "text-slate-400 dark:text-slate-400"
          }`}>
          <UploadCloud className="w-8 h-8" />
        </div>
        <div>
          <p className="font-semibold text-[#E5E7EB] dark:text-slate-300">
            Drag and drop files here, or <span className="text-cyan-400 group-hover:underline">browse</span>
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
