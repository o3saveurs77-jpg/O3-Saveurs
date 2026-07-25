import type { Metadata } from "next";
import { AccountClient } from "@/components/account/AccountClient";

export const metadata: Metadata = {
  title: "Mon compte · Ô 3 Saveurs — Chez Laila",
};

export default function ComptePage() {
  return <AccountClient />;
}
