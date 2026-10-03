import { Children, createRef, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog as Primitive } from "radix-ui";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

type Element = ReactElement<{
  className: string;
  children?: ReactNode;
  [key: string]: unknown;
}>;
const elements = (children: ReactNode) => Children.toArray(children) as Element[];
const tokens = (element: Element) => element.props.className.split(" ");
const noDecoration =
  /shadow|ring-|blur|animate|fade|zoom|slide|duration|transition|font-(medium|semibold|bold)/;
const panels = [
  ["dialog", DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription],
  ["sheet", SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription],
] as const;

// These checks inspect element composition and SSR, not browser focus, portals or scrolling.
describe.each(panels)("Redesigned UI %s", (name, Content, Header, Footer, Title, Description) => {
  it("retains portal/overlay/content composition and Radix props, refs and children", () => {
    const ref = createRef<HTMLDivElement>();
    const onEscapeKeyDown = () => {};
    const onPointerDownOutside = () => {};
    const onCloseAutoFocus = () => {};
    const child = <div className="flex-1 overflow-y-auto">Body</div>;
    const portal = Content({
      ref,
      children: child,
      forceMount: true,
      id: "panel",
      "aria-describedby": undefined,
      onEscapeKeyDown,
      onPointerDownOutside,
      onCloseAutoFocus,
    });
    const [overlay, content] = elements(portal.props.children);
    const renderPortal = portal.type as (props: typeof portal.props) => Element;
    const primitivePortal = renderPortal(portal.props);
    expect(primitivePortal.type).toBe(Primitive.Portal);
    expect(primitivePortal.props["data-slot"]).toBe(`${name}-portal`);
    expect(typeof overlay.type).toBe("function");
    expect(content.type).toBe(Primitive.Content);
    expect(content.props).toMatchObject({
      ref,
      forceMount: true,
      id: "panel",
      "data-slot": `${name}-content`,
      "aria-describedby": undefined,
      onEscapeKeyDown,
      onPointerDownOutside,
      onCloseAutoFocus,
    });
    expect(elements(content.props.children)[0].props).toBe(child.props);
    expect(tokens(content)).toEqual(
      expect.arrayContaining([
        "rounded-none",
        "border-midnight-ink",
        "bg-bone-white",
        "gap-[13px]",
        "font-sans",
        "text-[15px]",
        "leading-[1.3]",
        "font-normal",
        "focus-visible:outline-2",
        "focus-visible:outline-solid",
        "focus-visible:outline-offset-2",
        "focus-visible:outline-midnight-ink",
      ]),
    );
    expect(content.props.className).not.toMatch(noDecoration);
    const renderOverlay = overlay.type as (props: typeof overlay.props) => Element;
    const renderedOverlay = renderOverlay(overlay.props);
    expect(renderedOverlay.type).toBe(Primitive.Overlay);
    expect(tokens(renderedOverlay)).toContain("bg-midnight-ink/20");
    expect(renderedOverlay.props.className).not.toMatch(noDecoration);
  });

  it("keeps the accessible default close, asChild and optional removal", () => {
    const [, content] = elements(Content({}).props.children);
    const close = elements(content.props.children).at(-1)!;
    expect(close.type).toBe(Primitive.Close);
    expect(close.props).toMatchObject({ asChild: true, "data-slot": `${name}-close` });
    const button = close.props.children as Element;
    expect(button.type).toBe(Button);
    expect(button.props).toMatchObject({ variant: "ghost", size: "icon-sm" });
    expect(tokens(button)).toEqual(["absolute", "top-[12px]", "right-[12px]"]);
    expect(renderToStaticMarkup(button)).toContain('class="sr-only">Close</span>');
    expect(renderToStaticMarkup(button)).toContain("focus-visible:outline-2");
    const child = <p>Body</p>;
    const [, withoutClose] = elements(
      Content({ showCloseButton: false, asChild: true, children: child }).props.children,
    );
    expect(withoutClose.props.asChild).toBe(true);
    expect(elements(withoutClose.props.children)).toHaveLength(1);
    expect(elements(withoutClose.props.children)[0].props).toBe(child.props);
  });

  it("keeps flat header/footer and regular utility typography with overrides", () => {
    for (const [Component, primitive, slot, size] of [
      [Title, Primitive.Title, "title", "text-[20px]"],
      [Description, Primitive.Description, "description", "text-[15px]"],
    ] as const) {
      const ref = createRef<never>();
      const element = Component({ ref, id: slot, children: "Copy", asChild: true });
      expect(element.type).toBe(primitive);
      expect(element.props).toMatchObject({
        ref,
        id: slot,
        children: "Copy",
        asChild: true,
        "data-slot": `${name}-${slot}`,
      });
      expect(tokens(element)).toEqual(
        expect.arrayContaining(["font-sans", size, "leading-[1.3]", "font-normal"]),
      );
      expect(element.props.className).not.toMatch(noDecoration);
      const overridden = Component({
        className: "text-[30px] font-mono",
        ...{ "data-slot": "custom" },
      });
      expect(overridden.props["data-slot"]).toBe("custom");
      expect(tokens(overridden)).toContain("text-[30px]");
      expect(tokens(overridden)).not.toContain(size);
      expect(tokens(overridden)).not.toContain("font-sans");
    }
    for (const [Component, slot] of [
      [Header, "header"],
      [Footer, "footer"],
    ] as const) {
      const ref = createRef<HTMLDivElement>();
      const element = Component({ ref, id: slot, children: "Actions" });
      expect(element.type).toBe("div");
      expect(element.props).toMatchObject({ ref, id: slot, "data-slot": `${name}-${slot}` });
      expect(tokens(element)).toContain("gap-[13px]");
      expect(element.props.className).not.toMatch(noDecoration);
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Actions");
    }
    const footer = Footer({});
    expect(tokens(footer)).toEqual(
      expect.arrayContaining(["border-t", "border-midnight-ink", "bg-warm-sand", "p-[24px]"]),
    );
    expect(Header({ className: "gap-[6px] p-[13px]" }).props.className).not.toContain("gap-[13px]");
  });
});

