"""Build data/fa2027.json: the projected 2027 free-agent class, from real Basketball-Reference data.

Run: python3 scripts/fetch_fa.py          (uses pages already downloaded to data/raw/)
     python3 scripts/fetch_fa.py --fetch  (downloads fresh pages first)
Then: python3 scripts/build_data.py

A player is in the class if he has a 2026-27 salary and either no 2027-28 salary or an option for 2027-28.
That's a projection: options can be picked up and players can sign extensions before July 2027.
The asking price is our own estimate (see ask_price), not a real number.
"""
import html
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
PAGES = {
    "contracts.html": "https://www.basketball-reference.com/contracts/players.html",
    "per_game_2026.html": "https://www.basketball-reference.com/leagues/NBA_2026_per_game.html",
    "advanced_2026.html": "https://www.basketball-reference.com/leagues/NBA_2026_advanced.html",
}
CAP = 164.961          # 2026-27 salary cap, $M (NBA announcement; Basketball-Reference)
MIN_SALARY = 1.358     # 2026-27 minimum salary, 0 years of service, $M (rounded)
MAX_SALARY = round(CAP * 0.35, 3)  # the most a player can get (35% of the cap, for 10+ year veterans)


def fetch():
    os.makedirs(RAW, exist_ok=True)
    for name, url in PAGES.items():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(os.path.join(RAW, name), "wb") as f:
            f.write(r.read())
        print("Downloaded", name)
        time.sleep(4)  # be polite to Basketball-Reference


def cells(tr):
    out = {}
    for m in re.finditer(r'<t[dh]([^>]*)data-stat="([^"]+)"([^>]*)>(.*?)</t[dh]>', tr, re.S):
        cls = re.search(r'class="([^"]*)"', m.group(1) + m.group(3))
        out[m.group(2)] = (html.unescape(re.sub("<[^>]+>", "", m.group(4))).strip(), cls.group(1) if cls else "")
    return out


