from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "snowforce-checkin-review-proposal-zh.pdf"
REGULAR_FONT = Path(r"C:\Windows\Fonts\Deng.ttf")
BOLD_FONT = Path(r"C:\Windows\Fonts\Dengb.ttf")

PAGE_WIDTH, PAGE_HEIGHT = A4
BLUE = colors.HexColor("#005BEA")
DARK = colors.HexColor("#15171B")
MUTED = colors.HexColor("#5D687A")
LIGHT_BLUE = colors.HexColor("#EEF5FF")
LIGHT_GRAY = colors.HexColor("#F5F7FA")
BORDER = colors.HexColor("#DCE3ED")
GREEN = colors.HexColor("#147D4B")
LIGHT_GREEN = colors.HexColor("#ECF8F1")
AMBER = colors.HexColor("#9A6700")
LIGHT_AMBER = colors.HexColor("#FFF8E6")
RED = colors.HexColor("#B42318")
LIGHT_RED = colors.HexColor("#FFF1F0")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Deng", str(REGULAR_FONT)))
    pdfmetrics.registerFont(TTFont("Deng-Bold", str(BOLD_FONT)))
    pdfmetrics.registerFontFamily(
        "Deng",
        normal="Deng",
        bold="Deng-Bold",
        italic="Deng",
        boldItalic="Deng-Bold",
    )


register_fonts()

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="SFTitle",
        fontName="Deng-Bold",
        fontSize=27,
        leading=36,
        textColor=DARK,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="SFSubtitle",
        fontName="Deng",
        fontSize=13,
        leading=21,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="SFH1",
        fontName="Deng-Bold",
        fontSize=19,
        leading=26,
        textColor=DARK,
        spaceBefore=4,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="SFH2",
        fontName="Deng-Bold",
        fontSize=13,
        leading=19,
        textColor=DARK,
        spaceBefore=8,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="SFBody",
        fontName="Deng",
        fontSize=10,
        leading=16,
        textColor=colors.HexColor("#303744"),
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="SFSmall",
        fontName="Deng",
        fontSize=8.3,
        leading=12.5,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="SFTable",
        fontName="Deng",
        fontSize=8.2,
        leading=12,
        textColor=colors.HexColor("#303744"),
    )
)
styles.add(
    ParagraphStyle(
        name="SFTableHead",
        fontName="Deng-Bold",
        fontSize=8.4,
        leading=12,
        textColor=DARK,
    )
)
styles.add(
    ParagraphStyle(
        name="SFBadge",
        fontName="Deng-Bold",
        fontSize=9,
        leading=13,
        textColor=BLUE,
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="SFCoverMeta",
        fontName="Deng",
        fontSize=9,
        leading=15,
        textColor=MUTED,
        alignment=TA_LEFT,
    )
)


def p(text: str, style: str = "SFBody") -> Paragraph:
    return Paragraph(text, styles[style])


def bullet(text: str, level: int = 0) -> Paragraph:
    return Paragraph(
        escape(text),
        ParagraphStyle(
            name=f"Bullet{level}",
            parent=styles["SFBody"],
            leftIndent=12 + level * 12,
            firstLineIndent=-8,
            bulletIndent=0 + level * 12,
            spaceAfter=3,
        ),
        bulletText="-",
    )


def section_title(number: str, title: str) -> Table:
    data = [
        [
            Paragraph(number, styles["SFBadge"]),
            Paragraph(title, styles["SFH1"]),
        ]
    ]
    table = Table(data, colWidths=[16 * mm, 156 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), LIGHT_BLUE),
                ("BOX", (0, 0), (0, 0), 0.8, colors.HexColor("#B8D2FF")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (0, 0), 4),
                ("RIGHTPADDING", (0, 0), (0, 0), 4),
                ("TOPPADDING", (0, 0), (0, 0), 5),
                ("BOTTOMPADDING", (0, 0), (0, 0), 5),
                ("LEFTPADDING", (1, 0), (1, 0), 8),
                ("RIGHTPADDING", (1, 0), (1, 0), 0),
            ]
        )
    )
    return table


