import { Toaster } from 'react-hot-toast';
import BookingPage from './BookingPage';
import ConfirmedPage from './ConfirmedPage';

export default function App() {
  const path = window.location.pathname;
  const isConfirmed = path === '/booking-confirmed' || path.startsWith('/booking-confirmed');
  
  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <Toaster 
        position="top-center"
        toastOptions={{
          style: { background: '#1e1e2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
        }}
      />
      {isConfirmed ? <ConfirmedPage /> : <BookingPage />}
    </div>
  );
}
