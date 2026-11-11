// the autopilot: it presses the same keys a person would. before each jump it plays the jump out on a copy of the
// game, against where the birds, bolts and moving plates are heading, and takes the best one that survives. a bolt that
// hasn't appeared yet is left out of the copy, so it can't see those coming either
// "best" means furthest along the chain, whichever way that is: up a climb, or left or right along the ground. on a
// rope it swings, and every other tick tries letting go on a copy, and lets go for real once that lands it safely.
// a door is like a pipe: the ground after it is very hard going, so it always walks into the door and goes down the
// tunnel, runs it, and comes out of the far end
// meteors, lava bombs and burning platforms are on the copy too once their warning shows, and so is the wind
// in a boss fight it shoots whenever a fireball would hit, and every few ticks tries each way of moving on a copy,
// taking the one that loses no hearts and keeps it lined up with the boss
import { AUTO_RESTART_TICKS, BODY_W, CRUMBLE_TICKS, GRAVITY, HANDS, JUMP, act, doorAt, restart, ropeOf, safeCenter, sectionOf, step, touchesColumns } from "./game.mjs";

const SIM_TICKS = 70;
const AFTER_LANDING = 20;
const ESCAPE_TICKS = 30;
const ESCAPE_KEYS = [" ", "a", "d", "w", "s"];
const WAITS = [0, 2, 5, 9, 14, 20, 28];
const MAX_TRIALS = 60;
const CHECK_EVERY = 4;
const JUMP_HEIGHT = 7;
// how far across, and how far down, a jump is worth trying
const REACH = 32;
const DROP = 14;

const middleOf = (claude) => claude.x + BODY_W / 2;
const isRope = (t) => t.ax !== undefined;
// where to steer for: the middle of a plate's safe part, or a rope
const aimX = (t) => (isRope(t) ? t.ax : safeCenter(t));
// how high it is: a plate's top, or about where a rope gets caught
const aimY = (t) => (isRope(t) ? t.ay - t.len * 0.6 - HANDS : t.y);
const wasSprung = (claude) => !claude.on && !claude.rope && claude.vy > JUMP + 0.1;
const findIn = (g, t) => (isRope(t) ? ropeOf(g, t.n) : g.plates.find((p) => p.n === t.n));
// what's worth heading for: in a tunnel only its own plates, and up top nothing past a door that's coming up
const everything = (g) => [...g.plates.filter((p) => (p.tunnel !== undefined) === (g.tunnel !== null)), ...(g.tunnel === null ? g.ropes : [])].filter((t) => t.dist <= (g.stopAt ?? Infinity));

// a copy of the game to try things on; nothing new is let into it, since nobody could see that coming
function copyOf(g) {
    const sim = structuredClone(g);
    sim.auto = false;
    sim.boltWait = Infinity;
    sim.strikeWait = Infinity;
    sim.fireWait = Infinity;
    return sim;
}

// the next stretch of the way on: the nearest plate or rope further along than here
const nextAfter = (g, dist) =>
    everything(g)
        .filter((t) => t.path && t.dist > dist)
        .sort((a, b) => a.dist - b.dist)[0];

// the bolt about to come down on Claude's column, if any
const boltOverhead = (g) => g.bolts.find((b) => touchesColumns(g.claude, b.x - 2, b.x + 4));

// stays clear of a bolt; false when there's nowhere to step, so it does something else instead
function dodgeBolt(g, bolt) {
    const { claude } = g;
    const key = middleOf(claude) < bolt.x + 1.5 ? "a" : "d";
    const next = claude.x + (key === "a" ? -5 : 5);
    if (claude.on && (next + 3.5 < claude.on.x || next + 0.5 >= claude.on.x + claude.on.len)) return false;
    act(g, key);
    return true;
}

// one tick of a plan: wait or walk for a moment, jump, then steer for the target
function follow(g, target, plan) {
    const { claude } = g;
    const gap = aimX(target) - middleOf(claude);
    if (claude.on) {
        if (plan.waitLeft > 0) {
            plan.waitLeft -= 1;
            if (plan.walk && Math.abs(gap) > 2.5) act(g, gap > 0 ? "d" : "a");
        } else {
            act(g, " ");
        }
        return;
    }
    if (Math.abs(gap) > (isRope(target) ? 0.6 : 2.5)) act(g, gap > 0 ? "d" : "a");
    if (plan.flap && !claude.fluttered && claude.vy < 0 && claude.y < aimY(target) + 3) act(g, "w");
}

