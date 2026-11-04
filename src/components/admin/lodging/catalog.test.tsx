import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
vi.mock("@/lib/lodging/actions", () => ({saveLodgingCatalog:vi.fn()}));
import { LodgingCatalog } from "./catalog";
afterEach(cleanup);
it("shows a clear disabled state with no write forms",()=>{
 const {container}=render(<LanguageProvider initialLang="en"><LodgingCatalog status="disabled" /></LanguageProvider>);
 expect(screen.getByRole("status")).toHaveTextContent("disabled");
 expect(container.querySelector("form")).toBeNull();
});
it("provides bilingual fields and no booking or payment controls",()=>{
 render(<LanguageProvider initialLang="zh"><LodgingCatalog status="ready" /></LanguageProvider>);
 expect(screen.getByText("住宿资料管理")).toBeInTheDocument();
 expect(screen.getByText(/尚未开放订房和付款/)).toBeInTheDocument();
 expect(screen.getAllByLabelText("Name · English")).toHaveLength(2);
 expect(screen.getAllByLabelText("名称 · 中文")).toHaveLength(2);
 expect(screen.getAllByRole("button")).toHaveLength(3);
 expect(screen.queryByRole("button",{name:/付款|预订/})).toBeNull();
});
it("shows load failure instead of a misleading empty catalog",()=>{
 const {container}=render(<LanguageProvider initialLang="zh"><LodgingCatalog status="error" /></LanguageProvider>);
 expect(screen.getByRole("status")).toHaveTextContent("加载失败");
 expect(container.querySelector("form")).toBeNull();
});
