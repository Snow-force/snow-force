import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import { parseCatalogForm, type Catalog } from "@/lib/lodging/catalog";
import { saveLodgingCatalog } from "@/lib/lodging/actions";
import { LodgingCatalog } from "./catalog";
vi.mock("@/lib/lodging/actions", () => ({ saveLodgingCatalog: vi.fn() }));
const hotelId = "11111111-1111-4111-8111-111111111111", roomId = "22222222-2222-4222-8222-222222222222";
const otherHotel = "44444444-4444-4444-8444-444444444444", otherRoom = "55555555-5555-4555-8555-555555555555";
const offer = { id: "33333333-3333-4333-8333-333333333333", version: 1, event_slug: "trip-a", room_type_id: roomId, check_in: "2027-01-01", check_out: "2027-01-03", nightly_amount: 10000, mandatory_fee: 2000, tax_basis_points: 1000, policy: { en: "Terms", zh: "条款" }, currency: "usd" as const, sales_enabled: false as const, package_amount: 39900 };
const catalog: Catalog = {
  properties: [{ id: hotelId, version: 1, name: { en: "Mountain Lodge", zh: "山麓酒店" }, address: "Road", timezone: "UTC", photo_url: "" }, { id: otherHotel, version: 1, name: { en: "Lake Lodge", zh: "湖畔酒店" }, address: "Lake Road", timezone: "UTC", photo_url: "" }],
  rooms: [{ id: roomId, version: 1, property_id: hotelId, name: { en: "Twin room", zh: "双床房" }, beds: { en: "Twin beds", zh: "双床" }, max_guests: 4 }, { id: otherRoom, version: 1, property_id: otherHotel, name: { en: "Suite", zh: "套房" }, beds: { en: "Queen", zh: "大床" }, max_guests: 2 }],
  offers: [offer, { ...offer, id: "66666666-6666-4666-8666-666666666666", event_slug: "trip-b", room_type_id: otherRoom, package_amount: null }],
};
const events = [{ slug: "trip-a", title: { en: "Mammoth Weekend", zh: "猛犸周末" }, eventDate: "2027-01-01" }, { slug: "trip-b", title: { en: "Lake Trip", zh: "湖畔活动" }, eventDate: "2027-02-01" }];
const editName = "Edit Mammoth Weekend · Twin room";
beforeEach(() => { vi.mocked(saveLodgingCatalog).mockReset().mockResolvedValue({ code: "saved" }); });
afterEach(cleanup);
function setup(props: Partial<React.ComponentProps<typeof LodgingCatalog>> = {}, lang: "en" | "zh" = "en") {
  return { user: userEvent.setup(), ...render(<LanguageProvider initialLang={lang}><LodgingCatalog status="ready" catalog={catalog} events={events} {...props} /></LanguageProvider>) };
}
it("starts with an activity package table instead of stacked editing forms", () => {
  const { container } = setup(); expect(screen.getByRole("heading", { name: "Lodging management" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Package per person" })).toBeInTheDocument(); expect(screen.getByText("USD 399.00")).toBeInTheDocument();
  expect(container.querySelector("form")).toBeNull(); expect(screen.queryByRole("button", { name: /pay|book now/i })).toBeNull();
});
it.each(["disabled", "error"] as const)("provides a clear %s state without write controls", status => {
  const { container } = setup({ status }); expect(screen.getByRole("status")).toHaveTextContent(status === "disabled" ? "disabled" : "could not be loaded");
  expect(container.querySelector("form")).toBeNull(); expect(screen.queryByRole("button", { name: "Add activity package" })).toBeNull();
});
it("filters the activity linked from the event editor and supports searching", async () => {
  const { user } = setup({ initialEventSlug: "trip-a" }); expect(screen.queryByRole("button", { name: "Edit Lake Trip · Suite" })).toBeNull();
  await user.selectOptions(screen.getByLabelText("Filter by activity"), ""); expect(screen.getByRole("button", { name: "Edit Lake Trip · Suite" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Search lodging records"), "Lake"); expect(screen.queryByRole("button", { name: editName })).toBeNull(); expect(screen.getByText("Lake Lodge")).toBeInTheDocument();
});
it("separates hotels and rooms and opens one bilingual form at a time", async () => {
  const { user, container } = setup(); await user.click(screen.getByRole("button", { name: /Hotels/ }));
  expect(screen.getByRole("columnheader", { name: "Address" })).toBeInTheDocument(); expect(container.querySelector("form")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Add hotel" })); expect(screen.getByLabelText("Name · English")).toBeInTheDocument(); expect(screen.getByLabelText("名称 · 中文")).toBeInTheDocument(); expect(container.querySelectorAll("form")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Cancel" })); expect(container.querySelector("form")).toBeNull();
  await user.click(screen.getByRole("button", { name: /Room types/ })); await user.selectOptions(screen.getByLabelText("Filter by hotel"), otherHotel);
  expect(screen.getByRole("button", { name: "Edit Suite" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Edit Twin room" })).toBeNull();
});
it("selects activity names and limits rooms to the chosen hotel, clearing stale choices", async () => {
  const { user, container } = setup(); await user.click(screen.getByRole("button", { name: editName }));
  expect(screen.getByLabelText("Activity")).toHaveValue("trip-a"); expect(container.querySelector('input[name="event_slug"]')).toBeNull();
  const rooms = screen.getByLabelText("Room type"); expect(rooms).toHaveValue(roomId); expect(within(rooms).queryByRole("option", { name: "Suite" })).toBeNull();
  await user.selectOptions(screen.getByLabelText("Hotel"), otherHotel); expect(rooms).toHaveValue("");
  expect(within(rooms).queryByRole("option", { name: "Twin room" })).toBeNull(); expect(within(rooms).getByRole("option", { name: "Suite" })).toBeInTheDocument();
});
it("preselects the linked activity for new packages", async () => {
  const { user } = setup({ initialEventSlug: "trip-a" }); await user.click(screen.getByRole("button", { name: "Add activity package" })); expect(screen.getByLabelText("Activity")).toHaveValue("trip-a");
});
it("saves through the existing action and returns to the list with confirmation", async () => {
  const { user, container } = setup(); await user.click(screen.getByRole("button", { name: editName })); const amount = screen.getByLabelText("Activity package per person, including lodging (USD)");
  await user.clear(amount); await user.type(amount, "429.50"); await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Draft saved.")); expect(container.querySelector("form")).toBeNull();
  const form = vi.mocked(saveLodgingCatalog).mock.calls[0][1]; expect(form.get("event_slug")).toBe("trip-a");
  expect(parseCatalogForm("offer", form)).toMatchObject({success:true,data:{package_amount:42950,nightly_amount:10000,tax_basis_points:1000}});
});
it("retains edits and reports a conflict without closing the form", async () => {
  vi.mocked(saveLodgingCatalog).mockResolvedValue({ code: "conflict" }); const { user } = setup(); await user.click(screen.getByRole("button", { name: editName })); await user.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Another staff member")); expect(screen.getByLabelText("Activity package per person, including lodging (USD)")).toHaveValue(399);
});
it("previews fixed per-person totals without recharging hotel costs or dividing by occupancy", async () => {
  const { user } = setup({}, "zh"); await user.click(screen.getByRole("button", { name: "预览猛犸周末 · 双床房" })); expect(screen.getByRole("status")).toHaveTextContent("USD 399.00");
  const count = screen.getByLabelText("参加人数"); await user.clear(count); await user.type(count, "3"); expect(screen.getByRole("status")).toHaveTextContent("USD 1197.00");
  await user.click(screen.getByRole("button", { name: "关闭预览" })); expect(screen.queryByLabelText("参加人数")).toBeNull();
});
it("keeps old unpriced drafts blank and disables their previews", async () => {
  const { user } = setup(); expect(screen.getByRole("button", { name: "Preview Lake Trip · Suite" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Edit Lake Trip · Suite" })); expect(screen.getByLabelText("Activity package per person, including lodging (USD)")).toHaveValue(null);
});
it("guides an empty catalog through hotel creation first", async () => {
  const { user } = setup({ catalog: { properties: [], rooms: [], offers: [] } }); expect(screen.getByRole("button", { name: "Add activity package" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Add your first hotel" })); expect(screen.getByRole("heading", { name: "Add hotel" })).toBeInTheDocument();
});
it("treats an activity without packages as intentionally having no lodging, without requiring setup",()=>{
 const {container}=setup({catalog:{properties:[],rooms:[],offers:[]},initialEventSlug:"trip-a"},"zh");
 expect(screen.getByRole("heading",{name:"此活动不提供住宿"})).toBeInTheDocument();
 expect(screen.getByText(/住宿是可选项，无需补填/)).toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"新增第一家酒店"})).toBeNull();
 expect(container.querySelector("form")).toBeNull();expect(saveLodgingCatalog).not.toHaveBeenCalled();
});
it("only creates lodging configuration when staff explicitly add a package",async()=>{
 const {user}=setup({catalog:{...catalog,offers:[]},initialEventSlug:"trip-a"});
 expect(screen.getByRole("heading",{name:"No lodging provided"})).toBeInTheDocument();
 await user.click(screen.getByRole("button",{name:"Add activity package"}));
 expect(screen.getByLabelText("Activity")).toHaveValue("trip-a");
 await user.click(screen.getByRole("button",{name:"Cancel"}));
 expect(screen.getByRole("heading",{name:"No lodging provided"})).toBeInTheDocument();expect(saveLodgingCatalog).not.toHaveBeenCalled();
});
