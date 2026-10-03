import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent bg-clip-padding font-mono text-[13px] font-normal leading-[1.2] whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-midnight-ink aria-invalid:border-dotted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[16px]",
  {
    variants: {
      variant: {
        default:
          "border-midnight-ink bg-midnight-ink text-bone-white focus-visible:outline-bone-white focus-visible:outline-offset-[-3px] aria-invalid:border-bone-white",
        outline:
          "border-midnight-ink bg-bone-white text-midnight-ink hover:bg-warm-sand aria-expanded:bg-warm-sand",
        secondary:
          "border-midnight-ink bg-warm-sand text-midnight-ink hover:bg-bone-white aria-expanded:bg-bone-white",
        ghost: "bg-transparent text-midnight-ink underline-offset-4 hover:underline",
        destructive:
          "border-midnight-ink border-dashed bg-bone-white text-midnight-ink hover:bg-warm-sand",
        link: "bg-transparent text-midnight-ink underline-offset-4 hover:underline",
      },
      size: {
        // Numeric spacing tokens are literal pixels in the redesigned UI theme.
        default: "h-[36px] gap-[6px] px-[6px] py-[2px]",
        xs: "h-[24px] gap-[4px] px-[6px] py-[2px] [&_svg:not([class*='size-'])]:size-[12px]",
        sm: "h-[28px] gap-[4px] px-[6px] py-[2px] [&_svg:not([class*='size-'])]:size-[14px]",
        lg: "h-[36px] gap-[6px] px-[6px] py-[2px]",
        icon: "size-[36px]",
        "icon-xs": "size-[24px] [&_svg:not([class*='size-'])]:size-[12px]",
        "icon-sm": "size-[28px]",
        "icon-lg": "size-[36px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
