import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, badgeVariants } from "./badge";

const variants = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;

function classes(html: string) {
  return html.match(/class="([^"]+)"/)![1].split(" ");
}

describe("Redesigned UI Badge", () => {
  it("keeps the span, native props, default metadata and invalid semantics", () => {
    const html = renderToStaticMarkup(
      <Badge id="status" title="Status" tabIndex={0} aria-invalid="true" data-testid="status">
        Available
      </Badge>,
    );
    expect(html).toMatch(/^<span /);
    for (const attribute of [
      'data-slot="badge"',
      'data-variant="default"',
      'id="status"',
      'title="Status"',
      'tabindex="0"',
      'aria-invalid="true"',
      'data-testid="status"',
    ])
      expect(html).toContain(attribute);
    expect(html).toContain(">Available</span>");
    expect(classes(html)).toEqual(
      expect.arrayContaining(["aria-invalid:border-dotted", "aria-invalid:border-bone-white"]),
    );
    const valid = renderToStaticMarkup(<Badge aria-invalid={false}>Available</Badge>);
    expect(valid).toContain('aria-invalid="false"');
    expect(renderToStaticMarkup(<Badge role="status" />)).toContain('role="status"');
  });

  it.each(variants)("preserves %s with square, unclipped 13px mono micropadding", (variant) => {
    const html = renderToStaticMarkup(<Badge variant={variant}>Status</Badge>);
    const tokens = classes(html);
    expect(html).toContain(`data-variant="${variant}"`);
    expect(tokens).toEqual(
      expect.arrayContaining([
        "rounded-none",
        "border",
        "font-mono",
        "text-[13px]",
        "font-normal",
        "leading-[1.2]",
        "px-[6px]",
        "py-[2px]",
        "focus-visible:outline-2",
        "focus-visible:outline-solid",
      ]),
    );
    expect(tokens.filter((token) => /rounded/.test(token))).toEqual(["rounded-none"]);
    expect(tokens.join(" ")).not.toMatch(
      /shadow|ring-|active:|translate|font-(?:medium|semibold|bold)|overflow-hidden/,
    );
    expect(tokens.some((token) => /^(?:h|min-h|max-h|size)-/.test(token))).toBe(false);
    expect(badgeVariants({ variant })).toContain("text-[13px]");
  });

  it("uses a contrasting inset outline on black and dashed destructive borders", () => {
    const normal = classes(renderToStaticMarkup(<Badge />));
    const destructive = classes(renderToStaticMarkup(<Badge variant="destructive" />));
    expect(normal).toEqual(
      expect.arrayContaining([
        "bg-midnight-ink",
        "text-bone-white",
        "focus-visible:outline-bone-white",
        "focus-visible:outline-offset-[-3px]",
      ]),
    );
    expect(destructive).toEqual(
      expect.arrayContaining([
        "bg-bone-white",
        "text-midnight-ink",
        "border-dashed",
        "aria-invalid:border-dotted",
        "focus-visible:outline-midnight-ink",
        "focus-visible:outline-offset-2",
      ]),
    );
    expect(badgeVariants({ variant: "outline" })).toContain("[a]:hover:bg-warm-sand");
    for (const variant of ["ghost", "link"] as const) {
      expect(badgeVariants({ variant })).toContain("hover:underline");
      expect(badgeVariants({ variant })).not.toMatch(/hover:(?:text|bg)-/);
    }
  });

  it("preserves asChild, child/native attributes, consumer overrides and icon forwarding", () => {
    const html = renderToStaticMarkup(
      <Badge
        asChild
        variant="outline"
        className="rounded-full bg-warm-sand px-[12px] py-[4px] text-[15px] font-sans"
      >
        <a href="/collection" className="consumer-badge" aria-label="View collection">
          <svg className="size-[20px]" data-icon="inline-end" aria-hidden="true">
            <path d="M0 0" />
          </svg>
          Collection
        </a>
      </Badge>,
    );
    expect(html).toMatch(/^<a /);
    expect(html).not.toContain("<span");
    for (const attribute of [
      'href="/collection"',
      'data-slot="badge"',
      'data-variant="outline"',
      'aria-label="View collection"',
      'data-icon="inline-end"',
      'class="size-[20px]"',
    ]) {
      expect(html).toContain(attribute);
    }
    expect(classes(html)).toEqual(
      expect.arrayContaining([
        "consumer-badge",
        "rounded-full",
        "bg-warm-sand",
        "px-[12px]",
        "py-[4px]",
        "text-[15px]",
        "font-sans",
      ]),
    );
    for (const removed of [
      "rounded-none",
      "bg-bone-white",
      "px-[6px]",
      "py-[2px]",
      "text-[13px]",
      "font-mono",
    ]) {
      expect(classes(html)).not.toContain(removed);
    }
    expect(badgeVariants()).not.toContain("!");
    const override = renderToStaticMarkup(<Badge data-slot="custom" data-variant="custom" />);
    for (const key of ["slot", "variant"]) expect(override).toContain(`data-${key}="custom"`);
  });
});
