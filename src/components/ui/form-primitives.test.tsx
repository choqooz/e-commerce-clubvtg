import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input } from "./input";
import { Label } from "./label";
import { Separator } from "./separator";
import { Textarea } from "./textarea";

function classes(html: string) {
  return html.match(/class="([^"]+)"/)![1].split(" ");
}

const focus = [
  "focus-visible:outline-2",
  "focus-visible:outline-solid",
  "focus-visible:outline-offset-2",
  "focus-visible:outline-midnight-ink",
];

describe("Redesigned UI form primitives", () => {
  it.each(["text", "search", "email", "tel", "url", "password", "number", "date", "file"])(
    "preserves native %s input props and neutral states",
    (type) => {
      const html = renderToStaticMarkup(
        <Input
          type={type}
          id="field"
          name="field"
          form="editor"
          required
          disabled
          aria-invalid="true"
          aria-describedby="hint"
          data-owner="native"
        />,
      );
      for (const attribute of [
        `type="${type}"`,
        'id="field"',
        'name="field"',
        'form="editor"',
        'required=""',
        'disabled=""',
        'aria-invalid="true"',
        'aria-describedby="hint"',
        'data-owner="native"',
        'data-slot="input"',
      ])
        expect(html).toContain(attribute);
      const tokens = classes(html);
      expect(tokens).toEqual(
        expect.arrayContaining([
          ...focus,
          "h-[36px]",
          "font-sans",
          "text-[16px]",
          "md:text-[15px]",
          "font-normal",
          "border",
          "border-midnight-ink",
          "bg-bone-white",
          "rounded-none",
          "aria-invalid:border-dotted",
          "disabled:opacity-50",
          "disabled:cursor-not-allowed",
          "file:h-[28px]",
          "file:font-normal",
        ]),
      );
      expect(tokens.join(" ")).not.toMatch(
        /shadow|ring-|transition|font-(medium|semibold|bold)|disabled:pointer-events-none/,
      );
    },
  );

  it("keeps controlled/default values, constraints and file selection attributes", () => {
    const html = renderToStaticMarkup(
      <Input type="number" value={12} readOnly min={0} max={20} step={2} autoComplete="off" />,
    );
    for (const attribute of [
      'value="12"',
      'readOnly=""',
      'min="0"',
      'max="20"',
      'step="2"',
      'autoComplete="off"',
    ]) {
      expect(html).toContain(attribute);
    }
    expect(renderToStaticMarkup(<Input defaultValue="Draft" />)).toContain('value="Draft"');
    const file = renderToStaticMarkup(
      <Input type="file" accept="image/*" multiple capture="environment" />,
    );
    for (const attribute of ['accept="image/*"', 'multiple=""', 'capture="environment"'])
      expect(file).toContain(attribute);
    expect(file).not.toContain("value=");
  });

  it.each([false, true])("preserves textarea value and disabled=%s", (disabled) => {
    const html = renderToStaticMarkup(
      <Textarea
        id="description"
        name="description"
        form="editor"
        value="A description"
        readOnly
        required
        disabled={disabled}
        rows={4}
        maxLength={400}
        wrap="soft"
        placeholder="Description"
        aria-invalid="false"
      />,
    );
    for (const attribute of [
      'data-slot="textarea"',
      'id="description"',
      'name="description"',
      'form="editor"',
      'readOnly=""',
      'required=""',
      'rows="4"',
      'maxLength="400"',
      'wrap="soft"',
      'placeholder="Description"',
      'aria-invalid="false"',
    ])
      expect(html).toContain(attribute);
    expect(html.includes('disabled=""')).toBe(disabled);
    expect(html).toContain(">A description</textarea>");
    const tokens = classes(html);
    expect(tokens).toEqual(
      expect.arrayContaining([
        ...focus,
        "min-h-[96px]",
        "field-sizing-content",
        "font-sans",
        "text-[16px]",
        "md:text-[15px]",
        "font-normal",
        "rounded-none",
        "border-midnight-ink",
        "bg-bone-white",
        "aria-invalid:border-dotted",
        "disabled:cursor-not-allowed",
        "disabled:opacity-50",
      ]),
    );
    expect(tokens.join(" ")).not.toMatch(/shadow|ring-|transition|font-(medium|semibold|bold)/);
    expect(renderToStaticMarkup(<Textarea defaultValue="Draft" />)).toContain(">Draft</textarea>");
  });

  it("preserves label association, children and group/peer disabled styling", () => {
    const html = renderToStaticMarkup(
      <Label htmlFor="field" id="field-label">
        Field
      </Label>,
    );
    expect(html).toMatch(/^<label/);
    expect(html).toContain('for="field"');
    expect(html).toContain('id="field-label"');
    expect(html).toContain('data-slot="label"');
    expect(html).toContain(">Field</label>");
    expect(classes(html)).toEqual(
      expect.arrayContaining([
        "font-mono",
        "text-[13px]",
        "font-normal",
        "group-data-[disabled=true]:pointer-events-none",
        "group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed",
        "peer-disabled:opacity-50",
      ]),
    );
  });

  it.each(["horizontal", "vertical"] as const)(
    "preserves %s separator semantics",
    (orientation) => {
      const html = renderToStaticMarkup(
        <Separator orientation={orientation} decorative={false} id="rule" />,
      );
      expect(html).toContain('role="separator"');
      expect(html).toContain(`data-orientation="${orientation}"`);
      expect(html).toContain('data-slot="separator"');
      expect(html).toContain('id="rule"');
      expect(html.includes('aria-orientation="vertical"')).toBe(orientation === "vertical");
      expect(classes(html)).toEqual(
        expect.arrayContaining([
          "bg-midnight-ink",
          "data-horizontal:h-[1px]",
          "data-horizontal:w-full",
          "data-vertical:w-[1px]",
          "data-vertical:self-stretch",
        ]),
      );
      const decorative = renderToStaticMarkup(<Separator orientation={orientation} />);
      expect(decorative).toContain('role="none"');
      expect(decorative).not.toContain("aria-orientation");
    },
  );

  it("forwards refs/events unchanged and merges consumer classes last", () => {
    const inputRef = createRef<HTMLInputElement>();
    const textareaRef = createRef<HTMLTextAreaElement>();
    const onChange = () => {};
    expect(Input({ ref: inputRef, onChange }).props).toMatchObject({ ref: inputRef, onChange });
    expect(Textarea({ ref: textareaRef, onChange }).props).toMatchObject({
      ref: textareaRef,
      onChange,
    });
    for (const element of [
      <Input key="input" className="h-7 text-xs rounded-full" data-slot="custom" />,
      <Textarea key="textarea" className="h-7 text-xs rounded-full" data-slot="custom" />,
    ]) {
      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-slot="custom"');
      expect(classes(html)).toEqual(expect.arrayContaining(["h-7", "text-xs", "rounded-full"]));
      expect(classes(html)).not.toContain("text-[16px]");
      expect(classes(html)).not.toContain("rounded-none");
    }
    expect(classes(renderToStaticMarkup(<Label className="font-sans text-[15px]" />))).toEqual(
      expect.arrayContaining(["font-sans", "text-[15px]"]),
    );
    expect(
      classes(renderToStaticMarkup(<Separator className="data-horizontal:h-[2px] bg-warm-sand" />)),
    ).not.toContain("data-horizontal:h-[1px]");
  });
});
