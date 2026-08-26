#!/usr/bin/env python3
"""Find className values in the JSX that have no matching rule in globals.css.

WHY THIS EXISTS
---------------
On 2026-08-25 a correction report submitted through /submit vanished: the
success screen appeared, no row reached the database, no email was sent.

The cause was a class name with nothing behind it. The correction form's
honeypot field was written as className="submit-honeypot", but the stylesheet
only ever defined ".submit-hp". A missing CSS rule is not an error — the
element simply renders unstyled — so the honeypot, whose whole job is to be
invisible, rendered as an ordinary text box just above the submit button.
Anything that filled it (browser autofill matches the name `company_website`)
tripped the form's bot check, which shows the success screen and deliberately
never inserts. A real person's report was thanked and thrown away.

Nothing catches this: the build passes, the page renders, and the failure is
silent by design. Hence a script.

The same run also found `field-error` / `field-hint` — invented names for things
the form already called `err` / `submit-hint`, so validation errors were
rendering as plain black text instead of red.

RUN IT
------
    python3 scripts/check_classnames.py

Exits 1 if anything is reported, so it can go in a pre-commit hook or CI later.

KNOWN FALSE POSITIVES
---------------------
Class names built from template literals are reported as their fragments,
because this reads the source and does not execute it. For example
`submit-geo--${geo.state}` is reported as `submit-geo--`, `geo` and `state`.
Those are expected. What matters is a plain, complete, quoted name appearing
here — that is almost always a typo or an invented name.
"""

import glob
import os
import re
import sys

CSS_FILE = "app/globals.css"
SOURCE_GLOBS = ["components/*.js", "app/*.js"]

# Fragments produced by template-literal class names — see the docstring.
KNOWN_FALSE_POSITIVES = {
    "geo", "state", "submit-geo--",  # `submit-geo--${geo.state}`
    "isOpen", "open",                # conditional open/closed classes
    "layer-summary",                 # styled as `.layer > summary`
}


def defined_classes(css_path):
    """Every class name the stylesheet defines a rule for."""
    with open(css_path, encoding="utf-8") as fh:
        css = fh.read()
    return set(re.findall(r"\.([A-Za-z][A-Za-z0-9_-]*)", css))


def used_classes(patterns):
    """Every class name referenced from a className in the JSX.

    JSX comments are stripped first: this file's own explanation quotes
    className="submit-honeypot" as an example, and counting prose as code would
    make the script report the very bug it documents.
    """
    used = {}
    for pattern in patterns:
        for path in glob.glob(pattern):
            with open(path, encoding="utf-8") as fh:
                src = fh.read()
            src = re.sub(r"\{/\*.*?\*/\}", "", src, flags=re.S)
            for match in re.finditer(r'className=(?:"([^"]+)"|\{`([^`]*)`\})', src):
                raw = match.group(1) or match.group(2) or ""
                for cls in re.findall(r"[A-Za-z][A-Za-z0-9_-]*", raw):
                    used.setdefault(cls, set()).add(os.path.basename(path))
    return used


def main():
    defined = defined_classes(CSS_FILE)
    used = used_classes(SOURCE_GLOBS)

    missing = {
        cls: files
        for cls, files in used.items()
        if cls not in defined and cls not in KNOWN_FALSE_POSITIVES
    }

    if not missing:
        print("OK — every className in the JSX has a rule in", CSS_FILE)
        return 0

    print("Class names used in JSX with no rule in", CSS_FILE)
    print("(a complete, plainly-quoted name here is usually a typo or an")
    print(" invented name — check whether the stylesheet already has one)")
    print()
    for cls, files in sorted(missing.items()):
        print(f"  {cls:30s} <- {', '.join(sorted(files))}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
