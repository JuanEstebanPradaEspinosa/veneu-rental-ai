import { useState, useEffect, Fragment } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import DatePicker from './DatePicker';

const SLOTS = [
  { id: 'morning',   label: 'Morning',   hours: '09:00 — 13:00', price: 250 },
  { id: 'afternoon', label: 'Afternoon', hours: '13:00 — 17:00', price: 250 },
  { id: 'evening',   label: 'Evening',   hours: '18:00 — 22:00', price: 350 },
];

const SLIDESHOW = [
  { src: '/venue/hero.jpg',       alt: 'The main room' },
  { src: '/venue/gallery-04.jpg', alt: 'Community evening · October 2025' },
  { src: '/venue/gallery-03.jpg', alt: 'Speaker night · October 2025' },
  { src: '/venue/gallery-01.jpg', alt: 'Sunday brunch · 2025' },
  { src: '/venue/gallery-05.jpg', alt: 'Aperitivo hour · September 2025' },
];

const GALLERY = [
  { src: '/venue/gallery-01.jpg', caption: 'Sunday brunch · 2025' },
  { src: '/venue/gallery-04.jpg', caption: 'Community evening · Oct 2025' },
  { src: '/venue/gallery-03.jpg', caption: 'Speaker night · Oct 2025' },
  { src: '/venue/gallery-02.jpg', caption: 'Open kitchen · 2025' },
  { src: '/venue/hero-alt.jpg',   caption: 'ICP Belgium meet-up · Sep 2025' },
  { src: '/venue/gallery-05.jpg', caption: 'Aperitivo hour · Sep 2025' },
];

const EVENT_TYPES = [
  {
    n: '01',
    title: 'Supper clubs',
    italic: '& private dinners',
    body: 'Long-table evenings for 20–40 guests. Open kitchen, candlelight, slow service.',
    price: 'From €250',
  },
  {
    n: '02',
    title: 'Founder dinners',
    italic: '& meet-ups',
    body: 'Off-site days, listening sessions, R&D evenings. Wi-fi, screen, and quiet enough to hear the whole table.',
    price: 'From €250',
  },
  {
    n: '03',
    title: 'Private launches',
    italic: '& openings',
    body: 'Press previews, brand evenings, salon openings. Up to 70 standing.',
    price: 'From €350',
  },
];

