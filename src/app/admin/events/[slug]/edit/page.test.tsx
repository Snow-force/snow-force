import {render,screen,cleanup} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
vi.mock("@/lib/events/repository",()=>({getEventAdmin:vi.fn()}));
vi.mock("@/components/admin/event-editor-form",()=>({EventEditorForm:()=> <div>Event editor</div>}));
vi.mock("@/components/admin/event-editor-heading",()=>({EventEditorHeading:()=> <h1>Activity</h1>}));
import {getEventAdmin} from "@/lib/events/repository";
import {seedEvents} from "@/lib/events/seed";
import Page from "./page";
afterEach(cleanup);
it("links to the separate lodging module without embedding package forms in activity editing",async()=>{
 const event=seedEvents[0];vi.mocked(getEventAdmin).mockResolvedValue(event);
 render(await Page({params:Promise.resolve({slug:event.slug}),searchParams:Promise.resolve({})}));
 expect(screen.getByRole("link",{name:"Lodging management / 住宿管理"})).toHaveAttribute("href",`/admin/lodging?event=${encodeURIComponent(event.slug)}`);
 expect(screen.queryByLabelText(/package per person/i)).toBeNull();expect(screen.getByText("Event editor")).toBeInTheDocument();
});