// stands on a copy for a moment after landing; on crumbling ground only till just before it gives way
function settles(sim) {
    const ticks = sim.claude.on?.kind === "crumble" ? CRUMBLE_TICKS - 4 : AFTER_LANDING;
    for (let i = 0; i < ticks; i++) {
        step(sim);
        if (sim.phase !== "playing") return false;
    }
    return true;
}

// plays a plan out on a copy of the game; how good it turned out, or null if Claude didn't make it
function trial(g, plan) {
    const sim = copyOf(g);
    const target = findIn(sim, plan.target);
    if (!target) return null;
    const mine = { ...plan };
    const from = plan.from;
    let airborne = !sim.claude.on;
    for (let t = 0; t < SIM_TICKS; t++) {
        follow(sim, target, mine);
        step(sim);
        if (sim.phase !== "playing") return null;
        const { claude } = sim;
        if (!claude.on) airborne = true;
        if (!airborne) continue;
        if (claude.rope) {
            const rope = ropeOf(sim, claude.rope.n);
            return rope && rope.dist > from ? rope.dist * 3 - t * 0.04 + 1.5 : null;
        }
        if (wasSprung(claude)) return (from + 11) * 3 - t * 0.04;
        if (claude.on) {
            const spot = claude.on;
            if (!settles(sim)) return null;
            if (spot.dist <= from) return null;
            const penalty = (spot.kind === "crumble" ? 1 : 0) + (spot.kind === "moving" ? 0.5 : 0) + (spot.fire ? 3 : 0);
            return spot.dist * 3 - t * 0.04 - penalty + (spot.path ? 1.5 : 0);
        }
    }
    return null;
}

// the best plan that survives: the furthest targets are tried first, each with the shortest wait that works
function choosePlan(g) {
    const { claude } = g;
    const middle = middleOf(claude);
    const from = claude.on ? claude.on.dist : g.lastDist;
    const top = claude.on ? claude.on.y + JUMP_HEIGHT : claude.y + Math.max(0, claude.vy) ** 2 / (2 * GRAVITY) + 2.5;
    const targets = everything(g)
        .filter((t) => t !== claude.on && t.dist > from && Math.abs(aimX(t) - middle) <= REACH)
        .filter((t) => aimY(t) <= top && aimY(t) >= claude.y - DROP && aimY(t) >= g.camera - 1)
        .filter((t) => !(isRope(t) && claude.cool > 0 && t.n === claude.lastRope))
        .sort((a, b) => b.dist - a.dist)
        .slice(0, 6);
    const options = claude.on
        ? WAITS.flatMap((waitLeft) => (waitLeft ? [{ waitLeft }, { waitLeft, walk: true }] : [{ waitLeft }]))
        : [{ waitLeft: 0 }, { waitLeft: 0, flap: true }];
    let best = null;
    let trials = 0;
    for (const target of targets) {
        for (const option of options) {
            if (trials >= MAX_TRIALS) return best?.plan ?? null;
            trials += 1;
            const plan = { target: { n: target.n, ax: target.ax }, from, walk: false, flap: false, air: !claude.on, ...option };
            const value = trial(g, plan);
            if (value !== null) {
                if (!best || value > best.value) best = { plan, value };
                break;
            }
        }
    }
    return best?.plan ?? null;
}

function planStillGood(g) {
    const { plan, claude } = g;
    if (!plan || !findIn(g, plan.target)) return false;
    // a door has come up since this plan was made, and the plan goes past it
    if (findIn(g, plan.target).dist > (g.stopAt ?? Infinity)) return false;
    if (plan.air && (claude.on || claude.rope || wasSprung(claude))) return false;
    return g.ticks % CHECK_EVERY !== 0 || trial(g, plan) !== null;
}

// does Claude live through the next moments if this key is pressed (or held, for walking), or nothing at all?
function survives(g, key) {
    const sim = copyOf(g);
    for (let t = 0; t < ESCAPE_TICKS; t++) {
        if (key && (t === 0 || ((key === "a" || key === "d") && t < 8))) act(sim, key);
        step(sim);
        if (sim.phase !== "playing") return false;
    }
    return true;
}

