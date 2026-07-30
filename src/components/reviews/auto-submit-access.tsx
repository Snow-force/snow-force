"use client";

import { useEffect, useRef } from "react";

export function AutoSubmitAccess(props: {
  accessCode: string;
  action(formData: FormData): void | Promise<void>;
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} action={props.action}>
      <input type="hidden" name="accessCode" value={props.accessCode} />
      <button className="btn-primary px-5 py-2" type="submit">
        {props.label}
      </button>
    </form>
  );
}