describe("container contracts", () => {
  it.each([
    [Dialog, DialogTrigger, DialogClose, "dialog"],
    [Sheet, SheetTrigger, SheetClose, "sheet"],
  ] as const)(
    "forwards root state and trigger/close asChild, native props and refs",
    (Root, Trigger, Close, name) => {
      const onOpenChange = () => {};
      const root = Root({ open: true, defaultOpen: false, modal: false, onOpenChange });
      expect(root.type).toBe(Primitive.Root);
      expect(root.props).toMatchObject({
        open: true,
        defaultOpen: false,
        modal: false,
        onOpenChange,
        "data-slot": name,
      });
      expect(Root({}).props.modal).toBeUndefined(); // Radix retains its modal default.
      const ref = createRef<HTMLButtonElement>();
      const onClick = () => {};
      for (const [Component, primitive] of [
        [Trigger, Primitive.Trigger],
        [Close, Primitive.Close],
      ] as const) {
        const child = <button type="button">Action</button>;
        const element = Component({ ref, onClick, asChild: true, disabled: true, children: child });
        expect(element.type).toBe(primitive);
        expect(element.props).toMatchObject({
          ref,
          onClick,
          asChild: true,
          disabled: true,
          children: child,
        });
      }
      const html = renderToStaticMarkup(
        <Root>
          <Trigger id="open">Open</Trigger>
        </Root>,
      );
      expect(html).toContain('type="button"');
      expect(html).toContain('aria-haspopup="dialog"');
      expect(html).toContain('aria-expanded="false"');
    },
  );

  it("preserves dialog portal/overlay overrides, viewport bounds and footer close defaults", () => {
    const portal = DialogPortal({ forceMount: true, children: "Content", container: null });
    expect(portal.type).toBe(Primitive.Portal);
    expect(portal.props).toMatchObject({ forceMount: true, container: null, children: "Content" });
    const overlay = DialogOverlay({ className: "bg-black/90", ...{ "data-slot": "zoom" } });
    expect(overlay.props["data-slot"]).toBe("zoom");
    expect(tokens(overlay)).toContain("bg-black/90");
    expect(tokens(overlay)).not.toContain("bg-midnight-ink/20");
    const [, content] = elements(DialogContent({}).props.children);
    expect(tokens(content)).toEqual(
      expect.arrayContaining([
        "max-w-[calc(100vw-32px)]",
        "sm:max-w-[400px]",
        "max-h-[calc(100dvh-32px)]",
        "overflow-y-auto",
        "p-[24px]",
        "border",
      ]),
    );
    const [, overridden] = elements(
      DialogContent({
        className: "max-w-none sm:max-w-none max-h-[90vh] overflow-visible bg-transparent p-0",
        ...{ "data-slot": "zoom" },
      }).props.children,
    );
    expect(overridden.props["data-slot"]).toBe("zoom");
    for (const token of [
      "max-w-[calc(100vw-32px)]",
      "sm:max-w-[400px]",
      "max-h-[calc(100dvh-32px)]",
      "overflow-y-auto",
      "bg-bone-white",
      "p-[24px]",
    ]) {
      expect(tokens(overridden)).not.toContain(token);
    }
    expect(elements(DialogFooter({ children: "Save" }).props.children)).toEqual(["Save"]);
    const footer = DialogFooter({ showCloseButton: true });
    expect(tokens(footer)).toEqual(
      expect.arrayContaining(["-mx-[24px]", "-mb-[24px]", "rounded-none", "sm:flex-row"]),
    );
    const [close] = elements(footer.props.children);
    expect(close.type).toBe(Primitive.Close);
    expect(close.props.asChild).toBe(true);
    const button = close.props.children as Element;
    expect(button.props).toMatchObject({ variant: "outline", children: "Close" });
  });

  it.each(["top", "right", "bottom", "left"] as const)(
    "keeps %s sheet geometry and inner-scroller ownership",
    (side) => {
      const [, content] = elements(SheetContent({ side }).props.children);
      const cls = tokens(content);
      expect(content.props["data-side"]).toBe(side);
      expect(cls).toEqual(expect.arrayContaining(["flex", "flex-col", "min-h-0", "max-h-dvh"]));
      expect(content.props.className).not.toMatch(/overflow|clip(?!-padding)/);
      const horizontal = side === "left" || side === "right";
      expect(cls).toContain(`data-[side=${side}]:${horizontal ? "inset-y-0" : "inset-x-0"}`);
      expect(cls).toContain(`data-[side=${side}]:${side}-0`);
      expect(cls).toContain(`data-[side=${side}]:${horizontal ? "h-dvh" : "h-auto"}`);
      const edge = { top: "b", right: "l", bottom: "t", left: "r" }[side];
      expect(cls).toContain(`data-[side=${side}]:border-${edge}`);
      expect(cls.includes("w-3/4")).toBe(horizontal);
      expect(cls.includes("sm:max-w-[400px]")).toBe(horizontal);
      expect(tokens(SheetHeader({}))).toContain("shrink-0");
      expect(tokens(SheetFooter({}))).toContain("shrink-0");
    },
  );

  it("defaults to the right and allows the cart width/max-width and caller data overrides", () => {
    expect(elements(SheetContent({}).props.children)[1].props["data-side"]).toBe("right");
    const [, content] = elements(
      SheetContent({ className: "w-full sm:max-w-md", ...{ "data-slot": "cart" } }).props.children,
    );
    expect(content.props["data-slot"]).toBe("cart");
    expect(tokens(content)).toEqual(expect.arrayContaining(["w-full", "sm:max-w-md"]));
    expect(tokens(content)).not.toContain("w-3/4");
    expect(tokens(content)).not.toContain("sm:max-w-[400px]");
  });
});

