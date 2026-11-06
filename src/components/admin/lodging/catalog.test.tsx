import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
vi.mock("@/lib/lodging/actions", () => ({saveLodgingCatalog:vi.fn()}));
import { EventLodgingPackages, LodgingCatalog } from "./catalog";
import userEvent from "@testing-library/user-event";
import type { Catalog } from "@/lib/lodging/catalog";
afterEach(cleanup);
it("shows a clear disabled state with no write forms",()=>{
 const {container}=render(<LanguageProvider initialLang="en"><LodgingCatalog status="disabled" /></LanguageProvider>);
 expect(screen.getByRole("status")).toHaveTextContent("disabled");
 expect(container.querySelector("form")).toBeNull();
});
it("provides bilingual fields and no booking or payment controls",()=>{
 render(<LanguageProvider initialLang="zh"><LodgingCatalog status="ready" /></LanguageProvider>);
 expect(screen.getByText("住宿资料管理")).toBeInTheDocument();
 expect(screen.getByText(/尚未开放订房和付款/)).toBeInTheDocument();
 expect(screen.getAllByLabelText("Name · English")).toHaveLength(2);
 expect(screen.getAllByLabelText("名称 · 中文")).toHaveLength(2);
 expect(screen.getAllByRole("button")).toHaveLength(3);
 expect(screen.queryByRole("button",{name:/付款|预订/})).toBeNull();
});
it("shows load failure instead of a misleading empty catalog",()=>{
 const {container}=render(<LanguageProvider initialLang="zh"><LodgingCatalog status="error" /></LanguageProvider>);
 expect(screen.getByRole("status")).toHaveTextContent("加载失败");
 expect(container.querySelector("form")).toBeNull();
});
const roomId="11111111-1111-4111-8111-111111111111";
const baseOffer={id:"offer-a",version:1,event_slug:"trip-a",room_type_id:roomId,check_in:"2027-01-01",check_out:"2027-01-03",nightly_amount:10000,mandatory_fee:2000,tax_basis_points:1000,policy:{en:"Terms",zh:"条款"},currency:"usd" as const,sales_enabled:false as const,package_amount:39900};
const catalog:Catalog={
 properties:[{id:"hotel",version:1,name:{en:"Hotel",zh:"酒店"},address:"Road",timezone:"UTC",photo_url:""}],
 rooms:[{id:roomId,version:1,property_id:"hotel",name:{en:"Twin room",zh:"双床房"},beds:{en:"Twin beds",zh:"双床"},max_guests:4}],
 offers:[baseOffer,{...baseOffer,id:"other-event",event_slug:"trip-b",package_amount:1},{...baseOffer,id:"legacy",check_in:"2027-02-01",check_out:"2027-02-03",package_amount:null}],
};
it("keeps other events out of the event editor and binds its forms to this activity",()=>{
 const {container}=render(<LanguageProvider initialLang="en"><EventLodgingPackages eventSlug="trip-a" catalog={catalog} status="ready" /></LanguageProvider>);
 expect(container.querySelectorAll('form input[name="event_slug"]')).toHaveLength(3);
 for(const input of container.querySelectorAll('form input[name="event_slug"]')) expect(input).toHaveValue("trip-a");
 expect(container.querySelector('input[name="name_en"]')).toBeNull();
 expect(screen.queryByRole("option",{name:/0.01 per person/})).toBeNull();
 expect(within(screen.getByLabelText("Preview room type")).getAllByRole("option")).toHaveLength(2);
 expect(screen.queryByRole("button",{name:/book|pay/i})).toBeNull();
});
it("previews a fixed price per person including lodging without recharging costs or dividing by four occupants",async()=>{
 const user=userEvent.setup();
 render(<LanguageProvider initialLang="zh"><EventLodgingPackages eventSlug="trip-a" catalog={catalog} status="ready" /></LanguageProvider>);
 await user.selectOptions(screen.getByLabelText("预览房型"),"offer-a");
 expect(screen.getByText("1 人 · 总计 USD 399.00，已含住宿")).toBeInTheDocument();
 const count=screen.getByLabelText("预览人数");await user.clear(count);await user.type(count,"3");
 expect(screen.getByText("3 人 · 总计 USD 1197.00，已含住宿")).toBeInTheDocument();
 expect(screen.getAllByText(/同住人数变化不改变每人价格/)).toHaveLength(3);
 expect(screen.getAllByLabelText("每人活动套餐总价，含住宿（美元）")[0]).toHaveValue(399);
});
it("never presents an unpriced legacy hotel cost as a package sale price",()=>{
 render(<LanguageProvider initialLang="en"><LodgingCatalog catalog={{...catalog,offers:[{...baseOffer,package_amount:null}]}} status="ready" /></LanguageProvider>);
 expect(screen.getByText(/Package price not set/)).toBeInTheDocument();
 for (const input of screen.getAllByLabelText("Activity package per person, including lodging (USD)")) {
  expect(input).toBeRequired();expect(input).toHaveValue(null);
 }
});
it.each(["disabled","error"] as const)("exposes no package editing or price preview while %s",status=>{
 const {container}=render(<LanguageProvider initialLang="en"><EventLodgingPackages eventSlug="trip-a" status={status} /></LanguageProvider>);
 expect(container.querySelector("form")).toBeNull();
 expect(screen.queryByLabelText("Preview room type")).toBeNull();
});
