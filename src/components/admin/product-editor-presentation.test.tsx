import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UseFormProps } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductFormValues } from "@/lib/validations/product";

// Node SSR probes use real RHF; injected errors/pending are presentation fixtures,
// not browser validation, effect execution, or asynchronous interaction coverage.
const probe = vi.hoisted(() => ({
  errors: {} as Record<string, { message: string }>,
  pending: false,
  defaults: undefined as unknown,
  resolver: undefined as unknown,
  uploader: undefined as unknown,
  selects: [] as Array<{
    onValueChange: (value: string) => void;
    children: ReactNode;
    disabled?: boolean;
    value?: string;
    defaultValue?: string;
  }>,
  buttons: [] as Array<{
    "aria-label"?: string;
    onClick?: () => void;
    disabled?: boolean;
    type?: string;
    children?: ReactNode;
  }>,
  setValue: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  fetch: vi.fn(() => {
    throw new Error("External fetch forbidden in presentation tests");
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: probe.back, push: probe.push }),
}));
vi.mock("@/lib/actions/product", () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  getActiveProductTaxonomy: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [value, setter] = actual.useState(initial);
      return [initial === false && probe.pending ? true : value, setter];
    },
  };
});
vi.mock("react-hook-form", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-hook-form")>();
  return {
    ...actual,
    useForm: (options: UseFormProps<ProductFormValues>) => {
      const form = actual.useForm<ProductFormValues>(options);
      probe.defaults = options.defaultValues;
      probe.resolver = options.resolver;
      return {
        ...form,
        setValue: probe.setValue,
        formState: { ...form.formState, errors: probe.errors },
      };
    },
  };
});
vi.mock("./image-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./image-upload")>();
  return {
    ...actual,
    MultiImageUpload: (props: Parameters<typeof actual.MultiImageUpload>[0]) => {
      probe.uploader = props;
      return <actual.MultiImageUpload {...props} />;
    },
  };
});
vi.mock("@/components/ui/select", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/select")>();
  return {
    ...actual,
    Select: (props: Parameters<typeof actual.Select>[0]) => {
      probe.selects.push(props as (typeof probe.selects)[number]);
      return <actual.Select {...props} />;
    },
  };
});
vi.mock("@/components/ui/button", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/button")>();
  return {
    ...actual,
    Button: (props: Parameters<typeof actual.Button>[0]) => {
      probe.buttons.push(props as (typeof probe.buttons)[number]);
      return <actual.Button {...props} />;
    },
  };
});
import { ProductForm } from "./product-form";
import { MultiImageUpload } from "./image-upload";
import { createProduct, updateProduct, getActiveProductTaxonomy } from "@/lib/actions/product";

const classes = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(" "));
function flat(html: string) {
  expect(classes(html).join(" ")).not.toMatch(
    /shadow|scale-|blur|rounded-(?!none)|font-(medium|semibold|bold)|(?:text|bg|border)-(?:red|green|blue|destructive)/,
  );
  expect(classes(html)).toContain("font-normal");
}
function elements(node: ReactNode): Array<Record<string, unknown>> {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    return [child.props, ...elements(child.props.children)];
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  probe.errors = {};
  probe.pending = false;
  probe.selects = [];
  probe.buttons = [];
  vi.stubGlobal("fetch", probe.fetch);
});
afterEach(() => {
  expect(probe.fetch).not.toHaveBeenCalled();
  expect(createProduct).not.toHaveBeenCalled();
  expect(updateProduct).not.toHaveBeenCalled();
  expect(getActiveProductTaxonomy).not.toHaveBeenCalled(); // SSR does not execute useEffect.
  vi.unstubAllGlobals();
});

