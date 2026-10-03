export type Localized = { en: string; zh: string };
export type Category = "outerwear" | "kids" | "goggles" | "accessories";
export type Brand = "VECTOR" | "BURTON" | "ISEE MIGGA" | "PSN" | "REV";
export type ShopProduct = {
  slug: string;
  brand: Brand;
  category: Category;
  name: Localized;
  description: Localized;
  referencePrice: number;
  colors: Localized[];
  sizes: string[];
  source: { file: string; page: number };
};

export const categories: { id: Category | "all"; label: Localized }[] = [
  { id: "all", label: { en: "All gear", zh: "全部装备" } },
  { id: "outerwear", label: { en: "Snow apparel", zh: "滑雪服饰" } },
  { id: "kids", label: { en: "Little riders", zh: "儿童装备" } },
  { id: "goggles", label: { en: "Goggles", zh: "滑雪镜" } },
  { id: "accessories", label: { en: "Helmets & accessories", zh: "头盔与配件" } },
];
export const brands: Brand[] = ["VECTOR", "BURTON", "ISEE MIGGA", "PSN", "REV"];
const adult = "2026FW VECTOR成人产品手册.pdf";
const kids = "2026FW VECTOR儿童产品手册.pdf";
const burton = "26-27 BURTON softgoods-1222.pdf";
const apparel = "2026 雪服选货清单图册 - 8.10更新.pdf";
const accessories = "ISEE MIGGA 配件选款图册-26.2.4.pdf";
const psn = "PSN_2026-27_Alpine_Collection(1).pdf";
const rev = "REV 2026 产品手册(1).pdf";
const adultSizes = ["XS", "S", "M", "L", "XL", "XXL"];
const childSizes = ["110", "120", "130", "140", "150", "160"];

