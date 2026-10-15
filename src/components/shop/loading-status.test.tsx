import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LoadingSpinner, LoadingStatus } from "./loading-status";

afterEach(cleanup);
describe("shared waiting animation", () => {
  it("pairs a decorative spinner with a polite, atomic status and real text", () => {
    render(<LoadingStatus>Calculating shipping and tax…</LoadingStatus>);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveTextContent("Calculating shipping and tax…");
    expect(status.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(status.querySelector("svg")).toHaveAttribute("focusable", "false");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("respects reduced motion without hiding the readable status", () => {
    render(<LoadingStatus>正在核验订单…</LoadingStatus>);
    const icon = screen.getByRole("status").querySelector("svg");
    expect(icon).toHaveClass("motion-safe:animate-spin", "motion-reduce:animate-none");
    expect(icon).not.toHaveClass("animate-spin");
    expect(screen.getByText("正在核验订单…")).toBeVisible();
  });
  it("does not repeatedly announce a duplicate summary indicator", () => {
    const { container } = render(<LoadingStatus announce={false}>Updating total…</LoadingStatus>);
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(container.querySelector("[data-loading-spinner]")).not.toBeNull();
  });
  it("keeps a button's accessible name and removes the animation when waiting ends", () => {
    const { rerender } = render(<button disabled><LoadingSpinner />Confirming…</button>);
    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
    rerender(<button>Continue</button>);
    expect(screen.getByRole("button", { name: "Continue" }).querySelector("svg")).toBeNull();
  });
});
