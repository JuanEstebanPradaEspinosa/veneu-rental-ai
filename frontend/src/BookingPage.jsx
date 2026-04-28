import { useState, useEffect, Fragment } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DatePicker from './DatePicker';

const SLOTS = [
  { id: 'morning',   label: 'Morning',   hours: '09:00 — 13:00', price: 250 },
  { id: 'afternoon', label: 'Afternoon', hours: '13:00 — 17:00', price: 250 },
  { id: 'evening',   label: 'Evening',   hours: '18:00 — 22:00', price: 350 },
];

const GALLERY = [
  { src: '/venue/gallery-01.jpg', caption: 'Sunday brunch · 2025' },
  { src: '/venue/gallery-04.jpg', caption: 'Community evening · Oct 2025' },
  { src: '/venue/gallery-03.jpg', caption: 'Speaker night · Oct 2025' },
  { src: '/venue/gallery-02.jpg', caption: 'Open kitchen · 2025' },
  { src: '/venue/hero-alt.jpg',   caption: 'ICP Belgium meet-up · Sep 2025' },
  { src: '/venue/gallery-05.jpg', caption: 'Aperitivo hour · Sep 2025' },
];

const STEPS = [
  { n: '01', title: 'Pick a date',    body: 'Open dates appear on the calendar — three-day lead time required.' },
  { n: '02', title: 'Choose a slot',  body: 'Morning, afternoon, or evening. Each slot runs four hours.' },
  { n: '03', title: 'Send your details', body: "We reply within two working days. No payment until we approve." },
];

