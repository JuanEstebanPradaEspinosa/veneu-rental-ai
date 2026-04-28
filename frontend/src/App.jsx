import { Toaster } from 'react-hot-toast';
import BookingPage from './BookingPage';
import ConfirmedPage from './ConfirmedPage';

export default function App() {
  const path = window.location.pathname;
  const isConfirmed = path === '/booking-confirmed' || path.startsWith('/booking-confirmed');

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1a1814',
            color: '#f4efe6',
            border: 'none',
            borderRadius: '2px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
            letterSpacing: '0.01em',
          },
        }}
      />
      {isConfirmed ? <ConfirmedPage /> : <BookingPage />}
    </div>
  );
}
