"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type CancellationAction = (formData: FormData) => void | Promise<void>;

function ConfirmationSubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !enabled}
      className="rounded bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-gray-300"
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
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-1 whitespace-nowrap text-xs font-semibold text-red-700 hover:text-red-900"
      >
        Cancel
      </button>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <div
            aria-labelledby={`cancel-registration-title-${registrationId}`}
            aria-modal="true"
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            role="dialog"
          >
            <h3 id={`cancel-registration-title-${registrationId}`} className="text-lg font-semibold text-gray-900">
              Cancel registration?
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              This marks the registration as cancelled and frees its event capacity. Type <strong>CANCEL</strong> to continue.
            </p>
            <form action={action} className="mt-4">
              <input type="hidden" name="id" value={registrationId} />
              <input type="hidden" name="returnEvent" value={returnEvent} />
              <label className="block text-sm font-medium text-gray-700">
                Confirmation
                <input
                  autoFocus
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="CANCEL"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
                />
              </label>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmation("");
                    setIsOpen(false);
                  }}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Keep registration
                </button>
                <ConfirmationSubmitButton enabled={confirmation === "CANCEL"} />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
