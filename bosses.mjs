// boss fights: every world ends with a boss on its cloud top, and the cloud only opens once it's beaten. most worlds
// have a mini boss, a giant of their own creature that fights the way that creature moves; worlds 4, 8, 12, 16 and 17
// have a big boss instead, a tech villain with its own attacks. the screen locks onto the cloud top, walls go up at
// both ends, and a few ledges appear to dodge onto
// Claude gets three hearts for a fight and shoots mini fireballs with F or E, only ever in a fight. every attack warns
// first, like everything else in the game: a mark where it will land, a flash where it will come from, a wind-up
// the game never ends: after world 17 the worlds start over as the next lap, and every lap's bosses are tougher, with
// more health, more at once and shorter (never too short) warnings
import { PLACES, placeOf } from "./places.mjs";
import { BODY_W, clamp, whole } from "./world.mjs";

export const HEARTS = 3;
// after a hit Claude flashes and can't be hit again for this long
export const HURT_TICKS = 30;
// the boss's name is up and it holds still for this long first; when it's beaten, it bursts for this long
export const INTRO_TICKS = 40;
const DYING_TICKS = 36;
// fireballs: how fast, how often, and how many at once
const SHOT_SPEED = 1.2;
const SHOT_COOL = 8;
const MAX_SHOTS = 3;
// the shortest warning any attack ever gets, however many laps in
export const MIN_WARN = 12;
// the ledges, above the cloud: two low ones at the sides and one higher in the middle
const LOW_LEDGE = 5;
const HIGH_LEDGE = 9;
// how high things hover, and where a dropper hangs, above the cloud
const HOVER = 6;
const CEILING = 11;
// how high the arena reaches above the cloud, for things falling in from the top
const ARENA_TOP = 16;

// the big bosses, by the world they end (counting from 0), on every lap
const BIG_AT = { 3: "bluescreen", 7: "stack", 11: "y2k", 15: "panic", 16: "monolith" };
export const BIG_BOSSES = {
    bluescreen: { name: "Blue Screen", hp: 40, home: "side", moves: ["errors"] },
    stack: { name: "Stack Overflow", hp: 44, home: "hover", moves: ["stack", "slide"] },
    y2k: { name: "Y2K Bug", hp: 44, home: "floor", moves: ["bombs", "leap"] },
    panic: { name: "Kernel Panic", hp: 46, home: "hover", moves: ["bolts", "charge"] },
    monolith: { name: "Legacy Monolith", hp: 60, home: "side", moves: ["errors", "bombs"] },
};
// the final boss gets more to throw as it weakens
const MONOLITH_PHASES = [["errors", "bombs"], ["errors", "bombs", "stack"], ["errors", "stack", "bolts", "slide"]];
// a mini boss is a giant of its world's creature
const MINI_NAMES = {
    snake: "King Snake",
    spider: "Mother Spider",
    conflict: "Mega Merge Conflict",
    nan: "NaN Phantom",
    bug: "Giant Bug",
    pointer: "Giant Dangling Pointer",
    phantom: "Phantom Lord",
    drone: "Bot Mothership",
    elephant: "Giant Elephant",
    storm: "Thunderhead",
    bean: "Giant Coffee Bean",
    reel: "Tape Titan",
    worm: "Pipeline Wyrm",
    crab: "Giant Crab",
    chip: "Meltdown Chip",
    gopher: "Giant Gopher",
    gem: "Ruby Dragon",
};
// how each kind of creature fights when it's a giant, and where it waits between attacks
const MINI_MOVES = { walk: ["charge"], hop: ["leap"], drop: ["drop"], swoop: ["dive"], fly: ["rain"] };
const MINI_HOMES = { walk: "floor", hop: "floor", drop: "ceiling", swoop: "hover", fly: "hover" };
export const MINI = { w: 9, h: 4, hp: 20 };
export const BIG = { w: 12, h: 5 };

// which lap a world is on, counting from 1
export const lapOf = (place) => Math.floor(place / PLACES.length) + 1;

