import { describe, it, expect } from "vitest";
import { promotionDiscount } from "@/lib/pricing";

describe("probe", () => {
  it("importe lib/pricing", () => {
    expect(promotionDiscount({ kind: "amount", value: 500 }, 300, 0).discountCents).toBe(300);
  });
});
