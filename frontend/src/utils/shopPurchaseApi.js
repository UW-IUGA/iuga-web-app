export const SHOP_PURCHASES_URL = "/api/v1/shop/purchases";

export async function loadShopPurchase(id) {
  try {
    const response = await fetch(`${SHOP_PURCHASES_URL}/${id}`);
    if (response.ok) return (await response.json()).purchase ?? null;
  } catch {
    // Refresh is best-effort; the failed write's notice still stands.
  }
  return null;
}

export async function saveShopPurchaseChange(
  order,
  action,
  changes,
  method = "PATCH",
) {
  const response = await fetch(`${SHOP_PURCHASES_URL}/${order.id}/${action}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...changes, expectedRevision: order.revision }),
  });
  const body = await response.json().catch(() => null);
  if (response.ok && body?.purchase) return { order: body.purchase };
  if (response.ok) throw new Error("Saved order missing from response");

  return {
    status: response.status,
    message: body?.message,
    // Refresh separately so the screen can show the failure without waiting for the read.
    current: response.status === 409 ? loadShopPurchase(order.id) : null,
  };
}