// would letting go now land Claude further on, on ground or the next rope?
function letGoWorks(g) {
    const rope = ropeOf(g, g.claude.rope.n);
    if (!rope) return false;
    const sim = copyOf(g);
    const ahead = nextAfter(sim, rope.dist);
    act(sim, " ");
    for (let t = 0; t < SIM_TICKS; t++) {
        const { claude } = sim;
        if (ahead && !claude.on) {
            const gap = aimX(ahead) - middleOf(claude);
            if (Math.abs(gap) > 2.5) act(sim, gap > 0 ? "d" : "a");
        }
        step(sim);
        if (sim.phase !== "playing") return false;
        if (claude.rope) return (ropeOf(sim, claude.rope.n)?.dist ?? 0) > rope.dist;
        if (claude.on) return claude.on.dist > rope.dist && settles(sim);
    }
    return false;
}

// on a rope: let go when that's safe, and otherwise lean into the swing
function swingAcross(g) {
    const { claude } = g;
    if (g.ticks % 2 === 0 && letGoWorks(g)) {
        act(g, " ");
        g.plan = null;
        return;
    }
    act(g, claude.rope.w >= 0 ? "d" : "a");
}

// no safe jump right now: get out of the way of whatever's coming, head for the next plate, and don't get left behind
function makeDo(g) {
    const { claude } = g;
    // S in a doorway would go down a tunnel, so it's no escape there
    const escapes = doorAt(g) ? ESCAPE_KEYS.filter((key) => key !== "s") : ESCAPE_KEYS;
    if (!survives(g, "")) {
        const way = escapes.find((key) => survives(g, key));
        if (way) {
            act(g, way);
            return;
        }
    }
    const bolt = boltOverhead(g);
    if (bolt && dodgeBolt(g, bolt)) return;
    if (!claude.on) {
        if (claude.vy < 0) {
            const under = g.plates.filter((p) => p.y + 1 <= claude.y && p.dist >= g.lastDist).sort((a, b) => Math.abs(aimX(a) - middleOf(claude)) - Math.abs(aimX(b) - middleOf(claude)))[0];
            g.aim = under ? { n: under.n } : g.aim;
        }
        const aim = g.aim && findIn(g, g.aim);
        if (aim) {
            const gap = aimX(aim) - middleOf(claude);
            if (Math.abs(gap) > 2.5) act(g, gap > 0 ? "d" : "a");
        }
        return;
    }
    const next = nextAfter(g, claude.on.dist);
    g.aim = next ? { n: next.n, ax: next.ax } : null;
    if (!next) return;
    const gap = aimX(next) - middleOf(claude);
    const key = gap > 0 ? "d" : "a";
    // walk on towards it, but never off an edge into nothing
    if (Math.abs(gap) > 13 && survives(g, key)) act(g, key);
    else if (claude.on.kind === "crumble" || claude.y - g.camera < 5) act(g, " ");
}

// the door coming up in this stretch of ground, if any, and the plate it stands on
function doorAhead(g) {
    if (g.tunnel !== null) return null;
    const door = g.doors
        .filter((d) => !d.used && d.sec === g.sec && d.dist >= g.lastDist - 3 && d.dist - g.best < 60)
        .sort((a, b) => a.dist - b.dist)[0];
    const ground = door && g.plates.find((p) => p.door === door.n);
    return ground ? { door, ground } : null;
}

// walks over to a spot on the plate Claude is on, as long as that's safe; false if it isn't
// careful, it first checks the steps are safe; walking into a tunnel's exit it doesn't, since a look ahead would carry
// on walking up top, off ground it hasn't seen yet
function walkTo(g, x, careful = true) {
    const gap = x - middleOf(g.claude);
    if (Math.abs(gap) < 0.5) return true;
    const key = gap > 0 ? "d" : "a";
    if (careful && !survives(g, key)) return false;
    act(g, key);
    return true;
}

// ---- boss fights ----

// a capital A or D on the copy means keep running that way the whole time, to see a long run through
const FIGHT_KEYS = [[], ["a"], ["d"], ["A"], ["D"], [" "], ["a", " "], ["d", " "], ["A", " "], ["D", " "]];
const FIGHT_LOOK = 48;
const FIGHT_EVERY = 3;
// how far from the boss it likes to stand: close enough to hit it, far enough to see what's coming
const FIGHT_GAP = 13;
// and how far it likes to keep from the walls
const FIGHT_ROOM = 6;

