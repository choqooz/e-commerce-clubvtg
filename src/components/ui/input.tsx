import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[36px] w-full min-w-0 rounded-none border border-midnight-ink bg-bone-white px-[6px] py-[2px] font-sans text-[16px] font-normal leading-[1.2] text-midnight-ink outline-none md:text-[15px]",
        "file:mr-[6px] file:inline-flex file:h-[28px] file:rounded-none file:border-0 file:bg-warm-sand file:px-[6px] file:font-sans file:text-[16px] file:font-normal file:text-midnight-ink md:file:text-[15px] placeholder:text-concrete-gray",
        "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-midnight-ink disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-dotted",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
