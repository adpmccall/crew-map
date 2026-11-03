"use client";

// Type-ahead crew search — added 2026-11-03 at the owner's request, as an
// alternative to filtering or panning: type a crew's name, pick it from the
// dropdown, and the map flies to it and opens its popup. Deliberately its
// own small component (not folded into Filters.js): a text input with a
// live dropdown is a different interaction pattern than the <details>-based
// checkbox facets there, and this box is NOT a filter — see the note next
// to .crew-search in globals.css and handleSearchSelect in CrewMap.js.

import { useEffect, useRef, useState } from "react";
import { crewDisplayName } from "../lib/formatting";

// Enough matches to be useful without the dropdown running off screen —
// same idea as MAX_JOBS_SHOWN in CrewPopup.
const MAX_RESULTS = 8;

// Matches against the crew's DISPLAYED name (crewDisplayName — the same
// string the popup and, in symbol mode, nothing else shows), not the raw
// crew_name column, so the 316 crews with no crew_name are still findable
// by the ranger-district name their popup actually shows. Town is included
// too, so typing a place ("Lolo") finds the crew based there even if its
// name doesn't contain it.
function matchesQuery(crew, q) {
  const name = crewDisplayName(crew).name.toLowerCase();
  const town = (crew.town || "").toLowerCase();
  return name.includes(q) || town.includes(q);
}

export default function SearchBar({ crews, onSelect }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const boxRef = useRef(null);

  const q = query.trim().toLowerCase();
  const results = q
    ? crews.filter((c) => matchesQuery(c, q)).slice(0, MAX_RESULTS)
    : [];

  // Dismiss on an outside click. The filter panel's own dropdowns get this
  // for free from <details>/<summary>; a text input has no such built-in,
  // so it's wired up by hand.
  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(crew) {
    if (!crew) return;
    onSelect(crew);
    setQuery("");
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[activeIndex >= 0 ? activeIndex : 0]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="crew-search" ref={boxRef}>
      <input
        type="text"
        className="crew-search-input"
        placeholder="Search for a crew…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(-1);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        aria-label="Search for a crew by name"
      />
      {isOpen && q && (
        <ul className="crew-search-results">
          {results.length === 0 ? (
            <li className="crew-search-empty">
              No crew matches &quot;{query}&quot;
            </li>
          ) : (
            results.map((crew, i) => {
              const { name } = crewDisplayName(crew);
              const location = [crew.town, crew.state]
                .map((v) => (v || "").trim())
                .filter(Boolean)
                .join(", ");
              return (
                <li key={crew.id}>
                  <button
                    type="button"
                    className={`crew-search-result${
                      i === activeIndex ? " is-active" : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => pick(crew)}
                  >
                    <span className="crew-search-result-name">{name}</span>
                    {location && (
                      <span className="crew-search-result-location">
                        {location}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
