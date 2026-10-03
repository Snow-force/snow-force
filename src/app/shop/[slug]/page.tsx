import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/shop/product-detail";
import Link from "next/link";
import { getStorefrontCatalog } from "@/lib/shop/storefront-repository";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  try { const { products } = await getStorefrontCatalog(); const product = products.find((item) => item.slug === params.slug); return product ? { title: `${product.brand} ${product.name.en} | SnowForce`, description: product.description.en } : { title: "Gear not found | SnowForce", robots: { index: false } }; }
  catch { return { title: "Gear Shop | SnowForce", robots: { index: false } }; }
}
export default async function ProductPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const catalog = await getStorefrontCatalog().catch(() => null);
  if (!catalog) return <div className="shop-container py-20" role="alert"><h1 className="text-2xl font-semibold">商城暂时无法加载 · Shop temporarily unavailable</h1><Link href="/shop" className="btn-primary mt-6">返回商城 · Back to shop</Link></div>;
  const { products } = catalog;
  const product = products.find((item) => item.slug === params.slug);
  if (!product) notFound();
  const related = products.filter((item) => item.slug !== product.slug && (item.brand === product.brand || item.category === product.category)).slice(0, 4);
  return <ProductDetail key={product.slug} product={product} related={related} />;
}
