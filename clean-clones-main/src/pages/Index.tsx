import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CategoryBanner from "@/components/CategoryBanner";
import ProductCard from "@/components/ProductCard";
import { products, categories } from "@/data/products";
import { ChevronRight } from "lucide-react";

const Index = () => {
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredProducts =
    activeCategory === "all"
      ? products
      : products.filter((p) => p.category === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main>
        {/* Category Banners */}
        <section className="container mx-auto px-6 pt-8 pb-6">
          <CategoryBanner />
        </section>

        {/* Breadcrumb */}
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground font-body">
            <span className="hover:text-foreground cursor-pointer transition-colors">Home</span>
            <ChevronRight size={12} />
            <span className="text-foreground">Apparel</span>
          </nav>
        </div>

        {/* Title & Description */}
        <section className="container mx-auto px-6 pb-8">
          <h1 className="font-heading text-4xl md:text-5xl font-light mb-4">
            Apparel
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed font-body">
            Curated vintage pieces designed to last. From everyday essentials to statement layers — 
            each item is selected for its quality, character, and timeless appeal. Natural materials, 
            relaxed silhouettes, effortless style.
          </p>
        </section>

        {/* Category Filter */}
        <section className="container mx-auto px-6 pb-6">
          <div className="flex items-center gap-6 border-b border-border">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`pb-3 text-sm tracking-wide font-body transition-colors relative ${
                  activeCategory === cat.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat.label}
                {activeCategory === cat.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Product Grid */}
        <section className="container mx-auto px-6 pb-16">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-10">
            {filteredProducts.map((product, i) => (
              <div
                key={product.id}
                className="animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <ProductCard product={product} />
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <p className="text-center text-muted-foreground py-20 font-body">
              No products found in this category.
            </p>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};

export default Index;
