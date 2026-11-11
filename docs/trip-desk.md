# Trip desk

The user supplied the bilingual event-page conversation patch and desktop/mobile references, and confirmed that it should be integrated after the image recovery release. Keep that design: a floating desktop panel and a full-screen mobile conversation, suggested questions, free text, citations to event briefing sections and a registration handoff.

Answers use the current event's published fields and payment/registration settings. No external model, new service, business-data write or paid dependency is needed. The conversation does not book places, process payments, approve registrations or guarantee beginner suitability. Missing information points to the organizer. Refund intent takes priority over payment instructions, and claims about riding level must be explicit in published content.

Use the existing React/Next.js, language context and event availability rules. Keep the source patch's public interfaces. Correct citations to match visible briefing sections. On mobile, contain focus, lock background scrolling and restore the appropriate focus on close or citation navigation. Desktop remains a non-modal panel.

## 管理员说明

- 在活动编辑页填写并发布活动费用、付款方式、付款说明、集合时间和地点；助手直接使用这些信息。
- 退款问题读取已发布的退款模块；装备准备读取须知；行程读取概览、亮点和行程模块。
- 若活动适合新手或有水平限制，请在概览、亮点、行程或须知中明确写出。报名表里的水平选项不代表适合所有水平。
- 未公布的信息会提示顾客联系领队。助手不会替顾客提交报名、收费或承诺名额，实际报名仍按现有流程处理。
- 对话只保留在当前页面，不会自动发给领队；需要真人帮助时，请按助手提供的邮箱或微信自行联系。名额信息来自页面加载，最终以报名时核验为准。

## Verification

Verify bilingual questions, mixed deposit/refund questions, missing and hidden module content, approval requirements, unlimited/full/closed registration, citation navigation, reduced motion and mobile keyboard/focus/scroll behavior. Run the complete test suite, coverage, production build and browser checks before publishing.
