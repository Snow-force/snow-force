import { describe, expect, it } from "vitest";

import { adminCopy } from "./admin-copy";

describe("adminCopy", () => {
  it("keeps admin event workflow labels bilingual", () => {
    expect(adminCopy.events.title.zh).toBe("活动管理");
    expect(adminCopy.editor.save.en).toBe("Save Event");
    expect(adminCopy.editor.basicInfo.en).toBe("Basic info");
    expect(adminCopy.editor.registrationSettings.en).toBe("Registration settings");
    expect(adminCopy.editor.participantQuestions.en).toBe("Participant questions");
    expect(adminCopy.editor.eventDetailModules.en).toBe("Event detail modules");
    expect(adminCopy.editor.previewAndPublish.en).toBe("Preview and publish");
    expect(adminCopy.editor.meetLocation.en).toBe("Meet location");
    expect(adminCopy.editor.activityLocation.en).toBe("Activity location");
    expect(adminCopy.editor.invalidJson.en).toBe("Enter valid JSON array before saving.");
    expect(adminCopy.editor.addQuestion.en).toBe("Add question");
    expect(adminCopy.editor.addModule.en).toBe("Add module");
    expect(adminCopy.editor.copy.en).toBe("Copy");
    expect(adminCopy.editor.moveUp.en).toBe("Move up");
    expect(adminCopy.editor.moveDown.en).toBe("Move down");
    expect(adminCopy.editor.collapse.en).toBe("Collapse");
    expect(adminCopy.editor.expand.en).toBe("Expand");
    expect(adminCopy.editor.questionKey.zh).toBe("字段标识");
    expect(adminCopy.editor.questionLabelZh.zh).toBe("中文问题");
    expect(adminCopy.editor.questionOptionsZh.zh).toBe("中文选项，每行一条");
    expect(adminCopy.editor.uploadCoverImage.en).toBe("Upload cover image");
    expect(adminCopy.editor.coverUploadHelp.zh).toBe("支持 6MB 以内 JPG、PNG、WebP 或 GIF。");
    expect(adminCopy.editor.coverUploaded.zh).toBe("封面已上传。");
    expect(adminCopy.shell.signOut.zh).toBe("退出");
  });
});
