// what the world throws at Claude besides its platforms: the creatures, and the disasters that are part of the rules
// every one of them gives warning first: a meteor or a lava bomb shows a target where it will land, a platform catching
// fire smokes before it burns, and a creature is always in plain sight before it moves on Claude
// a sandstorm's wind pushes Claude sideways; it doesn't hurt, it just has to be steered against
// none of this happens underground, and none of it with hazards switched off
import { BODY_W, W, clamp, rand, whole } from "./world.mjs";
import { holdSky, weatherAt } from "./weather.mjs";

// how long a meteor's or a lava bomb's target shows before it lands, how long a burning platform smokes first and then
// burns, and how long the patch a lava bomb sets alight burns for
export const STRIKE_WARNING = 30;
export const SMOKE_TICKS = 40;
const BURN_TICKS = 100;
const LAVA_BURN = 60;
// a disaster only starts doing anything once it's well under way, so its banner is up first
const HAZARD_POWER = 0.5;
// how hard a sandstorm pushes, on the ground and in the air, in cells a tick
const WIND_GROUND = 0.05;
const WIND_AIR = 0.18;
const WIND_SWING = 0.0006;
// a hopper's hop: how often, how long it's in the air, and how high
const HOP_EVERY = 50;
const HOP_TICKS = 16;
const HOP_HEIGHT = 3;
// a dropper waits at the bottom this long, then climbs back up its thread this fast
const DROP_WAIT = 20;
const CLIMB_BACK = 0.15;
// a swooper's dive, and how long before it can dive again
const DIVE_TICKS = 36;
const DIVE_REST = 60;

// the weather's own seed, from the game's: a seed always brings the same weather as well as the same world
export const skySeedOf = (seed) => (Math.imul(seed ^ 0x2545f491, 0x9e3779b1) >>> 0) & 0x7fffffff;

export function updateSky(g) {
    const real = weatherAt(g.skySeed, g.ticks);
    g.sky = g.holdSky ? holdSky(real, g.holdSky) : real;
}

const active = (g, disaster) => g.hazards && g.tunnel === null && g.sky.disaster === disaster && g.sky.power >= HAZARD_POWER;

// the wind right now, from -1 to 1: which way and how hard
export const windNow = (g) => (g.hazards && g.tunnel === null && g.sky.weather === "sandstorm" ? g.sky.wind * g.sky.amount : 0);
export const windPush = (g, inAir) => windNow(g) * (inAir ? WIND_AIR : WIND_GROUND);
export const windSwing = (g) => windNow(g) * WIND_SWING;

// a platform burns between from and to, cells in from its left end, so the fire moves with a moving platform
export const burning = (p) => Boolean(p.fire) && p.fire.smoke === 0 && p.fire.burn > 0;
function setFire(p, from, to, smoke, burn) {
    p.fire = { from: Math.max(0, Math.floor(from)), to: Math.min(p.len - 1, Math.ceil(to)), smoke, burn };
}

const touches = (claude, from, to) => Math.floor(claude.x) + 3 >= from && Math.floor(claude.x) + 1 <= to;

// ---- meteors and lava bombs ----

// one at a time, every second or two, aimed somewhere near Claude: on the highest platform under that spot, in view
function aimStrike(g) {
    const meteor = active(g, "meteor shower");
    if (!meteor && !active(g, "volcano")) return;
    g.strikeWait -= 1;
    if (g.strikeWait > 0) return;
    g.strikeWait = meteor ? whole(g, 28, 55) : whole(g, 36, 65);
    const { claude } = g;
    const left = Math.round(g.camX);
    const x = clamp(Math.round(claude.x + whole(g, -10, 12)), left + 1, left + W - 4);
    const under = g.plates
        .filter((p) => p.kind !== "top" && p.x <= x + 2 && p.x + p.len >= x && p.y <= claude.y + 6 && p.y >= g.camera - 1)
        .sort((a, b) => b.y - a.y)[0];
    if (!under) return;
    g.strikes.push({ kind: meteor ? "meteor" : "lava", x, y: under.y + 1, t: STRIKE_WARNING, plate: under.n, from: rand(g) < 0.5 ? -1 : 1 });
}

// lands whatever's due; what it hits, if Claude, ends the run. a meteor smashes a side platform (never one on the way),
// and a lava bomb leaves its patch of platform burning for a while
function landStrikes(g) {
    let cause = null;
    const { claude } = g;
    for (const s of g.strikes) {
        s.t -= 1;
        if (s.t > 0) continue;
        if (touches(claude, s.x, s.x + 2) && claude.y >= s.y - 1 && claude.y <= s.y + 2.5) {
            cause = s.kind === "meteor" ? "A meteor came down on you." : "A lava bomb got you.";
        }
        const p = g.plates.find((q) => q.n === s.plate);
        if (p && s.kind === "meteor" && !p.path) p.t = 1;
        if (p && s.kind === "lava") setFire(p, s.x - p.x - 1, s.x - p.x + 3, 0, LAVA_BURN);
        g.impacts.push({ kind: s.kind, x: s.x, y: s.y, t: 12 });
    }
    g.strikes = g.strikes.filter((s) => s.t > 0);
    for (const i of g.impacts) i.t -= 1;
    g.impacts = g.impacts.filter((i) => i.t > 0);
    return cause;
}

