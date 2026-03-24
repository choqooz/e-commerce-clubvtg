import knitSweater from "@/assets/products/knit-sweater.jpg";
import denimJacket from "@/assets/products/denim-jacket.jpg";
import cargoPants from "@/assets/products/cargo-pants.jpg";
import stripedTee from "@/assets/products/striped-tee.jpg";
import linenShirt from "@/assets/products/linen-shirt.jpg";
import corduroyTrousers from "@/assets/products/corduroy-trousers.jpg";
import woolOvercoat from "@/assets/products/wool-overcoat.jpg";
import navyHoodie from "@/assets/products/navy-hoodie.jpg";

export type Product = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  category: "tops" | "bottoms" | "outerwear" | "knitwear";
  image: string;
  description: string;
  sizes: string[];
  colors: { name: string; hex: string }[];
  details: string[];
};

export const products: Product[] = [
  {
    id: "wool-knit-sweater",
    name: "Oversized Wool Knit Sweater",
    price: 89,
    category: "knitwear",
    image: knitSweater,
    description:
      "A relaxed-fit cream wool sweater with a soft hand feel. Vintage-inspired ribbed cuffs and hem. Perfect for layering in transitional weather.",
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: [
      { name: "Cream", hex: "#F0E6D3" },
      { name: "Oatmeal", hex: "#C4B59D" },
    ],
    details: [
      "100% wool blend",
      "Oversized relaxed fit",
      "Ribbed cuffs and hem",
      "Dry clean recommended",
    ],
  },
  {
    id: "washed-denim-jacket",
    name: "Washed Black Denim Jacket",
    price: 120,
    originalPrice: 150,
    category: "outerwear",
    image: denimJacket,
    description:
      "Classic trucker-style denim jacket in a faded black wash. Button closure with chest pockets. A timeless layering piece.",
    sizes: ["S", "M", "L", "XL"],
    colors: [
      { name: "Washed Black", hex: "#3A3A3A" },
      { name: "Indigo", hex: "#2C3E6B" },
    ],
    details: [
      "100% cotton denim",
      "Button front closure",
      "Chest flap pockets",
      "Machine wash cold",
    ],
  },
  {
    id: "military-cargo-pants",
    name: "Military Cargo Pants",
    price: 95,
    category: "bottoms",
    image: cargoPants,
    description:
      "Vintage-inspired cargo pants in olive green with utility pockets. Relaxed straight-leg cut with adjustable waistband.",
    sizes: ["28", "30", "32", "34", "36"],
    colors: [
      { name: "Olive", hex: "#5C6B3C" },
      { name: "Khaki", hex: "#B5A888" },
    ],
    details: [
      "100% cotton twill",
      "Relaxed straight leg",
      "Side cargo pockets",
      "Machine wash warm",
    ],
  },
  {
    id: "breton-striped-tee",
    name: "Breton Striped Long Sleeve Tee",
    price: 45,
    category: "tops",
    image: stripedTee,
    description:
      "Classic navy and white Breton-stripe long sleeve tee. Crew neck with a slightly relaxed body. A wardrobe staple.",
    sizes: ["XS", "S", "M", "L", "XL"],
    colors: [
      { name: "Navy/White", hex: "#2C3E6B" },
      { name: "Charcoal/Cream", hex: "#4A4A4A" },
    ],
    details: [
      "100% cotton jersey",
      "Regular fit",
      "Crew neckline",
      "Machine wash cold",
    ],
  },
  {
    id: "washed-linen-shirt",
    name: "Washed Linen Button-Up Shirt",
    price: 75,
    category: "tops",
    image: linenShirt,
    description:
      "A soft, pre-washed linen shirt in natural beige. Relaxed fit with a chest pocket. Gets better with every wash.",
    sizes: ["S", "M", "L", "XL"],
    colors: [
      { name: "Natural", hex: "#D4C5A9" },
      { name: "Sage", hex: "#9CAF88" },
    ],
    details: [
      "100% French linen",
      "Relaxed fit",
      "Button front with chest pocket",
      "Machine wash gentle",
    ],
  },
  {
    id: "wide-corduroy-trousers",
    name: "Wide Leg Corduroy Trousers",
    price: 85,
    originalPrice: 110,
    category: "bottoms",
    image: corduroyTrousers,
    description:
      "Rich brown corduroy trousers with a wide-leg silhouette. High waist with belt loops. A vintage essential.",
    sizes: ["28", "30", "32", "34", "36"],
    colors: [
      { name: "Chestnut", hex: "#7B4B2A" },
      { name: "Forest", hex: "#3D5A3D" },
    ],
    details: [
      "Cotton corduroy",
      "Wide leg cut",
      "High waist with belt loops",
      "Machine wash cold",
    ],
  },
  {
    id: "classic-wool-overcoat",
    name: "Classic Wool Overcoat",
    price: 245,
    category: "outerwear",
    image: woolOvercoat,
    description:
      "A timeless wool overcoat in heathered grey. Notch lapel, single-breasted with a clean silhouette. Built to last seasons.",
    sizes: ["S", "M", "L", "XL"],
    colors: [
      { name: "Heather Grey", hex: "#8E8E8E" },
      { name: "Camel", hex: "#C19A6B" },
    ],
    details: [
      "Wool/polyester blend",
      "Single breasted",
      "Notch lapel",
      "Dry clean only",
    ],
  },
  {
    id: "faded-navy-hoodie",
    name: "Faded Wash Hoodie",
    price: 68,
    category: "tops",
    image: navyHoodie,
    description:
      "An oversized hoodie with a naturally faded navy wash. Heavy-weight French terry with a kangaroo pocket. Effortlessly cool.",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: [
      { name: "Faded Navy", hex: "#4A5568" },
      { name: "Washed Black", hex: "#2D2D2D" },
    ],
    details: [
      "400gsm French terry cotton",
      "Oversized fit",
      "Kangaroo pocket",
      "Machine wash cold",
    ],
  },
];

export const categories = [
  { id: "all", label: "All" },
  { id: "tops", label: "Tops" },
  { id: "bottoms", label: "Bottoms" },
  { id: "outerwear", label: "Outerwear" },
  { id: "knitwear", label: "Knitwear" },
] as const;
