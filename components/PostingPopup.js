"use client";

// The popup behind a posting pin: every open posting in one town.
//
// The unit here is the TOWN, not the posting, and that is a deliberate limit
// rather than a shortcut. USAJOBS gives a duty-station town, and both it and
// our geocoder resolve that to a single town-centre coordinate — so every
// posting in a town lands on the exact same point. One pin per town with a
// count is the most precise thing we can honestly draw. Scattering the pins
// apart to make them individually clickable would invent a precision the data
// doesn't have, which is the mistake the old crew rings made.

import PostingList from "./PostingList";

export default function PostingPopup({ town, state, postings }) {
  const place = [town, state].filter(Boolean).join(", ");

  return (
    <div className="posting-popup">
      <h3 className="posting-popup-title">{place}</h3>
      <div className="posting-popup-count">
        {postings.length === 1
          ? "1 open posting"
          : `${postings.length} open postings`}
      </div>

      {/* Every posting in this town, no cap: the pin's whole job is to show
          what's here, so hiding some behind a "+N more" would defeat it. The
          busiest town in the current data has 6. */}
      <PostingList postings={postings} />

      <div className="posting-popup-note">
        Location is the town USAJOBS lists as the duty station, not a specific
        worksite.
      </div>
    </div>
  );
}
