"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const pricing_1 = require("../src/pricing");
(0, node_test_1.describe)("Pricing Engine & Validation", () => {
    (0, node_test_1.it)("should validate valid print options", () => {
        const valid = (0, pricing_1.validatePrintOptions)({
            paper: "A4",
            colour: "bw",
            sides: "single",
            copies: 5,
            binding: true,
            lamination: false,
        });
        node_assert_1.default.strictEqual(valid.isValid, true);
        node_assert_1.default.strictEqual(valid.validatedOptions?.paper, "A4");
        node_assert_1.default.strictEqual(valid.validatedOptions?.copies, 5);
    });
    (0, node_test_1.it)("should reject invalid paper size", () => {
        const res = (0, pricing_1.validatePrintOptions)({
            paper: "A2",
            colour: "bw",
            sides: "single",
            copies: 1,
        });
        node_assert_1.default.strictEqual(res.isValid, false);
        node_assert_1.default.match(res.error || "", /paper size/i);
    });
    (0, node_test_1.it)("should reject non-positive or excessive copies", () => {
        const res0 = (0, pricing_1.validatePrintOptions)({ paper: "A4", colour: "bw", sides: "single", copies: 0 });
        node_assert_1.default.strictEqual(res0.isValid, false);
        const resNeg = (0, pricing_1.validatePrintOptions)({ paper: "A4", colour: "bw", sides: "single", copies: -5 });
        node_assert_1.default.strictEqual(resNeg.isValid, false);
        const resExcess = (0, pricing_1.validatePrintOptions)({ paper: "A4", colour: "bw", sides: "single", copies: 9999 });
        node_assert_1.default.strictEqual(resExcess.isValid, false);
    });
    (0, node_test_1.it)("should calculate standard A4 B&W single-sided price correctly", () => {
        const breakdown = (0, pricing_1.calculatePrintPrice)({
            paper: "A4",
            colour: "bw",
            sides: "single",
            copies: 10,
            binding: false,
            lamination: false,
        });
        // A4 B&W base: 2/page * 10 copies = 20
        node_assert_1.default.strictEqual(breakdown.perPagePrice, 2);
        node_assert_1.default.strictEqual(breakdown.printingSubtotal, 20);
        node_assert_1.default.strictEqual(breakdown.total, 20);
    });
    (0, node_test_1.it)("should calculate colour, double-sided, binding and lamination options correctly", () => {
        const breakdown = (0, pricing_1.calculatePrintPrice)({
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
        node_assert_1.default.strictEqual(breakdown.perPagePrice, 4);
        node_assert_1.default.strictEqual(breakdown.printingSubtotal, 16);
        node_assert_1.default.strictEqual(breakdown.bindingPrice, 20);
        node_assert_1.default.strictEqual(breakdown.laminationPrice, 10);
        node_assert_1.default.strictEqual(breakdown.total, 46);
    });
    (0, node_test_1.it)("should calculate A3 format correctly", () => {
        const breakdown = (0, pricing_1.calculatePrintPrice)({
            paper: "A3", // base 4
            colour: "colour", // +3
            sides: "single",
            copies: 2,
            binding: false,
            lamination: false,
        });
        // 4 + 3 = 7 per page * 2 = 14
        node_assert_1.default.strictEqual(breakdown.perPagePrice, 7);
        node_assert_1.default.strictEqual(breakdown.total, 14);
    });
});
