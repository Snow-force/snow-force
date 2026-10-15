import "@testing-library/jest-dom/vitest";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {LanguageProvider} from "@/lib/language";
vi.mock("@/lib/shop/after-sales-actions",()=>({getAfterSalesAction:vi.fn(),submitAfterSalesAction:vi.fn(),updateAfterSalesAction:vi.fn()}));
import {getAfterSalesAction,submitAfterSalesAction,updateAfterSalesAction} from "@/lib/shop/after-sales-actions";
import {MemberAfterSales} from "./member-after-sales";
import type {AfterSalesList,AfterSalesResult,AfterSalesRequest} from "@/lib/shop/after-sales";
const at="2026-10-01T08:00:00.000Z",id="22222222-2222-4222-8222-222222222222";
const request:AfterSalesRequest={id,order_id:"order_fixture",kind:"return",reason:"size",description:"Need a different fit",items:[{id:"ordli_fixture",quantity:1}],status:"pending",version:1,customer_message:"",return_carrier:"",return_tracking_number:"",created_at:at,updated_at:at,reviewed_at:null,history:[{status:"pending",message:"",at}]};
const empty:AfterSalesList={requests:[],eligibleItems:[{id:"ordli_fixture",title:"Test gear",variant:"M",available:2}]};
function wrap(initial:AfterSalesResult,lang:"zh"|"en"="zh"){render(<LanguageProvider initialLang={lang}><MemberAfterSales orderId="order_fixture" initial={initial}/></LanguageProvider>);}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getAfterSalesAction).mockResolvedValue({state:"ready",data:empty});vi.mocked(submitAfterSalesAction).mockResolvedValue({state:"ready",data:{...empty,requests:[request]}});vi.mocked(updateAfterSalesAction).mockResolvedValue({state:"ready",data:{...empty,requests:[{...request,status:"cancelled",version:2}]}});});
describe("member return and exchange application",()=>{
 it("shows unavailable requests separately from an empty history and can refresh",async()=>{wrap({state:"unavailable"});expect(screen.getByText(/暂时无法读取或更新申请/)).toBeInTheDocument();expect(screen.queryByText("提交申请")).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"刷新进度"}));await screen.findByText("提交申请");expect(getAfterSalesAction).toHaveBeenCalledWith("order_fixture");});
 it("submits selected delivered quantities with an idempotency key and then shows review progress",async()=>{
   wrap({state:"ready",data:empty});fireEvent.change(screen.getByRole("spinbutton",{name:"申请数量 Test gear"}),{target:{value:"1"}});fireEvent.change(screen.getByRole("textbox",{name:"原因说明 / 希望更换的尺码或颜色"}),{target:{value:"需要更换大一号尺码"}});fireEvent.click(screen.getByRole("button",{name:"提交审核"}));await screen.findByText("撤销申请");expect(submitAfterSalesAction).toHaveBeenCalledWith("order_fixture",{requestKey:expect.any(String),kind:"return",reason:"size",description:"需要更换大一号尺码",items:[{id:"ordli_fixture",quantity:1}]});expect(screen.queryByText("提交申请")).not.toBeInTheDocument();
 });
 it("retains the idempotency key after an uncertain failure instead of creating another request",async()=>{
   vi.mocked(submitAfterSalesAction).mockResolvedValue({state:"unavailable"});wrap({state:"ready",data:empty});const button=screen.getByRole("button",{name:"提交审核"});fireEvent.change(screen.getByRole("spinbutton"),{target:{value:"1"}});fireEvent.change(screen.getByRole("textbox"),{target:{value:"需要更换大一号尺码"}});fireEvent.click(button);await screen.findByText(/暂时无法读取或更新申请/);await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await waitFor(()=>expect(submitAfterSalesAction).toHaveBeenCalledTimes(2));expect(vi.mocked(submitAfterSalesAction).mock.calls[0][1]).toEqual(vi.mocked(submitAfterSalesAction).mock.calls[1][1]);await waitFor(()=>expect(button).toBeEnabled());
 });
 it("versioned cancellation shows the actual returned status",async()=>{wrap({state:"ready",data:{...empty,requests:[request]}});fireEvent.click(screen.getByRole("button",{name:"撤销申请"}));await screen.findByText("提交申请");expect(updateAfterSalesAction).toHaveBeenCalledWith("order_fixture",id,{command:"cancel",version:1});expect(screen.getByText("已撤销")).toBeInTheDocument();});
 it("approved requests show customer instructions and accept return tracking without refund controls",async()=>{
   const approved={...request,status:"approved" as const,version:2,history:[...request.history,{status:"approved" as const,message:"Please return to the address supplied by support.",at}]};vi.mocked(updateAfterSalesAction).mockResolvedValue({state:"ready",data:{...empty,requests:[approved]}});wrap({state:"ready",data:{...empty,requests:[approved]}},"en");expect(screen.getByText(approved.history[1].message)).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Cancel request"})).not.toBeInTheDocument();fireEvent.change(screen.getByRole("textbox",{name:"Carrier"}),{target:{value:"UPS"}});fireEvent.change(screen.getByRole("textbox",{name:"Tracking number"}),{target:{value:"fixture-tracking"}});fireEvent.click(screen.getByRole("button",{name:"Save return tracking"}));await waitFor(()=>expect(updateAfterSalesAction).toHaveBeenCalledWith("order_fixture",id,{command:"tracking",version:2,carrier:"UPS",trackingNumber:"fixture-tracking"}));await screen.findByText("Request updated.");
 });
 it("does not invent eligibility when none is returned",()=>{wrap({state:"ready",data:{requests:[],eligibleItems:[]}},"en");expect(screen.getByText(/no received items available/)).toBeInTheDocument();expect(screen.getByText(/Choose items you have received/)).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Submit for review"})).not.toBeInTheDocument();});
 it("shows the verified approved dispatch deadline without treating a tracking number as dispatch evidence",()=>{
   const approved={...request,status:"approved" as const,reviewed_at:at};
   const policy={schema_version:1 as const,version:1,effective_at:at,content:{seller_name:"Fixture",customer_service_email:"support@example.test",terms:{return_window_days:30,approved_dispatch_days:14,review_business_days:2,refund_business_days:5,processing_business_days_min:1,processing_business_days_max:2,transit_business_days_min:3,transit_business_days_max:7},copy:{shipping:{en:"Shipping",zh:"配送"},requests:{en:"Requests",zh:"申请"},conditions:{en:"Conditions",zh:"条件"},shipping_costs:{en:"Costs",zh:"费用"},refunds:{en:"Refunds",zh:"退款"},return_address:{en:"Address",zh:"地址"},consumer_rights:{en:"Rights",zh:"权利"}}}};
   wrap({state:"ready",data:{...empty,requests:[approved],purchase:{orderId:"order_fixture",policy,assessedOn:"2026-10-02",lines:[],dispatches:[{requestId:id,dispatchBy:"2026-10-15"}]}}},"en");
   expect(screen.getByText(/Approved return dispatch deadline.*Oct 15, 2026/)).toBeInTheDocument();expect(screen.getByText(/tracking number alone is not proof of dispatch/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Save return tracking"})).toBeEnabled();
 });
 it("switching orders never reuses the previous order's requests or purchase summary",()=>{
   const view=render(<LanguageProvider initialLang="zh"><MemberAfterSales orderId="order_fixture" initial={{state:"ready",data:{...empty,requests:[request]}}}/></LanguageProvider>);
   expect(screen.getByText(request.description)).toBeInTheDocument();
   view.rerender(<LanguageProvider initialLang="zh"><MemberAfterSales orderId="order_second" initial={{state:"ready",data:{requests:[],eligibleItems:[]}}}/></LanguageProvider>);
   expect(screen.queryByText(request.description)).not.toBeInTheDocument();expect(screen.getByText(/当前没有可提交新申请/)).toBeInTheDocument();
 });
});
