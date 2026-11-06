import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/admin",()=>({ requireAdmin: vi.fn() }));
vi.mock("./repository",()=>({ lodgingAdminEnabled: vi.fn(), saveCatalog: vi.fn() }));
vi.mock("next/cache",()=>({ revalidatePath: vi.fn() }));
import { requireAdmin } from "@/lib/auth/admin";
import { lodgingAdminEnabled, saveCatalog } from "./repository";
import { saveLodgingCatalog } from "./actions";
import { revalidatePath } from "next/cache";
const actor = "11111111-1111-4111-8111-111111111111";
function form() {const f=new FormData(); for(const [k,v] of Object.entries({kind:"property",name_en:"Hotel",name_zh:"酒店",address:"Road",timezone:"UTC",updated_by:"attacker"})) f.set(k,v);return f;}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(requireAdmin).mockResolvedValue({userId:actor,email:"staff@example.test",role:"admin"});vi.mocked(lodgingAdminEnabled).mockReturnValue(true);});
it("rejects unauthenticated requests before writes",async()=>{vi.mocked(requireAdmin).mockRejectedValue(new Error("auth"));await expect(saveLodgingCatalog({code:"idle"},form())).rejects.toThrow("auth");expect(saveCatalog).not.toHaveBeenCalled();});
it("does not write while disabled",async()=>{vi.mocked(lodgingAdminEnabled).mockReturnValue(false);expect(await saveLodgingCatalog({code:"idle"},form())).toEqual({code:"unavailable"});expect(saveCatalog).not.toHaveBeenCalled();});
it("uses authenticated actor rather than client supplied actor",async()=>{expect(await saveLodgingCatalog({code:"idle"},form())).toEqual({code:"saved"});expect(saveCatalog).toHaveBeenCalledWith("property",expect.not.objectContaining({updated_by:"attacker"}),actor);});
it("rejects unknown kinds",async()=>{const f=form();f.set("kind","staff_roles");expect((await saveLodgingCatalog({code:"idle"},f)).code).toBe("invalid");expect(saveCatalog).not.toHaveBeenCalled();});
it("reports conflicts without pretending success",async()=>{vi.mocked(saveCatalog).mockRejectedValue(new Error("conflict"));expect((await saveLodgingCatalog({code:"idle"},form())).code).toBe("conflict");});
it("does not disclose internal database errors",async()=>{vi.mocked(saveCatalog).mockRejectedValue(new Error("private detail"));expect(await saveLodgingCatalog({code:"idle"},form())).toEqual({code:"unavailable"});});
function packageForm() {
 const f = new FormData();
 for (const [key,value] of Object.entries({kind:"offer", event_slug:"winter-trip", room_type_id:actor, check_in:"2027-01-01",check_out:"2027-01-03",nightly_amount:"10000",mandatory_fee:"2000",tax_basis_points:"1000",policy_en:"Terms",policy_zh:"条款",package_price:"399.50",package_amount:"1",sales_enabled:"true"})) f.set(key,value);
 return f;
}
it("saves an explicit package price with staff identity and refreshes the activity editor",async()=>{
 expect(await saveLodgingCatalog({code:"idle"},packageForm())).toEqual({code:"saved"});
 expect(saveCatalog).toHaveBeenCalledWith("offer",expect.objectContaining({event_slug:"winter-trip",package_amount:39950}),actor);
 expect(vi.mocked(saveCatalog).mock.calls[0][1]).not.toHaveProperty("sales_enabled");
 expect(revalidatePath).toHaveBeenCalledWith("/admin/events/winter-trip/edit");
});
it("rejects an invalid package price before writing or revalidating",async()=>{
 const f=packageForm();f.set("package_price","1.001");
 expect(await saveLodgingCatalog({code:"idle"},f)).toEqual({code:"invalid",field:"package_amount"});
 expect(saveCatalog).not.toHaveBeenCalled();expect(revalidatePath).not.toHaveBeenCalled();
});
