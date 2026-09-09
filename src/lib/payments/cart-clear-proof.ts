import "server-only";

export const CART_CLEAR_PROOF_COOKIE = "clubvtg-cart-clear-order";
export const CART_CLEAR_PROOF_MAX_AGE_SECONDS = 60;
export const CART_CLEAR_PROOF_PATH = "/api/mp-return/cart-clear-proof/consume";

export function isCartClearProofForOrder(proofOrderId: string | undefined, orderId: string): boolean {
  return proofOrderId === orderId;
}