// the boss at the end of a world: which one, and how tough on this lap
export function bossFor(place) {
    const lap = lapOf(place);
    const tougher = 1 + 0.4 * (lap - 1);
    const big = BIG_AT[place % PLACES.length];
    if (big) {
        const b = BIG_BOSSES[big];
        return { id: big, name: b.name, big: true, kind: big, hp: Math.round(b.hp * tougher), home: b.home, moves: [...b.moves], lap };
    }
    const creature = placeOf(place).creature;
    const moves = [...MINI_MOVES[creature.style]];
    // from the third lap on, a mini boss has learned a big boss's trick as well
    if (lap >= 3) moves.push("errors");
    return { id: creature.id, name: MINI_NAMES[creature.id] ?? `Giant ${creature.name}`, big: false, kind: creature.id, style: creature.style, hp: Math.round(MINI.hp * tougher), home: MINI_HOMES[creature.style], moves, lap };
}

// how a lap changes a fight: warnings, rests between attacks, how many things at once, and how fast
const warnFor = (lap) => Math.max(MIN_WARN, 30 - 5 * (lap - 1));
const restFor = (lap) => Math.max(18, 50 - 8 * (lap - 1));
const extraFor = (lap) => Math.min(3, lap - 1);
const speedFor = (lap) => Math.min(1.5, 1 + 0.1 * (lap - 1));

// ---- starting and ending a fight ----

// the cloud top becomes the arena; Claude is pulled onto it if it got past some other way
export function startFight(g, top) {
    const { claude } = g;
    const info = bossFor(top.zone - 1);
    const x0 = top.x;
    const x1 = top.x + top.len;
    const floor = top.y;
    const over = claude.x + BODY_W / 2 >= x0 && claude.x + BODY_W / 2 <= x1 && claude.y >= floor + 1;
    if (!over) {
        claude.x = x0 + 4;
        claude.y = floor + 1;
        claude.on = top;
        claude.vy = 0;
    }
    claude.vx = 0;
    claude.rope = null;
    const size = info.big ? BIG : MINI;
    const onLeft = claude.x + BODY_W / 2 < (x0 + x1) / 2;
    const boss = {
        ...info,
        w: size.w,
        h: size.h,
        maxHp: info.hp,
        x: onLeft ? x1 - size.w - 2 : x0 + 2,
        y: floor + 1,
        dir: onLeft ? -1 : 1,
        act: "idle",
        t: 0,
        rest: restFor(info.lap),
        windup: 0,
        flash: 0,
        dying: 0,
        next: 0,
    };
    boss.y = homeY(boss, floor);
    // the ledges belong to the fight and go with it
    const ledge = (x, y, len) => ({ n: g.serial++, sec: top.sec, y, x, len, kind: "plain", v: 0, t: 0, path: false, zone: top.zone - 1, dist: top.dist, arena: true });
    g.plates.push(ledge(x0 + 4, floor + LOW_LEDGE, 9), ledge(x1 - 13, floor + LOW_LEDGE, 9), ledge(x0 + 16, floor + HIGH_LEDGE, 12));
    // nothing else is let into the arena: creatures near it go, and so does anything coming down
    g.creatures = g.creatures.filter((c) => Math.abs(c.y - floor) > 18 || c.x + 3 < x0 || c.x > x1);
    g.strikes = [];
    g.bolts = [];
    g.fight = { top: top.n, x0, x1, floor, boss, attacks: [], shots: [], hearts: HEARTS, hurt: 0, cool: 0, intro: INTRO_TICKS, lap: info.lap };
    g.plan = null;
}

function winFight(g) {
    const f = g.fight;
    const top = g.plates.find((p) => p.n === f.top);
    if (top) top.done = true;
    if (g.claude.on?.arena) {
        g.claude.on = null;
        g.claude.vy = 0;
    }
    g.plates = g.plates.filter((p) => !p.arena);
    const bonus = (f.boss.big ? 3000 : 1000) * f.lap;
    g.stage += 1;
    g.bonus += bonus + 500;
    g.banner = 50;
    g.beaten = { name: f.boss.name, bonus, t: 70 };
    g.fight = null;
}

// ---- fireballs ----

// F or E: a mini fireball across the arena at the boss's side; Claude turns to face it as it throws
export function shoot(g) {
    const f = g.fight;
    if (!f || f.intro > 0 || f.boss.dying || f.cool > 0 || f.shots.length >= MAX_SHOTS) return;
    const { claude } = g;
    const b = f.boss;
    const dir = b.x + b.w / 2 > claude.x + BODY_W / 2 ? 1 : -1;
    claude.dir = dir;
    f.shots.push({ x: claude.x + (dir > 0 ? BODY_W : 0), y: claude.y + 1, dir });
    f.cool = SHOT_COOL;
}

