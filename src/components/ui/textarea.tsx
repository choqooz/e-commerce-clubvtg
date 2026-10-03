import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-[96px] w-full rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] font-sans text-[16px] font-normal leading-[1.2] text-midnight-ink outline-none placeholder:text-concrete-gray md:text-[15px]",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-dotted",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