// Curated from the supplied catalogs. These CNY catalog prices are not sale offers.
// Empty sizes mean the source does not establish a size range for that item.
export const products: ShopProduct[] = [
  {
    slug: "vector-insnow-dusk", brand: "VECTOR", category: "outerwear",
    name: { en: "Insnow Dusk softshell jacket", zh: "Insnow Dusk 软壳开襟滑雪服" },
    description: { en: "All Mountain softshell with four-way stretch and a graphene fleece lining. Catalog waterproof rating: ≥10,000 mm.", zh: "全能系列，四面弹软壳贴合石墨烯摇粒绒。图册标注防水 ≥10,000 mm，配备雪卡袋与防风袖口。" },
    referencePrice: 699, sizes: adultSizes,
    colors: [{ en: "Dawn pink", zh: "晨曦粉" }, { en: "Blue-purple", zh: "蓝调紫" }, { en: "Dusk purple", zh: "夜幕紫" }, { en: "Sunset red", zh: "幻日红" }],
    source: { file: adult, page: 13 },
  },
  {
    slug: "vector-voyager", brand: "VECTOR", category: "outerwear",
    name: { en: "Voyager insulated jacket", zh: "Voyager 加棉撞色开襟滑雪服" },
    description: { en: "All Mountain insulated jacket with SORONA fill, snow skirt and contrasting zippers. Catalog waterproof rating: ≥20,000 mm.", zh: "全能系列，SORONA 生物基填充、腰部防雪裙、撞色拉链与双重防风袖口。图册标注防水 ≥20,000 mm。" },
    referencePrice: 799, sizes: adultSizes,
    colors: [{ en: "Black", zh: "经典黑" }, { en: "White", zh: "松雾白" }, { en: "Lilac", zh: "兰花紫" }, { en: "Ice blue", zh: "冰川蓝" }, { en: "Pink", zh: "树莓粉" }, { en: "Green", zh: "越野绿" }, { en: "Purple", zh: "青藤紫" }],
    source: { file: adult, page: 15 },
  },
  {
    slug: "isee-barbie-set", brand: "ISEE MIGGA", category: "outerwear",
    name: { en: "Rhinestone Barbie snow set", zh: "满钻芭比滑雪套装" },
    description: { en: "A pink snow apparel set from the Autumn 2026 collection. Ask us to confirm the available size and set contents.", zh: "2026 秋季选款图册中的粉色滑雪套装。具体尺码与套装配置请咨询确认。" },
    referencePrice: 2560, sizes: [], colors: [{ en: "Pink", zh: "粉色" }], source: { file: apparel, page: 2 },
  },
  {
    slug: "burton-acamar-jacket", brand: "BURTON", category: "outerwear",
    name: { en: "Women's [ak] Acamar GORE-TEX PRO 3L jacket", zh: "女式 [ak] Acamar GORE-TEX PRO 三层夹克" },
    description: { en: "Technical three-layer GORE-TEX Pro shell with a regular articulated fit and zip vents, as described in the 26/27 catalog.", zh: "图册所载专业级三层 GORE-TEX Pro 面料、常规立体剪裁与拉链式透气口。" },
    referencePrice: 6998, sizes: ["XXS", ...adultSizes], colors: [{ en: "True Black", zh: "True Black 黑色" }, { en: "Nightshade / Purple Voltage", zh: "Nightshade / Purple Voltage 紫色" }], source: { file: burton, page: 8 },
  },
  {
    slug: "isee-magnetic-goggles", brand: "ISEE MIGGA", category: "goggles",
    name: { en: "Magnetic goggles 2.0", zh: "磁吸雪镜 2.0" },
    description: { en: "Magnetic goggles in four catalog colorways. Confirm lens specifications and helmet fit before ordering.", zh: "图册提供四款配色。镜片规格、头盔适配与供货情况请在选购前确认。" },
    referencePrice: 399, sizes: [], colors: [{ en: "Sakura pink", zh: "落樱粉" }, { en: "Purple", zh: "幻夜紫" }, { en: "Black", zh: "暗影黑" }, { en: "Gray", zh: "暮岩灰" }], source: { file: accessories, page: 18 },
  },
  {
    slug: "rev-f3-carbon", brand: "REV", category: "accessories",
    name: { en: "F3 forged carbon Mips helmet", zh: "F3 逆鳞哑光锻造碳 Mips 头盔" },
    description: { en: "The F3 matte forged-carbon Mips model. Use your measured head circumference to choose the catalog size, then confirm fit.", zh: "F3 逆鳞哑光锻造碳 Mips 款。请按实测头围选择图册尺码，并咨询确认佩戴适配。" },
    referencePrice: 2280, sizes: ["M · 55–58 cm", "L · 58–61 cm", "XL · 61–63 cm"], colors: [{ en: "Matte carbon", zh: "逆鳞哑光" }], source: { file: rev, page: 14 },
  },
  {
    slug: "vector-rogue-kids", brand: "VECTOR", category: "kids",
    name: { en: "Rogue kids' insulated jacket", zh: "Rogue 儿童加棉滑雪服" },
    description: { en: "Kids' All Mountain jacket with SORONA fill, snow skirt and sleeve pass pocket. Catalog waterproof rating: ≥20,000 mm.", zh: "儿童全能系列，SORONA 生物基填充、内置雪镜袋、腰部防雪裙与雪卡袋。图册标注防水 ≥20,000 mm。" },
    referencePrice: 699, sizes: childSizes, colors: [{ en: "Racing red-blue", zh: "竞速红蓝" }, { en: "Pink / ice blue", zh: "粉雪冰蓝" }, { en: "Space blue", zh: "太空蓝" }, { en: "Ice blue", zh: "碎冰蓝" }], source: { file: kids, page: 12 },
  },
  {
    slug: "vector-kids-colorblock", brand: "VECTOR", category: "kids",
    name: { en: "Neon kids' relaxed pullover jacket", zh: "Neon 儿童宽松套头滑雪服" },
    description: { en: "A colorblock pullover from VECTOR's kids' All Mountain range, with an underarm side zipper and an adjustable hem.", zh: "VECTOR 儿童全能系列，配备腋下侧开拉链、储物大口袋与可调节下摆。" },
    referencePrice: 599, sizes: childSizes, colors: [{ en: "Lava orange", zh: "熔岩橙" }, { en: "Forest", zh: "山林秘径" }, { en: "Lake green", zh: "镜湖绿" }, { en: "Aurora pink", zh: "极光桃粉" }], source: { file: kids, page: 14 },
  },
  {
    slug: "psn-aspen", brand: "PSN", category: "outerwear",
    name: { en: "Aspen cropped down ski jacket", zh: "Aspen 短款羽绒滑雪服" },
    description: { en: "A cropped jacket with a 3L composite fabric, down insulation, removable hood and snow skirt. Price is for the jacket only.", zh: "3L 复合面料、95 拒水白鸭绒、可拆卸帽子与防风裙。参考价仅为外套，图片中的连体服不包含在内。" },
    referencePrice: 1899, sizes: [], colors: [{ en: "Sakura", zh: "樱花粉" }, { en: "Bleu Glacier", zh: "冰川蓝" }, { en: "Violet Glacé", zh: "冰晶紫" }], source: { file: psn, page: 3 },
  },
  {
    slug: "burton-acamar-bib", brand: "BURTON", category: "outerwear",
    name: { en: "Women's [ak] Acamar GORE-TEX PRO 3L bib", zh: "女式 [ak] Acamar GORE-TEX PRO 三层背带裤" },
    description: { en: "Technical three-layer GORE-TEX Pro shell with a stretch-woven upper and regular fit, as described in the catalog.", zh: "专业级三层 GORE-TEX Pro 防水透气面料，搭配弹力梭织上装设计与常规剪裁。" },
    referencePrice: 6398, sizes: ["XXS", ...adultSizes], colors: [{ en: "True Black", zh: "True Black 黑色" }, { en: "Nightshade Purple", zh: "Nightshade Purple 紫色" }], source: { file: burton, page: 8 },
  },
  {
    slug: "isee-monogram-set", brand: "ISEE MIGGA", category: "outerwear",
    name: { en: "Pink monogram snow set", zh: "粉色老花滑雪套装" },
    description: { en: "Pink monogram snow apparel from the Autumn 2026 catalog. Confirm sizes and set contents before ordering.", zh: "2026 秋季选款图册中的粉色老花套装。尺码与套装配置请咨询确认。" },
    referencePrice: 2560, sizes: [], colors: [{ en: "Pink", zh: "粉色" }], source: { file: apparel, page: 3 },
  },
  {
    slug: "isee-logo-gloves", brand: "ISEE MIGGA", category: "accessories",
    name: { en: "Raised-logo snow gloves", zh: "立体 logo 滑雪手套" },
    description: { en: "Raised-logo gloves in five catalog colorways. Ask us to confirm size and insulation details.", zh: "五款图册配色的立体 logo 手套。尺码与保暖规格请咨询确认。" },
    referencePrice: 239, sizes: [], colors: [{ en: "Black / white", zh: "黑白" }, { en: "Blue", zh: "蓝色" }, { en: "Purple", zh: "紫色" }, { en: "Pink / black", zh: "粉黑" }, { en: "Khaki", zh: "卡其" }], source: { file: accessories, page: 35 },
  },
  {
    slug: "isee-down-liner", brand: "ISEE MIGGA", category: "outerwear",
    name: { en: "Down layering jacket", zh: "羽绒内胆" },
    description: { en: "A layering piece from the accessories catalog, offered in black and white. Confirm size and fill specifications with us.", zh: "配件图册中的羽绒内胆，提供黑色和白色。具体尺码与填充规格请咨询确认。" },
    referencePrice: 499, sizes: [], colors: [{ en: "Black", zh: "黑色" }, { en: "White", zh: "白色" }], source: { file: accessories, page: 1 },
  },
  {
    slug: "isee-bunny-hoodie", brand: "ISEE MIGGA", category: "outerwear",
    name: { en: "Bunny-ear hoodie", zh: "兔耳朵卫衣" },
    description: { en: "A mint-green hoodie with a bunny-ear hood, featured in the accessories catalog. Confirm the size range before ordering.", zh: "配件图册中的薄荷绿兔耳朵卫衣。具体尺码范围请咨询确认。" },
    referencePrice: 499, sizes: [], colors: [{ en: "Mint green", zh: "薄荷绿" }], source: { file: accessories, page: 3 },
  },
];

