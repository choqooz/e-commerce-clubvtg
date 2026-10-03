export function CategoryBanner() {
  return (
    <div className="grid grid-cols-1 gap-[13px] text-midnight-ink md:grid-cols-2 md:gap-[24px]">
      <div className="relative overflow-hidden rounded-none bg-warm-sand aspect-[16/9] md:aspect-[16/7]">
        <div className="absolute inset-0 border border-midnight-ink" />
        <div className="absolute bottom-[24px] left-[24px] right-[24px] md:bottom-[42px] md:left-[42px]">
          <h2 className="font-sans text-[30px] font-normal leading-[1]">Outerwear</h2>
          <p className="mt-[13px] font-mono text-[13px] font-normal leading-[1.2]">
            Camperas, abrigos y blazers vintage
          </p>
        </div>
      </div>
      <div className="relative overflow-hidden rounded-none bg-bone-white aspect-[16/9] md:aspect-[16/7]">
        <div className="absolute inset-0 border border-midnight-ink" />
        <div className="absolute bottom-[24px] left-[24px] right-[24px] md:bottom-[42px] md:left-[42px]">
          <h2 className="font-sans text-[30px] font-normal leading-[1]">Knitwear</h2>
          <p className="mt-[13px] font-mono text-[13px] font-normal leading-[1.2]">
            Sweaters y cardigans de colección
          </p>
        </div>
      </div>
    </div>
  );
}
