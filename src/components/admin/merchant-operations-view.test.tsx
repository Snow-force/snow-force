import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminMerchantView } from "@/lib/merchants/admin-view";
import type { MerchantBoothProgram } from "@/lib/merchants/types";
import { MerchantOperationsView } from "./merchant-operations-view";

vi.mock("@/lib/language", () => ({
  useLanguage: () => ({ t: (value: { en: string; zh: string }) => value.en }),
}));

const action = async () => undefined;
const program: MerchantBoothProgram = {
  id: "program-123",
  eventSlug: "event-123",
  enabled: true,
  paymentInstructionsEn: "Pay staff offline.",
  paymentInstructionsZh: "请现场付款。",
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
};

function operations(currentProgram: MerchantBoothProgram, overrides: Partial<AdminMerchantView> = {}) {
  const view: AdminMerchantView = {
    eventOptions: [],
    selectedEventSlug: "event-123",
    selectedStatus: "",
    selectedItems: [],
    instructionPrograms: [currentProgram],
    ...overrides,
  };
  return (
    <MerchantOperationsView
      view={view}
      eventLabels={{}}
      feedback={{}}
      reviewAction={action}
      approveAction={action}
      allocateAction={action}
      instructionAction={action}
      paymentAction={action}
    />
  );
}

function editInstructions() {
  fireEvent.change(screen.getByLabelText("Offline instructions (English)"), {
    target: { value: "Unsaved English instructions" },
  });
  fireEvent.change(screen.getByLabelText("Offline instructions (Chinese)"), {
    target: { value: "未保存的中文说明" },
  });
}

describe("MerchantOperationsView offline instructions", () => {
  it("keeps bilingual drafts when other program details or filters are refreshed", () => {
    const { rerender, container } = render(operations(program));
    editInstructions();

    rerender(operations({ ...program, updatedAt: "2026-07-01T00:00:00.000Z" }, {
      selectedEventSlug: "event-456",
      selectedStatus: "paid",
    }));

    expect(screen.getByLabelText("Offline instructions (English)")).toHaveValue("Unsaved English instructions");
    expect(screen.getByLabelText("Offline instructions (Chinese)")).toHaveValue("未保存的中文说明");
    expect(container.querySelector('input[name="returnEvent"]')).toHaveValue("event-456");
    expect(container.querySelector('input[name="returnStatus"]')).toHaveValue("paid");
  });

  it.each([
    ["English", { paymentInstructionsEn: "Updated English instructions" }],
    ["Chinese", { paymentInstructionsZh: "已发布的中文说明" }],
  ] as const)("resets both drafts when published %s instructions change", (_language, update) => {
    const { rerender } = render(operations(program));
    editInstructions();
    const updatedProgram = { ...program, ...update };

    rerender(operations(updatedProgram));

    expect(screen.getByLabelText("Offline instructions (English)")).toHaveValue(updatedProgram.paymentInstructionsEn);
    expect(screen.getByLabelText("Offline instructions (Chinese)")).toHaveValue(updatedProgram.paymentInstructionsZh);
  });

  it("does not carry drafts to a different program with identical published instructions", () => {
    const { rerender, container } = render(operations(program));
    editInstructions();

    rerender(operations({ ...program, id: "program-456" }));

    expect(screen.getByLabelText("Offline instructions (English)")).toHaveValue(program.paymentInstructionsEn);
    expect(screen.getByLabelText("Offline instructions (Chinese)")).toHaveValue(program.paymentInstructionsZh);
    expect(container.querySelector('input[name="programId"]')).toHaveValue("program-456");
  });
});
