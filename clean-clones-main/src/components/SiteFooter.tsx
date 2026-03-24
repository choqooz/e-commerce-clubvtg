import { Link } from "react-router-dom";

const SiteFooter = () => {
  return (
    <footer className="border-t border-border mt-20">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <h3 className="font-heading text-xl font-medium mb-4">clubvtg</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Curated vintage apparel. Timeless pieces for the modern wardrobe.
            </p>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest font-body font-medium mb-4 text-foreground">Shop</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-foreground transition-colors">New Arrivals</Link></li>
              <li><Link to="/" className="hover:text-foreground transition-colors">Tops</Link></li>
              <li><Link to="/" className="hover:text-foreground transition-colors">Bottoms</Link></li>
              <li><Link to="/" className="hover:text-foreground transition-colors">Outerwear</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest font-body font-medium mb-4 text-foreground">Help</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-foreground transition-colors">Shipping</Link></li>
              <li><Link to="/" className="hover:text-foreground transition-colors">Returns</Link></li>
              <li><Link to="/" className="hover:text-foreground transition-colors">FAQ</Link></li>
              <li><Link to="/" className="hover:text-foreground transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest font-body font-medium mb-4 text-foreground">Subscribe</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Get updates on new drops & exclusive offers.
            </p>
            <div className="flex">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground transition-colors font-body"
              />
              <button className="bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-widest font-body font-medium hover:opacity-90 transition-opacity">
                Join
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-6 text-center text-xs text-muted-foreground">
          © 2025 clubvtg. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
