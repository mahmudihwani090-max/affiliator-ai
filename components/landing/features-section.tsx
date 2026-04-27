'use client';

import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ImageIcon,
  Video,
  Camera,
  Package2,
  PanelTop,
  Film,
  Workflow,
  MessageSquareMore,
  Coins,
  LucideIcon
} from 'lucide-react';
import { FadeInUpView, StaggerContainerView, ScaleIn } from './animated-section';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
}

const features: Feature[] = [
  {
    icon: ImageIcon,
    title: "Image Generator",
    description: "Generate gambar produk profesional dengan AI. Support reference image dan berbagai style untuk kebutuhan marketing Anda",
    color: "blue"
  },
  {
    icon: Camera,
    title: "Model Studio",
    description: "Buat visual model, beauty portrait, dan editorial shoot premium dengan kontrol gaya dan reference identity.",
    color: "pink"
  },
  {
    icon: Package2,
    title: "Product Studio",
    description: "Generate hero packshot, ecommerce image, dan visual produk komersial dari foto produk Anda.",
    color: "orange"
  },
  {
    icon: PanelTop,
    title: "Thumbnail Generator",
    description: "Bikin thumbnail YouTube, cover short, dan visual hook yang lebih kuat untuk meningkatkan CTR.",
    color: "indigo"
  },
  {
    icon: Video,
    title: "Video Generator",
    description: "Generate video promosi sinematik untuk TikTok, Reels, dan konten short-form dengan AI video.",
    color: "purple"
  },
  {
    icon: Film,
    title: "Frame-to-Frame",
    description: "Transform frame referensi menjadi sequence video baru dengan kontrol visual yang lebih presisi.",
    color: "green"
  },
  {
    icon: Workflow,
    title: "Auto Scene",
    description: "Susun storyboard scene iklan otomatis dari brief produk, model, dan background reference Anda.",
    color: "blue"
  },
  {
    icon: MessageSquareMore,
    title: "UGC Affiliate",
    description: "Generate video review produk bergaya UGC affiliate langsung dari tiga gambar dan prompt terstruktur.",
    color: "purple"
  },
  {
    icon: Coins,
    title: "Subscription Access",
    description: "Pilih paket subscription untuk membuka semua AI tools tanpa batas selama masa aktif.",
    color: "green"
  }
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 px-4 sm:px-6 bg-white/50 dark:bg-slate-900/30">
      <div className="max-w-7xl mx-auto">
        <FadeInUpView className="text-center mb-16">
          <Badge className="mb-4 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
            AI Studio Lengkap
          </Badge>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Semua Tool yang Anda Butuhkan
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Semua fitur utama yang tampil di dashboard tersedia di sini, dari image tools, video tools, sampai subscription access.
          </p>
        </FadeInUpView>

        <StaggerContainerView className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <ScaleIn key={index}>
                <Card className="h-full hover:shadow-lg transition-shadow duration-300 dark:bg-slate-900/50 dark:border-slate-800 group cursor-pointer">
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${feature.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30' :
                      feature.color === 'green' ? 'bg-green-100 dark:bg-green-900/30' :
                        feature.color === 'orange' ? 'bg-orange-100 dark:bg-orange-900/30' :
                          feature.color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/30' :
                            feature.color === 'indigo' ? 'bg-indigo-100 dark:bg-indigo-900/30' :
                              'bg-pink-100 dark:bg-pink-900/30'
                      }`}>
                      <Icon className={`w-6 h-6 ${feature.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                        feature.color === 'green' ? 'text-green-600 dark:text-green-400' :
                          feature.color === 'orange' ? 'text-orange-600 dark:text-orange-400' :
                            feature.color === 'purple' ? 'text-purple-600 dark:text-purple-400' :
                              feature.color === 'indigo' ? 'text-indigo-600 dark:text-indigo-400' :
                                'text-pink-600 dark:text-pink-400'
                        }`} />
                    </div>
                    <CardTitle className="text-lg dark:text-white">{feature.title}</CardTitle>
                    <CardDescription className="dark:text-slate-400 text-sm">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>

                </Card>
              </ScaleIn>
            );
          })}
        </StaggerContainerView>
      </div>
    </section>
  );
}
