// Sky Hop: Claude runs, climbs and swings through a world made of tech. the rules only, with no screen in here, so the
// tests can play it too; terminal.mjs draws it as text, index.html as pixel art, and autopilot.mjs plays it
// heights count up from the first plate; a plate at y holds Claude, whose feet are at y + 1. x is in cells across the
// whole world, and the window is W cells of it, wherever the camera is
import { holdIn, lapOf, moveFight, shoot, startFight } from "./bosses.mjs";
import { dress, newLook } from "./looks.mjs";
import { hazardDanger, moveHazards, skySeedOf, updateSky, windPush, windSwing } from "./hazards.mjs";
import { ASPECT, BODY_W, CRUMBLE_TICKS, H, W, buildAhead, clamp, digTunnel, progressOf, safeCenter, sectionOf, startWorld, tidy, tunnelExit, whole } from "./world.mjs";

export { BODY_W, CRUMBLE_TICKS, H, W, lapOf, safeCenter, sectionOf };
// a crumbled plate grows back after this long: with two in a row gone the gap could be too wide to jump, and Claude
// would be stuck with no way on (in a tunnel, with nothing to fall to, for good)
export const REGROW_TICKS = 80;

export const TICK_MS = 50;
export const GRAVITY = 0.06;
export const JUMP = 0.95;
const FLUTTER = 0.55;
const SPRING = 1.4;
const MAX_FALL = 1.3;
const SPEED = 0.8;
// a terminal never says when a key is let go, so a press keeps moving for this long and holding it renews it
const MOVE_TICKS = 6;
const JUMP_BUFFER = 4;
const BOLT_WARNING = 26;
export const BOLT_STRIKE = 6;
export const AUTO_RESTART_TICKS = 60;
// on a rope: where Claude's hands are above its feet, how hard a push swings it, and how far out it can swing
export const HANDS = 1.5;
const PUMP = 0.0035;
const MAX_SWING = 1.3;
const LET_GO_LIFT = 0.35;
// after letting go, the same rope can't be caught again for this long
const ROPE_COOL = 12;
// the world is built this far ahead of Claude, and forgotten this far behind
const AHEAD = 220;
const BEHIND = 70;
// the fade in and out of a tunnel
export const WARP_TICKS = 12;
const TUNNEL_BONUS = 100;

// world starts the game further on, in that world (counting from 0), for a look at it or a test
export function newGame(seed = Date.now() | 0, { hazards = true, world = 0 } = {}) {
    const g = {
        seed,
        hazards,
        startWorld: world,
        auto: false,
        assisted: false,
        aim: null,
        plan: null,
        planPause: 0,
        overWait: 0,
        phase: "title",
        stage: world + 1,
        camera: -5,
        camX: 0,
        // the section Claude last stood in, the height of that ground, and how far along the chain its plate was
        sec: 0,
        groundY: 0,
        lastDist: 0,
        best: 0,
        bonus: 0,
        cause: "",
        banner: 0,
        warp: 0,
        tunnel: null,
        ticks: 0,
        boltWait: 40,
        bolts: [],
        // the weather, worked out each tick from its own seed (see hazards.mjs); holdSky keeps one on, for a look at it
        skySeed: skySeedOf(seed),
        sky: null,
        holdSky: null,
        // meteors and lava bombs on their way down, and where they just landed
        strikes: [],
        impacts: [],
        strikeWait: 40,
        fireWait: 40,
        // the boss fight on now, if any (see bosses.mjs), and the last boss beaten, for its banner
        fight: null,
        beaten: null,
        // crumbled plates waiting to grow back
        regrow: [],
        // who's playing and what they're wearing (see looks.mjs), and the wardrobe while it's open: only looks
        look: newLook(),
        wardrobe: null,
        claude: { x: 2, y: 1, vy: 0, vx: 0, on: null, dir: 0, left: 0, want: 0, fluttered: false, rope: null, cool: 0, lastRope: -1, moved: 0 },
    };
    updateSky(g);
    startWorld(g, world);
    g.claude.on = g.plates[0];
    g.lastDist = g.plates[0].dist;
    g.camX = g.claude.x + BODY_W / 2 - W / 2 + 6;
    buildAhead(g, AHEAD);
    return g;
}