const STEPS = [
  { n: '01', title: 'Pick a date',       body: 'Open dates appear on the calendar — three-day lead time required.' },
  { n: '02', title: 'Choose a slot',     body: 'Morning, afternoon, or evening. Each slot runs four hours.' },
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
  const [stickyVisible, setStickyVisible] = useState(false);

  // Fetch availability when date changes
  useEffect(() => {
    if (!date) return;
    setSlot('');
    setLoadingAvail(true);
    axios.get(`/api/availability?date=${date}`)
      .then(r => setAvailability(r.data))
      .catch(() => toast.error('Failed to check availability'))
      .finally(() => setLoadingAvail(false));
  }, [date]);

  // Sticky reserve bar — appears after scrolling past the hero
  useEffect(() => {
    let raf = null;
    const update = () => {
      raf = null;
      setStickyVisible(window.scrollY > 700);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const updateForm = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date) return toast.error('Please select a date');
    if (!slot) return toast.error('Please select a time');
    setSubmitting(true);
    try {
      const res = await axios.post('/api/bookings', {
        date, slot, ...form, guests: parseInt(form.guests) || 1,
      });
      setSubmitted(res.data);
      setCalRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Submitted confirmation — keep the existing acknowledgment screen
  if (submitted) {
    const sel = SLOTS.find(s => s.id === slot);
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-20">
        <div className="max-w-lg w-full">
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-mute mb-6">Request received</div>
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

  // Hero booking card — reflects user selections, falls back to placeholders
  const selectedSlot = SLOTS.find(s => s.id === slot);
  const heroDate    = date ? format(parseISO(date), 'd MMMM yyyy') : '12 June 2026';
  const heroDay     = date ? format(parseISO(date), 'EEEE')         : 'Friday';
  const heroSlot    = selectedSlot?.label || 'Afternoon';
  const heroHours   = selectedSlot?.hours || '13 — 17';
  const heroPrice   = selectedSlot?.price || 250;
  const hasSelection = Boolean(date && slot);

  return (
    <>
      <div className="min-h-screen">

        {/* Header — aligned to the split layout */}
        <header className="absolute top-0 inset-x-0 z-30 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
          <div className="px-10 sm:px-16 lg:px-24 py-7 flex items-center justify-between">
            <a href="/" className="font-serif text-2xl tracking-tight text-ink">Allusion</a>
            <nav className="hidden md:flex items-center gap-7 text-ink text-[13px] tracking-wide">
              <a href="#space"    className="hover:text-clay transition-colors">The space</a>
              <a href="#events"   className="hover:text-clay transition-colors">Events</a>
              <a href="#evenings" className="hover:text-clay transition-colors">Past evenings</a>
              <a href="#book"     className="hover:text-clay transition-colors">Book</a>
            </nav>
          </div>
          <div className="hidden lg:flex px-12 py-7 justify-end items-center">
            <span className="text-[11px] uppercase tracking-[0.22em] text-paper hero-shadow">
              Ghent · Belgium
            </span>
          </div>
        </header>

        {/* SPLIT HERO */}
        <section className="relative min-h-screen w-full grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
          {/* LEFT: cream side */}
          <div className="relative bg-paper flex flex-col justify-between px-10 sm:px-16 lg:px-24 py-28 sm:py-32">

            {/* Top: live availability strip */}
            <div className="flex items-center justify-between gap-6 fade-up d1 mt-12 sm:mt-16">
              <div className="flex items-center gap-3 text-[11px] tracking-[0.22em] uppercase text-ink-mute">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-clay live-dot" />
                <span>Now booking · autumn 2026</span>
              </div>
              <span className="hidden lg:block text-[11px] tracking-[0.22em] uppercase text-ink-mute">
                {hasSelection ? 'Your selection' : '12 dates open'}
              </span>
            </div>

            {/* Middle: eyebrow, headline, lead, divider, booking card */}
            <div>
              <div className="text-[12px] uppercase tracking-[0.28em] text-clay mb-7 fade-up d1">
                A private venue · est. 2024
              </div>
              <h1 className="font-serif text-[56px] sm:text-[80px] lg:text-[88px] leading-[0.95] text-ink mb-10 tracking-[-0.015em] fade-up d2">
                A room for<br />the <span className="italic font-light">moments</span><br />that should be<br />remembered.
              </h1>
              <p className="text-ink-soft text-[17px] leading-[1.65] max-w-md mb-9 fade-up d3">
                A 19<sup className="text-[60%] italic">th</sup>-century townhouse in the heart of Ghent.
                High windows, warm timber. Available in four-hour slots — for the
                gatherings that deserve a real room.
              </p>

              <div className="flex items-center gap-5 mb-10 max-w-md fade-up d3">
                <span className="h-px bg-rule w-10 shrink-0" />
                <span className="font-serif italic text-ink-soft text-[15px] whitespace-nowrap">
                  Two years · forty-two evenings
                </span>
                <span className="h-px bg-rule flex-1" />
              </div>

              {/* Booking preview card */}
              <div className="border border-rule bg-paper-soft/60 max-w-md fade-up d4 hero-card-shadow">
                <div className="px-7 py-3.5 border-b border-rule flex items-center justify-between text-[11px] tracking-[0.22em] uppercase">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-clay live-dot" />
                    <span className="text-ink">{hasSelection ? 'Selected' : 'Available'}</span>
                  </div>
                  <span className="text-ink-mute">Quick check</span>
                </div>
                <div className="px-7 pt-7 pb-5">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-ink-mute mb-2.5">{heroDay}</div>
                  <div className="font-serif text-[36px] sm:text-[40px] text-ink leading-none tracking-[-0.005em]">
                    {heroDate}
                  </div>
                </div>
                <div className="px-7 pb-7 grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-ink-mute mb-1.5">Slot</div>
                    <div className="font-serif text-lg text-ink">{heroSlot}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-ink-mute mb-1.5">Hours</div>
                    <div className="font-serif text-lg text-ink">{heroHours}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-ink-mute mb-1.5">{hasSelection ? 'Total' : 'From'}</div>
                    <div className="font-serif text-lg text-ink">€ {heroPrice}</div>
                  </div>
                </div>
                <a
                  href="#book"
                  className="group flex items-center justify-between gap-4 bg-ink text-paper px-7 py-5 hover:bg-clay transition-colors"
                >
                  <span className="text-[11px] uppercase tracking-[0.22em]">
                    {hasSelection ? 'Continue your booking' : 'Reserve a date'}
                  </span>
                  <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                </a>
              </div>
            </div>

            {/* Bottom: hairline + scroll prompt */}
            <div className="border-t border-rule pt-6 mt-10 fade-up d5 flex items-center justify-between">
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-ink-mute">
                <span className="inline-block w-3 h-px bg-ink-mute" />
                <span>Scroll for more</span>
              </div>
              <span className="text-[11px] uppercase tracking-[0.22em] text-ink-mute">No. 01 / 04</span>
            </div>
          </div>

          {/* RIGHT: 5-image crossfade slideshow */}
          <div className="relative overflow-hidden min-h-[60vh] lg:min-h-screen bg-ink">
            <div className="absolute inset-0">
              {SLIDESHOW.map((s, i) => (
                <img
                  key={s.src}
                  src={s.src}
                  alt={s.alt}
                  className={`slide slide-${i + 1}`}
                />
              ))}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between pointer-events-none">
              <span className="text-[11px] uppercase tracking-[0.22em] text-paper hero-shadow">
                Selected from 2024 — 2025
              </span>
              <span className="text-[11px] uppercase tracking-[0.22em] text-paper/75 hero-shadow">
                Ghent · 51.04°N
              </span>
            </div>
          </div>
        </section>

        {/* DARK STATS BAND */}
        <section className="border-y border-rule bg-ink text-paper">
          <div className="max-w-7xl mx-auto px-8 sm:px-12 py-20 sm:py-24">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-y-12 gap-x-10 items-end">
              <div className="md:col-span-5">
                <div className="text-[12px] uppercase tracking-[0.28em] text-paper/60 mb-5">— A premium private venue</div>
                <h2 className="font-serif text-[34px] sm:text-[48px] leading-[1.05] text-paper tracking-[-0.01em]">
                  Two years.<br />Forty-two evenings.<br />
                  <span className="italic font-light text-clay-soft">Now opening more.</span>
                </h2>
              </div>
              <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-y-10 gap-x-8">
                <Stat n="42"      label="Evenings hosted" />
                <Stat n="70"      label="Standing capacity" />
                <Stat n="4 h"     label="Per slot" />
                <Stat n="€ 250"   label="From" highlight />
              </div>
            </div>
          </div>
        </section>

        {/* THE SPACE */}
        <section id="space" className="border-b border-rule">
          <div className="max-w-7xl mx-auto px-8 sm:px-12 py-28 sm:py-36 grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-20 items-start">
            <div className="md:col-span-7 order-2 md:order-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="aspect-[3/4] overflow-hidden bg-paper-soft">
                  <img src="/venue/gallery-02.jpg" className="w-full h-full object-cover" alt="Open kitchen" loading="lazy" />
                </div>
                <div className="aspect-[3/4] overflow-hidden bg-paper-soft mt-16">
                  <img src="/venue/gallery-04.jpg" className="w-full h-full object-cover" alt="Community evening" loading="lazy" />
                </div>
              </div>
            </div>
            <div className="md:col-span-5 order-1 md:order-2 md:sticky md:top-12">
              <div className="text-[11px] uppercase tracking-[0.22em] text-clay mb-5">— The space</div>
              <h2 className="font-serif text-[40px] sm:text-[52px] leading-[1.04] text-ink mb-10 tracking-[-0.01em]">
                Heritage townhouse, <span className="italic font-light">in private hands.</span>
              </h2>
              <p className="text-ink-soft text-[15px] leading-[1.75] mb-6 max-w-md">
                Allusion sits just off Sint-Pietersnieuwstraat — moulded ceilings,
                oak floors, a view onto the gothic spires of the Boekentoren.
              </p>
              <p className="text-ink-soft text-[15px] leading-[1.75] mb-10 max-w-md">
                We host the gatherings that don't fit a hotel ballroom or a
                coworking café — supper clubs, founder dinners, listening sessions,
                intimate launches. Bring your own catering or use our preferred partners.
              </p>
              <div className="grid grid-cols-2 border-t border-rule pt-6 max-w-md">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-ink-mute mb-1">Capacity</div>
                  <div className="font-serif text-xl text-ink">70 standing · 40 seated</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-ink-mute mb-1">Lead time</div>
                  <div className="font-serif text-xl text-ink">3 days minimum</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CINEMATIC IMAGE QUOTE */}
        <section className="relative h-[60vh] min-h-[400px] overflow-hidden">
          <img src="/venue/gallery-03.jpg" alt="Speaker night" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/40" />
          <div className="relative h-full flex items-center px-8 sm:px-12 max-w-7xl mx-auto">
            <div className="max-w-2xl">
              <div className="text-[12px] uppercase tracking-[0.28em] text-paper/80 mb-6 hero-shadow">— What people say</div>
              <p className="font-serif text-paper text-[28px] sm:text-[36px] leading-[1.25] tracking-[-0.005em] hero-shadow">
                "The kind of room you remember the next morning.
                <span className="italic font-light"> Quiet, warm, and confident.</span>"
              </p>
              <div className="mt-8 text-[11px] uppercase tracking-[0.22em] text-paper/80 hero-shadow">
                Founder · Speaker night, Oct 2025
              </div>
            </div>
          </div>
        </section>

        {/* EVENTS */}
        <section id="events" className="border-y border-rule">
          <div className="max-w-7xl mx-auto px-8 sm:px-12 py-28 sm:py-32">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-16 gap-4 max-w-5xl">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-clay mb-5">— What happens here</div>
                <h2 className="font-serif text-[40px] sm:text-[56px] leading-[1.04] text-ink tracking-[-0.01em]">
                  The kind of evening <span className="italic font-light">we're built for.</span>
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {EVENT_TYPES.map(e => (
                <article key={e.n} className="border border-rule bg-paper p-10 group hover:border-ink transition-colors">
                  <div className="flex items-baseline justify-between mb-10">
                    <div className="font-serif text-3xl text-clay">№ {e.n}</div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-ink-mute">{e.price}</div>
                  </div>
                  <h3 className="font-serif text-[26px] leading-[1.15] text-ink mb-4">
                    {e.title}<br /><span className="italic font-light">{e.italic}</span>
                  </h3>
                  <p className="text-ink-soft text-[14px] leading-[1.7]">{e.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* PAST EVENINGS */}
        <section id="evenings" className="border-b border-rule">
          <div className="max-w-7xl mx-auto px-8 sm:px-12 py-28 sm:py-32">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-14 gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-clay mb-5">— Past evenings</div>
                <h2 className="font-serif text-[40px] sm:text-[56px] leading-[1.04] text-ink tracking-[-0.01em]">
                  A selection from <span className="italic font-light">2024 — 2025</span>.
                </h2>
              </div>
              <span className="text-[11px] uppercase tracking-[0.22em] text-ink-mute">Six of forty-two</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5">
              {GALLERY.map((g, i) => (
                <figure key={i} className="gallery-fig">
                  <div className="relative overflow-hidden bg-paper-soft aspect-[4/5]">
                    <img
                      src={g.src}
                      alt={g.caption}
                      loading="lazy"
                      className="gallery-img absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  <figcaption className="mt-3 text-[11px] uppercase tracking-[0.22em] text-ink-mute">
                    {g.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* RESERVE FORM — real DatePicker, real submission */}
        <section id="book" className="border-b border-rule bg-paper-soft/40">
          <div className="max-w-4xl mx-auto px-6 sm:px-10 py-28 sm:py-36">
            <div className="text-[12px] uppercase tracking-[0.28em] text-clay mb-5">Reserve</div>
            <h2 className="font-serif text-[44px] sm:text-[64px] leading-[0.98] text-ink mb-6 tracking-[-0.01em]">
              Hold a date.
            </h2>
            <p className="text-ink-soft text-lg leading-[1.6] max-w-xl mb-4">
              Three short steps. <span className="text-clay">No payment until we approve.</span>
            </p>

            {/* Inline 3-step explainer */}
            <ol className="grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-4 mb-16 mt-12 text-sm">
              {STEPS.map(s => (
                <li key={s.n} className="flex items-baseline gap-3">
                  <span className="font-serif text-clay">{s.n}</span>
                  <div>
                    <div className="font-serif text-ink mb-1">{s.title}</div>
                    <div className="text-ink-mute text-[13px] leading-[1.55]">{s.body}</div>
                  </div>
                </li>
              ))}
            </ol>

            <form onSubmit={handleSubmit} className="space-y-16 pt-12 border-t border-rule">
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
                      const isAvailable   = availability.available.includes(s.id);
                      const isUnavailable = availability.unavailable.includes(s.id);
                      const isSelected    = slot === s.id;
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
                      <input type="text" required value={form.name} onChange={updateForm('name')}
                             placeholder="Jane Smith" className="field" />
                    </Field>
                    <Field label="Email" required>
                      <input type="email" required value={form.email} onChange={updateForm('email')}
                             placeholder="jane@example.com" className="field" />
                    </Field>
                    <Field label="Phone">
                      <input type="tel" value={form.phone} onChange={updateForm('phone')}
                             placeholder="+32 4xx xxx xxx" className="field" />
                    </Field>
                    <Field label="Organisation / event">
                      <input type="text" value={form.organization} onChange={updateForm('organization')}
                             placeholder="Company or event name" className="field" />
                    </Field>
                    <Field label="Expected guests">
                      <input type="number" min="1" max="500" value={form.guests}
                             onChange={updateForm('guests')} className="field" />
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
                  <div className="text-[11px] uppercase tracking-[0.22em] text-ink-mute mb-6">Summary</div>
                  <div className="space-y-4 mb-10">
                    <Row k="Venue"    v="Allusion · Ghent" />
                    <Row k="Date"     v={date} />
                    <Row k="Time"     v={`${selectedSlot?.label} · ${selectedSlot?.hours}`} />
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
                    className="group inline-flex items-center justify-between gap-8 bg-ink text-paper px-8 py-5 w-full sm:w-auto sm:min-w-[400px] hover:bg-clay transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-[11px] uppercase tracking-[0.22em]">
                      {submitting ? 'Sending…' : 'Send request'}
                    </span>
                    <span aria-hidden="true" className="text-base transition-transform group-hover:translate-x-1">→</span>
                  </button>
                </div>
              )}
            </form>
          </div>
        </section>

        {/* FOOTER */}
        <footer>
          <div className="max-w-7xl mx-auto px-8 sm:px-12 py-16 grid grid-cols-1 sm:grid-cols-4 gap-10 items-start">
            <div className="sm:col-span-2">
              <div className="font-serif text-3xl text-ink mb-4">Allusion</div>
              <p className="text-ink-soft text-sm leading-[1.7] max-w-sm">
                A private venue for the gatherings that should be remembered.
                Heritage townhouse, in the heart of Ghent.
              </p>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-ink-mute mb-3">Find us</div>
              <p className="text-ink-soft text-sm leading-[1.7]">
                Sint-Pietersnieuwstraat<br />9000 Ghent · Belgium
              </p>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-ink-mute mb-3">Hello</div>
              <a href="mailto:info@allusion.be" className="text-ink hover:text-clay transition-colors text-sm block mb-1">
                info@allusion.be
              </a>
              <a href="#book" className="text-ink-soft hover:text-clay transition-colors text-sm">
                Book a date →
              </a>
            </div>
          </div>
          <div className="border-t border-rule">
            <div className="max-w-7xl mx-auto px-8 sm:px-12 py-6 text-[11px] uppercase tracking-[0.22em] text-ink-mute flex flex-col sm:flex-row justify-between gap-2">
              <span>© 2026 Allusion · Ghent</span>
              <span>A private venue · est. 2024</span>
            </div>
          </div>
        </footer>

      </div>

      {/* Sticky reserve bar — appears after scrolling past hero */}
      <div className={`sticky-bar ${stickyVisible ? 'visible' : ''} bg-ink text-paper`}>
        <div className="max-w-7xl mx-auto px-6 sm:px-10 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6 text-[13px]">
            <span className="font-serif text-xl">Allusion</span>
            <span className="hidden sm:inline text-paper/70">
              {hasSelection
                ? `${heroDate} · ${heroSlot} · €${heroPrice}`
                : 'Heritage venue · Ghent · from €250'}
            </span>
          </div>
          <a href="#book" className="group inline-flex items-center gap-3 bg-paper text-ink px-5 py-3 hover:bg-clay-soft hover:text-paper transition-colors">
            <span className="text-[11px] uppercase tracking-[0.22em]">
              {hasSelection ? 'Continue booking' : 'Reserve a date'}
            </span>
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
          </a>
        </div>
      </div>

      {/* Component-scoped styles: animations + form fields + sticky bar */}
      <style>{`
        /* Slideshow — 5 images crossfade with subtle zoom */
        .slide {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          opacity: 0;
          animation: slideFade 25s linear infinite;
          will-change: opacity, transform;
        }
        .slide-1 { animation-delay: -1s; }
        .slide-2 { animation-delay: 4s; }
        .slide-3 { animation-delay: 9s; }
        .slide-4 { animation-delay: 14s; }
        .slide-5 { animation-delay: 19s; }
        @keyframes slideFade {
          0%   { opacity: 0; transform: scale(1.00); }
          4%   { opacity: 1; transform: scale(1.02); }
          20%  { opacity: 1; transform: scale(1.10); }
          24%  { opacity: 0; transform: scale(1.12); }
          100% { opacity: 0; transform: scale(1.00); }
        }

        /* Live availability dot — soft, slow pulse */
        @keyframes pulseDot {
          0%, 100% { opacity: 0.5; box-shadow: 0 0 0 0 rgba(122, 51, 32, 0.4); }
          50%      { opacity: 1;   box-shadow: 0 0 0 4px rgba(122, 51, 32, 0);   }
        }
        .live-dot { animation: pulseDot 2.4s ease-in-out infinite; }

        /* Page-load fade up */
        @keyframes fadeUp {
          0% { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 800ms ease-out backwards; }
        .fade-up.d1 { animation-delay: 100ms; }
        .fade-up.d2 { animation-delay: 250ms; }
        .fade-up.d3 { animation-delay: 400ms; }
        .fade-up.d4 { animation-delay: 550ms; }
        .fade-up.d5 { animation-delay: 700ms; }

        /* Gallery hover */
        .gallery-img { transition: transform 700ms ease; }
        .gallery-fig:hover .gallery-img { transform: scale(1.03); }

        /* Hero text shadow helper */
        .hero-shadow { text-shadow: 0 1px 12px rgba(0, 0, 0, 0.65); }

        /* Hero card subtle shadow */
        .hero-card-shadow { box-shadow: 0 2px 24px rgba(21, 19, 15, 0.04); }

        /* Sticky reserve bar */
        .sticky-bar {
          position: fixed; bottom: 0; left: 0; right: 0;
          transform: translateY(100%);
          transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 50;
        }
        .sticky-bar.visible { transform: translateY(0); }

        /* Form fields — kept inline so the rest stays Tailwind-only */
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
          background: rgba(255, 255, 255, 0.4);
        }
        textarea.field:focus { border-color: var(--color-ink); }
      `}</style>
    </>
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

function Stat({ n, label, highlight }) {
  return (
    <div>
      <div className={`font-serif text-5xl mb-2 tracking-[-0.02em] ${highlight ? 'text-clay-soft' : 'text-paper'}`}>
        {n}
      </div>
      <div className="text-[11px] uppercase tracking-[0.22em] text-paper/60">{label}</div>
    </div>
  );
}
