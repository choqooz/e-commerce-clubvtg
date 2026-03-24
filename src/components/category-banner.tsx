export default function CategoryBanner() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="relative overflow-hidden bg-secondary aspect-[16/9] md:aspect-[16/7] group cursor-pointer">
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
        <div className="absolute bottom-6 left-6">
          <h2 className="font-heading text-2xl md:text-3xl text-white font-light">
            Outerwear
          </h2>
          <p className="text-white/80 text-sm font-sans mt-1">
            Camperas, abrigos y blazers vintage
          </p>
        </div>
      </div>
      <div className="relative overflow-hidden bg-secondary aspect-[16/9] md:aspect-[16/7] group cursor-pointer">
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
        <div className="absolute bottom-6 left-6">
          <h2 className="font-heading text-2xl md:text-3xl text-white font-light">
            Knitwear
          </h2>
          <p className="text-white/80 text-sm font-sans mt-1">
            Sweaters y cardigans de colección
          </p>
        </div>
      </div>
    </div>
  );
}
