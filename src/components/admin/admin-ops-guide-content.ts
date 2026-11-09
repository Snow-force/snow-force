import type { Bilingual } from "@/lib/types";

export type OpsGuideStep = {
  id: string;
  title: Bilingual;
  instruction: Bilingual;
  check: Bilingual;
  href: string;
  action: Bilingual;
};
export type OpsGuide = { id: string; title: Bilingual; description: Bilingual; steps: OpsGuideStep[] };

export const opsGuides: OpsGuide[] = [
  {
    id: "daily", title: { en: "Daily shift", zh: "每日值班" },
    description: { en: "Find urgent work, follow up conversations, and hand over a shift.", zh: "找到优先待办、跟进合作咨询，并完成交班。" },
    steps: [
      { id: "daily-queue", title: { en: "Start with the work queue", zh: "先看待办，再开始处理" },
        instruction: { en: "Check for an incomplete-data warning, then work down the queue. People, Payments, and Publishing filters help you focus; search accepts English and Chinese names or event titles.", zh: "先检查是否有数据不完整提示，再按队列顺序处理。可按人员、款项、内容发布筛选，也可搜索中英文姓名或活动名称。" },
        check: { en: "Open the record and verify the attendee and event before acting. Return and reload the desk after changes.", zh: "操作前打开记录，核对参与者与活动；处理后返回并刷新工作台。" },
        href: "#ops-work-queue", action: { en: "Go to work queue", zh: "查看待办队列" } },
      { id: "daily-partners", title: { en: "Read new partner inquiries", zh: "跟进新的合作咨询" },
        instruction: { en: "Expand an organization under New partner conversations to read its message and contact details. Draft email reply opens your email app for you to review and send.", zh: "展开“新的合作咨询”中的机构名称，阅读消息与联系方式。“起草邮件回复”会打开邮件应用，由你审核并发送。" },
        check: { en: "Opening a draft does not send mail or change the inquiry status. Check whether another colleague has already replied.", zh: "打开草稿不会发送邮件，也不会更新咨询状态。回复前请确认是否已有同事跟进。" },
        href: "#inquiries", action: { en: "Go to partner conversations", zh: "查看合作咨询" } },
      { id: "daily-handoff", title: { en: "Leave a clear handoff", zh: "留下清楚的交班信息" },
        instruction: { en: "Reload the desk, then use Copy shift brief and paste the summary into your staff handoff channel. The brief covers the full queue even while filters are active.", zh: "刷新工作台后，点击“复制交班简报”，自行粘贴到团队交接渠道。简报始终汇总完整队列，不受当前筛选影响。" },
        check: { en: "The brief contains task counts, not attendee details. If data is incomplete, resolve it or explain the gap to the next shift.", zh: "简报只包含待办数量，不包含参与者个人信息。如数据不完整，请先解决或向接班同事说明。" },
        href: "#ops-shift-handoff", action: { en: "Go to shift handoff", zh: "查看交班简报" } },
    ],
  },
  {
    id: "events", title: { en: "Publish an event", zh: "活动发布" },
    description: { en: "Prepare a draft, check registration settings, and share the event.", zh: "从活动草稿到报名设置，再到检查发布与推广。" },
    steps: [
      { id: "events-draft", title: { en: "Prepare event details", zh: "建立活动草稿" },
        instruction: { en: "In Events, create a new event or edit a draft. Complete the date, meeting time and locations, cover, and activity details. Review both visible language panels.", zh: "进入活动管理，新建活动或编辑草稿。填写日期、集合时间与地点、封面及活动详情，并检查同时显示的中英文内容。" },
        check: { en: "Keep the event as a draft until logistics and participant-facing information are ready.", zh: "行程与对外信息未确认前，请保留草稿状态。" },
        href: "/admin/events", action: { en: "Open Events", zh: "打开活动管理" } },
      { id: "events-registration", title: { en: "Set the registration rules", zh: "设置报名规则与费用" },
        instruction: { en: "In the event editor, review capacity, registration deadline, approval and waitlist settings, participant questions, and the Free / Deposit / Full prepay payment model.", zh: "在活动编辑器中核对名额、报名截止时间、审核与候补设置、参与者问题，以及免费／定金／全额预付的付款模式。" },
        check: { en: "Capacity 0 means unlimited. Verify amounts, currency, cancellation rules, and required questions before publishing.", zh: "名额为 0 表示不限名额。发布前核对金额、币种、取消规则及必填问题。" },
        href: "/admin/events", action: { en: "Review event settings", zh: "检查活动设置" } },
      { id: "events-publish", title: { en: "Preview, publish, and promote", zh: "预览后发布，再开始推广" },
        instruction: { en: "Use the editor preview to review the participant experience. Publish and verify the registration state in Events. Use Event promotion to prepare the event’s promotional material.", zh: "通过编辑器预览检查参与者看到的内容。发布后，在活动管理中确认报名状态；再进入活动推广准备宣传素材。" },
        check: { en: "Publishing and opening registration are separate decisions. Confirm that the event is ready to accept registrations before sharing it.", zh: "发布活动与开启报名是两个决定。分享前确认活动已准备好接受报名。" },
        href: "/admin/events/promotion", action: { en: "Open Event promotion", zh: "打开活动推广" } },
    ],
  },
  {
    id: "registrations", title: { en: "Registrations & refunds", zh: "报名与退款" },
    description: { en: "Find the right attendee and understand payment and cancellation decisions.", zh: "准确找到参与者，理解报名、款项与取消退款的处理顺序。" },
    steps: [
      { id: "registrations-find", title: { en: "Find and verify the attendee", zh: "找到并核对报名记录" },
        instruction: { en: "Choose the event in Registrations, then search by attendee name, email, or phone. Use payment and approval filters to narrow the list.", zh: "在报名管理中选择活动，再按参与者姓名、邮箱或电话搜索。可结合付款和审核状态筛选。" },
        check: { en: "Several attendees may share a booker’s contact email. Verify the attendee name and event before changing a record or exporting it.", zh: "多人代报名可能共用报名人的联系邮箱。修改或导出前，请核对参与者姓名和活动。" },
        href: "/admin/registrations", action: { en: "Open Registrations", zh: "打开报名管理" } },
      { id: "registrations-finance", title: { en: "Separate deposit and settlement", zh: "区分定金与最终结算" },
        instruction: { en: "Review the recorded deposit, currency, payment method, final amount, and settlement status. Follow up pending balances only after checking the source payment information.", zh: "检查已记录的定金、币种、付款方式、最终金额与结算状态。跟进待付尾款前，先核对付款来源信息。" },
        check: { en: "Stripe-managed payment fields follow the payment workflow. A settlement label does not prove a payment or refund succeeded.", zh: "Stripe 管理的付款字段应通过付款流程处理。结算标签不能证明付款或退款成功。" },
        href: "/admin/registrations", action: { en: "Review payment records", zh: "核对款项记录" } },
      { id: "registrations-cancel", title: { en: "Review cancellation, then refund", zh: "先审核取消，再单独执行退款" },
        instruction: { en: "Use the Cancellation requests panel to read the reason and review the decision. A pending request retains the place; approval cancels it. An approved refund requires a separate explicit execution.", zh: "在“取消申请”面板中阅读原因并审核。待审核申请仍保留名额；批准后取消名额。批准退款后，还需要单独明确执行退款。" },
        check: { en: "Only authorized admins can perform restricted actions. If controls are unavailable, ask an admin. Verify refund status before retrying to avoid duplicate operations.", zh: "受限操作仅限有权限的管理员。若看不到操作控件，请联系管理员；重试前核对退款状态，避免重复操作。" },
        href: "/admin/registrations#cancellations", action: { en: "Open cancellation review", zh: "打开取消申请审核" } },
    ],
  },
  {
    id: "onsite", title: { en: "Check-in & recaps", zh: "现场与回顾" },
    description: { en: "Run arrival check-in, collect feedback, and publish the recap.", zh: "完成现场签到、收集反馈，并整理活动回顾。" },
    steps: [
      { id: "onsite-checkin", title: { en: "Open check-in on arrival", zh: "到场时开启签到" },
        instruction: { en: "In Check-in & Reviews, choose the event and open its check-in campaign when participants arrive. Use the event’s check-in tools to record attendance.", zh: "进入“签到与反馈”，选择活动，在参与者到场时开启签到，并使用该活动的签到工具记录出勤。" },
        check: { en: "Confirm that you are managing the correct event before distributing its check-in QR code.", zh: "发放签到二维码前，确认当前管理的是正确活动。" },
        href: "/admin/reviews", action: { en: "Open Check-in & Reviews", zh: "打开签到与反馈" } },
      { id: "onsite-review", title: { en: "Collect feedback after the event", zh: "活动后开启反馈" },
        instruction: { en: "Open Review from the event’s check-in and review screen. Review uses the event’s saved feedback setup and automatically closes Check-in; archiving is not required first.", zh: "在该活动的签到与反馈页面开启反馈。反馈使用活动已保存的问卷设置，并会自动关闭签到，无需先归档活动。" },
        check: { en: "Review moderation and consent before publishing participant feedback.", zh: "公开参与者反馈前，请检查审核状态与公开授权。" },
        href: "/admin/reviews", action: { en: "Manage event feedback", zh: "管理活动反馈" } },
      { id: "onsite-recap", title: { en: "Prepare and publish the recap", zh: "整理并发布活动回顾" },
        instruction: { en: "Archiving an event creates a recap draft. In Recaps, edit the draft, add photos, choose a cover, and review the content before publishing.", zh: "归档活动会生成回顾草稿。在回顾管理中编辑草稿、添加照片、选择封面，检查内容后再发布。" },
        check: { en: "Check photo permissions and the public preview. A draft recap is not visible to visitors until published.", zh: "检查照片使用授权与公开预览。回顾草稿在发布前不会向访客展示。" },
        href: "/admin/recaps", action: { en: "Open Recaps", zh: "打开回顾管理" } },
    ],
  },
  {
    id: "logistics", title: { en: "Merchants & lodging", zh: "商家与住宿" },
    description: { en: "Understand booth operations and optional lodging configuration.", zh: "了解商家摊位流程，以及活动可选的住宿配置。" },
    steps: [
      { id: "logistics-merchants", title: { en: "Review and allocate merchant booths", zh: "审核商家并分配摊位" },
        instruction: { en: "In Merchants, choose the event, review applications, allocate booth codes, and provide offline payment instructions. Record payment only after confirming it was received.", zh: "在商家摊位中选择活动，审核申请、分配摊位编号，并提供线下付款说明。确认收到款项后再登记付款。" },
        check: { en: "Application approval, booth allocation, and payment are distinct steps. Merchant booth payments use the offline workflow.", zh: "申请获批、摊位分配与付款是不同步骤。商家摊位使用线下付款流程。" },
        href: "/admin/merchants", action: { en: "Open Merchants", zh: "打开商家摊位" } },
      { id: "logistics-lodging", title: { en: "Configure lodging only when needed", zh: "按需配置住宿，普通活动可跳过" },
        instruction: { en: "If lodging management is enabled, maintain hotels, room types, and activity packages in the independent Lodging module. Choose the activity first; lodging is optional even for multi-day events.", zh: "启用住宿管理后，在独立的住宿模块维护酒店、房型和活动套餐。先选择活动；即使多日活动，住宿也不是必选。" },
        check: { en: "Packages use fixed per-person prices including lodging; internal hotel costs are separate. Current lodging packages are staff drafts, not public room sales. Ask an admin if the module is unavailable.", zh: "套餐采用包含住宿的固定每人价格，内部酒店成本单独记录。当前住宿套餐仅供工作人员准备草稿，不是公开售房。模块不可用时请联系管理员。" },
        href: "/admin/lodging", action: { en: "Open Lodging", zh: "打开住宿管理" } },
    ],
  },
];

export type OpsGuideProgress = { guideId: string; stepIndex: number; completed: string[] };
export const opsGuideStorageKey = "snowforce:ops-guide:v1";
export const initialOpsGuideProgress: OpsGuideProgress = { guideId: "daily", stepIndex: 0, completed: [] };

export function parseOpsGuideProgress(raw: string | null): OpsGuideProgress {
  if (!raw) return { ...initialOpsGuideProgress, completed: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return { ...initialOpsGuideProgress, completed: [] };
    const stored = value as Record<string, unknown>;
    const guide = opsGuides.find((item) => item.id === stored.guideId) ?? opsGuides[0];
    const validIds = new Set(opsGuides.flatMap((item) => item.steps.map((step) => step.id)));
    return {
      guideId: guide.id,
      stepIndex: typeof stored.stepIndex === "number" && Number.isInteger(stored.stepIndex) && stored.stepIndex >= 0 && stored.stepIndex < guide.steps.length ? stored.stepIndex : 0,
      completed: Array.isArray(stored.completed) ? [...new Set(stored.completed.filter((id): id is string => typeof id === "string" && validIds.has(id)))] : [],
    };
  } catch {
    return { ...initialOpsGuideProgress, completed: [] };
  }
}
