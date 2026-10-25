"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language";

export function WaiverAgeFields({ adultConfirmed, onAdultChange }: { adultConfirmed: boolean; onAdultChange: (value: boolean) => void }) {
  const { t } = useLanguage();
  const [under14, setUnder14] = useState("");
  return <div className="space-y-4">
    <label className="flex items-start gap-3 text-sm font-medium"><input name="adultConfirmed" type="checkbox" checked={adultConfirmed} onChange={(e) => onAdultChange(e.target.checked)} />{t({ en: "I confirm I am the attendee and I am 18 or older at signing.", zh: "我确认我是参加者本人，签署时已满 18 周岁。" })}</label>
    {adultConfirmed ? <p className="text-sm">{t({ en: "Sign the adult waiver yourself. No guardian signature is required.", zh: "请本人签署成人免责，无需监护人签字。" })}</p> : <>
      <p className="text-sm">{t({ en: "For an attendee under 18, leave the box unchecked. A parent or legal guardian must verify their own email and sign using their own legal name. Ask the booker to correct the signing email if necessary.", zh: "参加者未满 18 岁时请勿勾选。须由父母或法定监护人验证自己的邮箱，并以自己的法定姓名签署；如邮箱不符，请代报名人更正。" })}</p>
      <label className="block text-sm">{t({ en: "Your legal relationship to the attendee", zh: "你与参加者的法定关系" })}<select name="guardianRelationship" required defaultValue="" className="input-field mt-2"><option value="">{t({ en: "Select relationship", zh: "选择关系" })}</option><option value="parent">{t({ en: "Parent", zh: "父母" })}</option><option value="legal_guardian">{t({ en: "Legal guardian", zh: "法定监护人" })}</option></select></label>
      <fieldset className="space-y-2"><legend className="text-sm">{t({ en: "Will the attendee be under 14 during the activity?", zh: "参加活动时是否未满 14 岁？" })}</legend>
        <label className="mr-5 inline-flex items-center gap-2 text-sm"><input required type="radio" name="minorUnder14" value="yes" checked={under14 === "yes"} onChange={() => setUnder14("yes")} />{t({ en: "Yes, under 14", zh: "是，未满 14 岁" })}</label>
        <label className="inline-flex items-center gap-2 text-sm"><input required type="radio" name="minorUnder14" value="no" checked={under14 === "no"} onChange={() => setUnder14("no")} />{t({ en: "No, 14 or older", zh: "否，已满 14 岁" })}</label>
      </fieldset>
      {under14 === "yes" && <div className="space-y-3">
        <p className="text-sm">{t({ en: "A parent or legal guardian must stay throughout the activity. Staff verify their presence before check-in. An accompanying adult who participates needs a separate booking.", zh: "父母或法定监护人须全程陪同，签到前由工作人员核验到场。陪同成人如参加活动，须另行报名。" })}</p>
        <label className="block text-sm">{t({ en: "Accompanying guardian’s name", zh: "陪同监护人姓名" })}<input required name="accompanyingGuardianName" maxLength={200} className="input-field mt-2" /></label>
        <label className="block text-sm">{t({ en: "Accompanying guardian’s phone", zh: "陪同监护人电话" })}<input required name="accompanyingGuardianPhone" type="tel" maxLength={40} className="input-field mt-2" /></label>
        <label className="block text-sm">{t({ en: "Accompanying guardian’s relationship", zh: "陪同监护人关系" })}<select required name="accompanyingGuardianRelationship" defaultValue="" className="input-field mt-2"><option value="">{t({ en: "Select relationship", zh: "选择关系" })}</option><option value="parent">{t({ en: "Parent", zh: "父母" })}</option><option value="legal_guardian">{t({ en: "Legal guardian", zh: "法定监护人" })}</option></select></label>
        <label className="flex items-start gap-3 text-sm"><input required name="guardianWillAttend" type="checkbox" />{t({ en: "This parent or legal guardian will stay throughout. If they leave, the child must stop participating and staff must be notified.", zh: "此父母或法定监护人将全程陪同。如陪同人离开，孩子须停止参加并通知工作人员。" })}</label>
      </div>}
    </>}
  </div>;
}
