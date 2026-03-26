import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPaymentTransaction } from "@/lib/midtrans";
import { getPublicSubscriptionPlanByCode } from "@/lib/subscription";
import { buildMidtransCallbacks, buildPaymentOrderId, resolvePaymentSiteContext } from "@/lib/payment-site";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { planCode, plan, websiteCode, originSite } = await request.json();
    const selectedPlanCode = planCode || plan;

    if (!selectedPlanCode) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const subscriptionPlan = await getPublicSubscriptionPlanByCode(selectedPlanCode);
    if (!subscriptionPlan || !subscriptionPlan.isActive) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    if (!subscriptionPlan.isAvailable) {
      return NextResponse.json(
        { error: subscriptionPlan.availabilityNote || "Paket ini sudah tidak tersedia" },
        { status: 400 }
      );
    }

    const siteContext = resolvePaymentSiteContext(request, { websiteCode, originSite });
    const orderId = buildPaymentOrderId({
      websiteCode: siteContext.websiteCode,
      userId: session.user.id,
    });

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        userId: session.user.id,
        planId: subscriptionPlan.id,
        orderId,
        amount: subscriptionPlan.price,
        subscriptionName: subscriptionPlan.name,
        subscriptionCode: subscriptionPlan.code,
        subscriptionDays: subscriptionPlan.durationDays,
        isLifetime: subscriptionPlan.isLifetime,
        status: "pending"
      }
    });

    // Create Midtrans payment
    const midtransTransaction = await createPaymentTransaction({
      orderId,
      amount: subscriptionPlan.price,
      customerDetails: {
        first_name: session.user.name || "User",
        email: session.user.email,
        phone: "08123456789" // You can collect this from user profile
      },
      websiteCode: siteContext.websiteCode,
      originSite: siteContext.originSite,
      planCode: subscriptionPlan.code,
      callbacks: buildMidtransCallbacks(siteContext.originSite, orderId),
    });

    // Update transaction with Midtrans token
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { midtransToken: midtransTransaction.token }
    });

    return NextResponse.json({
      token: midtransTransaction.token,
      redirect_url: midtransTransaction.redirect_url,
      clientKey: process.env.MIDTRANS_CLIENT_KEY, // Send client key to frontend
      orderId,
      websiteCode: siteContext.websiteCode,
      originSite: siteContext.originSite,
      plan: {
        code: subscriptionPlan.code,
        name: subscriptionPlan.name,
        price: subscriptionPlan.price,
        durationDays: subscriptionPlan.durationDays,
        isLifetime: subscriptionPlan.isLifetime,
        remainingSlots: subscriptionPlan.remainingSlots,
        availabilityNote: subscriptionPlan.availabilityNote,
      }
    });
  } catch (error: unknown) {
    console.error("Error creating payment:", error);
    const message = error instanceof Error ? error.message : "Failed to create payment";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
