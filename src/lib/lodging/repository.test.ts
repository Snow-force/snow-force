import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const fake=vi.hoisted(()=>({create:vi.fn(),from:vi.fn(),select:vi.fn(),order:vi.fn(),insert:vi.fn(),update:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:fake.create}));
import { loadCatalog, saveCatalog, lodgingAdminEnabled } from "./repository";
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://example.test");vi.stubEnv("SUPABASE_SECRET_KEY","test-key");
fake.create.mockReturnValue({from:fake.from});fake.from.mockReturnValue(fake);fake.select.mockReturnValue(fake);fake.eq.mockReturnValue(fake);fake.update.mockReturnValue(fake);
 fake.order.mockResolvedValue({data:[],error:null});fake.insert.mockResolvedValue({error:null});fake.maybeSingle.mockResolvedValue({data:{id:"one"},error:null});
});
it("defaults the feature to disabled",()=>{vi.stubEnv("LODGING_ADMIN_ENABLED","");expect(lodgingAdminEnabled()).toBe(false);});
it("fails closed on missing configuration",async()=>{vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","");await expect(loadCatalog()).rejects.toThrow("not configured");});
it("loads the three independent catalog tables",async()=>{expect(await loadCatalog()).toEqual({properties:[],rooms:[],offers:[]});expect(fake.from).toHaveBeenCalledTimes(3);});
it("scopes activity package reads to the current event while retaining reusable hotels and room types",async()=>{
 await loadCatalog("winter-trip");
 expect(fake.eq).toHaveBeenCalledExactlyOnceWith("event_slug","winter-trip");
 expect(fake.from).toHaveBeenCalledTimes(3);
});
it("does not pretend a failed read is an empty catalog",async()=>{fake.order.mockResolvedValue({data:null,error:{message:"unavailable"}});await expect(loadCatalog()).rejects.toThrow("unavailable");});
it("uses an atomic version comparison for staff updates",async()=>{await saveCatalog("property",{id:"one",version:3,address:"Road"},"staff");expect(fake.update).toHaveBeenCalledWith({address:"Road",updated_by:"staff",version:4});expect(fake.eq).toHaveBeenCalledWith("id","one");expect(fake.eq).toHaveBeenCalledWith("version",3);});
it("rejects stale writes",async()=>{fake.maybeSingle.mockResolvedValue({data:null,error:null});await expect(saveCatalog("property",{id:"one",version:1},"staff")).rejects.toThrow("conflict");});
it("uses the server actor on inserts",async()=>{await saveCatalog("property",{name:{en:"H",zh:"好"}},"staff");expect(fake.insert).toHaveBeenCalledWith({name:{en:"H",zh:"好"},updated_by:"staff"});});
it("propagates failed updates and inserts",async()=>{fake.maybeSingle.mockResolvedValue({data:null,error:{message:"failed"}});await expect(saveCatalog("property",{id:"one",version:1},"staff")).rejects.toThrow("failed");fake.insert.mockResolvedValue({error:{message:"failed"}});await expect(saveCatalog("property",{},"staff")).rejects.toThrow("failed");});
