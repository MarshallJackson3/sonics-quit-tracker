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
- **GitHub** (public repo https://github.com/MarshallJackson3/sonics-quit-tracker) is the backup.
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

- Sign-up story, main battle + up to 2 goals (custom skill name and question), timed daily tasks
  (morning report, goal check-ins, nightly check-in that plays the game), Today badge, catch-up for a missed night.
- Optional 4-digit passcode (More → Passcode). Locks whenever you leave the app. Stored hashed on the device;
  a privacy screen, not encryption. A forgotten passcode can't be recovered (erase + restore a backup).

- Media interviews: a daily task (noon by default) with a question that fits the day (day 1, after a slip,
  first win, streak and savings milestones, losing/winning streaks, or a rotating everyday question).
  Answers (typed or iPhone dictation) go to the Journal tab, which also takes free notes. Outlets are made up.

- Rewards (game money, labeled in the app; numbers in REWARD / ENDORSEMENTS / STADIUM in app/index.html):
  clean night +$0.3M cap space (collected in the next morning report), win +$0.25M revenue, goal yes +3 morale,
  interview +$0.25M revenue +2 morale + endorsement deals at 1, 3, 7, 14... interviews (made-up brands),
  craving beaten +2 morale +$0.1M cap (3/day max), report +1 morale, slip -8 morale. Morale settles 30% toward
  50 each night. Morale shifts game margin by (morale-50)/10 points; each stadium level adds 0.75 home points.
  Team tab (was Roster) shows the front office: morale meter, cap, revenue, stadium upgrades, sponsors, earnings.

- Contracts and free agency. Cap = real 2026-27 cap ($164.961M). Day-1 salaries = each player's real 2025-26
  earnings, or the 2026-27 minimum ($1.358M) for 10-day/two-way players; payroll $55.09M, the rest is game
  "dead money" ($109.87M) that earned cap space pays down. The 5 biggest deals ($34.69M) expire after season 1;
  every slip past 3 in a season extends one of them a year. After game 82: a 7-check-in offseason with free
  agency (Team tab). Pool = data/fa2027.json (scripts/fetch_fa.py): real players whose contracts end after
  2026-27 or have a 2027-28 option, rated on 2025-26 stats; asking prices are estimates, +30% (capped at the
  max contract) if team appeal is too low; other teams sign ~8% of the top 60 each day.

- Lineups: daily task (opens with the morning report, in season) to pick 5 starters; +1 morale. One player is
  hot (+2) and one cold (-2) each day (named in the report). No guard or no PF/C in the five = -1.5 each.
  Skipped = coach starts the 5 best-rated.

- Surprise moves (in season, by total clean days, +-4 days): coach fired/hired at ~25, ~110, ~230 (better tier each
  time; data/staff.json from Basketball-Reference records, none a head coach in 2026-27); GM at ~45 and ~180
  (real executives out of jobs, with news sources). Trades every 16/13/11 clean days by GM tier (2 fewer with
  morale 70+): worst Sonics player out for a slightly better real player (data/league.json) whose salary fits.
  Coach adds (career pct - .250) x 4 points a game. All labeled what-if. Don't show the owner the pools.
- Balance check: `node tests/sim.js` plays a perfect year (clean daily, morale 75, best free agents). Last run:
  about 20 wins, then ~45, then ~60.

Next:
- Voice memos for interviews (on hold, owner's call).
- Real phone notifications.
  (Notifications need a small free server, e.g. Cloudflare; the owner creates that account.)

## Decisions

- Main battles: nicotine, weed, drinking, porn, masturbation, video games, laziness/procrastination, working out.
  Goals (up to 2): any of those plus relationships, new skill, reading, meditating, screen-free time.
- Owner's plan: nicotine; goals = working out (10 AM) and real estate exam (4 PM). Quit date: Oct 22, 2026. Habit: 10-14 pouches/day (12 used), $5.33/tin, 15 pouches/tin assumed.
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