// ---- wildfire ----

// now and then a platform in view starts smoking, then burns
function spreadFire(g) {
    if (active(g, "wildfire")) {
        g.fireWait -= 1;
        if (g.fireWait <= 0) {
            g.fireWait = whole(g, 45, 80);
            const left = g.camX;
            const choices = g.plates.filter((p) => !p.fire && p.kind !== "top" && p.x + p.len > left && p.x < left + W && p.y >= g.camera && p.y < g.camera + 20);
            if (choices.length) {
                const p = choices[whole(g, 0, choices.length - 1)];
                setFire(p, 0, p.len - 1, SMOKE_TICKS, BURN_TICKS);
            }
        }
    }
    for (const p of g.plates) {
        if (!p.fire) continue;
        if (p.fire.smoke > 0) p.fire.smoke -= 1;
        else if (p.fire.burn > 0) p.fire.burn -= 1;
        if (p.fire.smoke === 0 && p.fire.burn === 0) delete p.fire;
    }
}

// ---- creatures ----

function patrol(c) {
    c.x += c.dir * c.speed;
    if (c.x < c.low || c.x > c.high) {
        c.x = clamp(c.x, c.low, c.high);
        c.dir = -c.dir;
    }
}

// each moves its own way: fliers and walkers pace back and forth, hoppers hop as they go, droppers fall on Claude
// passing under and climb back, swoopers dive at Claude and rise again
function moveCreatures(g) {
    const { claude } = g;
    const middle = claude.x + BODY_W / 2;
    for (const c of g.creatures) {
        c.t += 1;
        const across = middle - (c.x + 1.5);
        if (c.style === "fly" || c.style === "walk") patrol(c);
        else if (c.style === "hop") {
            patrol(c);
            const at = c.t % HOP_EVERY;
            c.y = c.ground + (at < HOP_TICKS ? HOP_HEIGHT * Math.sin((Math.PI * at) / HOP_TICKS) : 0);
        } else if (c.style === "drop") {
            if (c.phase === "idle" && Math.abs(across) < 3.5 && claude.y < c.y && claude.y > c.floor - 4) c.phase = "drop";
            if (c.phase === "drop") {
                c.y = Math.max(c.floor, c.y - c.speed);
                if (c.y === c.floor) {
                    c.phase = "wait";
                    c.cool = DROP_WAIT;
                }
            } else if (c.phase === "wait") {
                c.cool -= 1;
                if (c.cool <= 0) c.phase = "rise";
            } else if (c.phase === "rise") {
                c.y = Math.min(c.top, c.y + CLIMB_BACK);
                if (c.y === c.top) c.phase = "idle";
            }
        } else if (c.style === "swoop") {
            if (c.cool > 0) c.cool -= 1;
            if (c.phase === "idle") {
                patrol(c);
                if (c.cool === 0 && Math.abs(across) < 12 && claude.y < c.home - 1 && c.home - claude.y < 9) {
                    c.phase = "dive";
                    c.dive = 0;
                    c.depth = c.home - Math.round(claude.y);
                    c.dir = across > 0 ? 1 : -1;
                }
            } else {
                c.dive += 1;
                c.x += c.dir * c.speed * 2;
                c.y = c.home - c.depth * Math.sin((Math.PI * c.dive) / DIVE_TICKS);
                if (c.dive >= DIVE_TICKS) {
                    c.phase = "idle";
                    c.y = c.home;
                    c.cool = DIVE_REST;
                    c.x = clamp(c.x, c.low, c.high);
                }
            }
        }
    }
}

// ---- once a tick ----

// moves everything along; call before Claude moves
export function moveHazards(g) {
    moveCreatures(g);
    aimStrike(g);
    spreadFire(g);
}

// what got Claude this tick, if anything; call after Claude moves
export function hazardDanger(g) {
    const landed = landStrikes(g);
    if (landed) return landed;
    const { claude } = g;
    const feet = Math.round(claude.y);
    const on = claude.on;
    if (on && burning(on) && touches(claude, on.x + on.fire.from, on.x + on.fire.to)) return "You got burned.";
    for (const c of g.creatures) {
        const row = Math.round(c.y);
        const x = Math.round(c.x);
        if ((row === feet || row === feet + 1) && touches(claude, x, x + 2)) return `The ${c.name} got you.`;
    }
    return null;
}
