import { InvoiceClient } from "@/components/invoice/InvoiceClient";

export default async function FacturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceClient id={id} />;
}
