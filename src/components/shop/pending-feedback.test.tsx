import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { PendingFeedback } from "./pending-feedback";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const view = (kind: "cart" | "checkout" | "payment", lang: "en" | "zh" = "en") => render(<LanguageProvider initialLang={lang}><PendingFeedback kind={kind} /></LanguageProvider>);
it("announces slowness after eight seconds and uncertainty after thirty without claiming failure", () => {
  view("payment"); expect(screen.queryByRole("status")).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(7_999)); expect(screen.queryByRole("status")).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1)); expect(screen.getByRole("status")).toHaveTextContent("still in progress");
  act(() => vi.advanceTimersByTime(22_000)); expect(screen.getByRole("status")).toHaveTextContent("do not submit another payment");
  expect(screen.getByRole("link")).toHaveAttribute("href", "/member/orders");
  expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("offers a cart read instead of a duplicate write", () => {
  view("cart"); act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("status")).toHaveTextContent("avoid repeating the change");
  expect(screen.getByRole("link")).toHaveAttribute("href", "/shop/cart");
});
it("cleans both timers when an operation finishes and starts a fresh wait for the next", () => {
  const first = view("checkout"); expect(vi.getTimerCount()).toBe(2);
  act(() => vi.advanceTimersByTime(8_000)); first.unmount(); expect(vi.getTimerCount()).toBe(0);
  view("checkout"); expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("provides readable Chinese feedback without another animation or payment control", () => {
  const { container } = view("payment", "zh"); act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("status")).toHaveTextContent("暂勿再次付款");
  expect(container.querySelector("svg")).toBeNull();
});
