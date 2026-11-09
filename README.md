# Interpreter Availability

Scan a QR code and see, at that moment, **who is free** and **when each person is next free** between 8:00 AM and 5:00 PM.

```
Nick      Free now, until 11:30 AM
Elsie     Not available, but will be free 11:45 AM - 3:00 PM
Mustapha  Free now, until 1:15 PM · Free again: 2:45 PM - 5:00 PM
```

It is a plain static website (HTML, CSS, JavaScript). There is no server and no database, so it deploys anywhere for free.

## How it works

- `public/data/schedule.json` holds every interpreter's class times (built from the schedule .docx).
- Free time = working hours minus class times minus any overrides.
- Gaps shorter than `minGapMinutes` (default 20) are not counted as free, so a 15-minute break between classes shows as busy.
- The time is always read in the `Africa/Accra` time zone (GMT). It is synced to the web server's clock, so a wrong phone clock or time zone does not change the result. If the server clock can't be read, it falls back to the phone's clock.
- The page refreshes itself every 30 seconds.

## Run it locally

```bash
npm run dev      # opens http://localhost:3000
npm test         # runs the availability tests
```

Test any moment by adding `?at=` to the address, for example
`http://localhost:3000/?at=Monday 09:40` or `?at=2026-11-09T14:10`.

## Deploy (pick one)

**GitHub Pages** (workflow included)
1. Push this folder to a GitHub repository (branch `main`).
2. Repository **Settings → Pages → Source: GitHub Actions**.
3. Push again (or run the workflow from the Actions tab). Your site appears at `https://<user>.github.io/<repo>/`.

**Vercel**: import the repository, leave everything on default (`vercel.json` already sets the `public` folder), click Deploy.

**Netlify**: import the repository (`netlify.toml` already sets the `public` folder), click Deploy.

## Make the QR code

After deploying, open `/qr.html` on your live site, check the link in the box, and click **Print**. The code never changes, so you can print it once and stick it on a door or desk.

## Everyday changes

**One-off absence (sick, meeting, swapped class)**: edit `public/data/overrides.json`, commit, and the site updates within a minute or two.

```json
{
  "overrides": [
    { "interpreter": "Nick", "date": "2026-11-12", "start": "10:00", "end": "12:00", "reason": "Meeting" }
  ]
}
```

Leave out `start` and `end` for the whole day. The reason is never shown publicly.

**Settings** (`public/data/config.json`): working hours, working days, minimum gap, refresh rate.

**New semester schedule**:

```bash
pip install python-docx
python scripts/build-schedule.py "New_Schedule.docx"
npm test
```

This rewrites `public/data/schedule.json`. Then open `/check.html` to see double-booked interpreters, classes without an interpreter, and a weekly free-time table.

## Privacy note

Student and faculty names are deliberately **not** copied into `schedule.json`, because everything in `public/` is visible to anyone with the link. Only interpreter name, day, time and course are stored. Do not commit the original .docx to a public repository (`*.docx` is already in `.gitignore`). If you need access control, deploy privately (for example Vercel password protection) or ask for a version with a login.

## Project layout

```
public/            the website (this is what gets deployed)
  index.html       live "who is free" page
  check.html       schedule check + weekly view
  qr.html          printable QR code
  js/availability.js   the availability logic
  data/            schedule, overrides, config
scripts/build-schedule.py   .docx -> schedule.json
tests/             unit tests
```
