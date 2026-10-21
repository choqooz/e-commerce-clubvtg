"use client";

import Image, { getImageProps, type ImageProps } from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./progressive-image.module.css";

type PhotoState = {
  source: string;
  status: "initial" | "pending" | "loaded" | "cached" | "error";
  previewFailed: boolean;
};

function thumbnailSource(props: ImageProps, source: string): string | undefined {
  if (props.loader || props.overrideSrc) return;
  // Unknown formats may be animated or bypass the optimizer. Never use a full
  // original as a purported tiny preview (including known SVG/GIF sources).
  if (!/\.(?:jpe?g|png|webp|avif)$/i.test(source.split(/[?#]/)[0])) return;
  if (source.startsWith("/") && !source.startsWith("//")) {
    if (source.startsWith("/_next/image")) return;
  } else {
    try {
      const url = new URL(source);
      // Conservative subset of the existing next.config.ts allowlist. This does
      // not change the main Image policy, especially unoptimized category URLs.
      const allowed =
        url.hostname === "img.clerk.com" ||
        (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/"));
      if (url.protocol !== "https:" || url.port || url.username || url.password || !allowed) return;
    } catch {
      return;
    }
  }
  try {
    // Preview optimization is independent of the main photo's unoptimized policy.
    // Only the known raster/allowlist subset above may request this tiny URL.
    // No sizes: a fixed 16px request selects the installed optimizer's 32px src,
    // rather than the largest viewport candidate from a responsive srcset.
    const { props: tiny } = getImageProps({ src: props.src, alt: "", width: 16, height: 16 });
    const url = new URL(tiny.src, "https://storefront.invalid");
    const width = Number(url.searchParams.get("w"));
    if (
      tiny.src !== source &&
      url.pathname === "/_next/image" &&
      url.searchParams.get("url") === source &&
      width > 0 &&
      width <= 32
    )
      return tiny.src;
  } catch {
    // Disallowed/custom optimizer settings must not break the full photo.
  }
}

export function ProgressiveImage({ onLoad, onError, className, style, ...props }: ImageProps) {
  const source =
    typeof props.src === "string"
      ? props.src
      : "default" in props.src
        ? props.src.default.src
        : props.src.src;
  const main = useRef<HTMLImageElement>(null);
  const preview = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<PhotoState>({
    source,
    status: "initial",
    previewFailed: false,
  });
  // Derive the initial presentation synchronously for a new src; no old preview
  // or loaded state can leak into the render before its hydration effect runs.
  const current =
    state.source === source ? state : { source, status: "initial", previewFailed: false };
  const thumbnail = thumbnailSource(props, source);

  useEffect(() => {
    const image = main.current;
    if (!image) return;
    let cancelled = false;
    const settle = (status: PhotoState["status"]) => {
      if (cancelled || main.current !== image) return;
      setState((previous) => {
        if (previous.source === source && previous.status !== "initial") return previous;
        return { source, status, previewFailed: false };
      });
    };
    // The SSR preview already covers partial bytes. Next's onLoad waits for
    // decode; the hydration-complete path must do the same, without replaying
    // a fade or owning Next's metadata/callbacks. Decode rejection follows
    // Next's policy: a complete photo can still be displayed.
    if (!image.complete) settle("pending");
    else if (image.naturalWidth === 0) settle("error");
    else if (typeof image.decode === "function")
      void image.decode().then(
        () => settle("cached"),
        () => settle("cached"),
      );
    else settle("cached");
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settleOpacity = () => {
      if (!motion.matches) return;
      // Zero CSS duration does not reliably stop an in-flight CSSTransition.
      // Cancel only our two opacity transitions to expose their CSS end states:
      // pending stays hidden; loaded main is visible and its preview is hidden.
      for (const image of [main.current, preview.current]) {
        if (typeof image?.getAnimations !== "function") continue;
        for (const animation of image.getAnimations()) {
          if (
            "transitionProperty" in animation &&
            animation.transitionProperty === "opacity" &&
            animation.effect &&
            "target" in animation.effect &&
            animation.effect.target === image
          )
            animation.cancel();
        }
      }
    };
    settleOpacity();
    motion.addEventListener("change", settleOpacity);
    return () => motion.removeEventListener("change", settleOpacity);
  }, []);

  const showPreview =
    thumbnail &&
    !current.previewFailed &&
    (current.status === "initial" || current.status === "pending" || current.status === "loaded");

  return (
    <span
      data-progressive-image
      data-state={current.status}
      className={`${styles.frame} ${props.fill ? styles.fill : styles.natural}`}
    >
      {showPreview && (
        // A plain img intentionally receives only the verified tiny src, never
        // a responsive srcset, preload, alt duplication or pointer interception.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-image-preview
          key={`preview:${source}`}
          ref={preview}
          src={thumbnail}
          alt=""
          aria-hidden={true}
          loading={props.preload || props.priority || props.loading === "eager" ? "eager" : "lazy"}
          decoding="async"
          className={`${className ?? ""} ${styles.preview}`}
          style={{ objectFit: style?.objectFit, objectPosition: style?.objectPosition }}
          onError={(event) => {
            if (preview.current !== event.currentTarget) return;
            setState((previous) =>
              previous.source === source ? { ...previous, previewFailed: true } : previous,
            );
          }}
        />
      )}
      <Image
        {...props}
        alt={props.alt}
        key={`main:${source}`}
        ref={main}
        className={`${className ?? ""} ${styles.image}`}
        style={style}
        onLoad={(event) => {
          if (main.current !== event.currentTarget) return;
          setState((previous) => ({
            source,
            status:
              previous.source === source &&
              (previous.status === "pending" || previous.status === "loaded")
                ? "loaded"
                : "cached",
            previewFailed: previous.source === source && previous.previewFailed,
          }));
          onLoad?.(event);
        }}
        onError={(event) => {
          if (main.current !== event.currentTarget) return;
          setState({ source, status: "error", previewFailed: false });
          onError?.(event);
        }}
      />
    </span>
  );
}