def info_box(title: str, body: str, tone: str = "blue") -> Table:
    palette = {
        "blue": (LIGHT_BLUE, BLUE),
        "green": (LIGHT_GREEN, GREEN),
        "amber": (LIGHT_AMBER, AMBER),
        "red": (LIGHT_RED, RED),
        "gray": (LIGHT_GRAY, MUTED),
    }
    background, accent = palette[tone]
    table = Table(
        [[p(f"<b>{escape(title)}</b>", "SFBody"), p(escape(body), "SFBody")]],
        colWidths=[38 * mm, 134 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.8, accent),
                ("LINEBEFORE", (0, 0), (0, -1), 3, accent),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def data_table(headers: list[str], rows: list[list[str]], widths: list[float]) -> Table:
    content = [[p(escape(cell), "SFTableHead") for cell in headers]]
    content.extend([[p(escape(cell), "SFTable") for cell in row] for row in rows])
    table = Table(content, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), DARK),
                ("GRID", (0, 0), (-1, -1), 0.45, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
            ]
        )
    )
    return table


def flow_table(items: list[tuple[str, str]]) -> Table:
    cells: list[Paragraph] = []
    widths: list[float] = []
    available = 172 * mm
    connector_width = 5 * mm
    box_width = (available - connector_width * (len(items) - 1)) / len(items)
    for index, (title, desc) in enumerate(items):
        cells.append(p(f"<b>{escape(title)}</b><br/><font size='8'>{escape(desc)}</font>", "SFSmall"))
        widths.append(box_width)
        if index < len(items) - 1:
            cells.append(p("->", "SFBadge"))
            widths.append(connector_width)
    table = Table([cells], colWidths=widths)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]
    for index in range(0, len(cells), 2):
        commands.extend(
            [
                ("BACKGROUND", (index, 0), (index, 0), LIGHT_BLUE),
                ("BOX", (index, 0), (index, 0), 0.7, colors.HexColor("#B8D2FF")),
                ("LEFTPADDING", (index, 0), (index, 0), 5),
                ("RIGHTPADDING", (index, 0), (index, 0), 5),
                ("TOPPADDING", (index, 0), (index, 0), 8),
                ("BOTTOMPADDING", (index, 0), (index, 0), 8),
            ]
        )
    table.setStyle(TableStyle(commands))
    return table


class ProposalDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=19 * mm,
            rightMargin=19 * mm,
            topMargin=20 * mm,
            bottomMargin=18 * mm,
            title="SnowForce 现场 Check-in 与活动 Review 功能方案",
            author="SnowForce",
            subject="同事评审稿",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="main",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(
            [
                PageTemplate(id="proposal", frames=[frame], onPage=self.draw_header_footer),
            ]
        )

    def draw_header_footer(self, canvas, doc) -> None:
        canvas.saveState()
        if doc.page > 1:
            canvas.setStrokeColor(BORDER)
            canvas.setLineWidth(0.5)
            canvas.line(19 * mm, PAGE_HEIGHT - 13 * mm, PAGE_WIDTH - 19 * mm, PAGE_HEIGHT - 13 * mm)
            canvas.setFont("Deng", 7.5)
            canvas.setFillColor(MUTED)
            canvas.drawString(19 * mm, PAGE_HEIGHT - 10 * mm, "SnowForce - Check-in 与 Review 功能方案")
            canvas.drawRightString(PAGE_WIDTH - 19 * mm, PAGE_HEIGHT - 10 * mm, "同事评审稿")
        canvas.setFont("Deng", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(19 * mm, 10 * mm, "2026-07-29 | 尚未开始开发")
        canvas.drawRightString(PAGE_WIDTH - 19 * mm, 10 * mm, f"第 {doc.page} 页")
        canvas.restoreState()


def build_story() -> list:
    story: list = []

    # Cover
    story.extend(
        [
            Spacer(1, 22 * mm),
            Table(
                [[p("SNOWFORCE", "SFBadge")]],
                colWidths=[35 * mm],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BLUE),
                        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#B8D2FF")),
                        ("TOPPADDING", (0, 0), (-1, -1), 6),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ]
                ),
            ),
            Spacer(1, 16 * mm),
            p("现场 Check-in 与活动 Review<br/>功能方案", "SFTitle"),
            p(
                "会员到场扫码签到，活动结束后收集高质量反馈，支持活动级问卷与可选礼品配置",
                "SFSubtitle",
            ),
            Spacer(1, 16 * mm),
            info_box(
                "文档状态",
                "同事评审稿。用于确认产品流程、数据模型、技术风险和验收标准；尚未开始功能开发。",
                "amber",
            ),
            Spacer(1, 10 * mm),
            data_table(
                ["项目", "内容"],
                [
                    ["版本", "V1 评审稿"],
                    ["日期", "2026-07-29"],
                    ["适用系统", "SnowForce Next.js 14 / Supabase 会员与活动平台"],
                    ["主要决策", "Check-in 才标记 attended；Review 与 Archive 解耦；礼品为可选配置"],
                ],
                [38 * mm, 134 * mm],
            ),
            Spacer(1, 19 * mm),
            p(
                "<b>评审目标</b><br/>确认本方案后再进入数据库迁移、界面开发、测试与部署阶段。",
                "SFSubtitle",
            ),
            PageBreak(),
        ]
    )

    # Executive summary
    story.extend(
        [
            section_title("01", "决策摘要"),
            Spacer(1, 4 * mm),
            info_box(
                "不提前 Archive",
                "活动现场仍保持正常业务状态。Check-in、Review Campaign、Archive 和 Recap 是独立生命周期。",
                "green",
            ),
            Spacer(1, 4 * mm),
            data_table(
                ["决策", "方案"],
                [
                    ["到场认定", "会员到现场扫描 Check-in 二维码后才标记 attended"],
                    ["Review 资格", "只有 confirmed 且 attended 的会员可以填写"],
                    ["二维码", "Check-in 和 Review 使用两张不同的活动二维码"],
                    ["Review 内容", "平台提供默认模板，创建或编辑活动时允许调整"],
                    ["核心问题", "总体评分和改进建议不可删除，以保证统计和反馈质量"],
                    ["礼品", "每场活动独立设置是否有礼品、礼品说明和领取方式"],
                    ["结束页面", "根据无礼品、有礼品、超时、未签到等真实状态显示不同内容"],
                    ["公开展示", "只有经过审核并获得会员授权的内容才显示在 Recap"],
                ],
                [42 * mm, 130 * mm],
            ),
            Spacer(1, 7 * mm),
            p("完整流程", "SFH2"),
            flow_table(
                [
                    ("Check-in", "扫码并标记 attended"),
                    ("活动进行", "保持 published"),
                    ("Review", "验证 attended 后填写"),
                    ("感谢页面", "按礼品配置展示"),
                    ("Archive", "后续创建 Recap 草稿"),
                ]
            ),
            Spacer(1, 7 * mm),
            info_box(
                "重要边界",
                "Review 扫码只验证 attendance，不会补写 attended。未签到会员必须联系工作人员处理漏签。",
                "blue",
            ),
            PageBreak(),
        ]
    )

    # Check-in
    story.extend(
        [
            section_title("02", "现场 Check-in"),
            p("正常流程", "SFH2"),
            bullet("管理员在活动开始前开启 Check-in Campaign，默认有效期 2 小时。"),
            bullet("现场展示活动专属 Check-in 二维码。"),
            bullet("会员登录后扫码，系统验证邮箱、会员资料和 confirmed 报名。"),
            bullet("验证成功后记录 attended、来源 checkin_qr 和首次签到时间。"),
            bullet("重复扫码保持幂等，直接显示已完成 Check-in。"),
            Spacer(1, 5 * mm),
            data_table(
                ["报名情况", "Check-in 结果", "是否写入 attended"],
                [
                    ["confirmed + 已验证会员", "成功", "是"],
                    ["confirmed + 已经 attended", "显示已签到", "不覆盖首次时间"],
                    ["cancelled", "拒绝", "否"],
                    ["waitlist", "拒绝", "否"],
                    ["没有报名", "拒绝", "否"],
                    ["未验证邮箱", "引导完成验证", "否"],
                    ["Campaign 关闭或过期", "签到已结束", "否"],
                ],
                [62 * mm, 55 * mm, 55 * mm],
            ),
            Spacer(1, 6 * mm),
            p("后台现场视图", "SFH2"),
            bullet("显示 confirmed、已签到、未签到人数及签到比例。"),
            bullet("支持关闭、延长和重新生成二维码；重新生成后旧码立即失效。"),
            bullet("工作人员可处理漏签或错误状态，但会员扫码是默认签到方式。"),
            Spacer(1, 5 * mm),
            info_box(
                "已知风险",
                "共用二维码被转发时，另一名 confirmed 会员可能远程签到。通过短时有效、现场展示和及时关闭降低风险，但无法完全消除。",
                "amber",
            ),
            PageBreak(),
        ]
    )

    # Review flow
    story.extend(
        [
            section_title("03", "活动结束后的 Review"),
            p("开启 Review", "SFH2"),
            bullet("管理员点击开始收集 Review。"),
            bullet("系统自动关闭仍开放的 Check-in Campaign。"),
            bullet("系统复制当时的问卷、感谢语和礼品配置，形成不可变的 Campaign 快照。"),
            bullet("Review 二维码默认开放 90 分钟，可提前关闭或延长。"),
            Spacer(1, 4 * mm),
            p("扫码资格", "SFH2"),
            data_table(
                ["条件", "要求"],
                [
                    ["身份", "已登录且邮箱已验证"],
                    ["报名", "属于本人且状态为 confirmed"],
                    ["到场", "attendance_status 必须为 attended"],
                    ["Campaign", "存在、开放且未过期"],
                    ["重复提交", "同一报名只能保存一份 Review"],
                ],
                [45 * mm, 127 * mm],
            ),
            Spacer(1, 6 * mm),
            info_box(
                "填写缓冲",
                "会员在二维码关闭前取得填写权限后，至少保留 15 分钟完成表单，避免关闭 Campaign 时中断正在填写的人。",
                "blue",
            ),
            Spacer(1, 6 * mm),
            p("提高 Review 质量的原则", "SFH2"),
            bullet("整体控制在约 3 分钟完成，降低现场流失。"),
            bullet("同时要求写出做得好的一点和需要改进的一点，避免只有星级。"),
            bullet("礼品用于感谢完成反馈，与评分高低、是否公开、是否批准无关。"),
            bullet("用户答案保留原始语言，不自动翻译或改写。"),
            PageBreak(),
        ]
    )

    # Default template
    story.extend(
        [
            section_title("04", "默认 Review 模板"),
            p(
                "新活动自动获得下列模板。管理员可在活动编辑器中修改非核心问题、增加问题、调整顺序和预览手机端表单。",
                "SFBody",
            ),
            data_table(
                ["Key", "问题", "类型", "默认规则"],
                [
                    ["overall_rating", "总体评分", "1-5 星", "必填、可匿名公开、不可删除"],
                    ["organization_rating", "活动组织评分", "1-5 星", "默认必填、可编辑或删除"],
                    ["leader_rating", "领队或教练评分", "1-5 星", "选填、允许不适用"],
                    ["favorite_parts", "最喜欢的环节", "多选", "最多选择 3 项"],
                    ["best_part", "做得最好的一点", "长文本", "默认必填，20-600 字"],
                    ["improvement", "最需要改进的一点", "长文本", "必填、仅后台、不可删除"],
                    ["join_again", "再次参加意愿", "单选", "愿意 / 看活动 / 不愿意"],
                ],
                [34 * mm, 46 * mm, 32 * mm, 60 * mm],
            ),
            Spacer(1, 7 * mm),
            p("活动创建时允许编辑", "SFH2"),
            bullet("修改中英文问题标题、帮助文字和选项。"),
            bullet("修改非核心问题的必填状态、公开属性和顺序。"),
            bullet("增加或删除非核心问题。"),
            bullet("支持 1-5 星、单选、多选、是/否、短文本和长文本。"),
            bullet("支持一键恢复默认模板和手机端预览。"),
            Spacer(1, 6 * mm),
            info_box(
                "固定保护",
                "overall_rating 必须保留为必填 1-5 星；improvement 必须保留为必填内部长文本。公开授权复选框属于系统字段，活动管理员不能删除。",
                "green",
            ),
            PageBreak(),
        ]
    )

    # Config lifecycle
    story.extend(
        [
            section_title("05", "问卷配置、版本与快照"),
            p("活动保存 `reviewConfig`，包含：", "SFBody"),
            bullet("version：配置版本。"),
            bullet("questions：问题、类型、双语文案、选项、顺序、必填和隐私属性。"),
            bullet("thankYouCopy：活动级双语感谢语，可为空并回退平台默认。"),
            bullet("reward：礼品开关、双语礼品说明和领取方式。"),
            Spacer(1, 5 * mm),
            data_table(
                ["场景", "系统行为"],
                [
                    ["创建新活动", "自动调用统一默认模板"],
                    ["编辑尚未开放的 Review", "保存为活动当前配置"],
                    ["开启 Review Campaign", "复制完整配置快照"],
                    ["Campaign 开放中继续编辑活动", "只影响下一次开启，不改变当前表单"],
                    ["查看历史答案", "使用提交时的 Campaign 快照解释问题"],
                    ["平台默认模板升级", "不覆盖已有活动，除非管理员主动恢复默认"],
                ],
                [58 * mm, 114 * mm],
            ),
            Spacer(1, 7 * mm),
            info_box(
                "为什么需要快照",
                "如果活动问题在提交后被改名或删除，历史答案仍必须保留原问题含义。Campaign 快照提供稳定的审计和展示依据。",
                "blue",
            ),
            Spacer(1, 6 * mm),
            p("验证要求", "SFH2"),
            bullet("问题 key 在活动内唯一，保存后不可改名。"),
            bullet("服务端只接受快照中存在的 key，并按类型、长度和必填规则验证。"),
            bullet("未知问题类型、重复 key 或破坏核心问题的配置不能保存或开启 Campaign。"),
            PageBreak(),
        ]
    )

    # Reward
    story.extend(
        [
            section_title("06", "可选礼品与结束页面"),
            p("活动级礼品配置", "SFH2"),
            data_table(
                ["字段", "说明"],
                [
                    ["reward.enabled", "是否有现场感谢礼品"],
                    ["reward.description", "双语礼品名称或说明"],
                    ["reward.redemptionInstructions", "双语领取地点和方式"],
                ],
                [60 * mm, 112 * mm],
            ),
            Spacer(1, 6 * mm),
            p("无礼品活动", "SFH2"),
            info_box(
                "感谢你的认真反馈",
                "你的反馈已成功提交，将帮助我们持续改进之后的 SnowForce 活动。",
                "green",
            ),
            bullet("不出现礼品图标、礼品卡片或向工作人员出示的提示。"),
            bullet("管理员可覆盖双语感谢语；未填写时使用平台默认。"),
            Spacer(1, 5 * mm),
            p("有礼品活动", "SFH2"),
            info_box(
                "现场感谢礼品",
                "显示活动配置的礼品说明和领取方式，并提示向工作人员出示当前页面。每位符合条件的会员限领一次，礼品以现场实际库存为准。",
                "blue",
            ),
            bullet("成功页面不能承诺礼品已预留或保证领取。"),
            bullet("礼品信息使用 Campaign 快照，避免现场期间被活动编辑覆盖。"),
            bullet("第一版人工确认，没有库存和核销记录，存在重复出示风险。"),
            PageBreak(),
        ]
    )

    # End-state copy
    story.extend(
        [
            section_title("07", "结束与异常页面文案"),
            data_table(
                ["状态", "标题", "页面行为"],
                [
                    ["提交成功、无礼品", "感谢你的认真反馈", "显示感谢语和返回会员中心"],
                    ["提交成功、有礼品", "感谢你的认真反馈", "感谢语下显示礼品说明和领取方式"],
                    ["Campaign 已结束", "本次反馈收集已结束", "感谢参与，不显示礼品"],
                    ["填写权限已过期", "填写时间已结束", "不显示提交成功或礼品"],
                    ["没有 attended", "暂时无法填写 Review", "提示联系工作人员确认签到"],
                    ["已经提交", "Review 已提交", "显示真实提交时间和当时的结束页面"],
                    ["写入失败", "暂时无法提交", "保留表单并允许重试，不显示礼品"],
                ],
                [43 * mm, 48 * mm, 81 * mm],
            ),
            Spacer(1, 8 * mm),
            info_box(
                "文案原则",
                "页面必须反映真实状态。只有数据库确认 Review 保存成功，并且活动配置了礼品时，才能显示礼品领取信息。",
                "green",
            ),
            Spacer(1, 7 * mm),
            p("默认英文感谢文案", "SFH2"),
            p(
                "<b>Thank you for your thoughtful feedback</b><br/>"
                "Your feedback has been submitted and will help us improve future SnowForce events.",
                "SFBody",
            ),
            PageBreak(),
        ]
    )

    # Technical design
    story.extend(
        [
            section_title("08", "数据与技术实现"),
            data_table(
                ["对象", "关键数据"],
                [
                    [
                        "registrations",
                        "attendance_status、attendance_source、attendance_marked_at",
                    ],
                    [
                        "events",
                        "review_config JSONB，包含版本、问题、感谢语和礼品配置",
                    ],
                    [
                        "event_qr_campaigns",
                        "event_slug、purpose、access_code、status、时间窗口、review_config_snapshot",
                    ],
                    [
                        "event_qr_accesses",
                        "campaign_id、registration_id、scanned_at、access_expires_at、result",
                    ],
                    [
                        "event_reviews",
                        "registration_id、campaign_id、overall_rating、answers、公开授权、审核状态",
                    ],
                ],
                [45 * mm, 127 * mm],
            ),
            Spacer(1, 6 * mm),
            p("关键服务端操作", "SFH2"),
            bullet("Check-in：验证身份和报名，原子写入扫码记录与 attended。"),
            bullet("开启 Review：关闭 Check-in，验证配置并创建快照。"),
            bullet("Review Access：只验证 attended，不修改 attendance。"),
            bullet("提交 Review：按快照验证答案，同一报名保持唯一。"),
            bullet("公开读取：只返回审核通过、取得授权且标记为公开的字段。"),
            Spacer(1, 6 * mm),
            info_box(
                "认证回跳",
                "现有安全回跳白名单需要加入严格匹配的 Check-in 和 Review 路由，并覆盖密码、Magic Link 与 Google OAuth。",
                "amber",
            ),
            Spacer(1, 6 * mm),
            p("二维码生成", "SFH2"),
            bullet("复用现有服务端 qrcode 依赖，但 Check-in、Review 与活动分享使用不同 URL。"),
            bullet("展示版约 512px，打印版约 1024px，清晰标注 CHECK-IN 或 REVIEW。"),
            bullet("access_code 使用高随机度唯一值；重新生成后旧码失效。"),
            PageBreak(),
        ]
    )

    # Security
    story.extend(
        [
            section_title("09", "权限、隐私与安全"),
            bullet("所有新增 public schema 表启用 RLS。"),
            bullet("二维码只包含 Campaign code，不包含会员、报名或活动内部信息。"),
            bullet("会员和 registration_id 必须由服务端基于 Supabase Auth 查询，不能信任客户端提交。"),
            bullet("Check-in 与 Review access 使用数据库唯一约束和幂等写入。"),
            bullet("内部改进建议永不进入公共 DTO。"),
            bullet("Supabase secret/service key 只允许在服务器端仓储使用。"),
            bullet("新表的 Data API grants 和暴露状态必须在迁移后显式验证。"),
            Spacer(1, 7 * mm),
            data_table(
                ["公开 Recap 可返回", "绝不公开"],
                [
                    ["总体评分及评价数量", "会员 ID、邮箱、完整姓名"],
                    ["会员同意公开的正面反馈", "改进建议和内部问题"],
                    ["掩码显示名", "Campaign access code"],
                    ["经过审核的公开答案", "审核备注和管理字段"],
                ],
                [86 * mm, 86 * mm],
            ),
            Spacer(1, 8 * mm),
            info_box(
                "Supabase 原则",
                "RLS 负责数据库层防护，服务端仍需执行身份、报名、attendance、Campaign 和问题快照的完整业务校验。",
                "blue",
            ),
            Spacer(1, 6 * mm),
            p("参考", "SFH2"),
            p(
                "Supabase Row Level Security: "
                "https://supabase.com/docs/guides/database/postgres/row-level-security",
                "SFSmall",
            ),
            p(
                "Supabase Data API exposure change: "
                "https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically",
                "SFSmall",
            ),
            PageBreak(),
        ]
    )

    # Risks
    story.extend(
        [
            section_title("10", "主要风险与处理"),
            data_table(
                ["风险", "处理方案", "剩余限制"],
                [
                    [
                        "Check-in 二维码被转发",
                        "短时有效、现场展示、及时关闭、高随机 code",
                        "无法完全防止其他 confirmed 会员远程签到",
                    ],
                    [
                        "两张二维码混用",
                        "不同 URL、不同 code、明显标题和现场切换流程",
                        "仍需现场人员正确操作",
                    ],
                    [
                        "问题修改影响历史答案",
                        "开启 Campaign 时保存完整配置快照",
                        "管理员需理解修改只影响下一次开启",
                    ],
                    [
                        "礼品造成评分偏高",
                        "明确礼品与评分高低无关，并要求填写改进建议",
                        "激励仍可能产生一定选择偏差",
                    ],
                    [
                        "礼品重复领取",
                        "显示会员名和服务端提交时间，由工作人员人工确认",
                        "第一版没有真正核销能力",
                    ],
                    [
                        "写入部分成功",
                        "事务或数据库 RPC、唯一约束、幂等重试",
                        "需要数据库集成测试",
                    ],
                    [
                        "本地与远端迁移分歧",
                        "实施前核对 migration history，在隔离环境验证",
                        "不得盲目执行生产 db push",
                    ],
                ],
                [44 * mm, 76 * mm, 52 * mm],
            ),
            PageBreak(),
        ]
    )

    # Testing
    story.extend(
        [
            section_title("11", "测试与验收"),
            p("核心自动测试", "SFH2"),
            bullet("confirmed 会员 Check-in 后正确标记 attended；取消、候补、无报名不能签到。"),
            bullet("重复 Check-in 不改变首次签到时间。"),
            bullet("开启 Review 自动关闭 Check-in。"),
            bullet("Review 扫码不修改 attendance。"),
            bullet("只有 attended 会员能取得 Review 权限。"),
            bullet("默认模板、核心问题保护、自定义问题和配置快照正确。"),
            bullet("伪造问题 key、错误类型、超长文本和重复提交被拒绝。"),
            bullet("无礼品页面不出现任何礼品文案；有礼品页面显示说明和库存免责声明。"),
            bullet("Campaign 结束、权限过期、未签到、重复提交和写入失败显示正确页面。"),
            bullet("公共 Recap 不包含内部建议、身份信息、access code 或审核备注。"),
            Spacer(1, 6 * mm),
            p("交付前验证", "SFH2"),
            data_table(
                ["验证", "要求"],
                [
                    ["数据库", "隔离环境执行 migration，验证约束、事务、索引和 RLS"],
                    ["安全", "运行 Supabase advisors 并检查 Data API grants"],
                    ["自动测试", "npm test"],
                    ["覆盖率", "npm run test:coverage"],
                    ["构建", "npm run build"],
                    ["差异检查", "git diff --check"],
                    ["现场验收", "完整走通 Check-in -> Review -> 结束页面 -> Archive"],
                ],
                [45 * mm, 127 * mm],
            ),
            PageBreak(),
        ]
    )

    # Approval checklist
    checks = [
        "认可 Check-in 和 Review 使用两张二维码。",
        "认可只有 Check-in 才标记 attended，Review 不补写到场。",
        "认可活动无需提前 Archive。",
        "认可 Review 使用默认模板并允许活动级编辑。",
        "认可总体评分和改进建议为不可删除的核心问题。",
        "认可 Review 开启时保存问卷、感谢语和礼品配置快照。",
        "认可礼品为可选配置，不做库存和一次性核销。",
        "认可无礼品、有礼品、结束、超时和未签到使用不同页面文案。",
        "认可默认 Check-in 2 小时、Review 90 分钟、填写缓冲 15 分钟。",
        "认可审核并取得授权后才公开 Review。",
        "接受共用 Check-in 二维码被转发的剩余风险。",
    ]
    story.extend(
        [
            section_title("12", "同事评审确认清单"),
            p("请逐项确认；如有修改，在备注区域记录后再进入开发。", "SFBody"),
            Spacer(1, 3 * mm),
        ]
    )
    for item in checks:
        story.append(
            Table(
                [[p("[  ]", "SFTableHead"), p(escape(item), "SFBody")]],
                colWidths=[12 * mm, 160 * mm],
                style=TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDER),
                        ("TOPPADDING", (0, 0), (-1, -1), 5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ]
                ),
            )
        )
    story.extend(
        [
            Spacer(1, 7 * mm),
            p("评审备注", "SFH2"),
            Table(
                [[""], [""], [""]],
                colWidths=[172 * mm],
                rowHeights=[14 * mm, 14 * mm, 14 * mm],
                style=TableStyle(
                    [
                        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                    ]
                ),
            ),
            Spacer(1, 8 * mm),
            data_table(
                ["确认人", "日期", "结论"],
                [["", "", "通过 / 修改后通过 / 重新评审"]],
                [60 * mm, 45 * mm, 67 * mm],
            ),
            Spacer(1, 8 * mm),
            info_box(
                "下一步",
                "同事确认本评审稿后，再开始 schema migration、活动编辑器、Check-in、Review、后台审核及完整测试的实施。",
                "green",
            ),
        ]
    )

    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = ProposalDocTemplate(str(OUTPUT))
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
