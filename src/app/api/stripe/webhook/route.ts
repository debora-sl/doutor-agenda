import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@/db";
import { usersTable } from "@/db/schema";

export const runtime = "nodejs";
export const preferredRegion = "home";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-05-28.basil", // versão estável e compatível
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

    // Corrige a tipagem do customer
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;

    // Acessa subscription mesmo não tipado oficialmente
    const subscriptionRaw = (invoice as unknown as Record<string, unknown>)[
      "subscription"
    ];
    const subscriptionId =
      typeof subscriptionRaw === "string"
        ? subscriptionRaw
        : (subscriptionRaw?.toString() ?? null);

    // Acessa o plano (price.id) com tipagem segura
    const item = invoice.lines.data?.[0] as Stripe.InvoiceLineItem & {
      price?: { id: string };
    };
    const planId = item?.price?.id ?? null;

    // Acessa userId a partir do metadata
    const userId = invoice.metadata?.userId ?? item?.metadata?.userId;

    console.log("🔍 Webhook invoice.paid => userId:", userId);

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
