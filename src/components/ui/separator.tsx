"use client";

import { Separator as SeparatorPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-midnight-ink data-horizontal:h-[1px] data-horizontal:w-full data-vertical:w-[1px] data-vertical:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