export const heightOf = (g) => g.best;
export const scoreOf = (g) => g.best * 10 + g.bonus;

// Claude's feet are the middle three of its five columns, so a toe over the edge doesn't count
const overlaps = (claude, p) => claude.x + 3.5 >= p.x && claude.x + 0.5 < p.x + p.len;
export const touchesColumns = (claude, from, to) => Math.floor(claude.x) + 3 >= from && Math.floor(claude.x) + 1 <= to;

const end = (g, cause) => {
    g.phase = "over";
    g.cause = cause;
};

function land(g, p) {
    const { claude } = g;
    claude.y = p.y + 1;
    claude.vy = 0;
    claude.vx = 0;
    claude.on = p;
    claude.fluttered = false;
    if (p.kind === "crumble" && p.t === 0) p.t = CRUMBLE_TICKS;
    if (p.kind === "spring") {
        claude.on = null;
        claude.vy = SPRING;
    }
}

// a cloud top is reached once Claude is level with it or above, over it, even if a spring threw it straight past.
// its boss guards it: reaching it starts the fight, and only beating the boss counts it (see bosses.mjs)
function passCloudTops(g) {
    if (g.fight) return;
    const { claude } = g;
    const middle = claude.x + BODY_W / 2;
    // landing on the next place's ground counts too: from the side of a climb Claude can jump straight onto it, and
    // the boss pulls it back in
    const past = (p) => g.tunnel === null && claude.on && claude.on.kind !== "top" && claude.on.zone === p.zone;
    for (const p of g.plates) {
        if (p.kind !== "top" || p.done) continue;
        if ((claude.y >= p.y + 1 && claude.y - p.y < 14 && middle >= p.x - 2 && middle <= p.x + p.len + 2) || past(p)) {
            startFight(g, p);
            return;
        }
    }
}

function jump(claude) {
    claude.on = null;
    claude.vy = JUMP;
    claude.want = 0;
}

export const restart = (g) => {
    const { auto, holdSky, look } = g;
    Object.assign(g, newGame(g.seed, { hazards: g.hazards, world: g.startWorld }), { phase: "playing", auto, assisted: auto, holdSky, look });
};

// the door Claude is standing in, if any
export const doorAt = (g) => {
    const { claude } = g;
    if (!claude.on || g.tunnel !== null) return null;
    const middle = claude.x + BODY_W / 2;
    return g.doors.find((d) => !d.used && d.y === claude.on.y && Math.abs(middle - (d.x + 2)) <= 2.5) ?? null;
};

// ---- ropes ----

export const ropeOf = (g, n) => g.ropes.find((r) => r.n === n);

// where Claude's hands are on a rope, so where Claude is
function hang(g, rope) {
    const { claude } = g;
    const { a, len } = claude.rope;
    claude.x = rope.ax + len * Math.sin(a) * ASPECT - BODY_W / 2;
    claude.y = rope.ay - len * Math.cos(a) - HANDS;
}

// any rope Claude's hands pass close to in the air gets caught; the swing keeps the speed Claude had coming in
function grabRope(g) {
    const { claude } = g;
    const hx = claude.x + BODY_W / 2;
    const hy = claude.y + HANDS;
    for (const rope of g.ropes) {
        if (claude.cool > 0 && rope.n === claude.lastRope) continue;
        if (Math.abs(hx - rope.ax) > 1.3 || hy > rope.ay - 1 || hy < rope.ay - rope.len) continue;
        const dx = (hx - rope.ax) / ASPECT;
        const dy = rope.ay - hy;
        const len = clamp(Math.hypot(dx, dy), 3, rope.len);
        const a = Math.atan2(dx, dy);
        const w = ((claude.moved / ASPECT) * Math.cos(a) + claude.vy * Math.sin(a)) / len;
        claude.rope = { n: rope.n, a, w, len };
        claude.vy = 0;
        claude.vx = 0;
        claude.fluttered = false;
        hang(g, rope);
        return;
    }
}

