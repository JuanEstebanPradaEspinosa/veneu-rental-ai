import { Link } from 'react-router-dom'
import Section from '../components/Section'

const gallery = [
  {
    src: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80',
    alt: 'Main hall with warm ambient lighting and elegant decor',
  },
  {
    src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
    alt: 'Open lounge area with modern minimalist furniture',
  },
  {
    src: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    alt: 'Event setup with table arrangements and soft lighting',
  },
  {
    src: 'https://images.unsplash.com/photo-1505236858219-8359eb29e329?w=800&q=80',
    alt: 'Intimate corner with artistic wall details and ambient glow',
  },
  {
    src: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&q=80',
    alt: 'Outdoor terrace area with string lights at dusk',
  },
  {
    src: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80',
    alt: 'Prep kitchen with modern appliances and clean surfaces',
  },
]

const amenities = [
  { name: 'WiFi', detail: 'High-speed fiber connection' },
  { name: 'Sound System', detail: 'Professional Bluetooth-enabled PA system' },
  { name: 'Projector & Screen', detail: 'HD projector with 120″ screen' },
  { name: 'Ambient Lighting', detail: 'Dimmable warm and accent lighting' },
  { name: 'Prep Kitchen', detail: 'Full kitchen for catering prep' },
  { name: 'Furniture', detail: 'Tables, chairs, lounge seating included' },
  { name: 'Parking', detail: 'On-site parking for up to 15 vehicles' },
  { name: 'Accessibility', detail: 'Step-free ground floor access' },
]

export default function Venue() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[50vh] items-center justify-center bg-offblack text-warmwhite">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{
            backgroundImage:
              'url(https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80)',
          }}
          role="img"
          aria-label="Venue interior overview"
        />
        <div className="relative z-10 text-center px-6">
          <h1 className="font-display text-4xl font-semibold md:text-6xl">
            The Venue
          </h1>
          <p className="mt-4 text-lg text-warmwhite/70">
            A canvas for your vision — refined, flexible, unforgettable.
          </p>
        </div>
      </section>

      {/* Gallery */}
      <Section>
        <h2 className="font-display text-center text-3xl font-semibold mb-10 md:text-4xl">
          Gallery
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gallery.map((img) => (
            <div key={img.src} className="overflow-hidden">
              <img
                src={img.src}
                alt={img.alt}
                loading="lazy"
                className="h-64 w-full object-cover transition-transform duration-500 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Specs */}
      <Section dark>
        <h2 className="font-display text-center text-3xl font-semibold mb-10 text-warmwhite md:text-4xl">
          Space Specifications
        </h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-center">
          {[
            { label: 'Total Area', value: '180 m²' },
            { label: 'Standing Capacity', value: '50 guests' },
            { label: 'Seated Capacity', value: '30 guests' },
            { label: 'Outdoor Terrace', value: '40 m²' },
          ].map((spec) => (
            <div key={spec.label}>
              <p className="font-display text-3xl font-semibold text-gold">
                {spec.value}
              </p>
              <p className="mt-1 text-sm uppercase tracking-widest text-warmwhite/60">
                {spec.label}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Amenities */}
      <Section>
        <h2 className="font-display text-center text-3xl font-semibold mb-10 md:text-4xl">
          Amenities
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {amenities.map((a) => (
            <div
              key={a.name}
              className="border border-offblack/10 p-6 text-center"
            >
              <h3 className="font-display text-lg font-semibold">{a.name}</h3>
              <p className="mt-1 text-sm text-muted">{a.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section className="text-center">
        <h2 className="font-display text-3xl font-semibold md:text-4xl">
          Love What You See?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted">
          Check our pricing or go ahead and book your date.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            to="/pricing"
            className="inline-block border border-offblack px-8 py-3.5 text-sm font-semibold uppercase tracking-widest text-offblack transition-colors hover:bg-offblack hover:text-warmwhite"
          >
            View Pricing
          </Link>
          <Link
            to="/book"
            className="inline-block bg-offblack px-8 py-3.5 text-sm font-semibold uppercase tracking-widest text-warmwhite transition-colors hover:bg-offblack/80"
          >
            Book Now
          </Link>
        </div>
      </Section>
    </>
  )
}