// the boss's box: cells x to x + w across, rows y to y + h up
const inBox = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y - 0.3 && y <= b.y + b.h;

function moveShots(g) {
    const f = g.fight;
    const b = f.boss;
    if (f.cool > 0) f.cool -= 1;
    for (const s of f.shots) {
        s.x += s.dir * SHOT_SPEED;
        if (!b.dying && f.intro === 0 && inBox(b, s.x, s.y)) {
            s.hit = true;
            b.hp -= 1;
            b.flash = 4;
            if (b.hp <= 0) {
                b.dying = DYING_TICKS;
                f.attacks = [];
            }
        }
    }
    f.shots = f.shots.filter((s) => !s.hit && s.x > f.x0 - 1 && s.x < f.x1 + 1);
}

// ---- the boss ----

function homeY(b, floor) {
    if (b.home === "ceiling") return floor + CEILING;
    if (b.home === "hover") return floor + HOVER;
    return floor + 1;
}

const centerOf = (b) => b.x + b.w / 2;
const claudeMiddle = (g) => g.claude.x + BODY_W / 2;

// between attacks: pacing the floor, hovering, or hanging from the ceiling over Claude; a side boss keeps to its half
function wait(g, f, b) {
    const speed = 0.2 * speedFor(f.lap);
    const low = f.x0 + 1;
    const high = f.x1 - b.w - 1;
    const goalY = homeY(b, f.floor) + (b.home === "hover" ? Math.sin(b.t / 12) : 0);
    b.y += clamp(goalY - b.y, -0.3, 0.3);
    if (b.home === "ceiling") {
        b.x += clamp(claudeMiddle(g) - centerOf(b), -speed, speed);
    } else {
        const half = (f.x0 + f.x1) / 2;
        const [from, to] = b.home === "side" ? (centerOf(b) < half ? [low, half - b.w / 2] : [half - b.w / 2, high]) : [low, high];
        b.x += b.dir * speed * (b.home === "side" ? 0.6 : 1);
        if (b.x < from || b.x > to) {
            b.x = clamp(b.x, from, to);
            b.dir = -b.dir;
        }
    }
    b.x = clamp(b.x, low, high);
}

// the moves it has right now: the final boss gets more as it weakens
function movesOf(b) {
    if (b.id !== "monolith") return b.moves;
    const left = b.hp / b.maxHp;
    return MONOLITH_PHASES[left > 0.66 ? 0 : left > 0.33 ? 1 : 2];
}

// spots across the arena, spread out so there's always room between them, with one by Claude
function spots(g, f, count, width) {
    const middle = Math.round(claudeMiddle(g) - width / 2);
    const xs = [clamp(middle, f.x0 + 1, f.x1 - width - 1)];
    for (let tries = 0; xs.length < count && tries < 40; tries++) {
        const x = whole(g, f.x0 + 1, f.x1 - width - 1);
        if (xs.every((o) => Math.abs(o - x) >= width + 6)) xs.push(x);
    }
    return xs;
}

