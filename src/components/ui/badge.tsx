import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-[4px] rounded-none border border-transparent px-[6px] py-[2px] font-mono text-[13px] font-normal leading-[1.2] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2 aria-invalid:border-midnight-ink aria-invalid:border-dotted [&>svg]:pointer-events-none [&>svg]:shrink-0 [&>svg:not([class*='size-'])]:size-[12px]",
  {
    variants: {
      variant: {
        default:
          "border-midnight-ink bg-midnight-ink text-bone-white focus-visible:outline-bone-white focus-visible:outline-offset-[-3px] aria-invalid:border-bone-white",
        secondary: "border-midnight-ink bg-warm-sand text-midnight-ink",
        destructive:
          "border-midnight-ink border-dashed bg-bone-white text-midnight-ink [a]:hover:bg-warm-sand",
        outline: "border-midnight-ink bg-bone-white text-midnight-ink [a]:hover:bg-warm-sand",
        ghost: "bg-transparent text-midnight-ink underline-offset-4 hover:underline",
        link: "bg-transparent text-midnight-ink underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