describe("Product editor presentation (SSR and element props)", () => {
  it.each([undefined, "existing-slug"])(
    "preserves create/edit copy and fields for %s",
    (editSlug) => {
      const html = renderToStaticMarkup(<ProductForm editSlug={editSlug} />);
      expect(html).toContain(editSlug ? "Actualizar Producto" : "Guardar Producto");
      expect(html.includes('id="product-status"')).toBe(!!editSlug);
      for (const field of [
        "title",
        "price",
        "description",
        "brand",
        "condition",
        "size",
        "color",
        "measurements",
      ]) {
        expect(html).toContain(`name="${field}"`);
        expect(html).toContain(`for="product-${field}"`);
        expect(html).toContain(`id="product-${field}"`);
      }
      expect(html).toMatch(/<input[^>]*type="number"[^>]*name="price"/);
      expect(html).toMatch(/<textarea[^>]*name="description"[^>]*rows="4"/);
      expect(probe.defaults).toEqual({
        title: "",
        description: "",
        price: 0,
        category: "",
        subcategory: "",
        image_urls: [],
        status: "available",
        color: "",
        size: "",
        brand: "",
        condition: "",
        measurements: "",
        product_type_id: undefined,
        product_subtype_id: undefined,
      });
      expect(probe.resolver).toBeTypeOf("function");
      expect(classes(html)).toEqual(
        expect.arrayContaining([
          "gap-[24px]",
          "gap-[13px]",
          "p-[13px]",
          "bg-warm-sand",
          "text-[15px]",
          "text-[16px]",
          "md:text-[15px]",
          "font-mono",
          "text-[13px]",
        ]),
      );
      const cancel = probe.buttons.find((button) => button.children === "Cancelar")!;
      expect(cancel.type).toBe("button");
      cancel.onClick!();
      expect(probe.back).toHaveBeenCalledOnce();
      expect(probe.push).not.toHaveBeenCalled();
      flat(html);
    },
  );

  it("keeps edit defaults, uploader props and dependent-select callbacks", () => {
    const initialData: ProductFormValues = {
      title: "Campera",
      description: "Denim",
      price: 45000,
      category: "Abrigos",
      subcategory: "Camperas",
      image_urls: ["/first.jpg"],
      status: "sold",
      color: "Azul",
      size: "L",
      brand: "Vintage",
      condition: "Mint",
      measurements: "60cm",
      product_type_id: "type-1",
      product_subtype_id: "subtype-1",
    };
    renderToStaticMarkup(<ProductForm initialData={initialData} editSlug="existing-slug" />);
    expect(probe.defaults).toEqual(initialData);
    const uploader = probe.uploader as Parameters<typeof MultiImageUpload>[0];
    expect(uploader.value).toEqual(initialData.image_urls);
    expect(uploader.disabled).toBe(false);
    uploader.onChange(["/second.jpg"]);
    expect(probe.setValue).toHaveBeenLastCalledWith("image_urls", ["/second.jpg"]);
    const [category, subtype, status] = probe.selects;
    expect(category.value).toBe("type-1");
    expect(subtype.value).toBe("subtype-1");
    expect(subtype.disabled).toBe(true); // No loaded taxonomy during SSR.
    category.onValueChange("other-type");
    expect(probe.setValue.mock.calls.slice(-4)).toEqual([
      ["product_type_id", "other-type"],
      ["product_subtype_id", null],
      ["category", ""],
      ["subcategory", ""],
    ]);
    subtype.onValueChange("__none__");
    expect(probe.setValue.mock.calls.slice(-2)).toEqual([
      ["product_subtype_id", null],
      ["subcategory", ""],
    ]);
    expect(status.defaultValue).toBe("sold");
    const statusItems = elements(status.children).filter((props) => props.value);
    expect(statusItems.map((props) => [props.value, props.children])).toEqual([
      ["available", "Disponible"],
      ["sold", "Vendido"],
      ["archived", "Archivado"],
    ]);
    status.onValueChange("archived");
    expect(probe.setValue).toHaveBeenLastCalledWith("status", "archived");
  });

  it("renders verbatim neutral errors associated with their existing controls", () => {
    const fields = [
      "title",
      "price",
      "description",
      "category",
      "subcategory",
      "brand",
      "condition",
      "status",
      "image_urls",
    ];
    probe.errors = Object.fromEntries(
      fields.map((field) => [field, { message: `Error original ${field}` }]),
    );
    const html = renderToStaticMarkup(<ProductForm editSlug="existing-slug" />);
    for (const field of fields) {
      const id = field === "image_urls" ? "images" : field;
      expect(html).toContain(`aria-describedby="product-${id}-error"`);
      expect(html).toContain(`id="product-${id}-error"`);
      expect(html).toContain(`Error original ${field}</span>`);
    }
    expect(html.match(/lucide-circle-alert/g)).toHaveLength(fields.length);
    expect(classes(html)).toContain("border-dotted");
    flat(html);
  });

  it("preserves save, taxonomy and navigation boundaries without executing them", () => {
    const source = readFileSync(new URL("./product-form.tsx", import.meta.url), "utf8");
    for (const contract of [
      "resolver: zodResolver(productSchema)",
      "form.handleSubmit(onSubmit)",
      "getActiveProductTaxonomy().then",
      "updateProduct(editSlug, data)",
      "createProduct(data)",
      'router.push("/admin/products")',
      'toast.error("Error al guardar", { description: result.error })',
      "setIsPending(false)",
    ]) {
      expect(source).toContain(contract);
    }
  });

  it("keeps pending controls disabled and essential monochrome spinner", () => {
    probe.pending = true;
    const html = renderToStaticMarkup(<ProductForm editSlug="existing-slug" />);
    expect(probe.selects.every((select) => select.disabled)).toBe(true);
    expect(probe.buttons.every((button) => button.disabled)).toBe(true);
    expect((probe.uploader as { disabled: boolean }).disabled).toBe(true);
    for (const input of html.match(/<(?:input|textarea)\b[^>]*>/g) ?? []) {
      expect(input).toContain("disabled");
    }
    expect(html).toContain("lucide-loader-circle");
    expect(classes(html)).toContain("size-[16px]");
    flat(html);
  });
});

