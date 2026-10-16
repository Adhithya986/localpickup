import { describe, it } from "node:test";
import assert from "node:assert";
import { calculatePrintPrice, validatePrintOptions } from "../src/pricing";

describe("Pricing Engine & Validation", () => {
  it("should validate valid print options", () => {
    const valid = validatePrintOptions({
      paper: "A4",
      colour: "bw",
      sides: "single",
      copies: 5,
      binding: true,
      lamination: false,
    });

    assert.strictEqual(valid.isValid, true);
    assert.strictEqual(valid.validatedOptions?.paper, "A4");
    assert.strictEqual(valid.validatedOptions?.copies, 5);
  });

  it("should reject invalid paper size", () => {
    const res = validatePrintOptions({
      paper: "A2",
      colour: "bw",
      sides: "single",
      copies: 1,
    });
    assert.strictEqual(res.isValid, false);
    assert.match(res.error || "", /paper size/i);
  });

  it("should reject non-positive or excessive copies", () => {
    const res0 = validatePrintOptions({ paper: "A4", colour: "bw", sides: "single", copies: 0 });
    assert.strictEqual(res0.isValid, false);

    const resNeg = validatePrintOptions({ paper: "A4", colour: "bw", sides: "single", copies: -5 });
    assert.strictEqual(resNeg.isValid, false);

    const resExcess = validatePrintOptions({ paper: "A4", colour: "bw", sides: "single", copies: 9999 });
    assert.strictEqual(resExcess.isValid, false);
  });

  it("should calculate standard A4 B&W single-sided price correctly", () => {
    const breakdown = calculatePrintPrice({
      paper: "A4",
      colour: "bw",
      sides: "single",
      copies: 10,
      binding: false,
      lamination: false,
    });

    // A4 B&W base: 2/page * 10 copies = 20
    assert.strictEqual(breakdown.perPagePrice, 2);
    assert.strictEqual(breakdown.printingSubtotal, 20);
    assert.strictEqual(breakdown.total, 20);
  });

  it("should calculate colour, double-sided, binding and lamination options correctly", () => {
    const breakdown = calculatePrintPrice({
      paper: "A4",
      colour: "colour", // +3
      sides: "double", // -1 discount
      copies: 4,
      binding: true, // +20
      lamination: true, // +10
    });

    // Base 2 + 3 colour - 1 double = 4 per page
    // 4 * 4 copies = 16
    // Extras: 20 + 10 = 30
    // Total: 16 + 30 = 46
    assert.strictEqual(breakdown.perPagePrice, 4);
    assert.strictEqual(breakdown.printingSubtotal, 16);
    assert.strictEqual(breakdown.bindingPrice, 20);
    assert.strictEqual(breakdown.laminationPrice, 10);
    assert.strictEqual(breakdown.total, 46);
  });

  it("should calculate A3 format correctly", () => {
    const breakdown = calculatePrintPrice({
      paper: "A3", // base 4
      colour: "colour", // +3
      sides: "single",
      copies: 2,
      binding: false,
      lamination: false,
    });

    // 4 + 3 = 7 per page * 2 = 14
    assert.strictEqual(breakdown.perPagePrice, 7);
    assert.strictEqual(breakdown.total, 14);
  });
});
