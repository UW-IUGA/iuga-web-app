import { afterEach, expect, test, vi } from "vitest";
import { saveShopPurchaseChange } from "./shopPurchaseApi";

afterEach(() => vi.unstubAllGlobals());

test("a refused write returns its reason and the latest order without replaying the write", async () => {
  const latest = { id: "order", revision: 4 };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ message: "Review the current order" }, { status: 409 }),
    )
    .mockResolvedValueOnce(Response.json({ purchase: latest }));
  vi.stubGlobal("fetch", fetch);

  const outcome = await saveShopPurchaseChange(
    { id: "order", revision: 3 },
    "pickup",
    { pickedUp: true },
  );

  expect(outcome).toMatchObject({
    status: 409,
    message: "Review the current order",
  });
  expect(await outcome.current).toEqual(latest);
  expect(
    fetch.mock.calls.map(([url, request]) => [
      url,
      request?.method,
      request?.body && JSON.parse(request.body),
    ]),
  ).toEqual([
    [
      "/api/v1/shop/purchases/order/pickup",
      "PATCH",
      { pickedUp: true, expectedRevision: 3 },
    ],
    ["/api/v1/shop/purchases/order", undefined, undefined],
  ]);
});
