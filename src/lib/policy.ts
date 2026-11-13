import type { Policy } from "@/db/schema";
import type { Dictionary } from "./i18n/dictionaries";
import { interpolate } from "./i18n/config";

export function policyLines(policy: Policy, t: Dictionary["policy"]) {
  return [
    interpolate(t.deposit, { percent: policy.depositPercent, hours: policy.depositHours }),
    interpolate(t.balance, { days: policy.finalPaymentDays }),
    policy.adminFee ? interpolate(t.adminFee, { fee: policy.adminFee }) : "",
    interpolate(t.infants, { months: policy.infantsMonths }),
    policy.singleSurcharge > 0 ? interpolate(t.single, { n: policy.singleSurcharge }) : "",
    policy.shareMode ? t.share : "",
    ...policy.extraNotes,
  ].filter(Boolean);
}
