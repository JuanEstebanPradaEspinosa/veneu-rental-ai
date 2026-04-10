import { Link } from 'react-router-dom'
import Section from '../components/Section'

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden bg-offblack text-warmwhite">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{
            backgroundImage:
              'url(https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1600&q=80)',
          }}
          role="img"
          aria-label="Elegant venue interior with warm ambient lighting"
        />
        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-gold">
            Private Events &middot; Belgium
          </p>
          <h1 className="font-display text-5xl font-semibold leading-tight md:text-7xl md:leading-tight">
            Where Moments
            <br />
            Become <em className="text-gold">Memories</em>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-warmwhite/70 md:text-xl">
            An intimate, design-forward space for celebrations, creative
            sessions, and gatherings that deserve something extraordinary.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              to="/book"
              className="inline-block rounded-none bg-gold px-8 py-3.5 text-sm font-semibold uppercase tracking-widest text-offblack transition-colors hover:bg-gold-light"
            >
              Reserve Your Date
            </Link>
            <Link
              to="/venue"
              className="inline-block border border-warmwhite/30 px-8 py-3.5 text-sm font-semibold uppercase tracking-widest text-warmwhite transition-colors hover:border-warmwhite"
            >
              Explore the Space
            </Link>
          </div>
        </div>
      </section>

      {/* Intro */}
      <Section>
        <div className="text-center">
          <h2 className="font-display text-3xl font-semibold md:text-4xl">
            A Space Designed for You
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">
            Allusion is a thoughtfully curated venue that adapts to your vision.
            Whether it&apos;s a birthday dinner, a product launch, a creative
            workshop, or a private celebration — the space is yours to define.
          </p>
        </div>
      </Section>

      {/* Highlights */}
      <Section dark>
        <div className="grid gap-12 md:grid-cols-3">
          {[
            {
              title: 'Intimate Capacity',
              desc: 'Designed for gatherings of up to 50 guests, ensuring every event feels personal.',
              icon: '✦',
            },
            {
              title: 'Fully Equipped',
              desc: 'Professional sound system, projector, ambient lighting, and a prep kitchen at your disposal.',
              icon: '✦',
            },
            {
              title: 'Effortless Booking',
              desc: 'Submit your inquiry online, receive a confirmation, and pay your deposit — all in minutes.',
              icon: '✦',
            },
          ].map((item) => (
            <div key={item.title} className="text-center">
              <span
                className="mb-4 inline-block text-2xl text-gold"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <h3 className="font-display text-xl font-semibold text-warmwhite">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-warmwhite/60">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section className="text-center">
        <h2 className="font-display text-3xl font-semibold md:text-4xl">
          Ready to Host Your Event?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted">
          Browse our pricing, explore the venue details, or jump straight to
          booking. We&apos;ll take care of the rest.
        </p>
        <Link
          to="/book"
          className="mt-8 inline-block bg-offblack px-8 py-3.5 text-sm font-semibold uppercase tracking-widest text-warmwhite transition-colors hover:bg-offblack/80"
        >
          Book Now
        </Link>
      </Section>
    </>
  )
}
