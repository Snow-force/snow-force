import type { EventRecap } from "@/lib/types";

export const seedRecaps: EventRecap[] = [
  {
    slug: "2025-season-finale",
    status: "published",
    title: {
      en: "2025 Season Finale — Spring Session",
      zh: "2025 雪季收官 — 春雪派对",
    },
    summary: {
      en: "We closed out the 2025 season with sunshine, slushy turns, and a epic BBQ. Over 60 riders joined for a day of spring laps, a best-trick contest, and an unforgettable après.",
      zh: "在阳光、春雪和史诗级烧烤中，我们为 2025 雪季画上句号。60 多位滑手参与了春日滑行、最佳技巧赛和难忘的雪后派对。",
    },
    content: {
      en: `The 2025 Season Finale was everything we hoped for and more. With bluebird skies and soft spring snow, riders of all levels spent the day lapping the mountain together.\n\nThe highlight of the day was the impromptu best-trick contest on the lower park jumps. Riders threw down everything from method grabs to backside 360s, with the crowd cheering from the deck.\n\nAs the sun set, we fired up the grills for an epic BBQ, shared season stories, and handed out some fun awards. Special thanks to everyone who made the 2025 season one to remember.`,
      zh: `2025 雪季收官活动超出了所有人的预期。晴空万里，春雪柔软，各个水平的滑手一起刷遍了雪场。\n\n当天最精彩的是下半公园跳台的即兴最佳技巧赛。从 method grab 到 backside 360，选手们各显神通，观众在平台上呐喊助威。\n\n日落时分，我们点燃烤炉享受 BBQ，分享雪季故事，并颁发了一些趣味奖项。特别感谢每一位让 2025 雪季变得难忘的伙伴。`,
    },
    date: "2025-03-22",
    location: {
      en: "Zhangjiakou Genting Snow Park",
      zh: "张家口云顶滑雪公园",
    },
    coverImage: "/images/recaps/2025-finale-cover.jpg",
    media: [
      { url: "/images/recaps/2025-finale-1.jpg", caption: { en: "Group shot at the peak", zh: "山顶大合影" } },
      { url: "/images/recaps/2025-finale-2.jpg", caption: { en: "Best trick contest", zh: "最佳技巧赛" } },
      { url: "/images/recaps/2025-finale-3.jpg", caption: { en: "Sunset BBQ", zh: "日落烧烤" } },
    ],
    tags: {
      en: ["Season Finale", "Spring", "BBQ", "Contest"],
      zh: ["雪季收官", "春雪", "烧烤", "比赛"],
    },
    seoTitle: {
      en: "SnowForce 2025 Season Finale Recap",
      zh: "SnowForce 2025 雪季收官回顾",
    },
    seoDescription: {
      en: "Sunshine, spring snow, and an epic BBQ — relive the SnowForce 2025 season finale with over 60 riders.",
      zh: "阳光、春雪和烧烤盛宴 — 重温 SnowForce 2025 雪季收官，60+ 滑手参与。",
    },
  },
  {
    slug: "night-session-jan-2025",
    status: "published",
    title: {
      en: "Full Moon Night Session",
      zh: "满月夜滑专场",
    },
    summary: {
      en: "A magical night under the lights with 40 riders. Night laps, hot chocolate, and a full moon made this one of our most memorable events of the season.",
      zh: "灯光下的魔幻灯会，40 位滑手参与。夜场滑行、热巧克力和满月，成就了本雪季最难忘的活动之一。",
    },
    content: {
      en: `There's something special about riding under the lights with a full moon overhead. Our January night session brought together 40 riders for an evening of groomer laps, park laps under the lights, and a cozy après with hot chocolate and snacks.\n\nThe snow held up surprisingly well through the night, and the park crew set up a special line just for our session. We're definitely making this a regular thing.`,
      zh: `满月当空、灯光璀璨下滑行，有着说不出的魔力。我们一月的夜滑专场聚集了 40 位滑手，在灯光下刷雪道、玩公园，最后以热巧克力和小食的温暖雪后派对收尾。\n\n当晚雪况出奇地好，公园维护团队还专门为我们搭建了一条特别线路。这绝对会成为固定项目。`,
    },
    date: "2025-01-18",
    location: {
      en: "Beijing Nanshan Ski Resort",
      zh: "北京南山滑雪场",
    },
    coverImage: "/images/recaps/night-session-cover.jpg",
    media: [
      { url: "/images/recaps/night-session-1.jpg", caption: { en: "Full moon rising over the park", zh: "满月从公园上方升起" } },
      { url: "/images/recaps/night-session-2.jpg", caption: { en: "Night laps crew", zh: "夜滑小队" } },
    ],
    tags: {
      en: ["Night Riding", "Full Moon", "Park", "Social"],
      zh: ["夜滑", "满月", "公园", "社交"],
    },
    seoTitle: {
      en: "Full Moon Night Session Recap — SnowForce",
      zh: "满月夜滑专场回顾 — SnowForce",
    },
    seoDescription: {
      en: "40 riders, full moon, and perfectly groomed night laps. Relive the SnowForce night session.",
      zh: "40 位滑手、满月与完美压雪夜场。重温 SnowForce 夜滑专场。",
    },
  },
];
