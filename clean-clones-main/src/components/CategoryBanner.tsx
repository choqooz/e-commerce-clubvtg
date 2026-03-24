import { Link } from "react-router-dom";

import bannerTops from "@/assets/banner-tops.jpg";
import bannerOuterwear from "@/assets/banner-outerwear.jpg";
import bannerBottoms from "@/assets/banner-bottoms.jpg";
import bannerKnitwear from "@/assets/banner-knitwear.jpg";

const bannerCategories = [
  { image: bannerTops, label: "Tops", href: "/" },
  { image: bannerOuterwear, label: "Outerwear", href: "/" },
  { image: bannerBottoms, label: "Bottoms", href: "/" },
  { image: bannerKnitwear, label: "Knitwear", href: "/" },
];

const CategoryBanner = () => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {bannerCategories.map((cat) => (
        <Link
          key={cat.label}
          to={cat.href}
          className="group relative overflow-hidden"
        >
          <div className="aspect-[3/2] overflow-hidden">
            <img
              src={cat.image}
              alt={cat.label}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
          </div>
          <p className="text-center mt-3 text-sm tracking-wide font-body text-foreground/80 group-hover:text-foreground transition-colors">
            {cat.label}
          </p>
        </Link>
      ))}
    </div>
  );
};

export default CategoryBanner;
