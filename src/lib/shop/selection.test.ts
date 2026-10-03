import { describe, expect, it } from "vitest";
import { addSelection, buildInquiry, readSelection, selectionReferenceTotal } from "./selection";

const item = { slug: "vector-insnow-dusk", color: 0, size: "M", quantity: 1 };
describe("gear selection", () => {
  it("adds the requested quantity, merges variants and keeps quantity within bounds", () => {
    expect(addSelection([], { ...item, quantity: 3 })).toEqual([{ ...item, quantity: 3 }]);
    expect(addSelection([item], { ...item, quantity: 3 })[0].quantity).toBe(4);
    expect(addSelection([item], { ...item, quantity: 100 })[0].quantity).toBe(99);
    for (const quantity of [-1, 0, 1.5, Infinity]) expect(addSelection([], { ...item, quantity })[0].quantity).toBe(1);
  });
  it("totals displayed USD unit prices across quantities and ignores obsolete products", () => {
    expect(selectionReferenceTotal([])).toBe(0);
    expect(selectionReferenceTotal([{ ...item, quantity: 3 }, { slug: "isee-magnetic-goggles", color: 0, size: null, quantity: 2 }, { ...item, slug: "obsolete" }])).toBe(431.32);
  });
  it("rejects corrupt, stale and invalid stored items", () => {
    for (const raw of [null, "not json", "{}", JSON.stringify([null, { slug: "obsolete" }, { ...item, color: 200 }, { ...item, color: -1 }, { ...item, size: "BAD" }, { ...item, quantity: 0 }, { ...item, quantity: 1.5 }, { ...item, color: undefined }])]) {
      expect(readSelection(raw)).toEqual([]);
    }
  });
  it("restores valid choices, merges duplicates and caps quantity", () => {
    expect(readSelection(JSON.stringify([item, { ...item, quantity: 150 }]))).toEqual([{ ...item, quantity: 99 }]);
    expect(readSelection(JSON.stringify([{ slug: "isee-barbie-set", color: 0, size: null, quantity: 1 }]))).toHaveLength(1);
  });
  it("merges identical variants while keeping different size and color choices", () => {
    const one = addSelection([], item);
    expect(addSelection(one, item)[0].quantity).toBe(2);
    expect(addSelection(one, { ...item, color: 1 })).toHaveLength(2);
    expect(addSelection(one, { ...item, size: "S" })).toHaveLength(2);
    expect(addSelection([{ ...item, quantity: 99 }], item)[0].quantity).toBe(99);
  });
  it("includes exact variants and confirmation terms in both inquiry languages", () => {
    expect(buildInquiry([item], "en")).toContain("Dawn pink");
    expect(buildInquiry([item], "en")).toContain("Size: M");
    expect(buildInquiry([item], "en")).toContain("shipping and return terms");
    expect(buildInquiry([item], "zh")).toContain("晨曦粉");
    expect(buildInquiry([{ ...item, color: null, size: null }], "zh")).toContain("待确认");
    expect(buildInquiry([{ ...item, color: null, size: null }], "en")).toContain("To confirm");
    expect(buildInquiry([{ ...item, slug: "obsolete" }], "en")).not.toContain("obsolete");
  });
});
