# Admin FAQ Editor Design

## 目标 (Objective)
在管理后台提供 FAQ (常见问题) 的编辑功能，支持双语（中英）的侧并侧(side-by-side)对照编辑，并且集成已有的 Google Translate API 实现一键同步翻译功能，提升运营管理效率。

## 架构 & 组件 (Architecture & Components)

1. **入口列表 (`src/app/admin/faq/page.tsx`)**
   - 顶部增加“添加 FAQ”按钮，跳转至 `/admin/faq/new`。
   - 列表操作列中在“删除”旁增加“编辑”按钮，跳转至 `/admin/faq/[id]`。

2. **编辑页面 (`src/app/admin/faq/[id]/page.tsx`)**
   - 作为一个 Server Component，负责获取数据（如果是已有 FAQ，则通过 `getFAQ(id)` 获取初始数据）。
   - 引入客户端组件 `FaqEditorForm`。

3. **编辑器表单组件 (`src/components/admin/faq-editor-form.tsx`)**
   - 状态管理：存储 FAQ 的 `question` (双语), `answer` (双语), `category` (双语), `order` (数字)。
   - 布局：左侧显示英文输入框组合，右侧显示中文输入框组合，形成天然的对比。
   - 集成 `<AdminTranslateMissingButton>`：提供“中 -> 英”和“英 -> 中”的一键翻译按钮，利用已有的 `/admin/translate` 后端接口将未填写的语言自动翻译补全。

4. **Server Actions (`src/lib/faqs/actions.ts`)**
   - 新建 `saveFAQAction(data: FAQItem, isNew: boolean)`。
   - 在执行具体操作前必须调用 `await requireAdmin()` 进行权限校验。
   - 调用现有的 `createFAQ` 或 `updateFAQ` 函数（目前为内存存储）。
   - 调用 `revalidatePath("/admin/faq")` 来刷新列表页面缓存。

## 错误处理与验证 (Error Handling & Validation)
- 当请求的 `[id]` 在 repository 中不存在时，使用 Next.js 的 `notFound()` 机制。
- Server Action 需捕捉异常并返回合适的错误信息（例如未授权）。

## 结论 (Conclusion)
该方案完全契合项目中 `AGENTS.md` 规定的 Admin 后台双语设计规范，并复用了已经验证过的活动管理中的翻译模块，保证了架构的一致性和用户体验。
