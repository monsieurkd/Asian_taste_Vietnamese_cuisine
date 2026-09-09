import { Link } from 'react-router-dom';
import { ArrowDownIcon } from '@heroicons/react/24/outline';

export function Hero() {
  return (
    <section className="relative h-[400px] overflow-hidden md:h-[480px] lg:h-[600px]">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/80 via-secondary/70 to-primary/60" />
        {/* Placeholder for hero image - replace with actual image */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1920&q=80')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-secondary/40" />
      </div>

      {/* Content */}
      <div className="relative flex h-full flex-col items-center justify-center px-4 text-center">
        <div className="max-w-3xl animate-fade-in-up">
          <h1 className="mb-4 text-3xl font-bold text-white md:text-4xl lg:text-5xl">
            Taste of Happiness
          </h1>
          <p className="mb-8 text-lg text-white/90 md:text-xl lg:text-2xl">
            Authentic Vietnamese flavors, made fresh daily with love
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link
              to="/menu"
              className="btn-primary px-8 py-4 text-base md:text-lg"
            >
              Order Now
            </Link>
            <Link
              to="/menu"
              className="btn-secondary border-white bg-transparent text-white hover:bg-white/10"
            >
              View Menu
            </Link>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-8 animate-bounce">
          <ArrowDownIcon className="h-8 w-8 text-white/70" />
        </div>
      </div>
    </section>
  );
}
