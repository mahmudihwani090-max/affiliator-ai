import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { calculateSubscriptionEndDate } from "@/lib/subscription";
import { parsePaymentOrderId } from "@/lib/payment-site";

async function activateSubscriptionForTransaction(transaction: {
  id: string
  userId: string
  planId: string
  subscriptionDays: number | null
  isLifetime: boolean
}) {
  const startDate = new Date()
  const endDate = calculateSubscriptionEndDate(transaction.subscriptionDays, transaction.isLifetime)

  return prisma.$transaction(async (tx) => {
    const existingSubscription = await tx.subscription.findFirst({
      where: { transactionId: transaction.id },
      select: { id: true },
    })

    await tx.subscription.updateMany({
      where: {
        userId: transaction.userId,
        status: 'active',
        ...(existingSubscription ? { id: { not: existingSubscription.id } } : {}),
      },
      data: {
        status: 'expired',
        canceledAt: startDate,
        endDate: startDate,
      },
    })

    if (existingSubscription) {
      return tx.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          planId: transaction.planId,
          status: 'active',
          startDate,
          endDate,
          isLifetime: transaction.isLifetime,
          canceledAt: null,
        },
      })
    }

    return tx.subscription.create({
      data: {
        userId: transaction.userId,
        planId: transaction.planId,
        transactionId: transaction.id,
        status: 'active',
        startDate,
        endDate,
        isLifetime: transaction.isLifetime,
      },
    })
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedOrder = parsePaymentOrderId(body.order_id || '');
    
    console.log('[Midtrans Webhook] Received notification:', {
      orderId: body.order_id,
      websiteCode: body.custom_field1 || parsedOrder?.websiteCode || null,
      originSite: body.custom_field2 || null,
      transactionStatus: body.transaction_status,
      paymentType: body.payment_type,
      fraudStatus: body.fraud_status
    });
    
    // Verify Midtrans signature
    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    const signatureKey = body.signature_key;
    const orderId = body.order_id;
    const statusCode = body.status_code;
    const grossAmount = body.gross_amount;
    
    const hash = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex');
    
    if (hash !== signatureKey) {
      console.error('[Midtrans Webhook] Invalid signature!', { orderId });
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    console.log('[Midtrans Webhook] ✅ Signature verified');

    // Update transaction status
    const transaction = await prisma.transaction.findUnique({
      where: { orderId },
      include: { user: true }
    });

    if (!transaction) {
      console.error('[Midtrans Webhook] Transaction not found:', orderId);
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    let transactionStatus = 'pending';
    
    // Handle different transaction statuses
    if (body.transaction_status === 'capture') {
      // For credit card, check fraud status
      if (body.fraud_status === 'accept') {
        transactionStatus = 'success';
      } else if (body.fraud_status === 'challenge') {
        transactionStatus = 'pending'; // Manual review needed
      }
    } else if (body.transaction_status === 'settlement') {
      transactionStatus = 'success';
    } else if (body.transaction_status === 'cancel' || body.transaction_status === 'deny' || body.transaction_status === 'expire') {
      transactionStatus = 'failed';
    } else if (body.transaction_status === 'pending') {
      transactionStatus = 'pending';
    }

    console.log('[Midtrans Webhook] Updating transaction:', {
      orderId,
      websiteCode: body.custom_field1 || parsedOrder?.websiteCode || null,
      oldStatus: transaction.status,
      newStatus: transactionStatus
    });

    const updatedTransaction = await prisma.transaction.update({
      where: { orderId },
      data: {
        status: transactionStatus,
        paymentType: body.payment_type,
        transactionId: body.transaction_id
      },
      include: {
        user: true,
      },
    });

    // If payment successful, activate subscription
    if (transactionStatus === 'success') {
      console.log('[Midtrans Webhook] 💰 Payment successful, activating subscription...', {
        userId: updatedTransaction.userId,
        plan: updatedTransaction.subscriptionCode,
        amount: updatedTransaction.amount,
        websiteCode: body.custom_field1 || parsedOrder?.websiteCode || null,
      });

      const subscription = await activateSubscriptionForTransaction(updatedTransaction)

      console.log('[Midtrans Webhook] ✅ Subscription activated!', {
        subscriptionId: subscription.id,
        userId: updatedTransaction.userId,
        plan: updatedTransaction.subscriptionCode,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        userEmail: updatedTransaction.user.email,
        websiteCode: body.custom_field1 || parsedOrder?.websiteCode || null,
      });

      // TODO: Send email notification to user
      // await sendSubscriptionActivationEmail(transaction.user.email, subscription);
    } else {
      console.log('[Midtrans Webhook] ℹ️ Transaction status:', transactionStatus, '- No action taken');
    }

    return NextResponse.json({ 
      success: true,
      message: 'Webhook processed successfully',
      transactionStatus,
      websiteCode: body.custom_field1 || parsedOrder?.websiteCode || null,
      orderPattern: parsedOrder ? 'structured' : 'legacy',
    });
  } catch (error: any) {
    console.error("[Midtrans Webhook] ❌ Error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook failed" },
      { status: 500 }
    );
  }
}

// GET endpoint for testing (Midtrans will send test notifications)
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "Midtrans webhook endpoint is ready",
    endpoint: "/api/payment/webhook",
    methods: ["POST"],
    note: "Untuk multi-website, gunakan satu endpoint webhook canonical yang mengarah ke database bersama. Website asal diidentifikasi dari order_id terstruktur dan custom_field Midtrans."
  });
}
