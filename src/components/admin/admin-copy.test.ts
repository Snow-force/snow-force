import { describe, expect, it } from "vitest";

import { adminCopy } from "./admin-copy";

describe("adminCopy", () => {
  it("keeps admin event workflow labels bilingual", () => {
    expect(adminCopy.events.title.zh).toBe("活动管理");
    expect(adminCopy.editor.save.en).toBe("Save Event");
    expect(adminCopy.shell.signOut.zh).toBe("退出");
  });
});
