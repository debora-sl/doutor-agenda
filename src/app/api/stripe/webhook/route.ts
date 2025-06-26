import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@/db";
import { usersTable } from "@/db/schema";

export const runtime = "nodejs";
export const preferredRegion = "home";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-05-28.basil",
  });

  const sig = req.headers.get("stripe-signature") as string;
  const rawBody = await req.arrayBuffer();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      Buffer.from(rawBody),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const error = err as Error;
    console.error("❌ Stripe webhook error:", error.message);
    return new NextResponse(`Webhook error: ${error.message}`, { status: 400 });
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;

    // Extrai customerId com segurança
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoiceUnsafe = invoice as any;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const subscriptionId =
      typeof invoiceUnsafe.subscription === "string"
        ? invoiceUnsafe.subscription
        : (invoiceUnsafe.subscription?.id ?? null);

    // Extrai line item e metadados
    const lineItem = invoice.lines.data?.[0] as Stripe.InvoiceLineItem & {
      price?: { id: string };
      metadata?: { userId?: string };
    };

    const planId = lineItem?.price?.id ?? null;
    const userId = invoice.metadata?.userId ?? lineItem?.metadata?.userId;

    console.log("🔍 Webhook invoice.paid =>", {
      userId,
      customerId,
      subscriptionId,
      planId,
    });

    if (!userId || !customerId || !subscriptionId) {
      console.warn("⚠️ Campos faltando para atualizar usuário:", {
        userId,
        customerId,
        subscriptionId,
      });
      return NextResponse.json({ received: true });
    }

    try {
      await db
        .update(usersTable)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          plan: planId,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));

      console.log("✅ Informações de assinatura salvas no banco.");
    } catch (error) {
      console.error("❌ Erro ao salvar assinatura no banco:", error);
    }
  }

  return NextResponse.json({ received: true });
}