export default function BookingPage() {
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [availability, setAvailability] = useState({ available: [], unavailable: [] });
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', organization: '', guests: 1, message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [calRefreshKey, setCalRefreshKey] = useState(0);

  useEffect(() => {
    if (!date) return;
    setSlot('');
    setLoadingAvail(true);
    axios.get(`/api/availability?date=${date}`)
      .then(r => setAvailability(r.data))
      .catch(() => toast.error('Failed to check availability'))
      .finally(() => setLoadingAvail(false));
  }, [date]);

  const updateForm = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date) return toast.error('Please select a date');
    if (!slot) return toast.error('Please select a time');
    setSubmitting(true);
    try {
      const res = await axios.post('/api/bookings', { date, slot, ...form, guests: parseInt(form.guests) || 1 });
      setSubmitted(res.data);
      setCalRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    const sel = SLOTS.find(s => s.id === slot);
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-20">
        <div className="max-w-lg w-full">
          <div className="text-[11px] uppercase tracking-[0.2em] text-ink-mute mb-6">Request received</div>
          <h2 className="font-serif text-5xl leading-[1.05] text-ink mb-6">
            Thank you. <span className="italic text-ink-soft">We will be in touch.</span>
          </h2>
          <p className="text-ink-soft text-base leading-relaxed mb-10 max-w-md">
            We've recorded your request. Allusion will review it and reply by email within
            two working days. Payment is only requested after approval.
          </p>
          <div className="border-t border-rule pt-6 space-y-3 text-sm">
            <Row k="Date" v={date} />
            <Row k="Time" v={`${sel?.label} · ${sel?.hours}`} />
            <Row k="Reference" v={submitted.id} mono />
          </div>
        </div>
      </div>
    );
  }

  const selectedSlot = SLOTS.find(s => s.id === slot);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-20 px-6 sm:px-10 py-6 flex items-center justify-between">
        <a href="/" className="font-serif text-xl tracking-tight text-paper">
          Allusion
        </a>
        <span className="text-[11px] uppercase tracking-[0.22em] text-paper/70">
          Ghent · Belgium
        </span>
      </header>

      {/* Hero */}
      <section className="relative h-[88vh] min-h-[560px] w-full overflow-hidden">
        <img
          src="/venue/hero.jpg"
          alt="A gathering at Allusion, Ghent"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Two stacked layers: a soft top-down darken + a stronger bottom plate where the copy sits */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/80" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="relative h-full flex flex-col justify-end px-6 sm:px-10 pb-16 max-w-5xl">
          <div className="text-sm sm:text-base uppercase tracking-[0.28em] text-paper mb-7"
               style={{ textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}>
            A venue · est. 2024
          </div>
          <h1 className="font-serif text-paper text-[44px] sm:text-7xl leading-[0.98] mb-6 max-w-3xl"
              style={{ textShadow: '0 2px 24px rgba(0,0,0,0.55)' }}>
            A room for the <span className="italic">moments</span><br />
            that should be remembered.
          </h1>
          <p className="text-paper text-lg max-w-xl leading-relaxed mb-9"
             style={{ textShadow: '0 1px 14px rgba(0,0,0,0.65)' }}>
            A heritage space in the heart of Ghent — high windows, warm timber,
            available in four-hour slots. Hosted dinners, talks, screenings, parties.
          </p>
          <a
            href="#reserve"
            className="inline-flex items-center gap-3 text-paper text-sm uppercase tracking-[0.2em] bg-paper/10 hover:bg-paper/20 border border-paper/70 hover:border-paper px-5 py-3 backdrop-blur-sm w-fit transition-colors"
          >
            Reserve a date
            <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      {/* Intro band */}
      <section className="max-w-6xl mx-auto px-6 sm:px-10 py-24 sm:py-32 grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16">
        <div className="md:col-span-4">
          <div className="text-sm sm:text-base uppercase tracking-[0.28em] text-ink-soft mb-4">
            The space
          </div>
        </div>
        <div className="md:col-span-8">
          <p className="font-serif text-3xl sm:text-4xl leading-[1.2] text-ink mb-8">
            Allusion sits inside a 19th-century townhouse just off
            Sint-Pietersnieuwstraat — moulded ceilings, oak floors, a view onto
            the gothic spires of the Boekentoren and Sint-Pieter.
          </p>
          <p className="text-ink-soft text-base leading-[1.7] max-w-2xl">
            We host the gatherings that don't fit a hotel ballroom or a coworking
            café — supper clubs, founder dinners, R&amp;D meet-ups, listening
            sessions, intimate launches. Capacity up to 70 standing, 40 seated.
            BYO catering or use our preferred partners.
          </p>
        </div>
      </section>

      {/* Past events gallery */}
      <section className="border-t border-rule">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-20 sm:py-24">
          <div className="flex items-end justify-between mb-12">
            <h2 className="font-serif text-3xl sm:text-4xl text-ink">Past evenings</h2>
            <span className="text-[11px] uppercase tracking-[0.22em] text-ink-mute hidden sm:block">
              Selected, 2024 — 2025
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
            {GALLERY.map((g, i) => (
              <figure key={i} className="group">
                <div className="relative overflow-hidden bg-paper-soft aspect-[4/5]">
                  <img
                    src={g.src}
                    alt={g.caption}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                </div>
                <figcaption className="mt-3 text-[11px] uppercase tracking-[0.18em] text-ink-mute">
                  {g.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Reserve */}
      <section id="reserve" className="border-t border-rule bg-paper-soft/40">
        <div className="max-w-4xl mx-auto px-6 sm:px-10 py-20 sm:py-28">
          <div className="text-sm sm:text-base uppercase tracking-[0.28em] text-ink-soft mb-4">
            Reserve
          </div>
          <h2 className="font-serif text-4xl sm:text-5xl text-ink mb-4 leading-[1.05]">
            Hold a date.
          </h2>
          <p className="text-ink-soft text-base leading-relaxed max-w-xl mb-12">
            Three short steps — start at the calendar below.
          </p>

          {/* How to reserve · 3 steps with arrows */}
          <ol className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-y-6 gap-x-4 items-start mb-16 pb-16 border-b border-rule">
            {STEPS.map((s, i) => (
              <Fragment key={s.n}>
                <li className="md:px-1">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="font-serif text-clay text-lg">{s.n}</span>
                    <h3 className="font-serif text-xl text-ink">{s.title}</h3>
                  </div>
                  <p className="text-ink-soft text-sm leading-relaxed">{s.body}</p>
                </li>
                {i < STEPS.length - 1 && (
                  <li
                    aria-hidden="true"
                    className="hidden md:flex items-center justify-center text-ink-mute text-2xl pt-1 select-none"
                  >
                    →
                  </li>
                )}
              </Fragment>
            ))}
          </ol>

          {/* On-ramp arrow pointing into the form */}
          <div className="flex items-center gap-3 mb-10 text-ink-soft">
            <span aria-hidden="true" className="text-2xl">↓</span>
            <span className="text-[11px] uppercase tracking-[0.22em]">Start here</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-16">
            {/* 01 — Date */}
            <Step number="01" title="Date">
              <DatePicker value={date} onChange={d => setDate(d)} refreshKey={calRefreshKey} />
            </Step>

            {/* 02 — Time */}
            {date && (
              <Step
                number="02"
                title="Time"
                aside={loadingAvail ? 'Checking availability…' : null}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-rule border border-rule">
                  {SLOTS.map(s => {
                    const isAvailable = availability.available.includes(s.id);
                    const isUnavailable = availability.unavailable.includes(s.id);
                    const isSelected = slot === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={isUnavailable || loadingAvail}
                        onClick={() => setSlot(s.id)}
                        className={`relative text-left px-6 py-7 transition-colors duration-150
                          ${isSelected
                            ? 'bg-ink text-paper'
                            : isUnavailable
                            ? 'bg-paper text-ink-mute cursor-not-allowed'
                            : 'bg-paper hover:bg-paper-soft cursor-pointer'
                          }`}
                      >
                        <div className={`text-[10px] uppercase tracking-[0.22em] mb-3 ${isSelected ? 'text-paper/60' : 'text-ink-mute'}`}>
                          {s.label}
                        </div>
                        <div className={`font-serif text-2xl mb-1 ${isSelected ? 'text-paper' : 'text-ink'}`}>
                          {s.hours}
                        </div>
                        <div className={`text-sm ${isSelected ? 'text-paper/70' : 'text-ink-soft'}`}>
                          € {s.price} · 4 hours
                        </div>
                        {isUnavailable && (
                          <div className="absolute top-4 right-5 text-[10px] uppercase tracking-[0.2em] text-ink-mute">
                            Booked
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Step>
            )}

            {/* 03 — Details */}
            {slot && (
              <Step number="03" title="Your details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-7">
                  <Field label="Full name" required>
                    <input
                      type="text" required
                      value={form.name}
                      onChange={updateForm('name')}
                      placeholder="Jane Smith"
                      className="field"
                    />
                  </Field>
                  <Field label="Email" required>
                    <input
                      type="email" required
                      value={form.email}
                      onChange={updateForm('email')}
                      placeholder="jane@example.com"
                      className="field"
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={updateForm('phone')}
                      placeholder="+32 4xx xxx xxx"
                      className="field"
                    />
                  </Field>
                  <Field label="Organisation / event">
                    <input
                      type="text"
                      value={form.organization}
                      onChange={updateForm('organization')}
                      placeholder="Company or event name"
                      className="field"
                    />
                  </Field>
                  <Field label="Expected guests">
                    <input
                      type="number" min="1" max="500"
                      value={form.guests}
                      onChange={updateForm('guests')}
                      className="field"
                    />
                  </Field>
                  <div className="hidden sm:block" />
                  <Field label="A few words about the evening" full>
                    <textarea
                      rows={4}
                      value={form.message}
                      onChange={updateForm('message')}
                      placeholder="Setup, AV, dietary needs, anything we should know."
                      className="field resize-none"
                    />
                  </Field>
                </div>
              </Step>
            )}

            {/* Summary + submit */}
            {slot && form.name && form.email && (
              <div className="border-t border-rule pt-10">
                <div className="text-[11px] uppercase tracking-[0.22em] text-ink-mute mb-6">
                  Summary
                </div>
                <div className="space-y-4 mb-10">
                  <Row k="Venue" v="Allusion · Ghent" />
                  <Row k="Date" v={date} />
                  <Row k="Time" v={`${selectedSlot?.label} · ${selectedSlot?.hours}`} />
                  <Row k="Duration" v="4 hours" />
                  <div className="border-t border-rule pt-4 flex items-baseline justify-between">
                    <span className="text-ink-soft text-sm">Total</span>
                    <span className="font-serif text-3xl text-ink">€ {selectedSlot?.price}</span>
                  </div>
                </div>
                <p className="text-ink-mute text-xs leading-relaxed mb-8 max-w-md">
                  No payment today. You will only be charged once Allusion has reviewed
                  and approved your request — a payment link will follow by email.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="group inline-flex items-center justify-between gap-8 bg-ink text-paper px-8 py-5 w-full sm:w-auto sm:min-w-[360px] hover:bg-ink-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-sm uppercase tracking-[0.22em]">
                    {submitting ? 'Sending…' : 'Send request'}
                  </span>
                  <span aria-hidden="true" className="text-base transition-transform group-hover:translate-x-1">→</span>
                </button>
              </div>
            )}
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-rule">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="font-serif text-2xl text-ink">Allusion</div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-mute">
            Ghent · Belgium · info@allusion.be
          </div>
        </div>
      </footer>

      {/* Field styles — kept inline so the rest of the file stays tailwind-only */}
      <style>{`
        .field {
          width: 100%;
          background: transparent;
          border: 0;
          border-bottom: 1px solid var(--color-rule);
          padding: 8px 0 10px;
          font-family: var(--font-sans);
          font-size: 15px;
          color: var(--color-ink);
          outline: none;
          transition: border-color 150ms ease;
        }
        .field::placeholder { color: var(--color-ink-mute); }
        .field:focus { border-bottom-color: var(--color-ink); }
        textarea.field {
          border: 1px solid var(--color-rule);
          padding: 12px 14px;
          background: rgba(255,255,255,0.4);
        }
        textarea.field:focus { border-color: var(--color-ink); }
      `}</style>
    </div>
  );
}

function Step({ number, title, aside, children }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
      <div className="md:col-span-3">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-ink-mute text-lg">{number}</span>
          <h3 className="font-serif text-2xl text-ink">{title}</h3>
        </div>
        {aside && (
          <div className="text-[11px] uppercase tracking-[0.2em] text-clay mt-2">
            {aside}
          </div>
        )}
      </div>
      <div className="md:col-span-9">{children}</div>
    </section>
  );
}

function Field({ label, required, full, children }) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="block text-[10px] uppercase tracking-[0.22em] text-ink-mute mb-2">
        {label}{required && <span className="text-clay"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-ink-mute text-sm">{k}</span>
      <span className={`text-ink ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{v}</span>
    </div>
  );
}
