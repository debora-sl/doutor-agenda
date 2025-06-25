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
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;

    // Extrai customerId com segurança
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : (invoice.customer?.id ?? null);

    // Acessa subscription (não tipado oficialmente) com fallback seguro
    const subscriptionId =
      typeof (invoice as any).subscription === "string"
        ? (invoice as any).subscription
        : ((invoice as any).subscription?.id ?? null);

    // Extrai line item e tipa metadados
    const lineItem = invoice.lines.data?.[0] as Stripe.InvoiceLineItem & {
      price?: { id: string };
      metadata?: { userId?: string };
    };

    const planId = lineItem?.price?.id ?? null;

    // Tenta pegar o userId do invoice.metadata ou do line item
    const userId =
      invoice.metadata?.userId ?? lineItem?.metadata?.userId ?? null;

    console.log("🔍 Webhook invoice.paid =>", {
      userId,
      customerId,
      subscriptionId,
      planId,
    });

    if (!userId || !customerId || !subscriptionId) {
      console.warn("⚠️ Campos faltando para salvar assinatura:", {
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

      console.log("✅ Informações de assinatura atualizadas no banco.");
    } catch (error) {
      console.error("❌ Erro ao atualizar dados no banco:", error);
    }
  }

  return NextResponse.json({ received: true });
}
