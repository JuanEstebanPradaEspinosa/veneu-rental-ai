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

  let dayClasses = 'relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center text-base sm:text-lg transition-colors duration-150 select-none ';

  if (!isCurrentMonth) {
    dayClasses += 'opacity-0 pointer-events-none ';
  } else if (isSelected) {
    dayClasses += 'bg-ink text-paper cursor-pointer ';
  } else if (disabled) {
    dayClasses += 'text-ink-mute/40 cursor-not-allowed ';
    if (fully_booked) dayClasses += 'line-through decoration-clay/50 ';
  } else if (isTodayDate) {
    dayClasses += 'text-clay cursor-pointer hover:bg-paper-soft ';
  } else {
    dayClasses += 'text-ink hover:bg-paper-soft cursor-pointer ';
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
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-clay/70" />
      )}
      {fully_booked && (
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-ink-mute/50" />
      )}
    </button>
  );
}

// refreshKey: increment from parent to force an immediate re-fetch (e.g. after submission)
export default function DatePicker({ value, onChange, refreshKey = 0 }) {
  const [viewDate,      setViewDate]   = useState(() => value ? startOfMonth(parseISO(value)) : startOfMonth(minBookingDate));
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
    <div className="border border-rule bg-paper p-6 sm:p-8 select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-8">
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          className="w-11 h-11 flex items-center justify-center text-ink-soft hover:text-ink hover:bg-paper-soft transition-colors disabled:opacity-20 disabled:pointer-events-none text-2xl"
          aria-label="Previous month"
        >
          ←
        </button>

        <div className="flex items-center gap-3">
          <span className="font-serif text-ink text-2xl sm:text-[28px]">
            {format(viewDate, 'MMMM yyyy')}
          </span>
          {isLoading && (
            <span className="w-3 h-3 border border-clay/40 border-t-clay rounded-full animate-spin" />
          )}
        </div>

        <button
          type="button"
          onClick={nextMonth}
          className="w-11 h-11 flex items-center justify-center text-ink-soft hover:text-ink hover:bg-paper-soft transition-colors text-2xl"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {/* Weekday headers — Monday first */}
      <div className="grid grid-cols-7 mb-2 border-b border-rule pb-3">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
          <div key={d} className="flex items-center justify-center text-ink-mute text-[11px] uppercase tracking-[0.18em] w-12 sm:w-14 h-7">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1.5 mt-3">
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
      <div className="flex items-center gap-6 mt-8 pt-5 border-t border-rule text-[11px] uppercase tracking-[0.2em] text-ink-soft">
        {bookedCount > 0 && (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ink-mute flex-shrink-0" />
            Fully booked
          </span>
        )}
        {partialCount > 0 && (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-clay flex-shrink-0" />
            Partial
          </span>
        )}
        {value && (
          <span className="ml-auto normal-case tracking-normal text-ink text-lg font-serif">
            {format(parseISO(value), 'MMMM d, yyyy')}
          </span>
        )}
      </div>
    </div>
  );
}