describe("Redesigned UI native table", () => {
  it("renders semantic native HTML, caption below and only the existing horizontal wrapper", () => {
    const html = renderToStaticMarkup(
      <Table id="orders" aria-label="Orders" data-custom="native">
        <TableCaption>History</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Order</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableCell colSpan={2} headers="order">
              Linen
            </TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );
    for (const tag of ["table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td"]) {
      expect(html).toContain(`<${tag}`);
    }
    for (const attribute of [
      'id="orders"',
      'aria-label="Orders"',
      'data-custom="native"',
      'scope="col"',
      'colSpan="2"',
      'headers="order"',
      'data-state="selected"',
    ]) {
      expect(html).toContain(attribute);
    }
    expect(html.match(/<div/g)).toHaveLength(1);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("caption-bottom");
    expect(html).not.toMatch(noDecoration);
  });

  it.each([
    ["table", Table],
    ["thead", TableHeader],
    ["tbody", TableBody],
    ["tfoot", TableFooter],
    ["tr", TableRow],
    ["th", TableHead],
    ["td", TableCell],
    ["caption", TableCaption],
  ] as const)("passes a native %s ref and children without adding structure", (tag, Component) => {
    const ref = createRef<never>();
    const rendered = Component({ ref, children: "Body" });
    const element = tag === "table" ? rendered.props.children : rendered;
    expect(element.type).toBe(tag);
    expect(element.props.ref).toBe(ref); // Forwarding only, not DOM attachment.
    expect(element.props.children).toBe("Body");
    expect(element.props["data-slot"]).toMatch(/^table/);
  });

  it("uses regular body/mono labels, hairlines, neutral row states and checkbox selectors", () => {
    expect(tokens(Table({}).props.children)).toEqual(
      expect.arrayContaining(["font-sans", "text-[15px]", "font-normal"]),
    );
    expect(tokens(TableHead({}))).toEqual(
      expect.arrayContaining([
        "h-[42px]",
        "px-[13px]",
        "font-mono",
        "text-[13px]",
        "font-normal",
        "[&:has([role=checkbox])]:pr-0",
      ]),
    );
    expect(tokens(TableCell({}))).toEqual(
      expect.arrayContaining(["p-[13px]", "[&:has([role=checkbox])]:pr-0"]),
    );
    expect(tokens(TableCaption({}))).toEqual(
      expect.arrayContaining(["font-mono", "text-[13px]", "font-normal"]),
    );
    expect(tokens(TableFooter({}))).toEqual(
      expect.arrayContaining([
        "border-t",
        "border-midnight-ink",
        "bg-warm-sand",
        "font-normal",
        "[&>tr]:last:border-b-0",
      ]),
    );
    expect(tokens(TableRow({}))).toEqual(
      expect.arrayContaining([
        "border-b",
        "border-midnight-ink",
        "hover:bg-warm-sand",
        "data-[state=selected]:bg-warm-sand",
      ]),
    );
    expect(tokens(TableHeader({}))).toContain("[&_tr]:border-midnight-ink");
    expect(tokens(TableBody({}))).toContain("[&_tr:last-child]:border-0");
  });

  it.each([TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption])(
    "retains native callbacks/data and consumer class overrides",
    (Component) => {
      const onClick = () => {};
      const element = Component({
        className: "p-[6px] px-[24px] font-sans text-[20px] font-normal",
        ...{ "data-slot": "custom" },
        id: "native",
        onClick,
      });
      expect(element.props).toMatchObject({ "data-slot": "custom", id: "native", onClick });
      expect(tokens(element)).toEqual(
        expect.arrayContaining(["p-[6px]", "px-[24px]", "font-sans", "text-[20px]"]),
      );
      expect(tokens(element)).not.toContain("px-[13px]");
      expect(tokens(element)).not.toContain("p-[13px]");
      expect(tokens(element)).not.toContain("font-mono");
      const table = Table({ className: "text-[20px]", ...{ "data-slot": "custom" }, onClick }).props
        .children;
      expect(table.props).toMatchObject({ "data-slot": "custom", onClick });
      expect(tokens(table)).not.toContain("text-[15px]");
    },
  );
});
