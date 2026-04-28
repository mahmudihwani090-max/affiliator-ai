import subscriptionPlanCatalog from "../prisma/subscription-plans.json";

import { prisma } from "./prisma";
export { formatPrice } from "./format-price";

/**
 * Operation types for subscription access checks
 */
export type SubscriptionOperationType =
  | "textToImage"
  | "imageToImage"
  | "upscaleImage"
  | "upscaleVideo"
  | "upscaleVideo4K"
  | "extendVideo"
  | "textToVideo"
  | "imageToVideo";



type SubscriptionPlanCatalogItem = {
  code: string;
  name: string;
  description: string;
  price: number;
  durationDays: number | null;
  isLifetime: boolean;
  isActive: boolean;
};

export const SUBSCRIPTION_PLAN_CATALOG =
  subscriptionPlanCatalog as SubscriptionPlanCatalogItem[];

export type SubscriptionPlanCode = string;

type SubscriptionPlanRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number | null;
  isLifetime: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicSubscriptionPlan = SubscriptionPlanRecord & {
  isAvailable: boolean;
  limit: number | null;
  claimedSlots: number | null;
  remainingSlots: number | null;
  availabilityNote: string | null;
};

function mapCatalogPlans() {
  return SUBSCRIPTION_PLAN_CATALOG.map((plan) => ({
    id: plan.code,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    durationDays: plan.durationDays,
    isLifetime: plan.isLifetime,
    isActive: plan.isActive,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

async function shouldUseCatalogFallback() {
  try {
    const totalPlans = await prisma.subscriptionPlan.count();
    return totalPlans === 0;
  } catch {
    return true;
  }
}

function findCatalogPlanByCode(code: string): SubscriptionPlanRecord | null {
  return mapCatalogPlans().find((plan) => plan.code === code) ?? null;
}

function toPublicSubscriptionPlan(
  plan: SubscriptionPlanRecord
): PublicSubscriptionPlan {
  return {
    ...plan,
    isAvailable: plan.isActive,
    limit: null,
    claimedSlots: null,
    remainingSlots: null,
    availabilityNote: null,
  };
}

export function calculateSubscriptionEndDate(
  durationDays?: number | null,
  isLifetime?: boolean
) {
  if (isLifetime || !durationDays) {
    return null;
  }

  const endDate = new Date();
  endDate.setDate(endDate.getDate() + durationDays);
  return endDate;
}

export function isSubscriptionActive(
  subscription:
    | {
        status: string;
        isLifetime: boolean;
        endDate: Date | null;
      }
    | null
    | undefined
) {
  if (!subscription || subscription.status !== "active") {
    return false;
  }

  if (subscription.isLifetime) {
    return true;
  }

  return Boolean(subscription.endDate && subscription.endDate > new Date());
}

export async function syncExpiredSubscriptions(userId?: string) {
  const now = new Date();

  await prisma.subscription.updateMany({
    where: {
      status: "active",
      isLifetime: false,
      endDate: { lt: now },
      ...(userId ? { userId } : {}),
    },
    data: {
      status: "expired",
    },
  });
}

export async function listActiveSubscriptionPlans() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: [
        { isLifetime: "asc" },
        { durationDays: "asc" },
        { price: "asc" },
      ],
    });
    

    if (plans.length > 0) {
      return plans;
    }
  } catch {
    return mapCatalogPlans().filter((plan) => plan.isActive);
  }

  return mapCatalogPlans().filter((plan) => plan.isActive);
}

export async function listPublicSubscriptionPlans() {
  const plans = await listActiveSubscriptionPlans();
  return plans.map((plan) => toPublicSubscriptionPlan(plan));
}

export async function listSubscriptionPlans() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: [
        { isActive: "desc" },
        { isLifetime: "asc" },
        { durationDays: "asc" },
        { price: "asc" },
      ],
    });

    if (plans.length > 0) {
      return plans;
    }
  } catch {
    return mapCatalogPlans();
  }

  return mapCatalogPlans();
}

export async function getSubscriptionPlanByCode(code: string) {
  try {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { code },
    });

    if (plan) {
      return plan;
    }

    if (await shouldUseCatalogFallback()) {
      return findCatalogPlanByCode(code);
    }

    return null;
  } catch {
    return findCatalogPlanByCode(code);
  }
}

export async function getPublicSubscriptionPlanByCode(code: string) {
  const plan = await getSubscriptionPlanByCode(code);

  if (!plan) {
    return null;
  }

  return toPublicSubscriptionPlan(plan);
}

export async function getActiveSubscriptionByUserId(userId: string) {
  await syncExpiredSubscriptions(userId);

  return prisma.subscription.findFirst({
    where: {
      userId,
      status: "active",
      OR: [
        { isLifetime: true },
        { endDate: { gt: new Date() } },
      ],
    },
    include: {
      plan: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getCurrentSubscription(userId: string) {
  const activeSubscription = await getActiveSubscriptionByUserId(userId);
  if (activeSubscription) {
    return activeSubscription;
  }

  return prisma.subscription.findFirst({
    where: { userId },
    include: {
      plan: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function checkSubscriptionStatus(userId: string) {
  const subscription = await getCurrentSubscription(userId);

  return {
    subscription,
    isActive: isSubscriptionActive(subscription),
  };
}
