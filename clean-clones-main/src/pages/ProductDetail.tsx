import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { products } from "@/data/products";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProductCard from "@/components/ProductCard";
import TryOnSection from "@/components/TryOnSection";
import { useCart } from "@/contexts/CartContext";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

const ProductDetail = () => {
  const { id } = useParams();
  const product = products.find((p) => p.id === id);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(0);
  const { addItem } = useCart();

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container mx-auto px-6 py-20 text-center">
          <h2 className="font-heading text-3xl mb-4">Product not found</h2>
          <Link to="/" className="text-sm underline text-muted-foreground hover:text-foreground">
            Continue shopping
          </Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const hasDiscount = product.originalPrice && product.originalPrice > product.price;
  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const handleAddToCart = () => {
    if (!selectedSize) {
      toast.error("Please select a size");
      return;
    }
    addItem({ product, size: selectedSize, colorIndex: selectedColor, quantity: 1 });
    toast.success("Added to cart");
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-body">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight size={12} />
            <Link to="/" className="hover:text-foreground transition-colors">Apparel</Link>
            <ChevronRight size={12} />
            <span className="text-foreground">{product.name}</span>
          </nav>
        </div>

        <div className="container mx-auto px-6 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            <div className="relative">
              <img src={product.image} alt={product.name} className="w-full aspect-[4/5] object-cover bg-secondary" />
              {hasDiscount && <span className="badge-sale text-sm">Sale</span>}
            </div>

            <div className="flex flex-col justify-center">
              <h1 className="font-heading text-3xl md:text-4xl font-light mb-3">{product.name}</h1>

              <div className="flex items-center gap-3 mb-6">
                <span className="text-lg font-body">${product.price}</span>
                {hasDiscount && (
                  <span className="text-base text-muted-foreground line-through">${product.originalPrice}</span>
                )}
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-8 font-body">{product.description}</p>

              {/* Color */}
              <div className="mb-6">
                <span className="text-xs uppercase tracking-widest font-body font-medium mb-3 block">
                  Color — {product.colors[selectedColor].name}
                </span>
                <div className="flex gap-2">
                  {product.colors.map((color, i) => (
                    <button
                      key={color.name}
                      onClick={() => setSelectedColor(i)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        selectedColor === i ? "border-foreground scale-110" : "border-border hover:border-foreground/50"
                      }`}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              {/* Size */}
              <div className="mb-8">
                <span className="text-xs uppercase tracking-widest font-body font-medium mb-3 block">Size</span>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`min-w-[44px] h-10 px-3 border text-sm font-body transition-all ${
                        selectedSize === size
                          ? "border-foreground bg-primary text-primary-foreground"
                          : "border-border text-foreground hover:border-foreground"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add to Cart */}
              <button
                onClick={handleAddToCart}
                className="w-full bg-primary text-primary-foreground py-3.5 text-sm uppercase tracking-widest font-body font-medium hover:opacity-90 transition-opacity mb-4"
              >
                Add to Cart
              </button>

              {/* Details */}
              <div className="border-t border-border pt-6 mt-4">
                <h3 className="text-xs uppercase tracking-widest font-body font-medium mb-3">Details</h3>
                <ul className="space-y-1.5">
                  {product.details.map((detail) => (
                    <li key={detail} className="text-sm text-muted-foreground font-body flex items-start gap-2">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Virtual Try-On */}
              <TryOnSection productName={product.name} productImage={product.image} />
            </div>
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <section className="container mx-auto px-6 pb-16">
            <h2 className="section-title mb-6">You May Also Like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
};

export default ProductDetail;
