import Section from '../components/Section'

const tallyUrl = import.meta.env.VITE_TALLY_FORM_URL || 'https://tally.so/r/placeholder'
const stripeUrl = import.meta.env.VITE_STRIPE_PAYMENT_LINK || 'https://buy.stripe.com/placeholder'

export default function Book() {
  return (
    <>
      {/* Hero */}
      <section className="flex min-h-[40vh] items-center justify-center bg-offblack text-warmwhite">
        <div className="text-center px-6">
          <h1 className="font-display text-4xl font-semibold md:text-6xl">
            Book Your Event
          </h1>
          <p className="mt-4 text-lg text-warmwhite/70">
            Fill out the form below and we&apos;ll confirm your reservation
            within 24 hours.
          </p>
        </div>
      </section>

      {/* Booking Form */}
      <Section>
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-center text-3xl font-semibold mb-2 md:text-4xl">
            Booking Inquiry
          </h2>
          <p className="text-center text-muted mb-8">
            Tell us about your event and preferred dates.
          </p>
          <div className="border border-offblack/10 bg-white">
            <iframe
              src={tallyUrl}
              title="Allusion Venue Booking Form"
              width="100%"
              height="600"
              className="block"
              loading="lazy"
              allow="payment"
            />
          </div>
        </div>
      </Section>

      {/* Deposit */}
      <Section dark className="text-center">
        <h2 className="font-display text-3xl font-semibold text-warmwhite md:text-4xl">
          Secure Your Date
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-warmwhite/60">
          Once your inquiry is confirmed, pay a refundable deposit to lock in
          your reservation. The remaining balance is due 7 days before your
          event.
        </p>
        <a
          href={stripeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block bg-gold px-8 py-3.5 text-sm font-semibold uppercase tracking-widest text-offblack transition-colors hover:bg-gold-light"
        >
          Pay Deposit via Stripe
        </a>
        <p className="mt-4 text-xs text-warmwhite/40">
          Secure payment powered by Stripe. Your deposit is fully refundable up
          to 14 days before the event.
        </p>
      </Section>

      {/* Process */}
      <Section>
        <h2 className="font-display text-center text-3xl font-semibold mb-10 md:text-4xl">
          How It Works
        </h2>
        <div className="grid gap-8 sm:grid-cols-3 text-center">
          {[
            {
              step: '01',
              title: 'Submit Inquiry',
              desc: 'Fill in the form above with your event details and preferred dates.',
            },
            {
              step: '02',
              title: 'Get Confirmation',
              desc: 'We review your request and confirm availability within 24 hours.',
            },
            {
              step: '03',
              title: 'Pay & Reserve',
              desc: 'Pay a refundable deposit to lock in your date. You\'re all set.',
            },
          ].map((item) => (
            <div key={item.step}>
              <p className="font-display text-4xl font-semibold text-gold">
                {item.step}
              </p>
              <h3 className="mt-3 font-display text-xl font-semibold">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}
