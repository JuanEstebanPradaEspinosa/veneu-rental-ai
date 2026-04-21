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
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0f0f1a]">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-10 max-w-md w-full text-center">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-3xl font-bold text-white mb-3">Booking Confirmed!</h1>
        <p className="text-white/50 text-base mb-8">
          Your payment has been received and your booking is fully confirmed.
          Check your email for the invoice and all details.
        </p>
        {booking && (
          <div className="bg-white/5 rounded-xl p-5 text-left space-y-3 text-sm mb-8">
            <div className="flex justify-between">
              <span className="text-white/40">Date</span>
              <span className="text-white font-medium">{booking.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Slot</span>
              <span className="text-white font-medium capitalize">{booking.slot}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Status</span>
              <span className="text-green-400 font-medium">✅ Paid & Confirmed</span>
            </div>
          </div>
        )}
        <p className="text-white/20 text-xs font-mono">Booking ID: {id}</p>
        <div className="mt-6">
          <a href="/" className="text-amber-400/70 hover:text-amber-400 text-sm transition-colors">
            ← Book another slot
          </a>
        </div>
      </div>
    </div>
  );
}
