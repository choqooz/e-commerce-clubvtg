import { Img, Section, Text } from "@react-email/components";
import * as React from "react";
import { getPublicAppOrigin } from "@/lib/urls";

export function EmailBrand() {
  const logoUrl = new URL(
    "/branding/clubvtg/clubvtg-horizontal-black-512.png",
    getPublicAppOrigin(),
  ).href;

  return (
    <Section style={{ margin: "0 0 24px" }}>
      <Img
        src={logoUrl}
        alt="ClubVTG"
        width={512}
        height={179}
        style={{ display: "block", width: "180px", maxWidth: "100%", height: "auto" }}
      />
      <Text style={{ color: "#333", fontSize: "14px", margin: "12px 0 0" }}>
        ClubVTG — Información de tu pedido
      </Text>
    </Section>
  );
}