const bossMiddle = (b) => b.x + b.w / 2;
// would a fireball from here hit the boss: at a height it covers
function linedUp(g) {
    const b = g.fight.boss;
    const row = g.claude.y + 1;
    return row >= b.y - 0.3 && row <= b.y + b.h;
}

// how well the fight's going on a copy: alive, unhurt, the boss hurt, lined up and a good distance off
function fightValue(sim, hp) {
    if (sim.phase !== "playing") return -1000;
    if (!sim.fight) return 1000;
    const b = sim.fight.boss;
    const gap = Math.abs(bossMiddle(b) - middleOf(sim.claude));
    // a wall at its back leaves only one way out of whatever comes next
    const room = Math.min(sim.claude.x - sim.fight.x0, sim.fight.x1 - sim.claude.x - BODY_W);
    const cornered = Math.max(0, FIGHT_ROOM - room) * 1.5;
    return (hp - b.hp) * 8 - Math.abs(gap - FIGHT_GAP) * 0.3 - cornered + (linedUp(sim) ? 6 : 0) - (sim.claude.on ? 0 : 1);
}

// plays a way of moving out on a copy, shooting whenever it's lined up, as it would for real
function tryFight(g, keys) {
    const sim = copyOf(g);
    const hearts = sim.fight.hearts;
    const hp = sim.fight.boss.hp;
    for (let t = 0; t < FIGHT_LOOK; t++) {
        for (const key of keys) {
            if (key === "A" || key === "D") act(sim, key.toLowerCase());
            else if (t === 0 || ((key === "a" || key === "d") && t < 8)) act(sim, key);
        }
        if (linedUp(sim)) act(sim, "f");
        step(sim);
        if (sim.phase !== "playing" || !sim.fight) break;
        // the sooner a hit, the worse
        if (sim.fight.hearts < hearts) return -300 - (FIGHT_LOOK - t);
    }
    return fightValue(sim, hp);
}

function fightBoss(g) {
    const f = g.fight;
    if (f.intro === 0 && !f.boss.dying && linedUp(g)) act(g, "f");
    if (g.ticks % FIGHT_EVERY !== 0) return;
    let best = null;
    for (const keys of FIGHT_KEYS) {
        const value = tryFight(g, keys);
        if (!best || value > best.value) best = { keys, value };
    }
    for (const key of best.keys) act(g, key.toLowerCase());
}

// in a doorway it goes down; standing on the door's plate it walks over to the door; underground, on the last plate,
// it walks out of the exit. true when that's what it did this tick
function useTunnels(g) {
    const { claude } = g;
    g.stopAt = null;
    if (g.tunnel !== null) {
        const sec = sectionOf(g, g.tunnel);
        const exit = sec && sec.exit.x + 2;
        if (sec && claude.on && claude.on.y === sec.exit.y && claude.on.x <= exit && claude.on.x + claude.on.len >= exit) return walkTo(g, exit, false);
        return false;
    }
    const ahead = doorAhead(g);
    if (!ahead) return false;
    g.stopAt = ahead.ground.dist;
    if (doorAt(g) === ahead.door) {
        act(g, "s");
        g.plan = null;
        return true;
    }
    if (claude.on === ahead.ground) return walkTo(g, ahead.door.x + 2);
    return false;
}

// call once a tick, before step; does nothing unless Tab has switched it on, and after a crash it starts a new run
export function autopilot(g) {
    if (!g.auto) return;
    if (g.phase === "over") {
        g.overWait += 1;
        if (g.overWait >= AUTO_RESTART_TICKS) restart(g);
        return;
    }
    if (g.phase !== "playing") return;
    if (g.fight) {
        fightBoss(g);
        return;
    }
    if (g.claude.rope) {
        swingAcross(g);
        return;
    }
    if (g.claude.on && useTunnels(g)) return;
    if (!planStillGood(g)) {
        g.plan = null;
        if (g.planPause > 0) g.planPause -= 1;
        else {
            g.plan = choosePlan(g);
            if (!g.plan) g.planPause = 2;
        }
    }
    if (!g.plan) {
        makeDo(g);
        return;
    }
    if (!g.claude.on) g.plan.air = true;
    const target = findIn(g, g.plan.target);
    if (target) follow(g, target, g.plan);
}
