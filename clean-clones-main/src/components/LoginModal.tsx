import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LoginModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const LoginModal = ({ open, onOpenChange }: LoginModalProps) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Demo only — no backend
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-background border-border p-8">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-normal text-center tracking-wide">
            {isSignUp ? "Create Account" : "Sign In"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {isSignUp && (
            <input
              type="text"
              placeholder="Full Name"
              className="w-full border border-border bg-transparent px-4 py-3 text-sm font-body outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-border bg-transparent px-4 py-3 text-sm font-body outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-border bg-transparent px-4 py-3 text-sm font-body outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground"
          />

          <button
            type="submit"
            className="w-full bg-primary text-primary-foreground py-3.5 text-sm uppercase tracking-widest font-body font-medium hover:opacity-90 transition-opacity"
          >
            {isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground font-body mt-4">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="underline text-foreground hover:opacity-70 transition-opacity"
          >
            {isSignUp ? "Sign In" : "Create one"}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default LoginModal;
