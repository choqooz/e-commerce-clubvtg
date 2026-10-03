import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "./button";

const variants = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;
const sizes = {
  default: "h-[36px]",
  xs: "h-[24px]",
  sm: "h-[28px]",
  lg: "h-[36px]",
  icon: "size-[36px]",
  "icon-xs": "size-[24px]",
  "icon-sm": "size-[28px]",
  "icon-lg": "size-[36px]",
} as const;

function classes(html: string) {
  return html.match(/class="([^"]+)"/)![1].split(" ");
}

describe("Redesigned UI Button", () => {
  it("keeps native props, default metadata and disabled/invalid semantics", () => {
    const html = renderToStaticMarkup(
      <Button
        type="submit"
        name="action"
        value="save"
        form="editor"
        title="Save"
        disabled
        aria-invalid="true"
        aria-label="Save changes"
        data-testid="save"
        tabIndex={-1}
      >
        Save
      </Button>,
    );
    for (const attribute of [
      'data-slot="button"',
      'data-variant="default"',
      'data-size="default"',
      'type="submit"',
      'name="action"',
      'value="save"',
      'form="editor"',
      'title="Save"',
      'disabled=""',
      'aria-invalid="true"',
      'aria-label="Save changes"',
      'data-testid="save"',
      'tabindex="-1"',
    ])
      expect(html).toContain(attribute);
    expect(html).toMatch(/^<button/);
    expect(html).toContain(">Save</button>");
    expect(classes(html)).toEqual(
      expect.arrayContaining([
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "aria-invalid:border-dotted",
        "aria-invalid:border-bone-white",
      ]),
    );
  });

  it.each(variants)("preserves the %s variant and square mono utility voice", (variant) => {
    const html = renderToStaticMarkup(<Button variant={variant}>Action</Button>);
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
        "focus-visible:outline-2",
        "focus-visible:outline-solid",
      ]),
    );
    expect(tokens.join(" ")).not.toMatch(/font-(?:medium|semibold|bold)/);
    expect(tokens.filter((token) => /rounded/.test(token))).toEqual(["rounded-none"]);
    expect(tokens.join(" ")).not.toMatch(/shadow|ring-|active:|translate|scale-/);
    expect(buttonVariants({ variant })).toContain("text-[13px]");
  });

  it.each(Object.entries(sizes))(
    "keeps the %s size explicit and independent of spacing tokens",
    (size, dimension) => {
      const html = renderToStaticMarkup(<Button size={size as keyof typeof sizes}>Action</Button>);
      expect(html).toContain(`data-size="${size}"`);
      expect(classes(html)).toContain(dimension);
      expect(classes(html)).toContain("text-[13px]");
      expect(classes(html).join(" ")).not.toMatch(/(?:^| )(?:h|size)-\d/);
    },
  );

  it("uses a white inset focus outline on black and neutral, distinct error states", () => {
    const normal = classes(renderToStaticMarkup(<Button />));
    const destructive = classes(renderToStaticMarkup(<Button variant="destructive" />));
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
    for (const variant of ["ghost", "link"] as const) {
      expect(classes(renderToStaticMarkup(<Button variant={variant} />))).toEqual(
        expect.arrayContaining(["hover:underline", "text-midnight-ink"]),
      );
      expect(buttonVariants({ variant })).not.toMatch(/hover:(?:text|bg)-/);
    }
    expect(buttonVariants({ variant: "outline" })).toContain("hover:bg-warm-sand");
  });

  it("keeps consumer overrides, Slot semantics, child classes and icon attributes", () => {
    const html = renderToStaticMarkup(
      <Button
        asChild
        variant="outline"
        size="xs"
        className="rounded-full h-[44px] bg-warm-sand text-[15px] font-sans"
      >
        <a href="/shop" className="consumer-link" data-owner="child">
          <svg className="size-[20px]" data-icon="inline-start" aria-hidden="true">
            <path d="M0 0" />
          </svg>
          Shop
        </a>
      </Button>,
    );
    expect(html).toMatch(/^<a /);
    expect(html).not.toContain("<button");
    for (const attribute of [
      'href="/shop"',
      'data-slot="button"',
      'data-size="xs"',
      'data-owner="child"',
      'data-icon="inline-start"',
      'aria-hidden="true"',
      'class="size-[20px]"',
    ]) {
      expect(html).toContain(attribute);
    }
    expect(classes(html)).toEqual(
      expect.arrayContaining([
        "consumer-link",
        "rounded-full",
        "h-[44px]",
        "bg-warm-sand",
        "text-[15px]",
        "font-sans",
      ]),
    );
    for (const removed of [
      "rounded-none",
      "h-[24px]",
      "bg-bone-white",
      "text-[13px]",
      "font-mono",
    ]) {
      expect(classes(html)).not.toContain(removed);
    }
    const enabled = renderToStaticMarkup(<Button aria-invalid={false} />);
    expect(enabled).toContain('aria-invalid="false"');
    expect(enabled).not.toContain('disabled=""');
    const override = renderToStaticMarkup(
      <Button data-slot="custom" data-variant="custom" data-size="custom" />,
    );
    for (const key of ["slot", "variant", "size"])
      expect(override).toContain(`data-${key}="custom"`);
  });
});