def rows(name):
    with open(os.path.join(RAW, name), encoding="utf-8") as f:
        text = f.read().replace("<!--", "").replace("-->", "")
    return [(tr, cells(tr)) for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", text, re.S)]


def money(s):
    return float(s.replace("$", "").replace(",", "")) / 1e6 if s.startswith("$") else None


def player_id(tr):
    m = re.search(r'href="/players/[a-z]/([a-z0-9]+)\.html"', tr)
    return m.group(1) if m else None


def stats_by_id(name, fields):
    """One row per player; for players on 2+ teams, the combined row comes first and wins."""
    out = {}
    for tr, c in rows(name):
        pid = player_id(tr)
        if pid and pid not in out:
            out[pid] = {k: c.get(k, ("", ""))[0] for k in fields}
    return out


def num(s, default=0.0):
    try:
        return float(s)
    except ValueError:
        return default


def rating(bpm, games, mp):
    """Same formula as the app: BPM pulled toward replacement level (-2) for small samples."""
    minutes = games * mp
    return (bpm * minutes - 2 * 400) / (minutes + 400)


def ask_price(r, salary, age):
    """Estimated asking price ($M/year): half what he's paid now, half what his rating is worth."""
    points = [(-2, MIN_SALARY), (0, 8), (2, 20), (4, 35), (6, 50), (7, MAX_SALARY)]
    if r <= points[0][0]:
        worth = MIN_SALARY
    elif r >= points[-1][0]:
        worth = MAX_SALARY
    else:
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            if x0 <= r <= x1:
                worth = y0 + (y1 - y0) * (r - x0) / (x1 - x0)
                break
    price = 0.5 * salary + 0.5 * worth
    if age >= 35:
        price *= 0.75
    return round(min(MAX_SALARY, max(MIN_SALARY, price)), 2)


# Basketball-Reference team codes that differ from the ones the app uses.
TEAM_FIX = {"BRK": "BKN", "CHO": "CHA", "PHO": "PHX"}


def write_league(per_game, adv, sonics, fa_ids):
    """data/league.json: every player under contract for 2026-27 (with 2025-26 stats), for what-if trades."""
    players = {}
    for tr, c in rows("contracts.html"):
        pid = player_id(tr)
        if not pid or pid in players:
            continue
        sal = [money(c.get(f"y{i}", ("", ""))[0]) for i in range(1, 7)]
        if not sal[0]:
            continue
        years = 0
        for x in sal:
            if not x:
                break
            years += 1
        s, a = per_game.get(pid), adv.get(pid)
        if not s or not a or s["name_display"] in sonics:
            continue
        team = c.get("team_id", ("", ""))[0]
        players[pid] = {
            "id": pid, "name": s["name_display"], "pos": s["pos"], "age": int(num(s["age"])) + 1,
            "team": TEAM_FIX.get(team, team), "g": int(num(s["games"])), "mp": num(s["mp_per_g"]),
            "pts": num(s["pts_per_g"]), "bpm": num(a["bpm"]), "vorp": num(a["vorp"]),
            "salary": round(sal[0], 2), "years": years,
        }
    out = {"snapshotDate": time.strftime("%Y-%m-%d"),
           "note": "Players under contract for 2026-27 (real contracts, 2025-26 stats). Used for what-if trades.",
           "players": sorted(players.values(), key=lambda p: p["name"])}
    with open(os.path.join(ROOT, "data", "league.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"Wrote data/league.json: {len(players)} players")


def main():
    if "--fetch" in sys.argv:
        fetch()
    per_game = stats_by_id("per_game_2026.html", ["name_display", "age", "pos", "games", "mp_per_g", "pts_per_g"])
    adv = stats_by_id("advanced_2026.html", ["bpm", "vorp"])
    with open(os.path.join(ROOT, "data", "day1.json"), encoding="utf-8") as f:
        sonics = {p["name"] for p in json.load(f)["roster"]}

    pool = {}
    for tr, c in rows("contracts.html"):
        pid = player_id(tr)
        if not pid or pid in pool:
            continue
        y1 = money(c.get("y1", ("", ""))[0])
        y2 = money(c.get("y2", ("", ""))[0])
        y2cls = c.get("y2", ("", ""))[1]
        if not y1:
            continue
        option = "player option" if "salary-pl" in y2cls else "team option" if "salary-tm" in y2cls else None
        if y2 is not None and not option:
            continue  # still under contract for 2027-28
        s = per_game.get(pid)
        a = adv.get(pid)
        if not s or not a or s["name_display"] in sonics:
            continue  # no 2025-26 stats to rate him on
        g, mp = int(num(s["games"])), num(s["mp_per_g"])
        bpm = num(a["bpm"])
        r = rating(bpm, g, mp)
        age = int(num(s["age"])) + 1  # age during 2026-27
        pool[pid] = {
            "id": pid, "name": s["name_display"], "pos": s["pos"], "age": age,
            "g": g, "mp": mp, "pts": num(s["pts_per_g"]), "bpm": bpm, "vorp": num(a["vorp"]),
            "salary": round(y1, 2), "option": option, "ask": ask_price(r, y1, age),
        }
    players = sorted(pool.values(), key=lambda p: -p["ask"])
    write_league(per_game, adv, sonics, set(pool))
    out = {
        "snapshotDate": time.strftime("%Y-%m-%d"),
        "note": "Projected 2027 free agents: players whose contracts end after 2026-27 or who have a 2027-28 option. "
                "Real contracts and 2025-26 stats; asking prices are the app's estimates.",
        "cap": CAP, "minSalary": MIN_SALARY, "maxSalary": MAX_SALARY,
        "sources": [PAGES["contracts.html"], PAGES["per_game_2026.html"], PAGES["advanced_2026.html"]],
        "players": players,
    }
    with open(os.path.join(ROOT, "data", "fa2027.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"Wrote data/fa2027.json: {len(players)} players")


if __name__ == "__main__":
    main()
