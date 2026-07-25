import { OrderTracker } from "@/components/order/OrderTracker";

export default async function CommandePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <div className="bg-page py-2" />
      <OrderTracker id={id} />
    </>
  );
}
