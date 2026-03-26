import midtransClient from 'midtrans-client';

// Initialize Snap client
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY || '',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || ''
});

interface CustomerDetails {
  first_name: string
  email: string
  phone?: string
}

interface PaymentTransactionOptions {
  orderId: string
  amount: number
  customerDetails: CustomerDetails
  websiteCode: string
  originSite: string
  planCode: string
  callbacks?: {
    finish: string
    pending: string
    error: string
  }
}

export async function createPaymentTransaction({
  orderId,
  amount,
  customerDetails,
  websiteCode,
  originSite,
  planCode,
  callbacks,
}: PaymentTransactionOptions) {
  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: amount
    },
    customer_details: customerDetails,
    custom_field1: websiteCode,
    custom_field2: originSite,
    custom_field3: planCode,
    enabled_payments: ['gopay', 'shopeepay', 'bank_transfer', 'echannel', 'qris'],
    credit_card: {
      secure: true
    },
    ...(callbacks ? { callbacks } : {}),
  };

  try {
    const transaction = await snap.createTransaction(parameter);
    return transaction;
  } catch (error) {
    console.error('Midtrans error:', error);
    throw error;
  }
}

export async function getTransactionStatus(orderId: string) {
  try {
    const statusResponse = await snap.transaction.status(orderId);
    return statusResponse;
  } catch (error) {
    console.error('Midtrans status error:', error);
    throw error;
  }
}
