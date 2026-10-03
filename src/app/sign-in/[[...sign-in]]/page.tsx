import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100dvh-64px)] min-w-0 items-center justify-center bg-bone-white px-[18px] py-[42px] font-sans font-normal text-midnight-ink md:px-[30px]">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto w-full min-w-0 max-w-[400px]",
            card: "rounded-none border border-midnight-ink bg-bone-white p-[24px] shadow-none",
            headerTitle: "font-sans text-[30px] font-normal leading-none text-midnight-ink",
            headerSubtitle: "font-sans text-[15px] font-normal leading-[1.3] text-midnight-ink",
            formButtonPrimary:
              "min-h-[36px] rounded-none border border-midnight-ink bg-midnight-ink px-[6px] py-[2px] font-mono text-[13px] font-normal text-bone-white hover:bg-midnight-ink focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2",
            formFieldInput:
              "min-h-[36px] rounded-none border border-midnight-ink bg-bone-white px-[13px] py-[6px] font-sans text-[16px] font-normal text-midnight-ink md:text-[15px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2",
            footerActionLink:
              "font-mono text-[13px] font-normal text-midnight-ink hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-midnight-ink focus-visible:outline-offset-2",
          },
        }}
      />
    </div>
  );
}
