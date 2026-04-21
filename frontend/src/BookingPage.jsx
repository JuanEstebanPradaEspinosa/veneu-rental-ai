import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DatePicker from './DatePicker';

const SLOTS = [
  { id: 'morning',   label: 'Morning',   hours: '09:00 – 13:00', price: 250, icon: '🌅', duration: '4 hours' },
  { id: 'afternoon', label: 'Afternoon', hours: '13:00 – 17:00', price: 250, icon: '☀️', duration: '4 hours' },
  { id: 'evening',   label: 'Evening',   hours: '18:00 – 22:00', price: 350, icon: '🌙', duration: '4 hours' },
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
    if (!slot) return toast.error('Please select a time slot');
    setSubmitting(true);
    try {
      const res = await axios.post('/api/bookings', { date, slot, ...form, guests: parseInt(form.guests) || 1 });
      setSubmitted(res.data);
      setCalRefreshKey(k => k + 1); // force calendar to re-fetch — new booking now visible
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 max-w-md w-full text-center">
          <div className="text-6xl mb-5">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-3">Request Submitted!</h2>
          <p className="text-white/60 text-base mb-6">
            We've received your booking request and will review it shortly.
            You'll receive an email once it's approved.
          </p>
          <div className="bg-white/5 rounded-xl p-4 text-sm text-left space-y-2 mb-6">
            <div className="flex justify-between">
              <span className="text-white/40">Date</span>
              <span className="text-white">{date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Slot</span>
              <span className="text-white capitalize">{SLOTS.find(s => s.id === slot)?.label}</span>
            </div>
          </div>
          <p className="text-white/30 text-xs font-mono">ID: {submitted.id}</p>
        </div>
      </div>
    );
  }

  const selectedSlot = SLOTS.find(s => s.id === slot);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/8 px-6 py-4 sticky top-0 bg-[#0f0f1a]/95 backdrop-blur-sm z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center font-bold text-black text-sm">A</div>
          <span className="text-white font-semibold">Allusion</span>
          <span className="text-white/20 mx-1">·</span>
          <span className="text-white/40 text-sm">Venue Booking · Ghent</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
            Book Our Venue
          </h1>
          <p className="text-white/50 text-lg">
            A beautiful space in Ghent — available in 4-hour slots.
            No charge today. Payment only after approval.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          {/* STEP 1: Date */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-400 text-xs font-bold flex items-center justify-center">1</span>
              <h2 className="text-white/60 text-sm font-semibold uppercase tracking-widest">Choose a Date</h2>
            </div>
            <DatePicker value={date} onChange={d => setDate(d)} refreshKey={calRefreshKey} />
          </section>

          {/* STEP 2: Slot */}
          {date && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-400 text-xs font-bold flex items-center justify-center">2</span>
                <h2 className="text-white/60 text-sm font-semibold uppercase tracking-widest">
                  Choose a Slot
                </h2>
                {loadingAvail && (
                  <span className="text-amber-400/50 text-xs ml-1">Checking availability…</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      className={`relative rounded-xl border p-5 text-left transition-all duration-200 group
                        ${isSelected
                          ? 'border-amber-400/80 bg-amber-400/10 shadow-lg shadow-amber-400/10'
                          : isUnavailable
                          ? 'border-white/5 bg-white/2 opacity-40 cursor-not-allowed'
                          : 'border-white/10 bg-white/3 hover:border-white/25 hover:bg-white/7 cursor-pointer'
                        }`}
                    >
                      <div className="text-2xl mb-3">{s.icon}</div>
                      <div className={`font-semibold text-sm mb-1 ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                        {s.label}
                      </div>
                      <div className="text-white/40 text-xs mb-3">{s.hours}</div>
                      <div className={`text-xl font-bold ${isSelected ? 'text-amber-400' : 'text-white/80'}`}>
                        €{s.price}
                      </div>
                      {isUnavailable && (
                        <div className="absolute top-2.5 right-2.5 text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                          Booked
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-2.5 right-2.5 text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                          ✓ Selected
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* STEP 3: Contact Details */}
          {slot && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-400 text-xs font-bold flex items-center justify-center">3</span>
                <h2 className="text-white/60 text-sm font-semibold uppercase tracking-widest">Your Details</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-white/40 text-xs mb-1.5 font-medium uppercase tracking-wide">Full Name *</label>
                  <input
                    type="text" required
                    value={form.name}
                    onChange={updateForm('name')}
                    placeholder="Jane Smith"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-white/40 text-xs mb-1.5 font-medium uppercase tracking-wide">Email Address *</label>
                  <input
                    type="email" required
                    value={form.email}
                    onChange={updateForm('email')}
                    placeholder="jane@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-white/40 text-xs mb-1.5 font-medium uppercase tracking-wide">Phone Number</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={updateForm('phone')}
                    placeholder="+32 4xx xxx xxx"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-white/40 text-xs mb-1.5 font-medium uppercase tracking-wide">Organization / Event</label>
                  <input
                    type="text"
                    value={form.organization}
                    onChange={updateForm('organization')}
                    placeholder="Company or event name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-white/40 text-xs mb-1.5 font-medium uppercase tracking-wide">Expected Guests</label>
                  <input
                    type="number" min="1" max="500"
                    value={form.guests}
                    onChange={updateForm('guests')}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400/50 transition-all"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-white/40 text-xs mb-1.5 font-medium uppercase tracking-wide">Message / Event Description</label>
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={updateForm('message')}
                    placeholder="Tell us about your event — setup needs, AV requirements, etc."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 transition-all resize-none"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Summary + Submit */}
          {slot && form.name && form.email && (
            <section>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-5">Booking Summary</h3>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Venue</span>
                    <span className="text-white">Allusion, Ghent</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Date</span>
                    <span className="text-white">{date}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Slot</span>
                    <span className="text-white">{selectedSlot?.label} · {selectedSlot?.hours}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Duration</span>
                    <span className="text-white">4 hours</span>
                  </div>
                  <div className="h-px bg-white/10 my-2" />
                  <div className="flex justify-between">
                    <span className="text-white/70 font-medium">Total</span>
                    <span className="text-amber-400 text-xl font-bold">€{selectedSlot?.price}</span>
                  </div>
                </div>
                <div className="bg-white/3 rounded-xl p-3 mb-5 flex items-start gap-2">
                  <span className="text-amber-400/70 text-sm mt-0.5">ℹ</span>
                  <p className="text-white/40 text-xs leading-relaxed">
                    No payment today. You'll only be charged after Allusion reviews and approves your request. 
                    We'll email you a payment link.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 active:scale-95 text-black font-bold py-4 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-base"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Submitting…
                    </span>
                  ) : (
                    'Submit Booking Request →'
                  )}
                </button>
              </div>
            </section>
          )}
        </form>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-white/5 text-center">
          <p className="text-white/20 text-sm">Allusion · Ghent, Belgium</p>
          <p className="text-white/15 text-xs mt-1">Questions? Contact info@allusion.be</p>
        </footer>
      </main>
    </div>
  );
}