export function productImage(product: ShopProduct) { return `/shop/${product.slug}.webp`; }
export function getProduct(slug: string) { return products.find((product) => product.slug === slug); }
// Fixed display-rate snapshot, not a live rate or a committed selling price.
// https://wise.com/us/currency-converter/usd-to-cny-rate/history/29-09-2026
export const USD_REFERENCE_RATE = { cnyPerUsd: 6.712, date: "2026-09-29" } as const;
export function usdReferencePrice(price: number) { return Math.round(price / USD_REFERENCE_RATE.cnyPerUsd * 100) / 100; }
export function formatUsdAmount(amount: number, lang: "en" | "zh") {
  return new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
export function formatReferencePrice(price: number, lang: "en" | "zh") { return formatUsdAmount(usdReferencePrice(price), lang); }
export type CatalogFilters = { category: Category | "all"; brand: Brand | "all"; query: string; sort: "featured" | "price-low" | "price-high" };
export const defaultCatalogFilters: CatalogFilters = { category: "all", brand: "all", query: "", sort: "featured" };
export function catalogFiltersFromSearchParams(params: Record<string, string | string[] | undefined>): CatalogFilters {
  const category = categories.find((item) => item.id === params.category)?.id ?? "all";
  const brand = brands.find((item) => item === params.brand) ?? "all";
  const sort = params.sort === "price-low" || params.sort === "price-high" ? params.sort : "featured";
  return { category, brand, sort, query: typeof params.q === "string" ? params.q.slice(0, 200) : "" };
}
export function filterProducts(filters: CatalogFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const result = products.filter((product) =>
    (filters.category === "all" || product.category === filters.category) &&
    (filters.brand === "all" || product.brand === filters.brand) &&
    `${product.brand} ${product.name.en} ${product.name.zh} ${product.description.en} ${product.description.zh}`.toLocaleLowerCase().includes(query),
  );
  if (filters.sort !== "featured") result.sort((a, b) => filters.sort === "price-low" ? a.referencePrice - b.referencePrice : b.referencePrice - a.referencePrice);
  return result;
}
