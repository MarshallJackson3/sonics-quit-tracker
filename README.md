# Sonics Quit Tracker

A nicotine-quit tracker that builds the (what-if) Seattle SuperSonics from a terrible expansion team
into a contender. Every clean day you check in, the Sonics play one game. As clean days stack up, the
front office quietly makes better trades, hires and signings, and you only find out after they happen.

## The two buttons (double-click in Finder)

| File | What it does |
|---|---|
| **Open Sonics.command** | Opens the app in your browser on this Mac. Keep its window open while you use it. |
| **Back up to GitHub.command** | Runs the tests, then saves and uploads everything to your private GitHub repo. |

The first time you double-click a `.command` file, macOS may say it's from an unidentified developer.
If so: right-click the file, choose **Open**, then click **Open** again. After that, double-click works.

## Where things live

- **This folder on your Desktop** is the main copy.
- **GitHub** (private repo https://github.com/MarshallJackson3/sonics-quit-tracker) is the backup.
- **Your progress** (games, streak, news) is stored in the app on each device, not in this folder.
  Use the app's **More → Save backup file** to keep a copy.

## The app on your phone

**https://marshalljackson3.github.io/sonics-quit-tracker/**

Open it in Safari, tap Share, then **Add to Home Screen**. Every upload to GitHub (the backup button)
updates the live app within a couple of minutes. The repo is public so friends can use the app;
everyone's progress stays private on their own phone.

## Status (Oct 21, 2026)

Done:
- Research: Day-1 roster, coach and GM in `data/day1.json`, with sources.
- Basic app: check-in, daily game, record, streak, slip-ups, news, roster, backup/restore.
- Savings dashboard (money, pouches not used, time nicotine-free), craving timer, habit settings.
- Online at the address above.

Next, in order:
1. Set the lineup before each game.
2. Salaries, salary cap and cap space earned per clean day (plus a bonus for beaten cravings).
   Day-1 players keep their real salaries; a labeled "dead money" line fills the rest of the cap.
   The biggest contracts expire after season 1, unless there are too many slips (then they auto-extend).
3. Offseason free agency: you sign real players from the (projected) 2027 free-agent class.
4. In-season surprise trades and coach/GM changes (hidden from the owner until they happen).
5. Push notifications.

## Decisions

- Quit date: Oct 22, 2026. Habit: 10-14 pouches/day (12 used), $5.33/tin, 15 pouches/tin assumed.
- 82-game seasons, one game per check-in day; the next season starts after game 82.
- Improvement is paced by clean days (~day 365 = good coach, an All-Star, lots of wins).
- A slip = lose that day's game (and later, maybe one recent improvement); you keep the team.
- Real players, coaches and GMs only. No drafts, no made-up players.
- Free agency is the owner's choice; in-season trades and coach/GM changes are surprises.
- Future moves stay hidden, even from the owner. Don't show the future player/coach/GM pool.
- Seattle has no NBA team yet (expansion only being explored as of Oct 2026); the franchise is a what-if.
- The games are simulated. A team's strength comes from its players' real 2025-26 Box Plus/Minus,
  tuned so the Day-1 roster wins about 15 games a season. Opponents use their real 2025-26 SRS.

## For Claude / developers

- `app/` is the app: `index.html` (everything), `data.js` (generated), `sw.js` (offline), icons, manifest.
- Edit `data/*.json`, then run `python3 scripts/build_data.py` to regenerate `app/data.js`.
- Tests: `cd tests && npm install` once, then `npm test`.
- `window.__sonics` exposes internals for tests; `window.__fakeNow` / `window.__fast` let tests fake the date.
