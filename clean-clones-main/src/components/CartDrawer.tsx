import { useCart } from "@/contexts/CartContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X, Minus, Plus } from "lucide-react";

const CartDrawer = () => {
  const { items, removeItem, totalItems, totalPrice, isOpen, setIsOpen } = useCart();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-full sm:max-w-md bg-background border-border flex flex-col">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="font-heading text-xl font-normal tracking-wide">
            Cart ({totalItems})
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground font-body">Your cart is empty</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {items.map((item) => (
                <div
                  key={`${item.product.id}-${item.size}-${item.colorIndex}`}
                  className="flex gap-4"
                >
                  <img
                    src={item.product.image}
                    alt={item.product.name}
                    className="w-20 h-24 object-cover bg-secondary shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-body truncate">{item.product.name}</h4>
                    <p className="text-xs text-muted-foreground font-body mt-0.5">
                      {item.product.colors[item.colorIndex].name} · {item.size}
                    </p>
                    <p className="text-sm font-body mt-1">${item.product.price}</p>
                    <p className="text-xs text-muted-foreground font-body mt-0.5">
                      Qty: {item.quantity}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.product.id, item.size)}
                    className="text-muted-foreground hover:text-foreground transition-colors self-start"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex justify-between text-sm font-body">
                <span>Total</span>
                <span className="font-medium">${totalPrice.toFixed(2)}</span>
              </div>
              <button className="w-full bg-primary text-primary-foreground py-3.5 text-sm uppercase tracking-widest font-body font-medium hover:opacity-90 transition-opacity">
                Checkout
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default CartDrawer;
