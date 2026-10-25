# V2 enabled on current events — 2026-10-25

Status: **ENABLED**, verified on all three current open events. The operator's explicit “开启” authorizes public activation of the previously prepared age-confirmation flow and adoption of its adult/guardian terms. This supersedes the earlier default-off release holds for these events; it is not a claim of attorney certification or of a completed real-recipient email acceptance test.

Activation committed at **2026-10-25 00:28 PDT / 07:28 UTC**. Read-back and public-route verification completed at **00:30 PDT / 07:30 UTC**.

| Event | Date | V2 group form | Mandatory emailed waiver | Payment | Approval | Capacity | Friend cap |
|---|---|---|---|---|---|---|---|
| metroslopes-indoor-ski-snowboard-1107 | 2026-11-07 | On | On | Full prepay USD 118 | Required | 50 | 5 |
| mammoth-opening-weekend-2026 | 2026-11-13 | On | On | Deposit USD 99 | Required | 150 | 5 |
| mammoth-thanksgiving-trip-2026 | 2026-11-26 | On | On | Deposit USD 99 | Not required | 100 | 5 |

## Terms and confirmed rules

The published operator-adopted files are [adult R1](event-waivers-20261025/adult-en-zh.txt) and [guardian R1](event-waivers-20261025/guardian-en-zh.txt), with an [activation manifest](event-waivers-20261025/activation-manifest.json). Earlier review drafts remain unchanged as history. The adult text's age clause was aligned with the user's signing-time rule before publication. Adoption is recorded as `operator-request:enable-v2:2026-10-25`, not a lawyer's review or a signature for an attendee.

The verified signer confirms age at signing. Checking “I am the attendee and 18 or older” selects personal adult signing without a guardian signature. Otherwise the parent/legal guardian signs using their own name and verified email. Under 14 during the activity still requires a qualifying parent/legal guardian throughout, with staff presence verification and departure handling. New bookings do not collect birth dates. Each participant retains independent payment, approval, waiver and ticket; the booker consumes a place only when attending. Contact and reply-to remain hello@snow-force.com.

The existing privacy notice's purpose-based retention and access/correction/deletion contact remain in force. No fixed guardian-contact or signature-evidence retention period, automatic purge rule, blanket legal compliance or attorney approval is invented. The current instruction authorizes opening the prepared flow rather than leaving its flags off for the earlier unanswered inputs. Authorized customer transactions may now generate their normal transactional invitations/OTPs; this activation did not send test messages to any person or execute real charges.

## Verification and applied change

- Current application source is main revision `86990e85695be96a68e66669872db16ccc088c74`, Railway deployment `c4cb1463-1b64-4c95-8714-855965a0b729`: SUCCESS, actual region sfo, one healthy replica. Main's subsequent commits before this activation were release records only. No new application deployment was needed to change event settings.
- `npm test`: **217 files / 1,400 tests passed**. `npm run build`: ESLint, production build and TypeScript passed without warnings. Focused release-text checks verified organizer/contact, current age rules, separate legal roles, preserved liability exclusions, version identifiers and exact SHA-256 hashes.
- Resend sender `notifications.snow-force.com` remains verified and sending-enabled, with open/click tracking off. Dedicated signed waiver delivery callback remains enabled for delivered/bounced/complained/failed events. Dedicated encryption, worker and callback keys are configured; the existing five-minute recovery service has no current service warnings/criticals.
- One transaction locked all three event rows, checked that they were still published/open and had no existing V2 policies, saved the exact published texts through `save_event_waiver_policy`, and enabled both V2 flags together. A before/after assertion preserved dates, status, price/payment model, approval, capacity, friend cap, proxy permission and registration close time. Existing V1 registrations and in-flight payments remain governed by the already tested compatibility path.
- [Activation evidence](../output/event-v2-enabled-20261025.json) confirms both flags true on all three events, current event dates/time zone, operator adoption, stored-text hashes matching the published files and unchanged price/approval/capacity/cap values.
- Every event page returned HTTP 200 and its server-rendered data contained `groupRegistrationEnabled: true`. Each live event's new booking RPC reached its participant validation and rejected an empty list before writes. Health and private waiver entry returned 200. No test booking, payment or email was created. This verifies public route activation and server validation, not a new paid/real-mail end-to-end transaction.
- The unrelated staged Railway region/shop patch was not applied. No source, secrets, staff privileges or payment credentials were changed for activation.

## Operation and rollback

Verified-email members should refresh an event page to load the group form. Continue following up on payment failures, unsigned/declined waivers, bounced mail, guardian authority, under-14 presence and event approval independently. Rejection/cancellation does not automatically refund money.

To stop new V2 bookings, disable both enrollment flags together. Retain the deployed V2-aware code, published policy/evidence, schema, email callback and recovery worker so existing V2 orders can still be fulfilled and handled. Do not roll back to code that cannot understand active V2 bookings.