// a pendulum: leaning into the swing with A or D pushes it higher
function swing(g) {
    const { claude } = g;
    const hold = claude.rope;
    const rope = ropeOf(g, hold.n);
    if (!rope) {
        claude.rope = null;
        return;
    }
    if (claude.left > 0) {
        claude.left -= 1;
        if (hold.w === 0 || Math.sign(hold.w) === claude.dir) hold.w += claude.dir * PUMP;
    }
    hold.w += windSwing(g);
    hold.w -= (GRAVITY / hold.len) * Math.sin(hold.a);
    hold.w *= 0.997;
    hold.a += hold.w;
    if (Math.abs(hold.a) > MAX_SWING) {
        hold.a = Math.sign(hold.a) * MAX_SWING;
        hold.w = 0;
    }
    hang(g, rope);
}

// Space lets go with a little hop, S just lets go; either way Claude flies off with the swing's speed
function letGo(g, hop) {
    const { claude } = g;
    const { a, w, len, n } = claude.rope;
    const speed = len * w;
    claude.vx = speed * Math.cos(a) * ASPECT;
    claude.vy = speed * Math.sin(a) + (hop ? LET_GO_LIFT : 0);
    claude.rope = null;
    claude.cool = ROPE_COOL;
    claude.lastRope = n;
    claude.want = 0;
}

// ---- tunnels ----

function enterTunnel(g, door) {
    const { claude } = g;
    door.used = true;
    const { sec, entry } = digTunnel(g, door);
    g.tunnel = sec.id;
    g.sec = sec.id;
    g.bolts = [];
    g.strikes = [];
    claude.x = entry.x + entry.len / 2 - BODY_W / 2;
    claude.y = entry.y + 1;
    claude.vy = 0;
    claude.vx = 0;
    claude.on = entry;
    claude.left = 0;
    g.groundY = entry.y;
    g.camera = entry.y - 5;
    g.camX = claude.x + BODY_W / 2 - W / 2;
    g.warp = WARP_TICKS;
    g.banner = 50;
}

// out of the far end, back up top a good way past the door
function leaveTunnel(g) {
    const sec = sectionOf(g, g.tunnel);
    const { claude } = g;
    const out = tunnelExit(g, sec);
    const inside = (o) => o.tunnel === sec.id;
    g.plates = g.plates.filter((p) => !inside(p));
    g.stars = g.stars.filter((s) => !inside(s));
    g.creatures = g.creatures.filter((c) => !inside(c));
    g.sections = g.sections.filter((s) => s !== sec);
    g.tunnel = null;
    g.bonus += TUNNEL_BONUS;
    g.warp = WARP_TICKS;
    claude.vy = 0;
    claude.vx = 0;
    claude.left = 0;
    if (!out) return end(g, "The tunnel caved in.");
    claude.x = safeCenter(out) - BODY_W / 2;
    claude.y = out.y + 1;
    claude.on = out;
    g.sec = out.sec;
    g.groundY = out.y;
    g.lastDist = out.dist;
    g.best = Math.max(g.best, Math.floor(progressOf(g)));
    g.camera = out.y - 5;
    g.camX = claude.x + BODY_W / 2 - W / 2;
}

function checkTunnelExit(g) {
    const sec = g.tunnel !== null && sectionOf(g, g.tunnel);
    const { claude } = g;
    if (!sec || !claude.on || claude.on.y !== sec.exit.y) return;
    if (Math.abs(claude.x + BODY_W / 2 - (sec.exit.x + 2)) <= 2.5) leaveTunnel(g);
}

// ---- keys ----

// one key press; the terminal's own escape codes (arrow keys and such) never reach here, see keysIn
// Tab hands Claude to the autopilot and back; a run it has touched doesn't count towards the best score
export function input(g, key) {
    // while the wardrobe is open every key goes to it
    if (g.wardrobe) {
        dress(g, key);
        return;
    }
    if (key === "\t") {
        g.auto = !g.auto;
        if (g.auto) g.assisted = true;
        if (g.phase === "title") g.phase = "playing";
        return;
    }
    if (key === "r" && g.phase !== "title") {
        restart(g);
        return;
    }
    if (g.phase === "title") {
        if (key === "c") g.wardrobe = { row: 0 };
        if (key === " " || key === "\r") g.phase = "playing";
        return;
    }
    if (!g.auto) act(g, key);
}

