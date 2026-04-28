import { useEffect, useState } from 'react';
import axios from 'axios';

export default function ConfirmedPage() {
  const [booking, setBooking] = useState(null);
  const id = new URLSearchParams(window.location.search).get('id');

  useEffect(() => {
    if (id) {
      axios.get(`/api/bookings/${id}`)
        .then(r => setBooking(r.data))
        .catch(() => {});
    }
  }, [id]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-20 bg-paper">
      <div className="max-w-lg w-full">
        <div className="text-[11px] uppercase tracking-[0.22em] text-clay mb-6">
          Booking confirmed
        </div>
        <h1 className="font-serif text-5xl leading-[1.05] text-ink mb-6">
          We will see you <span className="italic">then</span>.
        </h1>
        <p className="text-ink-soft text-base leading-relaxed mb-10 max-w-md">
          Payment received. Your evening at Allusion is on the calendar — a copy
          of the invoice and the practical details are on their way to your inbox.
        </p>

        {booking && (
          <div className="border-t border-rule pt-6 space-y-3 text-sm">
            <Row k="Date" v={booking.date} />
            <Row k="Time" v={String(booking.slot).replace(/^\w/, c => c.toUpperCase())} />
            <Row k="Status" v="Paid · confirmed" />
          </div>
        )}

        <div className="mt-10 text-[11px] uppercase tracking-[0.22em] text-ink-mute">
          Reference · <span className="font-mono normal-case tracking-normal text-ink-soft">{id}</span>
        </div>

        <a
          href="/"
          className="mt-12 inline-flex items-center gap-3 text-ink text-sm uppercase tracking-[0.2em] border-b border-ink/40 pb-1 hover:border-ink transition-colors"
        >
          <span aria-hidden="true">←</span>
          Reserve another evening
        </a>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="text-ink-mute text-sm">{k}</span>
      <span className="text-ink text-sm">{v}</span>
    </div>
  );
}
