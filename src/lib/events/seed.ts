import type { Event } from "@/lib/types";

export const seedEvents: Event[] = [
  {
    slug: "snowforce-kickoff-2026",
    status: "published",
    registrationState: "open",
    title: {
      en: "SnowForce 2026 Season Kickoff",
      zh: "SnowForce 2026 雪季开板活动",
    },
    subtitle: {
      en: "Start the season strong with technique workshops and group rides",
      zh: "技术工作坊加团队滑行，强势开启新雪季",
    },
    description: {
      en: `Join us for the official SnowForce season kickoff! This full-day event includes morning technique workshops tailored to your level, an afternoon group ride, and an evening social with food and drinks. Whether you're a first-timer or a seasoned rider, there's something for everyone.`,
      zh: `加入 SnowForce 官方雪季开板活动！全天活动包括上午按水平分组的技术工作坊、下午团队滑行，以及晚上的聚餐社交环节。无论你是新手还是老炮，这里都有适合你的内容。`,
    },
    highlights: {
      en: [
        "Level-specific technique workshops with certified instructors",
        "Group ride through the best terrain",
        "Evening social with food, drinks, and season preview",
        "Exclusive SnowForce starter kit for first-time participants",
      ],
      zh: [
        "持证教练按水平分组的技术教学",
        "最佳地形团队滑行",
        "晚间聚餐社交与新雪季预告",
        "首次参与可获 SnowForce 专属新手礼包",
      ],
    },
    audienceLevel: {
      en: "All levels — groups split by ability",
      zh: "全水平 — 按能力分组",
    },
    schedule: {
      en: `09:00 – Check-in & welcome coffee\n09:30 – Morning technique workshops\n12:00 – Lunch break\n13:30 – Afternoon group ride\n16:30 – Après social & season preview\n18:00 – Dinner (optional)`,
      zh: `09:00 – 签到与欢迎咖啡\n09:30 – 上午技术工作坊\n12:00 – 午餐休息\n13:30 – 下午团队滑行\n16:30 – 雪后社交与新雪季预告\n18:00 – 晚餐（可选）`,
    },
    location: {
      en: "Zhangjiakou Genting Snow Park",
      zh: "张家口云顶滑雪公园",
    },
    locationUrl: "https://maps.google.com/?q=Genting+Snow+Park+Zhangjiakou",
    feeInfo: {
      en: "Event participation is free. Lift ticket and meals at your own cost. Dinner approximately ¥150/person.",
      zh: "活动参与免费。雪票和午餐自理。晚餐约 ¥150/人。",
    },
    notices: {
      en: [
        "Please bring your own equipment or rent on-site",
        "Helmets are strongly recommended for all participants",
        "Weather-appropriate clothing is essential",
        "Registration closes 48 hours before the event",
      ],
      zh: [
        "请自备装备或在雪场租赁",
        "强烈建议所有参与者佩戴头盔",
        "请根据天气穿着合适衣物",
        "活动开始前48小时截止报名",
      ],
    },
    coverImage: "/images/events/kickoff-cover.jpg",
    media: [],
    capacity: 80,
    registrationCount: 34,
    registrationOpenAt: "2026-10-01T00:00:00Z",
    registrationCloseAt: "2026-11-13T00:00:00Z",
    eventStartAt: "2026-11-15T09:00:00+08:00",
    eventEndAt: "2026-11-15T18:00:00+08:00",
    registrationFields: [
      { key: "name", label: { en: "Full Name", zh: "姓名" }, type: "text", required: true, placeholder: { en: "Your full name", zh: "请输入姓名" } },
      { key: "email", label: { en: "Email", zh: "邮箱" }, type: "email", required: true, placeholder: { en: "your@email.com", zh: "请输入邮箱" } },
      { key: "phone", label: { en: "Phone", zh: "电话" }, type: "tel", required: true, placeholder: { en: "Your phone number", zh: "请输入电话" } },
      { key: "experience", label: { en: "Riding Experience", zh: "滑雪经验" }, type: "select", required: true, options: { en: ["Beginner", "Intermediate", "Advanced", "Expert"], zh: ["新手", "中级", "高级", "专家"] } },
      { key: "notes", label: { en: "Notes / Special Requests", zh: "备注 / 特殊需求" }, type: "textarea", required: false, placeholder: { en: "Anything we should know?", zh: "有什么我们需要了解的？" } },
    ],
    tags: {
      en: ["Kickoff", "All Levels", "Workshop", "Social"],
      zh: ["开板", "全水平", "工作坊", "社交"],
    },
    seoTitle: {
      en: "SnowForce 2026 Season Kickoff — Join the Ride",
      zh: "SnowForce 2026 雪季开板活动 — 一起开滑",
    },
    seoDescription: {
      en: "Join SnowForce for the 2026 season kickoff with technique workshops, group rides, and evening social. All levels welcome.",
      zh: "参加 SnowForce 2026 雪季开板活动，包含技术工作坊、团队滑行和晚间社交。全水平欢迎。",
    },
  },
  {
    slug: "park-skills-2026",
    status: "published",
    registrationState: "open",
    title: {
      en: "Park Skills Weekend",
      zh: "公园技巧周末",
    },
    subtitle: {
      en: "Two days of park progression with experienced coaches",
      zh: "两天公园进阶训练，经验丰富教练带队",
    },
    description: {
      en: `Take your park riding to the next level with our Park Skills Weekend. Over two days, experienced coaches will guide you through progressive park features, from basic boxes to advanced jumps. Small groups ensure plenty of individual feedback.`,
      zh: `通过公园技巧周末提升你的公园水平。两天时间里，经验丰富的教练将带你逐步挑战公园道具，从基础盒子到高级跳台。小班教学确保充足的个人指导。`,
    },
    highlights: {
      en: [
        "Progressive feature progression at your pace",
        "Small groups (max 6 per coach)",
        "Video analysis and individual feedback",
        "Evening theory session on park safety and etiquette",
      ],
      zh: [
        "按你的节奏逐步挑战道具",
        "小班教学（每组不超过6人）",
        "视频分析与个人反馈",
        "晚间理论课讲解公园安全与礼仪",
      ],
    },
    audienceLevel: {
      en: "Intermediate and above — must be comfortable on blue runs",
      zh: "中级及以上 — 需能自如滑行蓝道",
    },
    schedule: {
      en: `Day 1\n09:00 – Check-in & group assignment\n09:30 – Morning session: boxes & rails\n12:00 – Lunch\n13:30 – Afternoon: small jumps & grabs\n16:30 – Video review\n\nDay 2\n09:00 – Morning: medium jumps & spins\n12:00 – Lunch\n13:30 – Afternoon: line building & flow\n16:00 – Wrap-up & next steps`,
      zh: `第一天\n09:00 – 签到与分组\n09:30 – 上午训练：盒子与杆\n12:00 – 午餐\n13:30 – 下午训练：小跳台与抓板\n16:30 – 视频回顾\n\n第二天\n09:00 – 上午训练：中跳台与转体\n12:00 – 午餐\n13:30 – 下午训练：线路串联与流畅度\n16:00 – 总结与后续计划`,
    },
    location: {
      en: "Zhangjiakou Thaiwoo Ski Resort",
      zh: "张家口太舞滑雪小镇",
    },
    locationUrl: "https://maps.google.com/?q=Thaiwoo+Ski+Resort+Zhangjiakou",
    feeInfo: {
      en: "¥600/person (coaching only). Lift tickets, meals, and accommodation not included.",
      zh: "¥600/人（仅教练费）。雪票、餐饮和住宿自理。",
    },
    notices: {
      en: [
        "Park-specific safety gear required (helmet, back protector recommended)",
        "Bring your own park board or rent on-site",
        "Registration closes 72 hours before the event",
        "Minimum 8 participants required for the event to run",
      ],
      zh: [
        "需配备公园专用护具（建议头盔和护背）",
        "自备公园板或在雪场租赁",
        "活动开始前72小时截止报名",
        "满8人成团",
      ],
    },
    coverImage: "/images/events/park-skills-cover.jpg",
    media: [],
    capacity: 24,
    registrationCount: 18,
    registrationOpenAt: "2026-11-01T00:00:00Z",
    registrationCloseAt: "2026-12-10T00:00:00Z",
    eventStartAt: "2026-12-13T09:00:00+08:00",
    eventEndAt: "2026-12-14T16:00:00+08:00",
    registrationFields: [
      { key: "name", label: { en: "Full Name", zh: "姓名" }, type: "text", required: true },
      { key: "email", label: { en: "Email", zh: "邮箱" }, type: "email", required: true },
      { key: "phone", label: { en: "Phone", zh: "电话" }, type: "tel", required: true },
      { key: "experience", label: { en: "Riding Experience", zh: "滑雪经验" }, type: "select", required: true, options: { en: ["Intermediate", "Advanced", "Expert"], zh: ["中级", "高级", "专家"] } },
      { key: "parkExperience", label: { en: "Park Experience", zh: "公园经验" }, type: "select", required: true, options: { en: ["Never tried", "Tried a few times", "Comfortable on small features", "Comfortable on medium features"], zh: ["没试过", "试过几次", "小道具自如", "中道具自如"] } },
      { key: "notes", label: { en: "Notes", zh: "备注" }, type: "textarea", required: false },
    ],
    tags: {
      en: ["Park", "Freestyle", "Intermediate+", "Weekend"],
      zh: ["公园", "自由式", "中级以上", "周末"],
    },
    seoTitle: {
      en: "Park Skills Weekend — SnowForce Freestyle Training",
      zh: "公园技巧周末 — SnowForce 自由式训练",
    },
    seoDescription: {
      en: "Two-day park progression camp with experienced coaches. Small groups, video analysis, progressive features. Intermediate and above.",
      zh: "两天公园进阶训练营，经验教练带队，小班教学，视频分析，逐步挑战道具。中级及以上水平。",
    },
  },
];

export const defaultRegistrationFields = [
  { key: "name", label: { en: "Full Name", zh: "姓名" }, type: "text" as const, required: true },
  { key: "email", label: { en: "Email", zh: "邮箱" }, type: "email" as const, required: true },
  { key: "phone", label: { en: "Phone", zh: "电话" }, type: "tel" as const, required: true },
  { key: "experience", label: { en: "Riding Experience", zh: "滑雪经验" }, type: "select" as const, required: true, options: { en: ["Beginner", "Intermediate", "Advanced", "Expert"], zh: ["新手", "中级", "高级", "专家"] } },
  { key: "notes", label: { en: "Notes", zh: "备注" }, type: "textarea" as const, required: false },
];