// a move begins: the boss winds up, and whatever it's about to throw shows where it will be first
function begin(g, f, b, move) {
    const warn = warnFor(f.lap);
    const extra = extraFor(f.lap);
    b.act = move;
    b.t = 0;
    b.windup = warn;
    const top = f.floor + ARENA_TOP;
    if (move === "charge") {
        b.dir = claudeMiddle(g) > centerOf(b) ? 1 : -1;
        b.target = { x: b.dir > 0 ? f.x1 - b.w - 1 : f.x0 + 1 };
    } else if (move === "leap") {
        b.from = { x: b.x, y: b.y };
        b.target = { x: clamp(claudeMiddle(g) - b.w / 2, f.x0 + 1, f.x1 - b.w - 1) };
    } else if (move === "drop") {
        b.target = { x: b.x };
    } else if (move === "dive") {
        b.from = { x: b.x, y: b.y };
        b.target = { x: clamp(claudeMiddle(g) - b.w / 2, f.x0 + 1, f.x1 - b.w - 1), y: Math.max(f.floor + 1, g.claude.y) };
    } else if (move === "rain") {
        for (const x of spots(g, f, 2 + extra, 2)) f.attacks.push({ kind: "fall", x, y: top, w: 2, h: 1, vy: -0.8, warn, life: 1 });
        b.windup = 0;
    } else if (move === "stack") {
        for (const x of spots(g, f, 3 + extra, 4)) f.attacks.push({ kind: "fall", x, y: top, w: 4, h: 2, vy: -0.9, warn, life: 1, block: true });
        b.windup = 0;
    } else if (move === "bolts") {
        for (const x of spots(g, f, 2 + extra, 3)) f.attacks.push({ kind: "bolt", x, y: f.floor + 1, w: 3, h: ARENA_TOP, warn, life: 8 });
        b.windup = 0;
    } else if (move === "bombs") {
        for (const x of spots(g, f, 2 + extra, 2)) {
            f.attacks.push({ kind: "bomb", x, y: f.floor + 1, w: 2, h: 1, fromX: centerOf(b), fromY: b.y + b.h, warn: warn + 30, fuse: warn + 30, life: 6 });
        }
        b.windup = 0;
    } else if (move === "errors") {
        // a few volleys of error text across the arena, from the boss's side, at one height each, or two from lap 2.
        // two are always next to each other, never the bottom and the top, so the ground or a low ledge stays clear
        const rows = [f.floor + 1, f.floor + 4, f.floor + 7];
        const fromLeft = centerOf(b) < (f.x0 + f.x1) / 2;
        for (let v = 0; v < 3; v++) {
            const skip = f.lap >= 2 ? 2 * whole(g, 0, 1) : whole(g, 0, 2);
            const chosen = f.lap >= 2 ? rows.filter((_, i) => i !== skip) : [rows[skip]];
            for (const y of chosen) {
                f.attacks.push({ kind: "row", x: fromLeft ? f.x0 : f.x1 - 5, y, w: 5, h: 1, vx: (fromLeft ? 0.7 : -0.7) * speedFor(f.lap), warn: warn + v * 18, life: 200 });
            }
        }
        b.windup = 0;
    } else if (move === "slide") {
        const fromLeft = claudeMiddle(g) > (f.x0 + f.x1) / 2;
        f.attacks.push({ kind: "slide", x: fromLeft ? f.x0 : f.x1 - 4, y: f.floor + 1, w: 4, h: 2, vx: (fromLeft ? 0.8 : -0.8) * speedFor(f.lap), warn, life: 200, block: true });
        b.windup = 0;
    }
}

// a move carries on; true while it's still going
function carryOn(g, f, b) {
    if (b.windup > 0) {
        b.windup -= 1;
        return true;
    }
    b.t += 1;
    const speed = speedFor(f.lap);
    const low = f.x0 + 1;
    const high = f.x1 - b.w - 1;
    if (b.act === "charge") {
        b.x += b.dir * 0.9 * speed;
        if (b.x <= low || b.x >= high) {
            b.x = clamp(b.x, low, high);
            b.dir = -b.dir;
            return false;
        }
        return true;
    }
    if (b.act === "leap") {
        const k = Math.min(1, b.t / 30);
        b.x = b.from.x + (b.target.x - b.from.x) * k;
        b.y = f.floor + 1 + 8 * Math.sin(Math.PI * k);
        if (k < 1) return true;
        // the landing sends a shockwave along the ground both ways
        for (const dir of [-1, 1]) f.attacks.push({ kind: "wave", x: dir < 0 ? b.x - 2 : b.x + b.w, y: f.floor + 1, w: 2, h: 1, vx: dir * 0.5 * speed, warn: MIN_WARN, life: 120 });
        return false;
    }
    if (b.act === "drop") {
        // straight down, a while on the ground (where it's easy to hit), then back up its thread
        if (b.landed === undefined) {
            b.y = Math.max(f.floor + 1, b.y - 1);
            if (b.y === f.floor + 1) b.landed = b.t;
            return true;
        }
        if (b.t - b.landed < 40) return true;
        b.y += 0.3;
        if (b.y < f.floor + CEILING) return true;
        b.landed = undefined;
        return false;
    }
    if (b.act === "dive") {
        const half = 16;
        const end = { x: clamp(b.target.x + (b.target.x - b.from.x), low, high), y: b.from.y };
        const [a, z, k] = b.t <= half ? [b.from, b.target, b.t / half] : [b.target, end, (b.t - half) / half];
        b.x = a.x + (z.x - a.x) * k;
        b.y = a.y + (z.y - a.y) * k;
        return b.t < half * 2;
    }
    // the rest only throw things, which carry on by themselves
    return false;
}

