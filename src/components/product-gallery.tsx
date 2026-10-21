"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Swiper as SwiperInstance } from "swiper";
import { Swiper, SwiperSlide } from "swiper/react";
import { ProgressiveImage } from "@/components/progressive-image";
import type { Product } from "@/lib/types";
import "swiper/css";
import styles from "./product-gallery.module.css";

type PhotoState = { width: number; height: number; status: "loaded" | "error" };
const pendingHeight = 96; // A loading/error message, not an invented photo ratio.
const emptyImages: string[] = [];

export function ProductGallery({ product }: { product: Product }) {
  const images = product.image_urls ?? emptyImages;
  const multiple = images.length > 1;
  const [active, setActive] = useState(0);
  const [imageStates, setImageStates] = useState<Record<string, PhotoState>>({});
  const sizes = useRef<Record<string, PhotoState>>({});
  const viewport = useRef<HTMLDivElement>(null);
  const swiper = useRef<SwiperInstance | null>(null);
  const width = useRef(0);
  const reduced = useRef(false);

  const syncGeometry = useCallback(() => {
    const instance = swiper.current;
    const element = viewport.current;
    if (!instance || instance.destroyed || !element) return;
    const photo = sizes.current[images[instance.activeIndex]];
    const height =
      photo?.status === "loaded" && width.current > 0
        ? (width.current * photo.height) / photo.width
        : pendingHeight;
    element.style.height = `${height}px`;
    // Swiper 14's update()/updateAutoHeight(0) also reset slide transition duration.
    // Update only geometry; preserve the transform's current 400ms transition.
    instance.updateSize();
    instance.updateSlides();
    const position = -(instance.slidesGrid[instance.activeIndex] ?? 0);
    instance.setTranslate(position);
    instance.updateProgress(position);
    instance.updateSlidesClasses();
    instance.checkOverflow();
  }, [images]);

  useEffect(() => {
    if (!multiple || !viewport.current) return;
    const element = viewport.current;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changeDirection = () => {
      const instance = swiper.current;
      if (!instance || instance.destroyed) return;
      // Natural vertical slides need centered snaps: otherwise Swiper trims end
      // snaps when a tall photo precedes a short one. At the active photo's own
      // viewport height its center is also its natural top, with no crop.
      instance.params.slidesPerView = desktop.matches ? "auto" : 1;
      instance.params.centeredSlides = desktop.matches;
      instance.changeDirection(desktop.matches ? "vertical" : "horizontal", false);
      syncGeometry();
    };
    const changeMotion = () => {
      reduced.current = motion.matches;
      const instance = swiper.current;
      if (!instance || instance.destroyed) return;
      instance.params.speed = motion.matches ? 0 : 400;
      if (motion.matches) {
        instance.setTransition(0);
        // Zero duration alone does not stop an already-running CSSTransition.
        // getAnimations flushes the zero-duration style before geometry changes.
        const wrapper = instance.wrapperEl;
        if (typeof wrapper?.getAnimations === "function") {
          for (const animation of wrapper.getAnimations()) {
            if ("transitionProperty" in animation && animation.transitionProperty === "transform")
              animation.cancel();
          }
        }
        // Settle the selected photo, not the interpolated in-flight transform.
        syncGeometry();
        instance.transitionEnd();
      }
    };
    width.current = element.getBoundingClientRect().width;
    changeDirection();
    changeMotion();
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      if (nextWidth === width.current) return; // Ignore our own height changes.
      width.current = nextWidth;
      syncGeometry();
    });
    observer.observe(element);
    desktop.addEventListener("change", changeDirection);
    motion.addEventListener("change", changeMotion);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", changeDirection);
      motion.removeEventListener("change", changeMotion);
    };
  }, [multiple, syncGeometry]);

  // Load/error rendering can change a slide's natural height. Re-measure after commit.
  useEffect(() => {
    syncGeometry();
  }, [imageStates, syncGeometry]);

  const record = (url: string, state: PhotoState) => {
    sizes.current = { ...sizes.current, [url]: state };
    setImageStates(sizes.current);
  };
  const select = (index: number) => {
    if (index < 0 || index >= images.length) return;
    swiper.current?.slideTo(index, reduced.current ? 0 : 400);
  };
  const photo = (url: string | undefined, index: number) => {
    const state = url ? imageStates[url] : undefined;
    return (
      <div
        data-gallery-photo
        data-active={index === active}
        aria-hidden={index !== active}
        className={styles.photo}
        style={state?.status !== "loaded" && url ? { minHeight: pendingHeight } : undefined}
      >
        {url && state?.status !== "error" ? (
          <>
            <ProgressiveImage
              src={url}
              alt={product.title}
              width={state?.width ?? 0}
              height={state?.height ?? 0}
              preload={index === 0}
              loading={index === 0 ? undefined : "lazy"}
              sizes="(min-width: 1024px) 58.33vw, 100vw"
              className="block"
              style={{ width: "100%", height: "auto" }}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0)
                  record(url, { width: naturalWidth, height: naturalHeight, status: "loaded" });
              }}
              onError={() => record(url, { width: 0, height: 0, status: "error" })}
            />
            {!state && (
              <span role="status" className={styles.loading}>
                Cargando imagen…
              </span>
            )}
          </>
        ) : (
          <span role="status" className="block px-[18px] py-[30px] font-mono text-[13px]">
            {url
              ? multiple
                ? "No pudimos cargar esta imagen. Probá otra vista."
                : "No pudimos cargar esta imagen."
              : product.category}
          </span>
        )}
      </div>
    );
  };
  const activeState = imageStates[images[active]];

  return (
    <div className="relative min-w-0" role="group" aria-label="Galería del producto">
      <div
        id="product-active-image"
        ref={viewport}
        className={`relative w-full${multiple ? ` ${styles.viewport}` : ""}`}
        style={multiple ? { height: pendingHeight } : undefined}
        aria-busy={Boolean(images[active] && !activeState)}
      >
        {multiple ? (
          <Swiper
            className={styles.swiper}
            speed={400}
            loop={false}
            rewind={false}
            autoHeight={false}
            slidesPerView={1}
            resizeObserver={false}
            updateOnWindowResize={false}
            lazyPreload={false}
            onSwiper={(instance) => {
              swiper.current = instance;
              syncGeometry();
            }}
            onBeforeDestroy={() => {
              swiper.current = null;
            }}
            onSlideChange={(instance) => {
              setActive(instance.activeIndex);
              syncGeometry();
            }}
          >
            {images.map((url, index) => (
              <SwiperSlide key={`${index}:${url}`} className={styles.slide}>
                {photo(url, index)}
              </SwiperSlide>
            ))}
          </Swiper>
        ) : (
          photo(images[0], 0)
        )}
      </div>
      {multiple && (
        <>
          <div className="flex gap-[6px] px-[18px] pt-[18px] md:px-[24px]">
            <button
              type="button"
              aria-label="Vista anterior"
              aria-controls="product-active-image"
              disabled={active === 0}
              onClick={() => select(active - 1)}
              className={styles.control}
            >
              Anterior
            </button>
            <button
              type="button"
              aria-label="Vista siguiente"
              aria-controls="product-active-image"
              disabled={active === images.length - 1}
              onClick={() => select(active + 1)}
              className={styles.control}
            >
              Siguiente
            </button>
          </div>
          <div className="flex gap-[6px] overflow-x-auto px-[18px] py-[18px] md:px-[24px]">
            {images.map((url, index) => (
              <button
                key={`${index}:${url}`}
                type="button"
                aria-label={`Ver vista ${index + 1} de ${product.title}`}
                aria-pressed={active === index}
                aria-controls="product-active-image"
                onClick={() => select(index)}
                className={`relative aspect-4/5 w-[72px] shrink-0 overflow-hidden border bg-warm-sand md:w-[84px] focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink ${
                  active === index
                    ? "border-midnight-ink"
                    : "border-transparent hover:border-midnight-ink"
                }`}
              >
                <Image
                  src={url}
                  alt={`Vista ${index + 1}`}
                  fill
                  sizes="(min-width: 768px) 84px, 72px"
                  className="object-contain"
                />
              </button>
            ))}
          </div>
        </>
      )}
      {product.status === "sold" && (
        <span className="absolute top-[18px] right-[18px] z-10 border border-midnight-ink bg-bone-white px-[6px] py-[2px] font-mono text-[13px] font-normal uppercase text-midnight-ink">
          Vendido
        </span>
      )}
      {product.status === "reserved" && (
        <span className="absolute top-[18px] right-[18px] z-10 border border-midnight-ink bg-warm-sand px-[6px] py-[2px] font-mono text-[13px] font-normal uppercase text-midnight-ink">
          Reservado
        </span>
      )}
    </div>
  );
}
