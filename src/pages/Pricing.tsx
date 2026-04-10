import { Link } from 'react-router-dom'
import Section from '../components/Section'

const tiers = [
  {
    name: 'Half Day',
    price: '€350',
    duration: 'Up to 5 hours',
    features: [
      'Full venue access',
      'Tables & chairs included',
      'Sound system & projector',
      'WiFi',
      'On-site parking',
    ],
    highlighted: false,
  },
  {
    name: 'Full Day',
    price: '€600',
    duration: 'Up to 10 hours',
    features: [
      'Everything in Half Day',
      'Prep kitchen access',
      'Ambient lighting control',
      'Early setup option',
      'Dedicated support contact',
    ],
    highlighted: true,
  },
  {
    name: 'Weekend',
    price: '€1,000',
    duration: 'Friday evening – Sunday',
    features: [
      'Everything in Full Day',
      'Extended access (2+ days)',
      'Overnight decoration setup',
      'Outdoor terrace included',
      'Priority booking',
    ],
    highlighted: false,
  },
]

const included = [
  'Tables, chairs, and lounge furniture',
  'Professional Bluetooth sound system',
  'HD projector and 120″ screen',
  'High-speed WiFi',
  'Dimmable ambient and accent lighting',
  'On-site parking (up to 15 vehicles)',
  'Restroom facilities',
  'Post-event cleanup assistance',
]

export default function Pricing() {
  return (
    <>
      {/* Hero */}
      <section className="flex min-h-[40vh] items-center justify-center bg-offblack text-warmwhite">
        <div className="text-center px-6">
          <h1 className="font-display text-4xl font-semibold md:text-6xl">
            Pricing
          </h1>
          <p className="mt-4 text-lg text-warmwhite/70">
            Transparent rates. No hidden fees.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <Section>
        <div className="grid gap-8 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`flex flex-col border p-8 ${
                tier.highlighted
                  ? 'border-gold bg-offblack text-warmwhite'
                  : 'border-offblack/10'
              }`}
            >
              <h2
                className={`font-display text-2xl font-semibold ${
                  tier.highlighted ? 'text-gold' : ''
                }`}
              >
                {tier.name}
              </h2>
              <p
                className={`mt-1 text-sm ${
                  tier.highlighted ? 'text-warmwhite/60' : 'text-muted'
                }`}
              >
                {tier.duration}
              </p>
              <p className="mt-6 font-display text-4xl font-semibold">
                {tier.price}
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className={`flex items-start gap-2 text-sm ${
                      tier.highlighted ? 'text-warmwhite/80' : 'text-muted'
                    }`}
                  >
                    <span
                      className={`mt-0.5 ${
                        tier.highlighted ? 'text-gold' : 'text-gold'
                      }`}
                      aria-hidden="true"
                    >
                      &#10003;
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/book"
                className={`mt-8 block text-center px-6 py-3 text-sm font-semibold uppercase tracking-widest transition-colors ${
                  tier.highlighted
                    ? 'bg-gold text-offblack hover:bg-gold-light'
                    : 'bg-offblack text-warmwhite hover:bg-offblack/80'
                }`}
              >
                Book {tier.name}
              </Link>
            </div>
          ))}
        </div>
      </Section>

      {/* What's Included */}
      <Section dark>
        <h2 className="font-display text-center text-3xl font-semibold text-warmwhite mb-10 md:text-4xl">
          What&apos;s Always Included
        </h2>
        <div className="mx-auto max-w-2xl grid gap-4 sm:grid-cols-2">
          {included.map((item) => (
            <div key={item} className="flex items-start gap-3 text-sm text-warmwhite/80">
              <span className="mt-0.5 text-gold" aria-hidden="true">
                &#10003;
              </span>
              {item}
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section className="text-center">
        <h2 className="font-display text-3xl font-semibold md:text-4xl">
          Find Your Perfect Package
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted">
          Not sure which tier fits? Tell us about your event and we&apos;ll help
          you choose.
        </p>
        <Link
          to="/book"
          className="mt-8 inline-block bg-offblack px-8 py-3.5 text-sm font-semibold uppercase tracking-widest text-warmwhite transition-colors hover:bg-offblack/80"
        >
          Get in Touch
        </Link>
      </Section>
    </>
  )
}