export function act(g, key) {
    if (g.phase !== "playing") return;
    const { claude } = g;
    if (key === "a" || key === "d") {
        claude.dir = key === "a" ? -1 : 1;
        claude.left = MOVE_TICKS;
    } else if (key === " ") {
        if (claude.rope) letGo(g, true);
        else claude.want = JUMP_BUFFER;
    } else if (key === "w") {
        if (claude.rope) return;
        if (claude.on) claude.want = JUMP_BUFFER;
        else if (!claude.fluttered) {
            claude.fluttered = true;
            claude.vy = Math.max(claude.vy, FLUTTER);
        }
    } else if (key === "f" || key === "e") {
        shoot(g);
    } else if (key === "s") {
        // the arena's floor is solid: no dropping out of a fight
        if (g.fight && claude.on?.kind === "top") return;
        const door = doorAt(g);
        if (door) enterTunnel(g, door);
        else if (claude.rope) letGo(g, false);
        else if (claude.on) {
            claude.on = null;
            claude.vy = 0;
            claude.y -= 0.01;
        } else {
            claude.vy = Math.min(claude.vy, -1);
        }
    }
}

// a chunk from the keyboard as single keys; "\x1b[A" is the up arrow, and must not read as the key A
export function keysIn(data) {
    return data.startsWith("\x1b") ? [] : [...data.toLowerCase()];
}

// ---- one tick ----

// crumbled plates come back whole once their time's up
function regrowPlates(g) {
    for (const r of g.regrow) r.t -= 1;
    for (const r of g.regrow) {
        if (r.t > 0) continue;
        r.plate.broken = false;
        r.plate.t = 0;
        g.plates.push(r.plate);
    }
    g.regrow = g.regrow.filter((r) => r.t > 0);
}

function moveThings(g) {
    const { claude } = g;
    moveHazards(g);
    for (const p of g.plates) {
        if (p.kind === "moving") {
            const before = p.x;
            p.x = clamp(p.x + p.v, p.low, p.high);
            if (p.x === p.low || p.x === p.high) p.v = -p.v;
            if (claude.on === p) claude.x += p.x - before;
        }
        if (p.t > 0) {
            p.t -= 1;
            if (p.t === 0) {
                p.broken = true;
                if (claude.on === p) {
                    claude.on = null;
                    claude.vy = 0;
                }
            }
        }
    }
    for (const p of g.plates) if (p.broken && p.kind === "crumble") g.regrow.push({ plate: p, t: REGROW_TICKS });
    g.plates = g.plates.filter((p) => !p.broken);
    regrowPlates(g);
    for (const b of g.bolts) b.t -= 1;
    g.bolts = g.bolts.filter((b) => b.t > 0);
    // no lightning underground or in a boss fight; it comes more often each lap
    if (g.hazards && g.best > 20 && g.tunnel === null && !g.fight) {
        g.boltWait -= 1;
        if (g.boltWait <= 0) {
            const left = Math.round(g.camX);
            g.bolts.push({ x: whole(g, left + 1, left + W - 4), t: BOLT_WARNING + BOLT_STRIKE });
            g.boltWait = Math.max(Math.max(18, 34 - 4 * lapOf(g.stage - 1)), whole(g, 70, 130) - g.stage * 10);
        }
    }
}

function moveClaude(g) {
    const { claude } = g;
    if (claude.want > 0) claude.want -= 1;
    if (claude.cool > 0) claude.cool -= 1;
    if (claude.rope) return swing(g);
    let move = 0;
    if (claude.left > 0) {
        move = claude.dir * SPEED;
        claude.left -= 1;
    }
    // speed from a rope carries Claude on through the air; pushing the other way slows it quickly
    if (claude.vx) {
        if (move && Math.sign(move) !== Math.sign(claude.vx)) claude.vx *= 0.8;
        if (Math.abs(claude.vx) > Math.abs(move)) move = claude.vx;
        claude.vx *= 0.985;
        if (Math.abs(claude.vx) < 0.05) claude.vx = 0;
    }
    // a sandstorm pushes, harder in the air
    move += windPush(g, !claude.on);
    claude.x += move;
    claude.moved = move;
    if (claude.on) {
        if (!overlaps(claude, claude.on)) {
            claude.on = null;
            claude.vy = 0;
        } else if (claude.want > 0) {
            jump(claude);
        } else {
            return;
        }
    }
    const before = claude.y;
    claude.vy = Math.max(claude.vy - GRAVITY, -MAX_FALL);
    claude.y += claude.vy;
    if (claude.vy <= 0) {
        const under = g.plates
            .filter((p) => p.y + 1 <= before && p.y + 1 >= claude.y && overlaps(claude, p))
            .sort((a, b) => b.y - a.y)[0];
        if (under) {
            land(g, under);
            if (claude.want > 0 && claude.on) jump(claude);
        }
    }
    if (!claude.on) grabRope(g);
}

