import { Children, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Select as Primitive } from "radix-ui";
import { describe, expect, it } from "vitest";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

function trigger(size: "default" | "sm" = "default", disabled = false) {
  return renderToStaticMarkup(
    <Select name="brand" defaultValue="linen" disabled={disabled}>
      <SelectTrigger size={size} id="brand" form="editor" aria-label="Brand" aria-invalid="true">
        <SelectValue placeholder="Choose">Linen</SelectValue>
      </SelectTrigger>
    </Select>,
  );
}

describe("Redesigned UI Select", () => {
  it.each(["default", "sm"] as const)(
    "preserves %s trigger semantics and explicit dimensions",
    (size) => {
      const html = trigger(size);
      expect(html).toMatch(/^<button/);
      for (const attribute of [
        'type="button"',
        'role="combobox"',
        'data-slot="select-trigger"',
        `data-size="${size}"`,
        'id="brand"',
        'form="editor"',
        'aria-label="Brand"',
        'aria-invalid="true"',
        'aria-expanded="false"',
        'data-slot="select-value"',
      ])
        expect(html).toContain(attribute);
      expect(html).toContain("Linen");
      const tokens = html.match(/class="([^"]+)"/)![1].split(" ");
      expect(tokens).toEqual(
        expect.arrayContaining([
          "data-[size=default]:h-[36px]",
          "data-[size=sm]:h-[28px]",
          "rounded-none",
          "border",
          "border-midnight-ink",
          "bg-bone-white",
          "font-mono",
          "text-[16px]",
          "md:text-[13px]",
          "font-normal",
          "aria-invalid:border-dotted",
          "focus-visible:outline-2",
          "focus-visible:outline-solid",
          "focus-visible:outline-offset-2",
          "focus-visible:outline-midnight-ink",
          "disabled:opacity-50",
          "disabled:cursor-not-allowed",
        ]),
      );
      expect(tokens.join(" ")).not.toMatch(
        /shadow|ring-|transition|dark:|font-(medium|semibold|bold)/,
      );
      expect(html).toContain("size-[12px]");
      expect(trigger(size, true)).toContain('disabled=""');
    },
  );

  it("keeps placeholders, refs, callbacks, root props and consumer overrides", () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectTrigger
          className="font-sans text-xs rounded-full"
          data-slot="custom"
          data-size="custom"
        >
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
      </Select>,
    );
    for (const value of [
      'data-placeholder=""',
      'data-slot="custom"',
      'data-size="custom"',
      "Choose",
      "font-sans",
      "text-xs",
      "rounded-full",
    ]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain("rounded-none");
    const ref = createRef<HTMLButtonElement>();
    const onClick = () => {};
    expect(SelectTrigger({ ref, onClick }).props).toMatchObject({ ref, onClick });
    const onValueChange = () => {};
    const onOpenChange = () => {};
    const root = Select({
      value: "linen",
      open: true,
      name: "brand",
      required: true,
      onValueChange,
      onOpenChange,
    });
    expect(root.type).toBe(Primitive.Root);
    expect(root.props).toMatchObject({
      value: "linen",
      open: true,
      name: "brand",
      required: true,
      onValueChange,
      onOpenChange,
    });
  });

  // Element inspection protects composition only; SSR does not open a Radix portal.
  it.each(["item-aligned", "popper"] as const)(
    "keeps %s portal, viewport and scroll composition",
    (position) => {
      const children = <SelectItem value="linen">Linen</SelectItem>;
      const portal = SelectContent({ position, align: "end", sideOffset: 6, children });
      expect(portal.type).toBe(Primitive.Portal);
      const content = portal.props.children;
      expect(content.type).toBe(Primitive.Content);
      expect(content.props).toMatchObject({
        position,
        align: "end",
        sideOffset: 6,
        "data-slot": "select-content",
        "data-align-trigger": position === "item-aligned",
      });
      expect(content.props.className.split(" ")).toEqual(
        expect.arrayContaining([
          "min-w-[144px]",
          "rounded-none",
          "border",
          "border-midnight-ink",
          "bg-bone-white",
          "font-normal",
        ]),
      );
      expect(content.props.className).not.toMatch(
        /shadow|ring-|animate|zoom|slide|duration|transition|translate/,
      );
      const [up, viewport, down] = Children.toArray(content.props.children) as (typeof content)[];
      expect(up.type).toBe(SelectScrollUpButton);
      expect(down.type).toBe(SelectScrollDownButton);
      expect(viewport.type).toBe(Primitive.Viewport);
      expect(viewport.props["data-position"]).toBe(position);
      expect(viewport.props.className).toContain(
        "data-[position=popper]:min-w-(--radix-select-trigger-width)",
      );
      expect(viewport.props.children).toBe(children);
    },
  );

  it("preserves default alignment and content prop/className overrides", () => {
    const defaults = SelectContent({}).props.children.props;
    expect(defaults).toMatchObject({
      position: "item-aligned",
      align: "center",
      "data-align-trigger": true,
    });
    const ref = createRef<HTMLDivElement>();
    const onCloseAutoFocus = () => {};
    const props = SelectContent({ ref, onCloseAutoFocus, className: "min-w-[200px] rounded-full" })
      .props.children.props;
    expect(props).toMatchObject({ ref, onCloseAutoFocus });
    expect(props.className).toContain("min-w-[200px]");
    expect(props.className).not.toContain("min-w-[144px]");
    expect(props.className).not.toContain("rounded-none");
  });

  it("retains every public wrapper and item text/selection indicator", () => {
    const group = SelectGroup({ children: "Group", id: "group" });
    expect(group.type).toBe(Primitive.Group);
    expect(group.props).toMatchObject({
      "data-slot": "select-group",
      children: "Group",
      id: "group",
    });
    expect(SelectValue({ placeholder: "Choose" }).type).toBe(Primitive.Value);
    const label = SelectLabel({ children: "Brands" });
    expect(label.type).toBe(Primitive.Label);
    expect(label.props.className.split(" ")).toEqual(
      expect.arrayContaining(["font-mono", "text-[13px]", "font-normal"]),
    );
    const item = SelectItem({
      value: "linen",
      disabled: true,
      textValue: "Linen",
      children: "Linen",
    });
    expect(item.type).toBe(Primitive.Item);
    expect(item.props).toMatchObject({
      value: "linen",
      disabled: true,
      textValue: "Linen",
      "data-slot": "select-item",
    });
    expect(item.props.className.split(" ")).toEqual(
      expect.arrayContaining([
        "font-mono",
        "text-[13px]",
        "font-normal",
        "rounded-none",
        "focus:bg-warm-sand",
        "data-highlighted:bg-warm-sand",
        "data-disabled:opacity-50",
        "data-disabled:pointer-events-none",
      ]),
    );
    const [indicator, text] = Children.toArray(item.props.children) as (typeof item)[];
    expect(indicator.props.children.type).toBe(Primitive.ItemIndicator);
    expect(indicator.props.children.props.children.props.className).toContain("size-[12px]");
    expect(text.type).toBe(Primitive.ItemText);
    expect(text.props.children).toBe("Linen");
    const separator = SelectSeparator({});
    expect(separator.type).toBe(Primitive.Separator);
    expect(separator.props.className).toContain("h-[1px]");
    for (const [component, primitive, slot] of [
      [SelectScrollUpButton, Primitive.ScrollUpButton, "select-scroll-up-button"],
      [SelectScrollDownButton, Primitive.ScrollDownButton, "select-scroll-down-button"],
    ] as const) {
      const scroll = component({ className: "consumer-scroll", tabIndex: -1 });
      expect(scroll.type).toBe(primitive);
      expect(scroll.props).toMatchObject({ "data-slot": slot, tabIndex: -1 });
      expect(scroll.props.className).toContain("consumer-scroll");
      expect(scroll.props.className).toContain("h-[28px]");
      expect(scroll.props.className).toContain("size-[16px]");
      expect(scroll.props.children).toBeTruthy();
    }
  });
});
