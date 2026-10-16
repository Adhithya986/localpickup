import { Shop } from "./database";

export interface PrintOrderOptions {
  paper: "A4" | "A3";
  colour: "bw" | "colour";
  sides: "single" | "double";
  copies: number;
  binding: boolean;
  lamination: boolean;
}

export interface PricingBreakdown {
  basePrice: number;
  colourSurcharge: number;
  doubleSideDiscount: number;
  perPagePrice: number;
  copies: number;
  printingSubtotal: number;
  bindingPrice: number;
  laminationPrice: number;
  total: number;
}

export function validatePrintOptions(options: any): { isValid: boolean; error?: string; validatedOptions?: PrintOrderOptions } {
  if (!options) {
    return { isValid: false, error: "Print options are required" };
  }

  const paper = String(options.paper || "").trim();
  if (paper !== "A4" && paper !== "A3") {
    return { isValid: false, error: "Invalid paper size. Must be 'A4' or 'A3'" };
  }

  const colour = String(options.colour || "").trim().toLowerCase();
  if (colour !== "bw" && colour !== "colour") {
    return { isValid: false, error: "Invalid colour option. Must be 'bw' or 'colour'" };
  }

  const sides = String(options.sides || "").trim().toLowerCase();
  if (sides !== "single" && sides !== "double") {
    return { isValid: false, error: "Invalid sides option. Must be 'single' or 'double'" };
  }

  const copies = parseInt(String(options.copies), 10);
  if (isNaN(copies) || copies < 1 || copies > 1000) {
    return { isValid: false, error: "Copies must be a positive integer between 1 and 1000" };
  }

  const binding = options.binding === true || options.binding === "true";
  const lamination = options.lamination === true || options.lamination === "true";

  return {
    isValid: true,
    validatedOptions: {
      paper,
      colour,
      sides,
      copies,
      binding,
      lamination,
    },
  };
}

export function calculatePrintPrice(options: PrintOrderOptions, shop?: Shop): PricingBreakdown {
  const cfg = shop?.pricingConfig;

  const basePrice = options.paper === "A4" ? (cfg?.a4BwPrice ?? 2) : (cfg?.a3BwPrice ?? 4);
  const colourSurcharge = options.colour === "colour" ? (cfg?.a4ColourPrice ? cfg.a4ColourPrice - cfg.a4BwPrice : 3) : 0;
  const doubleSideDiscount = options.sides === "double" ? (cfg?.doubleSideDiscount ?? 1) : 0;

  const perPagePrice = Math.max(1, basePrice + colourSurcharge - doubleSideDiscount);
  const printingSubtotal = perPagePrice * options.copies;

  const bindingPrice = options.binding ? (cfg?.bindingPrice ?? 20) : 0;
  const laminationPrice = options.lamination ? (cfg?.laminationPrice ?? 10) : 0;

  const total = printingSubtotal + bindingPrice + laminationPrice;

  return {
    basePrice,
    colourSurcharge,
    doubleSideDiscount,
    perPagePrice,
    copies: options.copies,
    printingSubtotal,
    bindingPrice,
    laminationPrice,
    total,
  };
}
