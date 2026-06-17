import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getStoredArray } from "../../utils/storage";
import {
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    TextCursor,
    Image as ImageIcon,
    Highlighter,
    PenTool,
    RotateCcw,
    RotateCw,
    Trash2,
    Download,
    Layers,
    FileText,
} from "lucide-react";
import DropZone from "../DropZone";
import ToolWrapper from "../ToolWrapper";

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const DEFAULT_TEXT_OPTIONS = {
    fontSize: 24,
    fill: "#0f172a",
};

const DEFAULT_BRUSH_OPTIONS = {
    color: "#0f172a",
    width: 4,
};

const DEFAULT_HIGHLIGHT_OPTIONS = {
    color: "#fde68a",
    opacity: 0.45,
};

const PAGE_RENDER_SCALE = 1.5;
const A4_PAGE_SIZE = { width: 1200, height: 1697 };
const A4_PAGE_MARGIN = 72;

const createShapeId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `shape-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const normalizeRotation = (rotation) => ((rotation % 360) + 360) % 360;

const readNumericInput = (value) => (value === "" ? "" : Number(value));

const commitNumericInput = (value, fallback, min = -Infinity, max = Infinity) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
};

const getCanvasSize = (page, zoom) => {
    const rotation = normalizeRotation(page.rotate);
    const rotated = rotation === 90 || rotation === 270;
    return {
        width: (rotated ? page.height : page.width) * zoom,
        height: (rotated ? page.width : page.height) * zoom,
    };
};

const pagePointToCanvas = (page, point, zoom) => {
    const rotation = normalizeRotation(page.rotate);
    if (rotation === 90) {
        return {
            x: (page.height - point.y) * zoom,
            y: point.x * zoom,
        };
    }
    if (rotation === 180) {
        return {
            x: (page.width - point.x) * zoom,
            y: (page.height - point.y) * zoom,
        };
    }
    if (rotation === 270) {
        return {
            x: point.y * zoom,
            y: (page.width - point.x) * zoom,
        };
    }
    return {
        x: point.x * zoom,
        y: point.y * zoom,
    };
};

const canvasPointToPage = (page, point, zoom) => {
    const rotation = normalizeRotation(page.rotate);
    if (rotation === 90) {
        return {
            x: point.y / zoom,
            y: page.height - point.x / zoom,
        };
    }
    if (rotation === 180) {
        return {
            x: page.width - point.x / zoom,
            y: page.height - point.y / zoom,
        };
    }
    if (rotation === 270) {
        return {
            x: page.width - point.y / zoom,
            y: point.x / zoom,
        };
    }
    return {
        x: point.x / zoom,
        y: point.y / zoom,
    };
};

const distanceToSegment = (x, y, x1, y1, x2, y2) => {
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx;
    let yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
};

const getShapeBounds = (shape) => {
    switch (shape.type) {
        case "text":
            return {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.fontSize * 1.3,
            };
        case "highlight":
            return {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height,
            };
        case "image":
            return {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height,
            };
        case "path": {
            const xCoordinates = shape.points.map((point) => point.x);
            const yCoordinates = shape.points.map((point) => point.y);
            const minX = Math.min(...xCoordinates);
            const maxX = Math.max(...xCoordinates);
            const minY = Math.min(...yCoordinates);
            const maxY = Math.max(...yCoordinates);
            const padding = shape.width / 2;
            return {
                x: minX - padding,
                y: minY - padding,
                width: maxX - minX + padding * 2,
                height: maxY - minY + padding * 2,
            };
        }
        default:
            return { x: 0, y: 0, width: 0, height: 0 };
    }
};

const isPointInShape = (shape, point, tolerance = 10) => {
    const bounds = getShapeBounds(shape);
    if (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
    ) {
        return true;
    }

    if (shape.type === "path" && shape.points.length > 1) {
        for (let i = 0; i < shape.points.length - 1; i += 1) {
            const segmentDistance = distanceToSegment(
                point.x,
                point.y,
                shape.points[i].x,
                shape.points[i].y,
                shape.points[i + 1].x,
                shape.points[i + 1].y
            );
            if (segmentDistance <= tolerance) {
                return true;
            }
        }
    }

    return false;
};

const loadImage = (src) =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });

const fileToDataUrl = async (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

const createA4ImagePage = async (file, pageNumber) => {
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = A4_PAGE_SIZE.width;
    canvas.height = A4_PAGE_SIZE.height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const maxWidth = canvas.width - A4_PAGE_MARGIN * 2;
    const maxHeight = canvas.height - A4_PAGE_MARGIN * 2;
    const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;
    const x = (canvas.width - drawWidth) / 2;
    const y = (canvas.height - drawHeight) / 2;

    ctx.drawImage(image, x, y, drawWidth, drawHeight);
    const imageUrl = canvas.toDataURL("image/png");

    return {
        pageNumber,
        rotate: 0,
        imageUrl,
        width: canvas.width,
        height: canvas.height,
        loaded: true,
        shapes: [],
        isImagePage: true,
    };
};

const drawPageOnContext = async (ctx, page, zoom, imageMap) => {
    ctx.save();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if (!page.imageUrl) {
        ctx.restore();
        return;
    }

    let image = imageMap.current[page.imageUrl];
    if (!image) {
        image = await loadImage(page.imageUrl);
        imageMap.current[page.imageUrl] = image;
    }

    const rotation = normalizeRotation(page.rotate);
    const pageWidth = page.width * zoom;
    const pageHeight = page.height * zoom;

    if (rotation === 90) {
        ctx.translate(ctx.canvas.width, 0);
        ctx.rotate(Math.PI / 2);
    } else if (rotation === 180) {
        ctx.translate(ctx.canvas.width, ctx.canvas.height);
        ctx.rotate(Math.PI);
    } else if (rotation === 270) {
        ctx.translate(0, ctx.canvas.height);
        ctx.rotate(-Math.PI / 2);
    }

    ctx.drawImage(image, 0, 0, pageWidth, pageHeight);
    ctx.restore();
};

const drawShapesOnContext = async (ctx, page, zoom, selectedShapeId, imageMap) => {
    const shapes = page.shapes || [];

    for (const shape of shapes) {
        if (shape.type === "image" && shape.src && !imageMap.current[shape.src]) {
            const image = await loadImage(shape.src);
            imageMap.current[shape.src] = image;
        }
    }

    shapes.forEach((shape) => {
        const drawPoint = (point) => pagePointToCanvas(page, point, zoom);

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (shape.type === "path") {
            if (shape.points.length === 0) {
                ctx.restore();
                return;
            }
            ctx.strokeStyle = shape.color;
            ctx.lineWidth = shape.width * zoom;
            ctx.beginPath();
            const first = drawPoint(shape.points[0]);
            ctx.moveTo(first.x, first.y);
            for (let i = 1; i < shape.points.length; i += 1) {
                const next = drawPoint(shape.points[i]);
                ctx.lineTo(next.x, next.y);
            }
            ctx.stroke();
        }

        if (shape.type === "highlight") {
            const topLeft = drawPoint({ x: shape.x, y: shape.y });
            const width = shape.width * zoom;
            const height = shape.height * zoom;
            ctx.fillStyle = shape.color;
            ctx.globalAlpha = shape.opacity;
            ctx.fillRect(topLeft.x, topLeft.y, width, height);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "#f59e0b";
            ctx.lineWidth = 1;
            ctx.strokeRect(topLeft.x, topLeft.y, width, height);
        }

        if (shape.type === "text") {
            const topLeft = drawPoint({ x: shape.x, y: shape.y });
            ctx.fillStyle = shape.color;
            ctx.font = `${shape.fontSize * zoom}px Inter, ui-sans-serif, system-ui, sans-serif`;
            ctx.textBaseline = "top";
            const lines = String(shape.text || "").split("\n");
            const lineHeight = shape.fontSize * 1.3 * zoom;
            lines.forEach((line, index) => {
                ctx.fillText(line, topLeft.x, topLeft.y + index * lineHeight, shape.width * zoom);
            });
        }

        if (shape.type === "image") {
            const topLeft = drawPoint({ x: shape.x, y: shape.y });
            const width = shape.width * zoom;
            const height = shape.height * zoom;
            const image = imageMap.current[shape.src];
            if (image) {
                ctx.drawImage(image, topLeft.x, topLeft.y, width, height);
            }
        }

        if (shape.id === selectedShapeId) {
            const bounds = getShapeBounds(shape);
            const topLeft = pagePointToCanvas(page, { x: bounds.x, y: bounds.y }, zoom);
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(topLeft.x - 2, topLeft.y - 2, bounds.width * zoom + 4, bounds.height * zoom + 4);
            ctx.setLineDash([]);
        }

        ctx.restore();
    });
};

export default function PdfEditor({ onBack }) {
    const [pdfFile, setPdfFile] = useState(null);
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [pages, setPages] = useState([]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [activeTool, setActiveTool] = useState("select");
    const [textOptions, setTextOptions] = useState(DEFAULT_TEXT_OPTIONS);
    const [brushOptions, setBrushOptions] = useState(DEFAULT_BRUSH_OPTIONS);
    const [highlightOptions, setHighlightOptions] = useState(DEFAULT_HIGHLIGHT_OPTIONS);
    const [selectedShapeId, setSelectedShapeId] = useState(null);
    const [dragState, setDragState] = useState(null);

    const canvasRef = useRef(null);
    const viewerRef = useRef(null);
    const pdfProxyRef = useRef(null);
    const imageInputRef = useRef(null);
    const appendImageInputRef = useRef(null);
    const imageMap = useRef({});

    const currentPage = useMemo(() => pages[currentPageIndex] || null, [pages, currentPageIndex]);
    const selectedShape = useMemo(
        () => currentPage?.shapes?.find((shape) => shape.id === selectedShapeId) || null,
        [currentPage, selectedShapeId]
    );

    const setErrorMessage = useCallback((message) => {
        setError(message);
        window.setTimeout(() => setError(""), 4000);
    }, []);

    const updateCurrentPage = useCallback(
        (updater) => {
            setPages((prev) => {
                const next = [...prev];
                if (!next[currentPageIndex]) {
                    return prev;
                }
                next[currentPageIndex] = updater(next[currentPageIndex]);
                return next;
            });
        },
        [currentPageIndex]
    );

    const handleToolChange = (tool) => {
        if (tool === activeTool) {
            setActiveTool("select");
            return;
        }

        setActiveTool(tool);
    };

    const addTextShape = (position) => {
        const shape = {
            id: createShapeId(),
            type: "text",
            x: position.x,
            y: position.y,
            text: "New text",
            fontSize: textOptions.fontSize,
            color: textOptions.fill,
            width: 260,
        };

        updateCurrentPage((page) => ({
            ...page,
            shapes: [...page.shapes, shape],
        }));
        setSelectedShapeId(shape.id);
        setActiveTool("select");
    };

    const addHighlightShape = (position) => {
        const shape = {
            id: createShapeId(),
            type: "highlight",
            x: position.x,
            y: position.y,
            width: 240,
            height: 60,
            color: highlightOptions.color,
            opacity: highlightOptions.opacity,
        };

        updateCurrentPage((page) => ({
            ...page,
            shapes: [...page.shapes, shape],
        }));
        setSelectedShapeId(shape.id);
        setActiveTool("select");
    };

    const addImageShape = async (file) => {
        if (!file || !currentPage) return;

        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const image = await loadImage(dataUrl);
        const maximumSize = Math.min(currentPage.width * 0.6, currentPage.height * 0.6);
        const scale = Math.min(1, maximumSize / Math.max(image.width, image.height));
        const shape = {
            id: createShapeId(),
            type: "image",
            x: (currentPage.width - image.width * scale) / 2,
            y: (currentPage.height - image.height * scale) / 2,
            width: image.width * scale,
            height: image.height * scale,
            src: dataUrl,
        };

        imageMap.current[dataUrl] = image;
        updateCurrentPage((page) => ({ ...page, shapes: [...page.shapes, shape] }));
        setSelectedShapeId(shape.id);
        setActiveTool("select");
    };

    const appendImagePages = async (files) => {
        if (!files?.length) return;
        if (!pages.length) {
            setErrorMessage("Please load a PDF first before adding image pages.");
            return;
        }

        setLoading(true);
        setError("");
        try {
            const appendedPages = [];
            const startPageNumber = pages.length + 1;
            for (let i = 0; i < files.length; i += 1) {
                const file = files[i];
                if (!file.type.startsWith("image/")) continue;
                const page = await createA4ImagePage(file, startPageNumber + appendedPages.length);
                appendedPages.push(page);
            }

            if (!appendedPages.length) {
                setErrorMessage("Please upload valid JPG or PNG image files.");
                return;
            }
            setPages((prev) => [...prev, ...appendedPages]);
            setCurrentPageIndex(pages.length);
        } catch (err) {
            setErrorMessage(err.message || "Failed to create PDF image pages.");
        } finally {
            setLoading(false);
        }
    };

    const updateSelectedShape = useCallback(
        (changes) => {
            if (!selectedShapeId) return;
            updateCurrentPage((page) => ({
                ...page,
                shapes: page.shapes.map((shape) =>
                    shape.id === selectedShapeId ? { ...shape, ...changes } : shape
                ),
            }));
        },
        [selectedShapeId, updateCurrentPage]
    );

    const handleCanvasPointerDown = async (event) => {
        if (!currentPage || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const canvasPoint = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
        const pagePoint = canvasPointToPage(currentPage, canvasPoint, zoom);

        if (activeTool === "draw") {
            const shape = {
                id: createShapeId(),
                type: "path",
                points: [pagePoint],
                color: brushOptions.color,
                width: brushOptions.width,
            };
            updateCurrentPage((page) => ({
                ...page,
                shapes: [...page.shapes, shape],
            }));
            setSelectedShapeId(shape.id);
            setDragState({ type: "draw", shapeId: shape.id });
            return;
        }

        if (activeTool === "text") {
            addTextShape(pagePoint);
            return;
        }

        if (activeTool === "highlight") {
            addHighlightShape(pagePoint);
            return;
        }

        const clickedShape = [...(currentPage.shapes || [])].reverse().find((shape) =>
            isPointInShape(shape, pagePoint)
        );

        if (clickedShape) {
            setSelectedShapeId(clickedShape.id);
            if (activeTool === "select") {
                const bounds = getShapeBounds(clickedShape);
                const offsetX = pagePoint.x - bounds.x;
                const offsetY = pagePoint.y - bounds.y;
                setDragState({ type: "move", shapeId: clickedShape.id, offsetX, offsetY });
            }
            return;
        }

        setSelectedShapeId(null);
    };

    const handleCanvasPointerMove = (event) => {
        if (!dragState || !currentPage || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const canvasPoint = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
        const pagePoint = canvasPointToPage(currentPage, canvasPoint, zoom);

        if (dragState.type === "draw") {
            updateCurrentPage((page) => ({
                ...page,
                shapes: page.shapes.map((shape) =>
                    shape.id === dragState.shapeId
                        ? { ...shape, points: [...shape.points, pagePoint] }
                        : shape
                ),
            }));
            return;
        }

        if (dragState.type === "move") {
            updateCurrentPage((page) => ({
                ...page,
                shapes: page.shapes.map((shape) => {
                    if (shape.id !== dragState.shapeId) {
                        return shape;
                    }
                    return {
                        ...shape,
                        x: pagePoint.x - dragState.offsetX,
                        y: pagePoint.y - dragState.offsetY,
                    };
                }),
            }));
        }
    };

    const handleCanvasPointerUp = () => {
        setDragState(null);
    };

    const loadPdfPage = useCallback(
        async (pageIndex) => {
            if (!pdfProxyRef.current || !pages[pageIndex]) return;
            setLoading(true);
            try {
                const pdf = pdfProxyRef.current;
                const page = await pdf.getPage(pageIndex + 1);
                const viewport = page.getViewport({ scale: PAGE_RENDER_SCALE });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport }).promise;
                const imageUrl = canvas.toDataURL("image/png");

                setPages((prev) => {
                    const next = [...prev];
                    next[pageIndex] = {
                        ...next[pageIndex],
                        loaded: true,
                        imageUrl,
                        width: viewport.width,
                        height: viewport.height,
                    };
                    return next;
                });
            } catch (err) {
                setErrorMessage(err.message || "Failed to render PDF page.");
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [pages, setErrorMessage]
    );

    const preparePdf = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (!pdf.numPages) {
            throw new Error("The selected PDF has no pages.");
        }
        pdfProxyRef.current = pdf;
        setPages(
            Array.from({ length: pdf.numPages }).map((_, index) => ({
                pageNumber: index + 1,
                rotate: 0,
                imageUrl: "",
                width: 0,
                height: 0,
                loaded: false,
                shapes: [],
            }))
        );
        setCurrentPageIndex(0);
        setPdfFile(file);
        setFileName(file.name);
        setSelectedShapeId(null);
    };

    const handleFilesSelected = async (fileList) => {
        setError("");

        const selected = Array.from(fileList).find(
            (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
        );
        if (!selected) {
            setErrorMessage("Please upload a valid PDF file.");
            return;
        }

        try {
            await preparePdf(selected);
        } catch (err) {
            setErrorMessage(err.message || "Unable to load the PDF file.");
        }
    };

    useEffect(() => {
        if (!currentPage) return;
        if (!currentPage.loaded) {
            loadPdfPage(currentPageIndex).catch((error) => {
                setErrorMessage("Could not render the PDF page. " + error.message);
            });
        }
    }, [currentPage, currentPageIndex, loadPdfPage, setErrorMessage]);

    const drawCanvas = useCallback(async () => {
        if (!canvasRef.current || !currentPage || !currentPage.imageUrl) return;

        const canvas = canvasRef.current;
        const size = getCanvasSize(currentPage, zoom);
        canvas.width = size.width;
        canvas.height = size.height;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        const ctx = canvas.getContext("2d");
        await drawPageOnContext(ctx, currentPage, zoom, imageMap);
        await drawShapesOnContext(ctx, currentPage, zoom, selectedShapeId, imageMap);
    }, [currentPage, zoom, selectedShapeId]);

    useEffect(() => {
        drawCanvas();
    }, [drawCanvas, pages]);

    const renderPageToDataUrl = async (pageState) => {
        if (!pageState.imageUrl) {
            throw new Error("Page asset missing for export.");
        }
        const canvas = document.createElement("canvas");
        const size = getCanvasSize(pageState, 1);
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        await drawPageOnContext(ctx, pageState, 1, imageMap);
        await drawShapesOnContext(ctx, pageState, 1, null, imageMap);
        return canvas.toDataURL("image/png");
    };

    const exportPdf = async () => {
        if (!pages.length) {
            setErrorMessage("No pages available to export.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const doc = await PDFDocument.create();
            for (let index = 0; index < pages.length; index += 1) {
                const pageState = pages[index];
                if (!pageState.loaded) {
                    await loadPdfPage(index);
                }
                const dataUrl = await renderPageToDataUrl(pageState);
                const response = await fetch(dataUrl);
                const imageBytes = await response.arrayBuffer();
                const pngImage = await doc.embedPng(imageBytes);
                const width = pageState.rotate % 180 === 0 ? pageState.width : pageState.height;
                const height = pageState.rotate % 180 === 0 ? pageState.height : pageState.width;
                const pdfPage = doc.addPage([width, height]);
                pdfPage.drawImage(pngImage, {
                    x: 0,
                    y: 0,
                    width,
                    height,
                });
            }

            const finalBytes = await doc.save();
            const blob = new Blob([finalBytes], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName ? fileName.replace(/\.pdf$/i, "-edited.pdf") : "edited.pdf";
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);

            const history = getStoredArray("nyoria_history");
            history.unshift({
                toolName: "PDF Editor",
                fileName: link.download,
                originalSize: pdfFile?.size || 0,
                finalSize: blob.size,
                timestamp: Date.now(),
            });
            localStorage.setItem("nyoria_history", JSON.stringify(history.slice(0, 50)));
            window.dispatchEvent(new Event("history_updated"));
        } catch (err) {
            setErrorMessage(err.message || "Failed to export the PDF.");
        } finally {
            setLoading(false);
        }
    };

    const handleThumbnailDrag = (event, index) => {
        event.dataTransfer.setData("text/plain", String(index));
    };

    const handleThumbnailDrop = (event, targetIndex) => {
        event.preventDefault();
        const sourceIndex = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isNaN(sourceIndex)) return;
        if (sourceIndex === targetIndex) return;
        setPages((prev) => {
            const next = [...prev];
            const [moved] = next.splice(sourceIndex, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
        if (currentPageIndex === sourceIndex) {
            setCurrentPageIndex(targetIndex);
        }
    };

    const rotateCurrentPage = (direction) => {
        if (!currentPage) return;
        const rotation = direction === "left" ? -90 : 90;
        setPages((prev) => {
            const next = [...prev];
            const page = next[currentPageIndex];
            next[currentPageIndex] = {
                ...page,
                rotate: normalizeRotation(page.rotate + rotation),
            };
            return next;
        });
    };

    const deleteCurrentPage = () => {
        if (!currentPage || pages.length <= 1) {
            setErrorMessage("You need at least one page to keep the PDF editor active.");
            return;
        }
        setPages((prev) => {
            const next = prev.filter((_, index) => index !== currentPageIndex);
            const nextIndex = Math.min(currentPageIndex, next.length - 1);
            setCurrentPageIndex(nextIndex);
            return next;
        });
    };

    const handleImageInputChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setErrorMessage("Please choose a valid image file.");
            return;
        }
        addImageShape(file);
        event.target.value = null;
    };

    const deleteSelectedShape = () => {
        if (!selectedShapeId) return;
        updateCurrentPage((page) => ({
            ...page,
            shapes: page.shapes.filter((shape) => shape.id !== selectedShapeId),
        }));
        setSelectedShapeId(null);
    };

    const handlePageClick = useCallback(
        (index) => {
            setSelectedShapeId(null);
            setCurrentPageIndex(index);
            if (viewerRef.current) {
                viewerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        },
        [viewerRef]
    );

    const currentPageLabel = currentPage
        ? `Page ${currentPage.pageNumber} / ${pages.length}`
        : "No PDF loaded";

    return (
        <ToolWrapper
            id="pdf-editor"
            title="PDF Editor"
            description="Upload and edit PDF pages with text, images, highlights, drawing, page reorder and export."
            onBack={onBack}
        >
            <div className="space-y-6 h-full">
                {!pdfFile ? (
                    <DropZone
                        onFilesSelected={handleFilesSelected}
                        accept="application/pdf"
                        subtitle="Upload a PDF to start editing"
                        className="py-6 min-h-[180px]"
                    />
                ) : (
                    <div className="grid gap-8 xl:grid-cols-[1.8fr_0.9fr] h-full items-stretch">
                        <div className="space-y-6 min-h-[calc(100vh-280px)]">
                            <div className="rounded-3xl border border-slate-700 bg-[#111827]/80 p-4 shadow-glass">
                                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { id: "select", label: "Select", icon: Layers },
                                            { id: "text", label: "Text", icon: TextCursor },
                                            { id: "image", label: "Image", icon: ImageIcon },
                                            { id: "highlight", label: "Highlight", icon: Highlighter },
                                            { id: "draw", label: "Draw", icon: PenTool },
                                        ].map((tool) => {
                                            const ToolIcon = tool.icon;
                                            return (
                                                <button
                                                    key={tool.id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (tool.id === "image") {
                                                            imageInputRef.current?.click();
                                                            return;
                                                        }
                                                        handleToolChange(tool.id);
                                                    }}
                                                    className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${activeTool === tool.id
                                                        ? "border-cyan-400 bg-cyan-400/10 text-cyan-700"
                                                        : "border-slate-700 bg-[#111827] text-slate-200 hover:border-cyan-300 hover:bg-cyan-50"
                                                        }`}
                                                >
                                                    <ToolIcon className="w-4 h-4" />
                                                    {tool.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="flex flex-wrap gap-2 justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-300 hover:bg-cyan-50"
                                        >
                                            <ZoomOut className="w-4 h-4" />
                                            Zoom -
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setZoom(Math.min(2.5, zoom + 0.1))}
                                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm font-semibold text-slate-200 hover:border-cyan-300 hover:bg-cyan-50"
                                        >
                                            <ZoomIn className="w-4 h-4" />
                                            Zoom +
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
                                            disabled={currentPageIndex === 0}
                                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm font-semibold text-slate-200 disabled:opacity-50 hover:border-cyan-300 hover:bg-cyan-50"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                            Prev
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
                                            disabled={currentPageIndex >= pages.length - 1}
                                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm font-semibold text-slate-200 disabled:opacity-50 hover:border-cyan-300 hover:bg-cyan-50"
                                        >
                                            Next
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-slate-700 bg-[#111827]/80 p-4 shadow-glass flex min-h-[520px] flex-col">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-200">{currentPageLabel}</p>
                                        <p className="text-xs text-slate-400">Use the toolbar to edit the page content or draw directly on the canvas.</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-950/10 px-3 py-2 text-xs text-slate-400">Zoom: {(zoom * 100).toFixed(0)}%</div>
                                </div>
                                <div ref={viewerRef} className="overflow-auto rounded-3xl border border-slate-700 bg-[#0B0F1A] p-4 flex-1">
                                    <div className="relative mx-auto flex h-full w-full overflow-hidden rounded-3xl bg-[#111827] shadow-sm min-h-[520px]">
                                        {loading && (
                                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
                                                <div className="rounded-full bg-[#111827]/90 px-4 py-2 text-sm font-semibold text-slate-200">Rendering page...</div>
                                            </div>
                                        )}
                                        <canvas
                                            ref={canvasRef}
                                            onPointerDown={handleCanvasPointerDown}
                                            onPointerMove={handleCanvasPointerMove}
                                            onPointerUp={handleCanvasPointerUp}
                                            className="block h-full w-full"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-slate-700 bg-[#111827]/80 p-4 shadow-glass">
                                <div className="mb-4 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-slate-200">Page thumbnails</h3>
                                    <span className="text-xs text-slate-400">Drag to reorder pages</span>
                                </div>
                                <div className="flex gap-3 overflow-x-auto pb-2">
                                    {pages.map((page, index) => (
                                        <button
                                            key={page.pageNumber}
                                            type="button"
                                            draggable
                                            onDragStart={(event) => handleThumbnailDrag(event, index)}
                                            onDragOver={(event) => event.preventDefault()}
                                            onDrop={(event) => handleThumbnailDrop(event, index)}
                                            onClick={() => handlePageClick(index)}
                                            className={`min-w-[90px] rounded-3xl border p-3 text-left transition ${index === currentPageIndex ? "border-cyan-400 bg-cyan-400/10" : "border-slate-700 bg-[#111827] hover:border-cyan-300"
                                                }`}
                                        >
                                            <div className="mb-2 h-20 overflow-hidden rounded-2xl bg-slate-950/10">
                                                {page.imageUrl ? (
                                                    <img src={page.imageUrl} alt={`Page ${page.pageNumber}`} className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="flex h-full items-center justify-center text-xs text-slate-400">Preview soon</div>
                                                )}
                                            </div>
                                            <div className="text-xs font-semibold text-slate-200">Page {page.pageNumber}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <aside className="space-y-6">
                            <div className="rounded-3xl border border-slate-700 bg-[#111827]/80 p-4 shadow-glass">
                                <div className="mb-4 flex items-center gap-3">
                                    <FileText className="h-4 w-4 text-cyan-400" />
                                    <h3 className="text-sm font-semibold text-slate-200">Object properties</h3>
                                </div>
                                <div className="space-y-4">
                                    {selectedShape ? (
                                        <>
                                            {selectedShape.type === "text" && (
                                                <>
                                                    <div>
                                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Text</label>
                                                        <textarea
                                                            rows={3}
                                                            value={selectedShape.text}
                                                            onChange={(event) => updateSelectedShape({ text: event.target.value })}
                                                            className="w-full rounded-2xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Text color</label>
                                                        <input
                                                            type="color"
                                                            value={selectedShape.color}
                                                            onChange={(e) => updateSelectedShape({ color: e.target.value })}
                                                            className="h-10 w-full rounded-2xl border border-slate-700 bg-[#111827] px-3"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Font size</label>
                                                        <input
                                                            type="number"
                                                            min="12"
                                                            max="96"
                                                            value={selectedShape.fontSize}
                                                            onChange={(e) => updateSelectedShape({ fontSize: readNumericInput(e.target.value) })}
                                                            onBlur={(e) => updateSelectedShape({ fontSize: commitNumericInput(e.target.value, 24, 12, 96) })}
                                                            className="w-full rounded-2xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm"
                                                        />
                                                    </div>
                                                </>
                                            )}
                                            {selectedShape.type === "highlight" && (
                                                <>
                                                    <div>
                                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Highlight color</label>
                                                        <input
                                                            type="color"
                                                            value={selectedShape.color}
                                                            onChange={(e) => updateSelectedShape({ color: e.target.value })}
                                                            className="h-10 w-full rounded-2xl border border-slate-700 bg-[#111827] px-3"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Opacity</label>
                                                        <input
                                                            type="range"
                                                            min="0.1"
                                                            max="0.9"
                                                            step="0.05"
                                                            value={selectedShape.opacity}
                                                            onChange={(e) => updateSelectedShape({ opacity: Number(e.target.value) })}
                                                            className="w-full accent-cyan-400"
                                                        />
                                                    </div>
                                                </>
                                            )}
                                            {selectedShape.type === "image" && (
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Width</label>
                                                        <input
                                                            type="number"
                                                            min="50"
                                                            max={currentPage?.width || 1000}
                                                            value={selectedShape.width}
                                                            onChange={(e) => updateSelectedShape({ width: readNumericInput(e.target.value) })}
                                                            onBlur={(e) =>
                                                                updateSelectedShape({
                                                                    width: commitNumericInput(e.target.value, 50, 50, currentPage?.width || 1000),
                                                                })
                                                            }
                                                            className="w-full rounded-2xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Height</label>
                                                        <input
                                                            type="number"
                                                            min="50"
                                                            max={currentPage?.height || 1000}
                                                            value={selectedShape.height}
                                                            onChange={(e) => updateSelectedShape({ height: readNumericInput(e.target.value) })}
                                                            onBlur={(e) =>
                                                                updateSelectedShape({
                                                                    height: commitNumericInput(e.target.value, 50, 50, currentPage?.height || 1000),
                                                                })
                                                            }
                                                            className="w-full rounded-2xl border border-slate-700 bg-[#111827] px-3 py-2 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={deleteSelectedShape}
                                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-[#111827]/20 px-4 py-3 text-sm font-semibold text-cyan-400 hover:border-cyan-300 hover:bg-cyan-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Remove selected object
                                            </button>
                                        </>
                                    ) : (
                                        <div className="rounded-3xl border border-dashed border-slate-700 bg-[#0B0F1A] p-4 text-sm text-slate-400">
                                            Select an object on the page to adjust text, highlight, or image properties.
                                        </div>
                                    )}

                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Draw color</label>
                                        <input
                                            type="color"
                                            value={brushOptions.color}
                                            onChange={(e) => setBrushOptions((prev) => ({ ...prev, color: e.target.value }))}
                                            className="h-10 w-full rounded-2xl border border-slate-700 bg-[#111827] px-3"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Brush width</label>
                                        <input
                                            type="range"
                                            min="1"
                                            max="24"
                                            value={brushOptions.width}
                                            onChange={(e) => setBrushOptions((prev) => ({ ...prev, width: Number(e.target.value) }))}
                                            className="w-full accent-cyan-400"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <button
                                            type="button"
                                            onClick={() => imageInputRef.current?.click()}
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-600"
                                        >
                                            <ImageIcon className="w-4 h-4" />
                                            Add image
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => appendImageInputRef.current?.click()}
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-[#111827] px-4 py-3 text-sm font-semibold text-slate-200 hover:border-cyan-300 hover:bg-cyan-50"
                                        >
                                            <ImageIcon className="w-4 h-4" />
                                            Insert image pages
                                        </button>
                                        <input
                                            ref={imageInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageInputChange}
                                            className="hidden"
                                        />
                                        <input
                                            ref={appendImageInputRef}
                                            type="file"
                                            accept="image/png,image/jpeg"
                                            multiple
                                            onChange={(event) => {
                                                const files = Array.from(event.target.files || []);
                                                appendImagePages(files);
                                                event.target.value = null;
                                            }}
                                            className="hidden"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-slate-700 bg-[#111827]/80 p-4 shadow-glass">
                                <div className="mb-4 flex items-center gap-3">
                                    <Layers className="h-4 w-4 text-cyan-400" />
                                    <h3 className="text-sm font-semibold text-slate-200">Page controls</h3>
                                </div>
                                <div className="grid gap-3">
                                    <button
                                        type="button"
                                        onClick={() => rotateCurrentPage("left")}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-[#111827] px-4 py-3 text-sm font-semibold text-slate-200 hover:border-cyan-300 hover:bg-cyan-50"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Rotate left
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => rotateCurrentPage("right")}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-[#111827] px-4 py-3 text-sm font-semibold text-slate-200 hover:border-cyan-300 hover:bg-cyan-50"
                                    >
                                        <RotateCw className="w-4 h-4" />
                                        Rotate right
                                    </button>
                                    <button
                                        type="button"
                                        onClick={deleteCurrentPage}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-[#111827]/20 px-4 py-3 text-sm font-semibold text-cyan-400 hover:border-cyan-300 hover:bg-cyan-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete page
                                    </button>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-slate-700 bg-[#111827]/80 p-4 shadow-glass">
                                <div className="mb-4 flex items-center gap-3">
                                    <Download className="h-4 w-4 text-cyan-400" />
                                    <h3 className="text-sm font-semibold text-slate-200">Export</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={exportPdf}
                                    disabled={loading}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Download className="w-4 h-4" />
                                    Download edited PDF
                                </button>
                                {error && <p className="mt-3 text-sm text-cyan-400">{error}</p>}
                            </div>
                        </aside>
                    </div>
                )}
            </div>
        </ToolWrapper>
    );
}
