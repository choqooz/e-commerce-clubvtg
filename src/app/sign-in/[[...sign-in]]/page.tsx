import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-none border border-border rounded-none",
            headerTitle: "font-heading font-light",
            headerSubtitle: "font-sans text-muted-foreground",
            formButtonPrimary: "bg-foreground text-background hover:bg-foreground/90 rounded-none",
            formFieldInput: "rounded-none border-border",
            footerActionLink: "text-foreground hover:text-foreground/80",
          },
        }}
      />
    </div>
  );
}
