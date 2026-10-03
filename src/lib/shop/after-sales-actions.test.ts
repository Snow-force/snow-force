import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({session:vi.fn(),request:vi.fn(),revalidate:vi.fn()}));
vi.mock("./commerce-auth",()=>({getCommerceCustomerSession:mocks.session}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import {CommerceAuthorizationError,CommerceRejectedError} from "./commerce-client";
import {afterSalesInput,afterSalesRequest,afterSalesPurchase,afterSalesList} from "./after-sales";
import {getAfterSalesAction,submitAfterSalesAction,updateAfterSalesAction} from "./after-sales-actions";
const key="22222222-2222-4222-8222-222222222222",at="2026-10-01T08:00:00.000Z";
const input={requestKey:key,kind:"return",reason:"size",description:"Need a different fit",items:[{id:"ordli_fixture",quantity:1}]};
const request={id:key,order_id:"order_fixture",kind:"return",reason:"size",description:input.description,items:input.items,status:"pending",version:1,customer_message:"",return_carrier:"",return_tracking_number:"",created_at:at,updated_at:at,reviewed_at:null,history:[{status:"pending",message:"",at}]};
beforeEach(()=>{vi.resetAllMocks();mocks.session.mockResolvedValue({token:"verified-token",request:mocks.request});mocks.request.mockImplementation(async(_path,schema,options)=>schema.parse(options?.method==="POST"?{request}:{requests:[request],eligibleItems:[]}));});
describe("member after-sales server boundary",()=>{
 it("validates exact fields, positive distinct items and paths before creating a customer session",async()=>{
   for(const change of [{items:[]},{items:[...input.items,...input.items]},{items:[{id:"ordli_fixture",quantity:0}]},{customerId:"forged"}])expect(afterSalesInput.safeParse({...input,...change}).success).toBe(false);
   expect(await submitAfterSalesAction("order_fixture",{...input,price:1})).toEqual({state:"invalid"});expect(await getAfterSalesAction("../foreign")).toEqual({state:"invalid"});expect(await updateAfterSalesAction("order_fixture","not-uuid",{command:"cancel",version:1})).toEqual({state:"invalid"});expect(mocks.session).not.toHaveBeenCalled();
 });
 it("preserves original Supabase authentication and sends only its linked bearer identity",async()=>{
   expect((await submitAfterSalesAction("order_fixture",input)).state).toBe("ready");expect(mocks.request).toHaveBeenCalledWith("/store/snowforce/orders/order_fixture/after-sales",expect.anything(),{method:"POST",token:"verified-token",body:input});expect(mocks.revalidate).toHaveBeenCalledWith("/member/orders/order_fixture");
 });
 it("uses versioned cancellation/tracking and reads progress again after saving",async()=>{
   expect((await updateAfterSalesAction("order_fixture",key,{command:"cancel",version:1})).state).toBe("ready");expect(mocks.request.mock.calls[0][0].endsWith(`/${key}`)).toBe(true);expect(mocks.request).toHaveBeenCalledTimes(2);
   expect((await getAfterSalesAction("order_fixture")).state).toBe("ready");
 });
 it("keeps authentication, conflict and unavailable results distinct without reporting a false save",async()=>{
   for(const [error,state] of [[new CommerceAuthorizationError(),"signed-out"],[new CommerceRejectedError(),"rejected"],[new Error("private DB details"),"unavailable"]]){mocks.session.mockRejectedValue(error);expect(await submitAfterSalesAction("order_fixture",input)).toEqual({state});}
   expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("rejects customer responses containing internal notes or another order",async()=>{
   expect(afterSalesRequest.safeParse({...request,internal_note:"private"}).success).toBe(false);
   mocks.request.mockImplementation(async(_path,schema)=>schema.parse({request:{...request,order_id:"order_foreign"}}));expect(await submitAfterSalesAction("order_fixture",input)).toEqual({state:"unavailable"});expect(mocks.revalidate).not.toHaveBeenCalled();
   mocks.request.mockImplementation(async(_path,schema)=>schema.parse({requests:[{...request,order_id:"order_foreign"}],eligibleItems:[]}));expect(await getAfterSalesAction("order_fixture")).toEqual({state:"unavailable"});
 });
 it("rejects purchase summaries for another order, private fields and impossible deadline facts",async()=>{
   const purchase={orderId:"order_foreign",policy:null,assessedOn:"2026-10-01",lines:[{id:"ordli_fixture",title:"Gear",status:"manual",earliestDeadline:null,latestDeadline:null}],dispatches:[]};
   mocks.request.mockImplementation(async(_path,schema)=>schema.parse({requests:[],eligibleItems:[],purchase}));expect(await getAfterSalesAction("order_fixture")).toEqual({state:"unavailable"});
   for(const invalid of [{...purchase,signature:"private"},{...purchase,assessedOn:"2026-02-30"},{...purchase,lines:[{...purchase.lines[0],status:"within_window"}]},{...purchase,dispatches:[{requestId:key,dispatchBy:"2026-10-15"}]}])expect(afterSalesPurchase.safeParse(invalid).success).toBe(false);
   expect(afterSalesList.safeParse({requests:[request],eligibleItems:[],purchase:{...purchase,dispatches:[{requestId:key,dispatchBy:"2026-10-15"}]}}).success).toBe(false);
 });
});