describe("Image upload presentation", () => {
  it.each([0, 2, 4, 5])("keeps previews, cap and single-file chooser at %i images", (count) => {
    const value = Array.from({ length: count }, (_, i) => `/photo-${i}.jpg`);
    const onChange = vi.fn();
    const html = renderToStaticMarkup(<MultiImageUpload value={value} onChange={onChange} />);
    expect(html.match(/<img\b/g) ?? []).toHaveLength(count);
    expect(html.includes('type="file"')).toBe(count < 5);
    if (count < 5) {
      expect(html).toContain(`Subir foto ${count + 1}`);
      expect(html).toContain('accept="image/*"');
      expect(classes(html)).toContain("sr-only");
      expect(classes(html)).toContain("focus-within:outline-2");
      expect(html).not.toContain("multiple");
    }
    value.forEach((_, i) => {
      expect(html).toContain(`alt="Preview ${i}"`);
      expect(html).toContain(`%2Fphoto-${i}.jpg`);
      expect(html).toContain('data-nimg="fill"');
      expect(html).toContain('sizes="(max-width: 768px) 50vw, 25vw"');
      const remove = probe.buttons.find(
        (button) => button["aria-label"] === `Quitar foto ${i + 1}`,
      )!;
      expect(remove.type).toBe("button");
      remove.onClick!(); // Pure local callback; no upload/network execution.
      expect(onChange).toHaveBeenLastCalledWith(value.filter((url) => url !== value[i]));
    });
    if (count) {
      expect(classes(html)).toEqual(
        expect.arrayContaining([
          "w-[96px]",
          "max-w-full",
          "aspect-square",
          "object-cover",
          "size-[36px]",
        ]),
      );
    }
    expect(html).not.toMatch(/grayscale|progress|Arrastrar/);
    flat(html);
  });

  it.each([false, true])(
    "preserves explicit disabled=%s on file and removal controls",
    (disabled) => {
      const onChange = vi.fn();
      const html = renderToStaticMarkup(
        <MultiImageUpload value={["/photo.jpg"]} onChange={onChange} disabled={disabled} />,
      );
      expect(probe.buttons[0].disabled).toBe(disabled);
      expect(html.match(/<input[^>]*>/)![0].includes("disabled")).toBe(disabled);
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it("protects the unchanged upload boundary without invoking it", () => {
    const source = readFileSync(new URL("./image-upload.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/const file = e.target.files\[0\];/);
    expect(source).toContain('formData.append("file", file)');
    expect(source).toMatch(/fetch\("\/api\/upload", \{\s*method: "POST",\s*body: formData,\s*\}\)/);
    expect(source).toContain("onChange([...value, data.publicUrl])");
    expect(source).toContain("setIsUploading(false)");
    expect(source).toContain('toast.error("Error al subir", { description: message })');
  });
});
