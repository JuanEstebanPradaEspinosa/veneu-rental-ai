import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths,
  format, isSameMonth, isSameDay, isToday, isBefore,
  parseISO, startOfDay,
} from 'date-fns';

const POLL_INTERVAL_MS = 60_000; // re-fetch visible months every 60 s

const today = startOfDay(new Date());

// Clients may not book within 3 days of today — Allusion needs lead time to prepare.
const minBookingDate = addDays(today, 3);

// Day status helpers
const isFull  = info => info && info.available.length === 0;
const isEmpty = info => !info;

function CalendarDay({ date, monthDate, dayInfo, selected, onClick }) {
  const isCurrentMonth = isSameMonth(date, monthDate);
  const isPast         = isBefore(date, minBookingDate); // includes today + next 2 days
  const isSelected     = selected && isSameDay(date, parseISO(selected));
  const isTodayDate    = isToday(date);
  const fully_booked   = !isPast && dayInfo && isFull(dayInfo);
  const partial        = !isPast && dayInfo && !isFull(dayInfo) && dayInfo.unavailable.length > 0;
  const noData         = !isPast && isEmpty(dayInfo);
  const disabled       = isPast || fully_booked || noData;

  let dayClasses = 'relative w-9 h-9 rounded-xl flex items-center justify-center text-sm font-medium transition-all duration-150 select-none ';

  if (!isCurrentMonth) {
    dayClasses += 'opacity-0 pointer-events-none ';
  } else if (isSelected) {
    dayClasses += 'bg-amber-400 text-black font-bold shadow-lg shadow-amber-400/30 scale-105 ';
  } else if (disabled) {
    dayClasses += 'text-white/15 cursor-not-allowed ';
    if (fully_booked) dayClasses += 'bg-red-500/10 line-through decoration-red-500/40 ';
  } else if (isTodayDate) {
    dayClasses += 'text-amber-400 border border-amber-400/40 hover:bg-amber-400/10 cursor-pointer ';
  } else {
    dayClasses += 'text-white/70 hover:bg-white/8 hover:text-white cursor-pointer ';
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onClick(format(date, 'yyyy-MM-dd'))}
      className={dayClasses}
      title={fully_booked ? 'Fully booked' : undefined}
    >
      {format(date, 'd')}
      {partial && !isSelected && (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400/60" />
      )}
      {fully_booked && (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500/60" />
      )}
    </button>
  );
}

// refreshKey: increment from parent to force an immediate re-fetch (e.g. after submission)
export default function DatePicker({ value, onChange, refreshKey = 0 }) {
  const [viewDate,      setViewDate]   = useState(() => value ? startOfMonth(parseISO(value)) : startOfMonth(today));
  const [monthCache,    setMonthCache] = useState({});
  const [loadingMonths, setLoading]    = useState({});

  // Track in-flight requests to avoid duplicate concurrent fetches
  const inFlight = useRef({});

  const monthKey = d => format(d, 'yyyy-MM');

  // Fetch a month — force=true bypasses the cache (used for polling & post-submit refresh)
  const fetchMonth = useCallback(async (d, force = false) => {
    const key = monthKey(d);
    if (inFlight.current[key]) return;          // already fetching right now
    if (!force && monthCache[key]) return;      // cached and no forced refresh needed

    inFlight.current[key] = true;
    setLoading(p => ({ ...p, [key]: true }));
    try {
      const res = await axios.get('/api/availability/month', {
        params: { year: d.getFullYear(), month: d.getMonth() + 1 },
      });
      setMonthCache(p => ({ ...p, [key]: res.data.days }));
    } catch {
      // silent — stale data stays in place, no visual flicker
    } finally {
      inFlight.current[key] = false;
      setLoading(p => ({ ...p, [key]: false }));
    }
  }, [monthCache]);

  // Initial load + re-load when view changes
  useEffect(() => {
    fetchMonth(viewDate);
    fetchMonth(addMonths(viewDate, 1));
  }, [viewDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force re-fetch when parent signals a refresh (e.g. after a booking is submitted)
  useEffect(() => {
    if (refreshKey === 0) return;
    fetchMonth(viewDate, true);
    fetchMonth(addMonths(viewDate, 1), true);
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Background polling — silently re-fetches visible months on an interval
  useEffect(() => {
    const tick = () => {
      fetchMonth(viewDate, true);
      fetchMonth(addMonths(viewDate, 1), true);
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [viewDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevMonth = () => setViewDate(v => subMonths(v, 1));
  const nextMonth = () => setViewDate(v => addMonths(v, 1));

  const currentDays = monthCache[monthKey(viewDate)] || {};
  const isLoading   = !!loadingMonths[monthKey(viewDate)];

  // Build grid: 6 weeks × 7 days, starting Monday
  const gridStart = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
  const gridEnd   = endOfWeek(endOfMonth(viewDate),     { weekStartsOn: 1 });
  const gridDays  = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    gridDays.push(cursor);
    cursor = addDays(cursor, 1);
  }

  const canGoPrev = addMonths(viewDate, 1) > minBookingDate;

  const allDays        = Object.entries(currentDays);
  const minStr         = format(minBookingDate, 'yyyy-MM-dd');
  const bookedCount    = allDays.filter(([d, info]) => d >= minStr && isFull(info)).length;
  const partialCount   = allDays.filter(([d, info]) => d >= minStr && !isFull(info) && info.unavailable.length > 0).length;

  return (
    <div className="bg-white/4 border border-white/10 rounded-2xl p-5 select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-all disabled:opacity-20 disabled:pointer-events-none"
        >
          ‹
        </button>

        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">
            {format(viewDate, 'MMMM yyyy')}
          </span>
          {isLoading && (
            <span className="w-3.5 h-3.5 border border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
          )}
        </div>

        <button
          type="button"
          onClick={nextMonth}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-all"
        >
          ›
        </button>
      </div>

      {/* Weekday headers — Monday first */}
      <div className="grid grid-cols-7 mb-2">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
          <div key={d} className="flex items-center justify-center text-white/25 text-xs font-medium w-9 h-7">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {gridDays.map((d, i) => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const info    = currentDays[dateStr];
          return (
            <div key={i} className="flex items-center justify-center">
              <CalendarDay
                date={d}
                monthDate={viewDate}
                dayInfo={info}
                selected={value}
                onClick={onChange}
              />
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/6 text-xs text-white/30">
        {bookedCount > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500/60 flex-shrink-0" />
            Fully booked
          </span>
        )}
        {partialCount > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400/60 flex-shrink-0" />
            Partially available
          </span>
        )}
        {value && (
          <span className="flex items-center gap-1.5 ml-auto text-amber-400/60">
            ✓ {format(parseISO(value), 'MMM d, yyyy')}
          </span>
        )}
      </div>
    </div>
  );
}