function moveBoss(g, f) {
    const b = f.boss;
    b.t += b.act === "idle" ? 1 : 0;
    if (b.flash > 0) b.flash -= 1;
    if (b.act === "idle") {
        wait(g, f, b);
        b.rest -= 1;
        // rows of errors and sliding blocks have to be across before anything else comes: piled up, they'd leave no
        // way through, or pin Claude to a wall under a fall
        if (b.rest <= 0 && !f.attacks.some((a) => a.kind === "slide" || a.kind === "row")) {
            const moves = movesOf(b);
            const move = moves[b.next % moves.length];
            b.next += 1;
            begin(g, f, b, move);
        }
        return;
    }
    if (!carryOn(g, f, b)) {
        b.act = "idle";
        b.target = null;
        b.rest = restFor(f.lap);
    }
}

function moveAttacks(f) {
    for (const a of f.attacks) {
        if (a.warn > 0) {
            a.warn -= 1;
            continue;
        }
        if (a.kind === "fall") {
            a.y += a.vy;
            if (a.y <= f.floor + 1) {
                a.y = f.floor + 1;
                a.life = 0;
            }
        } else if (a.kind === "row" || a.kind === "wave" || a.kind === "slide") {
            a.x += a.vx;
            if (a.x < f.x0 - a.w || a.x > f.x1) a.life = 0;
        } else {
            a.life -= 1;
        }
    }
    f.attacks = f.attacks.filter((a) => a.life > 0);
}

// ---- what hurts ----

const overlap = (ax, aw, bx, bw) => ax < bx + bw && bx < ax + aw;
// Claude's own box: the middle of its five columns, two rows high
const hits = (g, x, y, w, h) => overlap(g.claude.x + 0.8, BODY_W - 1.6, x, w) && overlap(g.claude.y, 2, y, h);

function hurt(g, f, from) {
    const { claude } = g;
    f.hearts -= 1;
    f.hurt = HURT_TICKS;
    if (f.hearts <= 0) {
        g.phase = "over";
        g.cause = `The ${f.boss.name} beat you.`;
        return;
    }
    // knocked back, away from what hit
    claude.on = null;
    claude.vy = 0.55;
    claude.vx = claude.x + BODY_W / 2 < from ? -0.7 : 0.7;
}

function checkHits(g, f) {
    if (f.hurt > 0) {
        f.hurt -= 1;
        return;
    }
    const b = f.boss;
    if (!b.dying && hits(g, b.x + 0.5, b.y, b.w - 1, b.h - 0.3)) return hurt(g, f, centerOf(b));
    for (const a of f.attacks) {
        if (a.warn > 0) continue;
        if (hits(g, a.x, a.y, a.w, a.h)) return hurt(g, f, a.x + a.w / 2);
    }
}

// a bomb bursts wider than itself
function burst(f) {
    for (const a of f.attacks) {
        if (a.kind === "bomb" && a.warn === 0 && !a.burst) {
            a.burst = true;
            a.x -= 3;
            a.w += 6;
            a.h = 3;
        }
    }
}

// ---- once a tick ----

// keeps Claude between the arena's walls
export function holdIn(g) {
    const f = g.fight;
    const { claude } = g;
    const x = clamp(claude.x, f.x0 - 0.5, f.x1 - BODY_W + 0.5);
    if (x !== claude.x) {
        claude.x = x;
        claude.vx = 0;
    }
}

// the fight goes on; call after Claude moves
export function moveFight(g) {
    const f = g.fight;
    moveShots(g);
    if (f.intro > 0) {
        f.intro -= 1;
        return;
    }
    const b = f.boss;
    if (b.dying) {
        b.dying -= 1;
        if (b.dying === 0) winFight(g);
        return;
    }
    moveBoss(g, f);
    moveAttacks(f);
    burst(f);
    checkHits(g, f);
}
