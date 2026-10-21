"use client";

import NextLink from "next/link";
import * as React from "react";
import type {} from "react/canary";
import { finishPendingCatalogTransition, runCatalogTransition } from "./catalog-transition";
import "./storefront-transition.css";

const StorefrontScope = React.createContext(false);
const fade = { "storefront-navigation": "storefront-page-fade", default: "none" };
const owners = new WeakMap<Document, number>();

/** Page-owned, not layout-owned: checkout/account routes never acquire this boundary. */
export function StorefrontTransition({ children }: { children: React.ReactNode }) {
  React.useLayoutEffect(() => {
    const owner = document;
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
    owner.documentElement.setAttribute("data-storefront-transition", "");
    // Retire the SSR bootstrap for this document, even after the last owner leaves.
    // Next may retain hidden SSR segments on routes that must not acquire motion.
    owner.documentElement.setAttribute("data-storefront-transition-ready", "");
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduce = () => {
      if (!motion?.matches) return;
      // Cancel snapshots themselves: zero CSS duration alone may leave a captured opacity.
      for (const animation of owner.getAnimations()) {
        const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement;
        if (pseudo?.match(/^::view-transition-(?:group|image-pair|old|new)\(storefront-page\)$/)) {
          animation.cancel();
        }
      }
    };
    motion?.addEventListener("change", reduce);
    return () => {
      motion?.removeEventListener("change", reduce);
      const remaining = (owners.get(owner) ?? 1) - 1;
      owners.set(owner, remaining);
      if (!remaining) owner.documentElement.removeAttribute("data-storefront-transition");
    };
  }, []);
  return (
    <StorefrontScope value={true}>
      <div data-storefront-scope="" style={{ display: "contents" }}>
        {children}
      </div>
    </StorefrontScope>
  );
}

/** Snapshot only the semantic main; chrome remains live inside the page scope. */
export function StorefrontContentTransition({
  children,
}: {
  children: React.ReactElement<React.ComponentProps<"main">, "main">;
}) {
  // Next App Router supplies canary React. Stable React/node consumers keep normal content.
  const ViewTransition = "ViewTransition" in React ? React.ViewTransition : undefined;
  const content = React.cloneElement(children, {
    className: ["storefront-entry", children.props.className].filter(Boolean).join(" "),
  });
  return ViewTransition ? (
    <ViewTransition
      name="storefront-page"
      default="none"
      enter="storefront-page-fade"
      exit={fade}
      share="storefront-page-fade"
    >
      {content}
    </ViewTransition>
  ) : (
    content
  );
}

/** Next owns modified/middle/external/download clicks and asynchronous route commits. */
export function StorefrontLink({ onNavigate, ...props }: React.ComponentProps<typeof NextLink>) {
  const scoped = React.useContext(StorefrontScope);
  const href = typeof props.href === "string" ? props.href : "";
  const catalog = href === "/" || href.startsWith("/?") || href.startsWith("/#");
  const storefront = scoped && (catalog || href.startsWith("/product/"));
  return (
    <NextLink
      {...props}
      transitionTypes={storefront ? ["storefront-navigation"] : undefined}
      onNavigate={(event) => {
        let cancelled = false;
        onNavigate?.({
          preventDefault: () => {
            cancelled = true;
            event.preventDefault();
          },
        });
        if (cancelled) return;
        // Settle synchronous history before handing any next route to the App Router.
        if (scoped) finishPendingCatalogTransition();
        if (!storefront || !catalog || window.location.pathname !== "/") return;
        event.preventDefault();
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (href === current) return;
        runCatalogTransition(() => {
          window.history.pushState(null, "", href);
          window.dispatchEvent(new Event("hashchange"));
        });
      }}
    />
  );
}
