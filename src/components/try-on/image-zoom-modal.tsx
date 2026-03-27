"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImageZoomModalProps {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 2;
const SCALE_STEP = 0.1;

export function ImageZoomModal({ src, alt, open, onClose }: ImageZoomModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const dragStart = useRef({ x: 0, y: 0 });
  const positionStart = useRef({ x: 0, y: 0 });
  const pinchDistStart = useRef(0);
  const pinchScaleStart = useRef(1);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [open]);

  // Clamp position so the image doesn't drift too far when zoomed
  const clampPosition = useCallback(
    (pos: { x: number; y: number }, currentScale: number) => {
      if (currentScale <= 1) return { x: 0, y: 0 };
      // Allow panning proportional to the zoom overflow
      const maxOffset = ((currentScale - 1) / currentScale) * 200;
      return {
        x: Math.max(-maxOffset, Math.min(maxOffset, pos.x)),
        y: Math.max(-maxOffset, Math.min(maxOffset, pos.y)),
      };
    },
    [],
  );

  // --- Desktop: Wheel zoom ---
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
      setScale((prev) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
        // Reset position when zooming back to 1x
        if (next <= 1) setPosition({ x: 0, y: 0 });
        return Math.round(next * 10) / 10;
      });
    },
    [],
  );

  // --- Double click/tap: toggle 1x ↔ 2x ---
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setScale((prev) => (prev === 1 ? 2 : 1));
      setPosition({ x: 0, y: 0 });
    },
    [],
  );

  // --- Pointer drag (desktop + mobile single-finger) ---
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= 1) return;
      // Only handle primary pointer (left click / single touch)
      if (!e.isPrimary) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      positionStart.current = { ...position };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [scale, position],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !e.isPrimary) return;
      e.preventDefault();
      const dx = (e.clientX - dragStart.current.x) / scale;
      const dy = (e.clientY - dragStart.current.y) / scale;
      const newPos = {
        x: positionStart.current.x + dx,
        y: positionStart.current.y + dy,
      };
      setPosition(clampPosition(newPos, scale));
    },
    [isDragging, scale, clampPosition],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary) return;
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [],
  );

  // --- Pinch-to-zoom (mobile) ---
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const t0 = touches[0];
    const t1 = touches[1];
    return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
  };

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchDistStart.current = getTouchDistance(e.touches);
        pinchScaleStart.current = scale;
      }
    },
    [scale],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const currentDist = getTouchDistance(e.touches);
        if (pinchDistStart.current === 0) return;
        const ratio = currentDist / pinchDistStart.current;
        const newScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, pinchScaleStart.current * ratio),
        );
        setScale(Math.round(newScale * 10) / 10);
        if (newScale <= 1) setPosition({ x: 0, y: 0 });
      }
    },
    [],
  );

  // Prevent passive wheel on the container for zoom to work
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !open) return;
    const preventScroll = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", preventScroll, { passive: false });
    return () => el.removeEventListener("wheel", preventScroll);
  }, [open]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      // Only close if clicking the backdrop itself, not the image
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const cursorStyle = isDragging
    ? "grabbing"
    : scale > 1
      ? "grab"
      : "zoom-in";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/90" />
        <div
          ref={containerRef}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={handleBackdropClick}
          onWheel={handleWheel}
        >
          {/* Accessible title (visually hidden) */}
          <DialogTitle className="sr-only">{alt}</DialogTitle>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 flex size-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={1.5} />
          </button>

          {/* Zoom indicator badge */}
          <div className="absolute bottom-4 right-4 z-10 rounded-full bg-black/60 px-2.5 py-1 text-xs font-mono text-white tabular-nums">
            {scale.toFixed(1)}x
          </div>

          {/* Image with zoom/pan */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            draggable={false}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            style={{
              transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
              transition: isDragging ? "none" : "transform 0.2s ease-out",
              maxWidth: "90vw",
              maxHeight: "90vh",
              objectFit: "contain",
              cursor: cursorStyle,
              touchAction: "none",
              userSelect: "none",
            }}
          />
        </div>
      </DialogPortal>
    </Dialog>
  );
}
