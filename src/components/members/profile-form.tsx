import type { MemberProfile } from "@/lib/types";
import {
  addPassAction,
  saveEquipmentAction,
  saveMemberProfile,
  saveMemberPrivacyPreferences,
} from "@/lib/members/actions";

type ProfileFormProps = {
  profile: MemberProfile;
};

const riderTypes = [
  ["", "Choose type"],
  ["snowboarder", "Snowboard"],
  ["skier", "Ski"],
  ["both", "Both"],
  ["learning", "Still learning"],
];

const riderLevels = [
  ["", "Choose level"],
  ["first_timer", "First timer"],
  ["beginner", "Beginner"],
  ["intermediate", "Intermediate"],
  ["advanced", "Advanced"],
  ["expert", "Expert"],
];

export function ProfileForm({ profile }: ProfileFormProps) {
  return (
    <div>
    <form id="profile" action={saveMemberProfile} className="rounded-[28px] border border-[#dce3ed] bg-white p-6 shadow-sm shadow-slate-200/40">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#005bea]">Rider profile</p>
          <h2 className="mt-2 text-[24px] font-semibold text-[#15171b]">Make registration one-tap</h2>
          <p className="mt-1 text-[15px] leading-6 text-[#667085]">Structured details help SnowForce prefill trip forms and coordinate rides.</p>
        </div>
        <button className="auth-primary-button mt-3 sm:mt-0 sm:w-auto">Save profile</button>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Display name" name="displayName" defaultValue={profile.displayName} required />
        <Field label="Phone" name="phone" defaultValue={profile.phone} />
        <Field label="Email" value={profile.email} disabled />
        <Field label="Home mountain" name="homeMountain" defaultValue={profile.homeMountain} placeholder="Mammoth, Big Bear, Mountain High" />

        <Select label="Rider type" name="riderType" defaultValue={profile.riderType} options={riderTypes} />
        <Select label="Rider level" name="riderLevel" defaultValue={profile.structuredRiderLevel} options={riderLevels} />

        <Field label="Instagram" name="instagram" defaultValue={profile.instagram} placeholder="@snowforce" />
        <Field label="Discord" name="discord" defaultValue={profile.discord} placeholder="rider#1234" />
        <Field label="Avatar URL" name="avatarUrl" defaultValue={profile.avatarUrl} />
      </div>

      <div className="mt-5">
        <label className="mb-1.5 block text-[13px] font-semibold text-[#344054]" htmlFor="profile-bio">Bio</label>
        <textarea id="profile-bio" name="bio" defaultValue={profile.bio} rows={3} className="auth-input rounded-[22px]" placeholder="Powder days, park laps, progression sessions..." />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Check name="carpoolInterest" label="Need carpool" defaultChecked={profile.carpoolInterest} />
        <Check name="lodgingInterest" label="Need lodging" defaultChecked={profile.lodgingInterest} />
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Select label="Preferred language" name="preferredLanguage" defaultValue={profile.preferredLanguage} options={[["zh", "中文"], ["en", "English"]]} />
        <Field label="Emergency contact" name="emergencyContact" defaultValue={profile.emergencyContact} />
        <Field label="Emergency phone" name="emergencyPhone" defaultValue={profile.emergencyPhone} />
      </div>
    </form>

    <form id="passes" action={addPassAction} className="mt-6 rounded-[24px] border border-[#dce3ed] bg-[#f6f7fb] p-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#005bea]">Passes</p>
      {profile.passes.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.passes.map((p) => (
            <span key={p} className="inline-flex items-center rounded-full border border-[#dce3ed] bg-white px-4 py-2 text-[13px] font-semibold text-[#15171b]">
              {p}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-[#667085]">No passes added yet. Add Ikon, Epic, or your local mountain pass.</p>
      )}
      <div className="mt-4 flex gap-3">
        <select name="passType" className="auth-input min-h-10 flex-1 text-[14px]" defaultValue="">
          <option value="" disabled>Add a pass</option>
          <option value="ikon">Ikon</option>
          <option value="epic">Epic</option>
          <option value="big_bear">Big Bear</option>
          <option value="mountain_high">Mountain High</option>
          <option value="other">Other</option>
        </select>
        <input name="passLabel" className="auth-input min-h-10 w-32 text-[14px]" placeholder="Label" />
        <button className="rounded-full bg-[#005bea] px-5 text-[13px] font-semibold text-white transition active:scale-95">Add</button>
      </div>
    </form>

    <form id="equipment" action={saveEquipmentAction} className="mt-4 rounded-[24px] border border-[#dce3ed] bg-[#f6f7fb] p-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#005bea]">Equipment</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Check name="ownsSkis" label="Own skis" defaultChecked={profile.equipment.ownsSkis} />
        <Check name="ownsSnowboard" label="Own snowboard" defaultChecked={profile.equipment.ownsSnowboard} />
        <Check name="ownsBoots" label="Own boots" defaultChecked={profile.equipment.ownsBoots} />
        <Check name="needsRentalHelp" label="Need rental help" defaultChecked={profile.equipment.needsRentalHelp} />
      </div>
      <div className="mt-3 flex gap-3">
        <input name="equipmentNote" className="auth-input min-h-10 flex-1 text-[14px]" placeholder="Notes, sizes, brands..." />
        <button className="rounded-full bg-[#005bea] px-5 text-[13px] font-semibold text-white transition active:scale-95">Save</button>
      </div>
    </form>

    <form id="privacy" action={saveMemberPrivacyPreferences} className="mt-4 rounded-[24px] border border-[#dce3ed] bg-[#f6f7fb] p-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#005bea]">Privacy & communications</p>
      <p className="mt-2 text-[14px] leading-6 text-[#667085]">The required Privacy Notice and the optional event-media permission are recorded separately.</p>
      <label className="mt-4 flex items-start gap-3 rounded-[18px] border border-[#dce3ed] bg-white px-4 py-3 text-[14px] text-[#344054]">
        <input name="eventMediaSocialConsent" type="checkbox" defaultChecked={profile.photoSocialMediaConsent ?? false} className="mt-0.5 h-4 w-4 rounded border-[#cfd8e3] text-[#005bea] focus:ring-[#005bea]" />
        <span><span className="block font-semibold">Allow event photos and videos on SnowForce social media</span><span className="mt-1 block text-[#667085]">Optional. This choice does not affect membership access or event registration.</span></span>
      </label>
      <label className="mt-4 flex items-start gap-3 rounded-[18px] border border-[#dce3ed] bg-white px-4 py-3 text-[14px] text-[#344054]">
        <input name="marketingEmailOptIn" type="checkbox" defaultChecked={profile.marketingEmailOptIn ?? true} className="mt-0.5 h-4 w-4 rounded border-[#cfd8e3] text-[#005bea] focus:ring-[#005bea]" />
        <span><span className="block font-semibold">Receive SnowForce marketing emails</span><span className="mt-1 block text-[#667085]">Event news, offers, and promotions. You can change this preference at any time.</span></span>
      </label>
      <button className="mt-4 rounded-full bg-[#005bea] px-5 py-2.5 text-[13px] font-semibold text-white transition active:scale-95">Save privacy preferences</button>
    </form>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  const id = `profile-${String(inputProps.name ?? label).toLowerCase()}`;
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-semibold text-[#344054]" htmlFor={id}>{label}</label>
      <input id={id} className="auth-input" {...inputProps} />
    </div>
  );
}

function Select({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: string[][] }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-semibold text-[#344054]" htmlFor={`profile-${name}`}>{label}</label>
      <select id={`profile-${name}`} name={name} defaultValue={defaultValue} className="auth-input">
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </div>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-3 rounded-[18px] border border-[#dce3ed] bg-[#f6f7fb] px-4 py-3 text-[14px] font-semibold text-[#344054]">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 rounded border-[#cfd8e3] text-[#005bea] focus:ring-[#005bea]" />
      {label}
    </label>
  );
}
