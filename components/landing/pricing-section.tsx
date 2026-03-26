import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { FadeInUpView, StaggerContainerView, ScaleIn } from './animated-section';
import { listPublicSubscriptionPlans } from '@/lib/subscription';

interface PricingPlan {
  code: string;
  name: string;
  price: string;
  duration: string;
  description: string;
  features: string[];
  popular: boolean;
  gradient: string;
  isAvailable: boolean;
  isLifetime: boolean;
  availabilityNote: string | null;
  remainingSlots: number | null;
}

const pricingGradientMap: Record<string, string> = {
  'weekly-7-days': 'from-blue-500 to-indigo-600',
  'monthly-30-days': 'from-purple-500 to-pink-600',
  lifetime: 'from-orange-500 to-red-600',
};

function formatPlanPrice(price: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(price);
}

function getPlanDuration(durationDays: number | null, isLifetime: boolean) {
  if (isLifetime) {
    return 'sekali bayar';
  }

  return `${durationDays || 0} hari akses penuh`;
}

function getPlanFeatures(plan: Awaited<ReturnType<typeof listPublicSubscriptionPlans>>[number]) {
  return [
    'Akses semua AI image & video tools',
    plan.isLifetime ? 'Tanpa masa berlaku' : `${plan.durationDays || 0} hari akses penuh`,
    'Generate tanpa potong kredit per request',
    plan.isLifetime ? 'Batch founding member dengan kuota terbatas' : 'Aktivasi subscription otomatis setelah pembayaran',
  ];
}

export async function PricingSection() {
  const plans = await listPublicSubscriptionPlans();
  const pricingPlans: PricingPlan[] = plans.map((plan) => ({
    code: plan.code,
    name: plan.name,
    price: formatPlanPrice(plan.price),
    duration: getPlanDuration(plan.durationDays, plan.isLifetime),
    description: plan.description || 'Paket subscription AFFILIATOR PRO',
    features: getPlanFeatures(plan),
    popular: plan.code === 'monthly-30-days',
    gradient: pricingGradientMap[plan.code] || 'from-slate-500 to-slate-700',
    isAvailable: plan.isAvailable,
    isLifetime: plan.isLifetime,
    availabilityNote: plan.availabilityNote,
    remainingSlots: plan.remainingSlots,
  }));

  return (
    <section id="pricing" className="py-20 px-4 sm:px-6 bg-white/50 dark:bg-slate-900/30">
      <div className="max-w-7xl mx-auto">
        <FadeInUpView className="text-center mb-16">
          <Badge className="mb-4 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300">
            Harga Spesial
          </Badge>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Pilih Paket yang Cocok
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Investasi kecil untuk hasil maksimal. Semua paket akses penuh!
          </p>
        </FadeInUpView>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* <StaggerContainerView className="contents"> */}
              {pricingPlans.map((plan) => (
                <ScaleIn key={plan.code}>
                  <Card className={`relative h-full ${plan.popular ? 'ring-2 ring-purple-500 dark:ring-purple-400 shadow-xl scale-105' : ''} dark:bg-slate-900/50 dark:border-slate-800`}>
                    {plan.popular && (
                      <div className="absolute -top-4 left-0 right-0 flex justify-center">
                        <Badge className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-4 py-1 text-[10px]">
                          ⭐ PALING POPULER
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pb-8 pt-8">
                      <CardTitle className="text-xl mb-2 dark:text-white">{plan.name}</CardTitle>
                      <div className={`text-4xl font-bold bg-gradient-to-r ${plan.gradient} bg-clip-text text-transparent mb-2`}>
                        {plan.price}
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 text-xs">{plan.duration}</div>
                      <CardDescription className="mt-4 dark:text-slate-400 text-xs">
                        {plan.description}
                      </CardDescription>
                      {plan.isLifetime ? (
                        <div className="mt-4 flex justify-center">
                          <Badge variant={plan.isAvailable ? 'secondary' : 'destructive'} className="text-[10px]">
                            {plan.isAvailable && plan.remainingSlots !== null
                              ? `Lifetime tersisa ${plan.remainingSlots} slot`
                              : 'Lifetime sold out'}
                          </Badge>
                        </div>
                      ) : null}
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3 mb-8">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                            <span className="text-slate-700 dark:text-slate-300 text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      {plan.availabilityNote ? (
                        <p className={`mb-6 text-xs ${plan.isAvailable ? 'text-slate-500 dark:text-slate-400' : 'text-red-500 dark:text-red-400'}`}>
                          {plan.availabilityNote}
                        </p>
                      ) : null}
                      {plan.isAvailable ? (
                        <a href={`/auth/login?callbackUrl=${encodeURIComponent(`/dashboard/credits?plan=${plan.code}`)}`}>
                          <Button
                            className={`w-full ${plan.popular ? 'bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700' : ''}`}
                            size="lg"
                          >
                            Pilih Paket Ini
                          </Button>
                        </a>
                      ) : (
                        <Button className="w-full" size="lg" disabled>
                          Paket Habis
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </ScaleIn>
              ))}
            {/* </StaggerContainerView> */}
        </div>
      </div>
    </section>
  );
}
