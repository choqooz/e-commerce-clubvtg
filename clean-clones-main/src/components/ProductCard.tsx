import { Link } from "react-router-dom";
import type { Product } from "@/data/products";

const ProductCard = ({ product }: { product: Product }) => {
  const hasDiscount = product.originalPrice && product.originalPrice > product.price;

  return (
    <Link to={`/product/${product.id}`} className="product-card">
      <div className="relative overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="product-card-image"
          loading="lazy"
        />
        {hasDiscount && (
          <span className="badge-sale">
            {Math.round(((product.originalPrice! - product.price) / product.originalPrice!) * 100)}% OFF
          </span>
        )}
      </div>
      <h3 className="product-card-title">{product.name}</h3>
      <div className="flex items-center gap-2 mt-1">
        <span className="product-card-price">
          ${product.price}
        </span>
        {hasDiscount && (
          <span className="text-xs text-muted-foreground line-through">
            ${product.originalPrice}
          </span>
        )}
      </div>
      <div className="flex gap-1.5 mt-2">
        {product.colors.map((color) => (
          <span
            key={color.name}
            className="w-3 h-3 rounded-full border border-border"
            style={{ backgroundColor: color.hex }}
            title={color.name}
          />
        ))}
      </div>
    </Link>
  );
};

export default ProductCard;