function checkDanger(g) {
    const { claude } = g;
    const feet = Math.round(claude.y);
    const left = Math.floor(claude.x);
    if (claude.y < g.camera - 2) return end(g, g.tunnel !== null ? "You fell down a dark shaft." : "You fell into the void.");
    if (claude.on?.kind === "spike" && touchesColumns(claude, claude.on.spikeX, claude.on.spikeX + claude.on.spikeLen - 1)) {
        return end(g, "You landed on a syntax error.");
    }
    const hit = hazardDanger(g);
    if (hit) return end(g, hit);
    for (const b of g.bolts) {
        if (b.t <= BOLT_STRIKE && touchesColumns(claude, b.x, b.x + 2)) return end(g, "An exception crashed you.");
    }
    g.stars = g.stars.filter((s) => {
        const hit = (s.y === feet || s.y === feet + 1) && s.x >= left && s.x <= left + BODY_W - 1;
        if (hit) g.bonus += 50;
        return !hit;
    });
}

// up a climb the camera only ever rises, and high enough it rises by itself, so nobody can wait on a plate forever;
// along the ground it follows Claude both ways, looking a little ahead. the plate at the top of a climb is where the
// ground starts again, so from there it follows like on the ground
function moveCamera(g) {
    const { claude } = g;
    const sec = sectionOf(g, g.sec);
    // in a boss fight the screen locks onto the arena
    if (g.fight) {
        g.camera += (g.fight.floor - 2 - g.camera) * 0.2;
        g.camX += (g.fight.x0 - g.camX) * 0.2;
    } else if (sec?.kind === "climb" && g.lastDist < sec.start + sec.len) {
        if (g.best > 10) g.camera += Math.min(0.07, 0.01 + 0.008 * g.stage);
        g.camera = Math.max(g.camera, claude.y - Math.floor(H * 0.55));
        g.camX += (sec.x0 - g.camX) * 0.15;
    } else {
        g.camera += (g.groundY - 5 - g.camera) * 0.12;
        g.camera = Math.max(g.camera, claude.y + 2 - (H - 4));
        const ahead = (sec?.dir ?? 1) * 6;
        g.camX += (claude.x + BODY_W / 2 - W / 2 + ahead - g.camX) * 0.12;
    }
    buildAhead(g, g.best + AHEAD);
    tidy(g, BEHIND);
}

export function step(g) {
    if (g.phase !== "playing") return;
    g.ticks += 1;
    updateSky(g);
    if (g.banner > 0) g.banner -= 1;
    if (g.warp > 0) g.warp -= 1;
    if (g.beaten && --g.beaten.t <= 0) g.beaten = null;
    moveThings(g);
    moveClaude(g);
    if (g.fight) holdIn(g);
    passCloudTops(g);
    const { claude } = g;
    if (claude.on) {
        g.sec = claude.on.sec;
        g.groundY = claude.on.y;
        if (g.tunnel === null) {
            g.lastDist = claude.on.dist;
            g.best = Math.max(g.best, Math.floor(progressOf(g)));
        }
    }
    // a rope belongs to the ground it hangs over, even when Claude jumped for it straight from the top of a climb
    if (claude.rope) g.sec = ropeOf(g, claude.rope.n)?.sec ?? g.sec;
    if (g.fight) moveFight(g);
    if (g.phase === "playing") checkDanger(g);
    if (g.phase === "playing") checkTunnelExit(g);
    if (g.phase === "playing") moveCamera(g);
}
