import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/admin",()=>({ requireAdmin: vi.fn() }));
vi.mock("./repository",()=>({ lodgingAdminEnabled: vi.fn(), saveCatalog: vi.fn() }));
vi.mock("next/cache",()=>({ revalidatePath: vi.fn() }));
import { requireAdmin } from "@/lib/auth/admin";
import { lodgingAdminEnabled, saveCatalog } from "./repository";
import { saveLodgingCatalog } from "./actions";
const actor = "11111111-1111-4111-8111-111111111111";
function form() {const f=new FormData(); for(const [k,v] of Object.entries({kind:"property",name_en:"Hotel",name_zh:"酒店",address:"Road",timezone:"UTC",updated_by:"attacker"})) f.set(k,v);return f;}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(requireAdmin).mockResolvedValue({userId:actor,email:"staff@example.test",role:"admin"});vi.mocked(lodgingAdminEnabled).mockReturnValue(true);});
it("rejects unauthenticated requests before writes",async()=>{vi.mocked(requireAdmin).mockRejectedValue(new Error("auth"));await expect(saveLodgingCatalog({code:"idle"},form())).rejects.toThrow("auth");expect(saveCatalog).not.toHaveBeenCalled();});
it("does not write while disabled",async()=>{vi.mocked(lodgingAdminEnabled).mockReturnValue(false);expect(await saveLodgingCatalog({code:"idle"},form())).toEqual({code:"unavailable"});expect(saveCatalog).not.toHaveBeenCalled();});
it("uses authenticated actor rather than client supplied actor",async()=>{expect(await saveLodgingCatalog({code:"idle"},form())).toEqual({code:"saved"});expect(saveCatalog).toHaveBeenCalledWith("property",expect.not.objectContaining({updated_by:"attacker"}),actor);});
it("rejects unknown kinds",async()=>{const f=form();f.set("kind","staff_roles");expect((await saveLodgingCatalog({code:"idle"},f)).code).toBe("invalid");expect(saveCatalog).not.toHaveBeenCalled();});
it("reports conflicts without pretending success",async()=>{vi.mocked(saveCatalog).mockRejectedValue(new Error("conflict"));expect((await saveLodgingCatalog({code:"idle"},form())).code).toBe("conflict");});
it("does not disclose internal database errors",async()=>{vi.mocked(saveCatalog).mockRejectedValue(new Error("private detail"));expect(await saveLodgingCatalog({code:"idle"},form())).toEqual({code:"unavailable"});});
