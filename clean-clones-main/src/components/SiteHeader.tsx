import { Link } from "react-router-dom";
import { Search, ShoppingBag, User } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/contexts/CartContext";
import LoginModal from "@/components/LoginModal";

const SiteHeader = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { totalItems, setIsOpen } = useCart();

  return (
    <>
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="bg-primary text-primary-foreground text-center py-2 text-xs tracking-widest uppercase font-body">
          Free shipping on orders over $150
        </div>

        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <nav className="hidden md:flex items-center gap-8">
              <Link to="/" className="nav-link">New</Link>
              <Link to="/" className="nav-link nav-link-active">Apparel</Link>
              <Link to="/" className="nav-link">Archive</Link>
            </nav>

            <Link to="/" className="absolute left-1/2 -translate-x-1/2">
              <h1 className="font-heading text-2xl tracking-wider font-medium">clubvtg</h1>
            </Link>

            <div className="flex items-center gap-5 ml-auto">
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="text-foreground/70 hover:text-foreground transition-colors"
                aria-label="Search"
              >
                <Search size={18} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setLoginOpen(true)}
                className="text-foreground/70 hover:text-foreground transition-colors"
                aria-label="Account"
              >
                <User size={18} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setIsOpen(true)}
                className="text-foreground/70 hover:text-foreground transition-colors relative"
                aria-label="Cart"
              >
                <ShoppingBag size={18} strokeWidth={1.5} />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-accent text-accent-foreground text-[10px] flex items-center justify-center rounded-full">
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="pb-4 animate-fade-in">
              <input
                type="text"
                placeholder="Search products..."
                className="w-full border-b border-foreground/20 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground font-body"
                autoFocus
              />
            </div>
          )}
        </div>
      </header>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  );
};

export default SiteHeader;
