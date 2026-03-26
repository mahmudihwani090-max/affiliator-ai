import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import subscriptionPlans from "./subscription-plans.json" with { type: "json" };

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  max: 5,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const plan of subscriptionPlans) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
        price: plan.price,
        durationDays: plan.durationDays,
        isLifetime: plan.isLifetime,
        isActive: plan.isActive,
      },
      create: plan,
    });
  }

  console.log(`Seeded ${subscriptionPlans.length} subscription plans.`);
}

main()
  .catch((error) => {
    console.error("Failed to seed subscription plans:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });