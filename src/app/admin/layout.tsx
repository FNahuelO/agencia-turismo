import type { Metadata } from "next";
import { FormValidation } from "@/components/admin/form-validation";

export const metadata: Metadata = {
  title: { default: "Backoffice", template: "%s · Backoffice TravelAr" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FormValidation />
      {children}
    </>
  );
}
