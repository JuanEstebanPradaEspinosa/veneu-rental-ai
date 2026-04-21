#!/usr/bin/env python3
"""
Allusion Venue Booking Watcher
================================
Polls the bookings DB for new pending bookings every 5 minutes.
Tracks seen booking IDs in a state file to avoid duplicate alerts.
Outputs nothing if no new bookings found (cron stays silent).
Outputs booking details when a new pending booking appears so the
Hermes cron agent can post to Slack and ask Allusion what to do.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH    = Path.home() / "projects/allusion-booking/backend/data/bookings.db"
STATE_FILE = Path.home() / ".hermes" / "allusion_seen_bookings.json"

SLOT_LABELS = {
    "morning":   "Morning   (09:00-13:00) - EUR 250",
    "afternoon": "Afternoon (13:00-17:00) - EUR 250",
    "evening":   "Evening   (18:00-22:00) - EUR 350",
}


def load_seen() -> set:
    if STATE_FILE.exists():
        try:
            return set(json.loads(STATE_FILE.read_text()).get("seen", []))
        except Exception:
            return set()
    return set()


def save_seen(seen: set):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps({
        "seen":    sorted(seen),
        "updated": datetime.now().isoformat()
    }))


def fetch_pending_bookings() -> list:
    if not DB_PATH.exists():
        return []
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        cur  = conn.cursor()
        cur.execute(
            "SELECT * FROM bookings WHERE status = 'pending' ORDER BY created_at DESC"
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        print(f"DB_ERROR: {e}")
        return []


def format_booking(b: dict) -> str:
    slot_label = SLOT_LABELS.get(b.get("slot", ""), b.get("slot", "unknown"))
    date_str   = b.get("date", "unknown date")
    try:
        dt       = datetime.strptime(date_str, "%Y-%m-%d")
        date_str = dt.strftime("%A, %B %d %Y")
    except Exception:
        pass

    lines = [
        f"Booking ID : {b.get('id')}",
        f"Customer   : {b.get('name', 'Unknown')}",
        f"Email      : {b.get('email', 'not provided')}",
        f"Phone      : {b.get('phone') or 'not provided'}",
        f"Org        : {b.get('organization') or 'not provided'}",
        f"Date       : {date_str}",
        f"Slot       : {slot_label}",
        f"Guests     : {b.get('guests', '?')}",
        f"Message    : {b.get('message') or 'none'}",
        f"Created at : {b.get('created_at', '')}",
    ]
    return "\n".join(lines)


def main():
    seen     = load_seen()
    bookings = fetch_pending_bookings()

    new_bookings = [b for b in bookings if b.get("id") and b["id"] not in seen]

    if not new_bookings:
        print("NO_NEW_BOOKINGS")
        return

    # Mark all new bookings as seen immediately
    for b in new_bookings:
        seen.add(b["id"])
    save_seen(seen)

    print(f"NEW_PENDING_BOOKINGS: {len(new_bookings)} new booking(s) found.\n")
    print("=" * 60)
    for i, b in enumerate(new_bookings, 1):
        print(f"\n--- Booking {i} of {len(new_bookings)} ---")
        print(format_booking(b))
    print("\n" + "=" * 60)
    print("\nACTION: For each booking above, post to Slack channel C0ARPALLJ0M.")
    print("Include the full booking details and ask Allusion (Roald) exactly 3 questions:")
    print("  1. Approve the booking?")
    print("  2. Decline the booking?")
    print("  3. Schedule a follow-up Google Meet with the customer?")


if __name__ == "__main__":
    main()
