import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/admin",()=>({requireAdmin:vi.fn()}));
vi.mock("@/lib/lodging/repository",()=>({lodgingAdminEnabled:vi.fn(),loadCatalog:vi.fn()}));
vi.mock("@/lib/events/repository",()=>({getAdminEventHistory:vi.fn()}));
import {requireAdmin} from "@/lib/auth/admin";
import {lodgingAdminEnabled,loadCatalog} from "@/lib/lodging/repository";
import {getAdminEventHistory} from "@/lib/events/repository";
import Page from "./page";
import { seedEvents } from "@/lib/events/seed";
beforeEach(()=>{
 vi.resetAllMocks();vi.mocked(requireAdmin).mockResolvedValue({userId:"staff",email:"staff@example.test",role:"manager"});
 vi.mocked(lodgingAdminEnabled).mockReturnValue(true);vi.mocked(loadCatalog).mockResolvedValue({properties:[],rooms:[],offers:[]});vi.mocked(getAdminEventHistory).mockResolvedValue([]);
});
it("guards both privileged data sources before reads",async()=>{
 vi.mocked(requireAdmin).mockRejectedValue(new Error("denied"));await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow("denied");expect(loadCatalog).not.toHaveBeenCalled();expect(getAdminEventHistory).not.toHaveBeenCalled();
});
it("does not load data while lodging is disabled",async()=>{
 vi.mocked(lodgingAdminEnabled).mockReturnValue(false);expect((await Page({searchParams:Promise.resolve({})})).props.status).toBe("disabled");expect(loadCatalog).not.toHaveBeenCalled();
});
it("renders failure instead of empty data if either source fails",async()=>{
 vi.mocked(getAdminEventHistory).mockRejectedValue(new Error("unavailable"));expect((await Page({searchParams:Promise.resolve({})})).props.status).toBe("error");
});
it("rejects unknown event filters",async()=>{
 const result=await Page({searchParams:Promise.resolve({event:"unknown"})});expect(result.props.initialEventSlug).toBe("");expect(result.props.events).toEqual([]);
});
it("preselects a known activity and sends only activity labels to the client",async()=>{
 const event=seedEvents[0];vi.mocked(getAdminEventHistory).mockResolvedValue([event]);
 const result=await Page({searchParams:Promise.resolve({event:event.slug})});
 expect(result.props.initialEventSlug).toBe(event.slug);expect(result.props.events).toEqual([{slug:event.slug,title:event.title,eventDate:event.eventDate}]);
});
