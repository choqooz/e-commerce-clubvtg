import { useState, useRef } from "react";
import { Upload, ImageIcon, X } from "lucide-react";

type TryOnSectionProps = {
  productName: string;
  productImage: string;
};

const TryOnSection = ({ productName, productImage }: TryOnSectionProps) => {
  const [uploadedPhoto, setUploadedPhoto] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedPhoto(ev.target?.result as string);
      setGeneratedImage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = () => {
    if (!uploadedPhoto) return;
    setIsGenerating(true);
    // Demo: simulate generation with a timeout
    setTimeout(() => {
      setGeneratedImage(productImage);
      setIsGenerating(false);
    }, 2000);
  };

  const clearPhoto = () => {
    setUploadedPhoto(null);
    setGeneratedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="border-t border-border pt-6 mt-4">
      <h3 className="text-xs uppercase tracking-widest font-body font-medium mb-4">
        Virtual Try-On
      </h3>
      <p className="text-sm text-muted-foreground font-body mb-4">
        Upload your photo to see how this piece looks on you.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Upload area */}
        <div className="relative">
          {uploadedPhoto ? (
            <div className="relative aspect-[3/4] bg-secondary">
              <img
                src={uploadedPhoto}
                alt="Your photo"
                className="w-full h-full object-cover"
              />
              <button
                onClick={clearPhoto}
                className="absolute top-2 right-2 w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center hover:opacity-80 transition-opacity"
              >
                <X size={12} />
              </button>
              <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest bg-background/80 text-foreground px-2 py-1 font-body">
                Your photo
              </span>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[3/4] border-2 border-dashed border-border hover:border-foreground/40 transition-colors flex flex-col items-center justify-center gap-3"
            >
              <Upload size={24} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-body">
                Upload your photo
              </span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Result area */}
        <div className="relative aspect-[3/4] bg-secondary flex items-center justify-center">
          {generatedImage ? (
            <>
              <img
                src={generatedImage}
                alt="Try-on result"
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest bg-background/80 text-foreground px-2 py-1 font-body">
                Result
              </span>
            </>
          ) : isGenerating ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground font-body">Generating...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ImageIcon size={24} className="text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/50 font-body">Result</span>
            </div>
          )}
        </div>
      </div>

      {/* Generate button */}
      {uploadedPhoto && !generatedImage && !isGenerating && (
        <button
          onClick={handleGenerate}
          className="w-full mt-4 border border-foreground text-foreground py-3 text-sm uppercase tracking-widest font-body font-medium hover:bg-primary hover:text-primary-foreground transition-all"
        >
          Generate Try-On
        </button>
      )}

      {generatedImage && (
        <button
          onClick={clearPhoto}
          className="w-full mt-4 border border-border text-muted-foreground py-3 text-sm uppercase tracking-widest font-body font-medium hover:border-foreground hover:text-foreground transition-all"
        >
          Try Another Photo
        </button>
      )}
    </div>
  );
};

export default TryOnSection;
