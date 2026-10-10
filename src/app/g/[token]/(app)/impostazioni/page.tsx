import { requireStaffPage } from "@/server/auth/require-staff";
import { VenueForm } from "./venue-form";

export const metadata = { title: "Impostazioni" };

export default async function VenueSettingsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { tenant } = await requireStaffPage(token, { permission: "settings.manage" });
  return (
    <VenueForm
      token={token}
      initial={{
        displayName: tenant.displayName,
        phone: tenant.phone ?? "",
        email: tenant.email ?? "",
        address: tenant.address ?? "",
        city: tenant.city ?? "",
        postalCode: tenant.postalCode ?? "",
        province: tenant.province ?? "",
        openingHours: tenant.settings.openingHours ?? [],
        closures: tenant.settings.closures ?? [],
        reviewUrl: tenant.settings.reviewUrl ?? "",
        socials: {
          instagram: tenant.settings.socials?.instagram ?? "",
          facebook: tenant.settings.socials?.facebook ?? "",
          tiktok: tenant.settings.socials?.tiktok ?? "",
          website: tenant.settings.socials?.website ?? "",
        },
      }}
      charges={{ coverChargeCents: tenant.settings.coverChargeCents, servicePctBp: tenant.settings.servicePctBp }}
    />
  );
}
