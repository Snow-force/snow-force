import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { buildCategoryTree, nativeCategorySchema } from "@/lib/shop/navigation";
import { fixtureCategoryRows, fixtureNavigation } from "@/lib/shop/shop.fixtures";
import { GearNavigation } from "./gear-navigation";
describe("Gear Shop mega menu", () => {
  it("shows all eight sections and dynamically renders newly added descendants", () => {
    const categories = buildCategoryTree([...fixtureCategoryRows, { id: "pcat_added", name: "New technical shells", handle: "technical-shells", rank: 0, parent_category_id: "pcat_outerwear" }].map(row => nativeCategorySchema.parse(row)));
    render(<LanguageProvider initialLang="en"><GearNavigation navigation={{ ...fixtureNavigation, categories }} /></LanguageProvider>);
    for (const name of ["FEATURED", "MEN", "WOMEN", "KIDS", "SKI & SNOWBOARD", "ACCESSORIES", "BRANDS", "SALE"]) expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "MEN" }));
    expect(screen.getByRole("link", { name: "New technical shells" })).toHaveAttribute("href", "/shop/categories/technical-shells");
    expect(screen.getByRole("link", { name: "Snow jackets" })).toHaveAttribute("href", "/shop/categories/snow-jackets");
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/shop/departments/men");
  });
  it("supports keyboard dismissal and returns focus to the controlling section", () => {
    render(<LanguageProvider initialLang="en"><GearNavigation navigation={fixtureNavigation} /></LanguageProvider>);
    const trigger = screen.getByRole("button", { name: "FEATURED" });
    fireEvent.click(trigger);
    const link = screen.getByRole("link", { name: "New arrivals" });
    link.focus(); fireEvent.keyDown(link, { key: "Escape" });
    expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "New arrivals" })).not.toBeInTheDocument();
  });
  it("opens on mouse hover and dismisses when the pointer leaves the menu", () => {
    render(<LanguageProvider initialLang="en"><GearNavigation navigation={fixtureNavigation} /></LanguageProvider>);
    const trigger = screen.getByRole("button", { name: "MEN" });
    const enter = createEvent.pointerOver(trigger); Object.defineProperty(enter, "pointerType", { value: "mouse" }); fireEvent(trigger, enter);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const nav = screen.getByRole("navigation");
    const leave = createEvent.pointerOut(nav); Object.defineProperty(leave, "pointerType", { value: "mouse" }); fireEvent(nav, leave);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
  it("dismisses a hover-opened menu with Escape while focus remains outside navigation", () => {
    render(<LanguageProvider initialLang="en"><GearNavigation navigation={fixtureNavigation} /></LanguageProvider>);
    const trigger = screen.getByRole("button", { name: "MEN" });
    const enter = createEvent.pointerOver(trigger); Object.defineProperty(enter, "pointerType", { value: "mouse" }); fireEvent(trigger, enter);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false"); expect(trigger).toHaveFocus();
  });
  it("closes on outside interaction and on route selection", () => {
    render(<LanguageProvider initialLang="en"><GearNavigation navigation={fixtureNavigation} /></LanguageProvider>);
    const trigger = screen.getByRole("button", { name: "BRANDS" });
    fireEvent.click(trigger); expect(screen.getByRole("link", { name: "VECTOR" })).toHaveAttribute("href", "/shop/brands/VECTOR");
    fireEvent.pointerDown(document.body); expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    const brandLink = screen.getByRole("link", { name: "VECTOR" });
    brandLink.addEventListener("click", event => event.preventDefault(), { once: true });
    fireEvent.click(brandLink);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
  it("provides mobile expansion, Chinese labels, and an explicit backend failure state", () => {
    render(<LanguageProvider initialLang="zh"><GearNavigation navigation={fixtureNavigation} unavailable /></LanguageProvider>);
    const toggle = screen.getByRole("button", { name: "选购分类" });
    fireEvent.click(toggle); expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "儿童" }));
    expect(within(screen.getByRole("status")).getByText(/分类暂时无法加载/)).toBeInTheDocument();
  });
});
