import type { FAQItem } from "@/lib/types";

export const seedFAQs: FAQItem[] = [
  {
    id: "1",
    question: { en: "What is SnowForce?", zh: "SnowForce 是什么？" },
    answer: {
      en: "SnowForce is a community-driven snow sports platform that organizes events, training sessions, and social gatherings for riders of all levels. We are based mainly in the United States, with activities in other regions too. We're about progression, community, and sharing the stoke.",
      zh: "SnowForce 是一个社群驱动的滑雪平台，为各水平滑手组织活动、培训和社交聚会。我们主要在美国开展活动，也会在其他地区组织聚会。我们关注进步、社群和分享热情。",
    },
    category: { en: "General", zh: "一般问题" },
    order: 1,
  },
  {
    id: "2",
    question: { en: "Do I need to be an expert to join?", zh: "我需要是高手才能参加吗？" },
    answer: {
      en: "Not at all! We welcome riders of all levels. Many events have groups split by ability, and we clearly mark the required level for each event. If you're new, look for events marked 'All Levels' or 'Beginner Friendly'.",
      zh: '完全不需要！我们欢迎各个水平的滑手。很多活动按能力分组，我们也会清楚标注每个活动所需水平。如果你是新手，可以找标注「全水平」或「新手友好」的活动。',
    },
    category: { en: "Participation", zh: "参与相关" },
    order: 2,
  },
  {
    id: "3",
    question: { en: "How do I register for an event?", zh: "如何报名活动？" },
    answer: {
      en: "Browse events on our site, sign in as a verified SnowForce member, and fill out the registration form. After submitting, go to your member home and click Confirm so the registration enters the staff list.",
      zh: "浏览我们网站上的活动，点击你感兴趣的活动，填写报名表单即可。报名成功后会收到确认邮件。注册不需要账号，但创建账号后下次报名更快捷。",
    },
    category: { en: "Participation", zh: "参与相关" },
    order: 3,
  },
  {
    id: "4",
    question: { en: "How much do events cost?", zh: "活动费用是多少？" },
    answer: {
      en: "Many SnowForce community events are free to join. Overnight trips may collect a deposit first for lodging, food, or shared supplies, then settle the final amount after the trip based on room assignment and actual costs. Check each event's fee details for specifics.",
      zh: "很多 SnowForce 社群活动免费参与。部分专项训练活动会收取教练费。除特别说明外，参与者需自理雪票、装备和餐饮。具体请查看每个活动的费用说明。",
    },
    category: { en: "Cost", zh: "费用相关" },
    order: 4,
  },
  {
    id: "5",
    question: { en: "What if I need to cancel my registration?", zh: "如果需要取消报名怎么办？" },
    answer: {
      en: "You can cancel by contacting SnowForce through the member channel or the site. Please cancel as early as possible so we can offer the spot to someone on the waitlist.",
      zh: "你可以通过回复确认邮件或通过网站联系我们取消报名。请尽早取消，以便我们将名额释放给候补的朋友。",
    },
    category: { en: "Participation", zh: "参与相关" },
    order: 5,
  },
  {
    id: "6",
    question: { en: "Can I bring friends who aren't registered?", zh: "可以带未报名的朋友来吗？" },
    answer: {
      en: "Each participant needs to register individually so we can manage group sizes, safety, and communications properly. Please have your friends register through the site.",
      zh: "每位参与者需要单独报名，以便我们妥善管理人数、安全和沟通。请让你的朋友通过网站报名。",
    },
    category: { en: "Participation", zh: "参与相关" },
    order: 6,
  },
  {
    id: "7",
    question: { en: "What safety gear do I need?", zh: "需要什么安全装备？" },
    answer: {
      en: "Helmets are strongly recommended (and required for park events). For park-specific events, additional protective gear such as back protectors and impact shorts is recommended. Check individual event notices for specific safety requirements.",
      zh: "强烈建议佩戴头盔（公园活动必须佩戴）。公园专项活动建议额外配备护背和护臀等护具。请查看单个活动的注意事项了解具体安全要求。",
    },
    category: { en: "Safety", zh: "安全相关" },
    order: 7,
  },
  {
    id: "8",
    question: { en: "How do I get to the event locations?", zh: "如何到达活动地点？" },
    answer: {
      en: "Most events take place at ski resorts across the United States, with occasional trips to other regions. We share transportation details and carpool options in our community chat — check the event details for logistics info.",
      zh: "大部分活动在美国的滑雪场，偶尔也会前往其他地区。我们会在社群里分享交通和拼车信息 — 请查看活动详情了解出行信息。",
    },
    category: { en: "Logistics", zh: "出行相关" },
    order: 8,
  },
];
