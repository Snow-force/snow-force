"use client";

import { useFormStatus } from "react-dom";

type CancellationAction = (formData: FormData) => void | Promise<void>;

function CancelButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:cursor-wait disabled:text-gray-400"
    >
      {pending ? "Cancelling..." : "Cancel registration"}
    </button>
  );
}

export function RegistrationCancellationControl({
  action,
  registrationId,
  returnEvent,
}: {
  action: CancellationAction;
  registrationId: string;
  returnEvent: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Cancel this registration? This will free its event capacity.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={registrationId} />
      <input type="hidden" name="returnEvent" value={returnEvent} />
      <CancelButton />
    </form>
  );
}
