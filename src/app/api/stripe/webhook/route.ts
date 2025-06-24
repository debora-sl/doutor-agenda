import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@/db";
import { usersTable } from "@/db/schema";

export const POST = async (request: Request) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Stripe keys not configured");
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("Missing Stripe signature");
    }

    const text = await request.text();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-05-28.basil",
    });

    const event = stripe.webhooks.constructEvent(
      text,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    switch (event.type) {
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;

        const lineItem = invoice.lines.data?.[0];
        const parent = lineItem?.parent as {
          subscription_details?: {
            subscription: string;
            metadata?: {
              userId?: string;
            };
          };
        };

        const subscriptionId = parent?.subscription_details?.subscription;
        const userId = parent?.subscription_details?.metadata?.userId;
        const customerId = invoice.customer?.toString();

        if (!subscriptionId || !userId || !customerId) {
          console.error("Missing subscription ID, user ID, or customer ID");
          return new NextResponse("Missing data", { status: 400 });
        }

        await db
          .update(usersTable)
          .set({
            stripeSubscriptionId: subscriptionId,
            stripeCustomerId: customerId,
            plan: "essential",
          })
          .where(eq(usersTable.id, userId));

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) {
          console.error("Missing user ID on subscription deletion");
          return new NextResponse("Missing user ID", { status: 400 });
        }

        await db
          .update(usersTable)
          .set({
            stripeSubscriptionId: null,
            stripeCustomerId: null,
            plan: null,
          })
          .where(eq(usersTable.id, userId));

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook error:", (err as Error).message);
    return new NextResponse("Webhook error", { status: 400 });
  }
};
