// the world: one endless chain of sections, made up a little ahead of Claude as it goes
// a run is ground going left or right, with gaps, ropes over the wide ones and now and then a tunnel door; a climb is the
// old climb up the sky, in a column one screen wide. each place is run, climb, run, climb, and its last climb ends on a
// cloud top that leads into the next place
// every section knows how far along the whole chain it starts, so progress, the autopilot and tidying up all go by that
// one number, dist
import { ERAS, eraOf, placeOf } from "./places.mjs";

// the window, in cells and rows
export const W = 44;
export const H = 20;
export const BODY_W = 5;
// a cell is 8 pixels wide and a row 12 tall, so a row of height is a cell and a half across; ropes swing in rows
export const ASPECT = 1.5;
export const CRUMBLE_TICKS = 16;
// how long a rope hangs, in rows, and how far above the ground its top is tied
export const ROPE_LEN = 8;
const ROPE_TOP = 12;
const CLIMB_SECTION = 1;
const GATE_SECTION = 3;
const PLACE_SECTIONS = 4;
// tunnels are dug far below everything, so nothing from up top is ever in view down there
const TUNNEL_DEPTH = 400;
// how high a tunnel's roof sits over its floor; well over a jump, so the roof is only scenery
export const TUNNEL_ROOF = 13;

export const mod = (n, m) => ((n % m) + m) % m;
export const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

// seeded, and kept on the game, so the same seed always plays out the same
export const rand = (g) => {
    g.seed = (g.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(g.seed ^ (g.seed >>> 15), 1 | g.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const between = (g, low, high) => low + rand(g) * (high - low);
export const whole = (g, low, high) => Math.floor(between(g, low, high + 1));

export const sectionOf = (g, id) => g.sections.find((s) => s.id === id);

// how far along the chain a spot in a section is: across for a run, up for a climb, and a tunnel doesn't count
export function distAt(sec, x, y) {
    if (sec.kind === "climb") return sec.start + (y - sec.y0);
    if (sec.kind === "tunnel") return sec.start;
    return sec.start + (x - sec.x0) * sec.dir;
}

// how far along Claude is, from where it stands
export function progressOf(g) {
    const { claude } = g;
    const sec = claude.on && sectionOf(g, claude.on.sec);
    if (!sec || sec.kind === "tunnel") return g.best;
    return clamp(distAt(sec, claude.x + BODY_W / 2, claude.y - 1), sec.start, sec.start + sec.len);
}

function addSection(g, fields) {
    const sec = { id: g.nextSection, len: 0, ...fields };
    g.nextSection += 1;
    g.sections.push(sec);
    return sec;
}

function makePlate(g, sec, x, y, len, kind) {
    const plate = { n: g.serial, sec: sec.id, y, x, len, kind, v: 0, t: 0, path: false, zone: sec.place, dist: 0 };
    g.serial += 1;
    if (sec.era !== undefined) plate.era = sec.era;
    if (sec.kind === "tunnel") plate.tunnel = sec.id;
    if (kind === "moving") {
        const range = sec.kind === "run" ? 3 : 6;
        plate.v = between(g, 0.12, 0.25) * (rand(g) < 0.5 ? -1 : 1);
        plate.low = x - range;
        plate.high = x + range;
    }
    if (kind === "spike") {
        // always at one end, so at least eight cells stay safe to land on
        plate.spikeLen = whole(g, 2, Math.min(4, len - 8));
        plate.spikeX = rand(g) < 0.5 ? x : x + len - plate.spikeLen;
    }
    plate.dist = distAt(sec, x + len / 2, y);
    return plate;
}

// the middle of the part of a plate that's safe to stand on
export const safeCenter = (p) => {
    const from = p.x + (p.kind === "spike" && p.spikeX === p.x ? p.spikeLen : 0);
    const to = p.x + p.len - (p.kind === "spike" && p.spikeX !== p.x ? p.spikeLen : 0);
    return (from + to) / 2;
};

const level = (g) => Math.min(3, g.gen.place);

function climbKind(g) {
    const roll = rand(g);
    if (roll < 0.48) return "plain";
    if (roll < 0.68) return "moving";
    if (roll < 0.82) return "crumble";
    if (roll < 0.9) return "spring";
    return g.hazards ? "spike" : "plain";
}

// no springs on the ground: one would throw Claude far over the next stretch
function runKind(g) {
    const roll = rand(g);
    if (roll < 0.62) return "plain";
    if (roll < 0.76) return "moving";
    if (roll < 0.9) return "crumble";
    return g.hazards ? "spike" : "plain";
}

// a world's own creature, by a plate: fliers and swoopers patrol the air over it, walkers and hoppers pace along it,
// and droppers hang above it waiting for Claude to pass under. a creature that can't stand on a plate that moves or
// crumbles flies instead
export function addCreature(g, sec, plate, kind) {
    const style = kind.style === "walk" || kind.style === "hop" ? (plate.kind === "plain" && plate.len >= 8 ? kind.style : "fly") : kind.style;
    const speed = kind.speed * between(g, 0.85, 1.15);
    const dir = rand(g) < 0.5 ? -1 : 1;
    const base = { kind: kind.id, name: kind.name, style, dir, speed, phase: "idle", t: whole(g, 0, 40), cool: 0 };
    if (sec.kind === "tunnel") base.tunnel = sec.id;
    let c;
    if (style === "walk" || style === "hop") {
        const x = between(g, plate.x, plate.x + plate.len - 3);
        c = { ...base, x, y: plate.y + 1, ground: plate.y + 1, low: plate.x, high: plate.x + plate.len - 3 };
    } else if (style === "drop") {
        const x = Math.round(between(g, plate.x + 1, plate.x + plate.len - 4));
        c = { ...base, x, y: plate.y + 8, top: plate.y + 8, floor: plate.y + 1, low: x, high: x };
    } else if (style === "swoop") {
        const y = plate.y + whole(g, 6, 7);
        c = { ...base, x: between(g, plate.x - 6, plate.x + plate.len + 6), y, home: y, low: plate.x - 10, high: plate.x + plate.len + 10 };
    } else {
        c = { ...base, x: between(g, plate.x - 8, plate.x + plate.len + 8), y: plate.y + whole(g, 2, 3), low: plate.x - 8, high: plate.x + plate.len + 8 };
    }
    c.dist = sec.kind === "tunnel" ? sec.start : distAt(sec, c.x, c.y);
    g.creatures.push(c);
}

function addStar(g, sec, x, y) {
    g.stars.push({ x: Math.round(x), y, dist: distAt(sec, x, y) });
}

// ground going one way from the plate the last section ended on, with gaps to jump, ropes over the widest, and maybe a door
function buildRun(g) {
    const { gen } = g;
    const from = gen.last;
    const dir = gen.dir;
    const sec = addSection(g, { kind: "run", dir, x0: gen.x0 ?? (dir > 0 ? from.x + from.len : from.x), y0: from.y, start: gen.dist, place: gen.place });
    gen.x0 = undefined;
    const length = whole(g, 90, 130);
    const shrink = level(g);
    let edge = dir > 0 ? from.x + from.len : from.x;
    let y = from.y;
    let pieces = 0;
    let door = false;
    let last = from;
    // the next piece of ground, gap cells on from the edge so far
    const lay = (gap, dy, len, kind) => {
        const near = edge + dir * gap;
        const x = dir > 0 ? near : near - len;
        const plate = makePlate(g, sec, x, y + dy, len, kind);
        plate.path = true;
        g.plates.push(plate);
        edge = dir > 0 ? x + len : x;
        y = plate.y;
        last = plate;
        pieces += 1;
        return plate;
    };
    while ((edge - sec.x0) * dir < length) {
        // a gap too wide to jump, with ropes over it; the ground either side is always solid and still, so nobody has
        // to jump for a rope off crumbling ground
        if (pieces > 0 && last.kind === "plain" && rand(g) < 0.18 + 0.03 * shrink) {
            const ropes = rand(g) < 0.4 ? 2 : 1;
            const first = whole(g, 13, 14);
            const spacing = whole(g, 19, 21);
            for (let i = 0; i < ropes; i++) {
                const ax = edge + dir * (first + i * spacing);
                g.ropes.push({ n: g.serial, sec: sec.id, ax, ay: y + ROPE_TOP, len: ROPE_LEN, dist: distAt(sec, ax, y), path: true });
                g.serial += 1;
            }
            const gap = first * 2 + (ropes - 1) * spacing + whole(g, 2, 5);
            if (rand(g) < 0.5) addStar(g, sec, edge + dir * (first + (ropes - 1) * spacing), y + 9);
            lay(gap, 0, whole(g, 14, 20), "plain");
            continue;
        }
        const kind = pieces === 0 ? "plain" : runKind(g);
        const len = kind === "spike" ? whole(g, 13, 16) : whole(g, 9, 18) - shrink;
        const plate = lay(whole(g, 3, 6 + shrink), pieces === 0 ? 0 : whole(g, -2, 2), len, kind);
        if (!door && kind === "plain" && len >= 12 && pieces > 1 && rand(g) < 0.3) {
            door = true;
            const x = Math.round(plate.x + plate.len / 2 - 2);
            g.doors.push({ n: g.serial, sec: sec.id, x, y: plate.y, era: whole(g, 0, ERAS.length - 1), dist: distAt(sec, x + 2, plate.y) });
            g.serial += 1;
        }
        if (rand(g) < 0.3) addStar(g, sec, safeCenter(plate), plate.y + 2);
        if (g.hazards && pieces > 2 && rand(g) < 0.1 + 0.03 * shrink) {
            addCreature(g, sec, plate, placeOf(sec.place).creature);
        }
    }
    // the last piece is still and solid too, since a climb starts from it
    if (last.kind !== "plain") lay(whole(g, 3, 5), 0, 12, "plain");
    sec.len = Math.abs(edge - sec.x0);
    gen.dist += sec.len;
    gen.last = last;
}

// the old climb, straight up a column one screen wide; it ends on a wide plate, or on a cloud top into the next place
function buildClimb(g, gate) {
    const { gen } = g;
    const from = gen.last;
    const dir = gen.dir;
    const x0 = dir > 0 ? from.x + from.len - 10 : from.x - W + 10;
    const sec = addSection(g, { kind: "climb", dir, x0, y0: from.y, start: gen.dist, place: gen.place });
    const shrink = level(g);
    const height = whole(g, 30, 44);
    let y = from.y + whole(g, 4, 5);
    let lastCenter = clamp(dir > 0 ? from.x + from.len - 4 : from.x + 4, x0 + 7, x0 + W - 7);
    const inColumn = (center, len) => Math.round(clamp(center - len / 2, x0 + 1, x0 + W - len - 1));
    while (y < from.y + height) {
        const kind = y - from.y < 8 ? "plain" : climbKind(g);
        let len = whole(g, 9 - shrink, 14 - shrink);
        if (kind === "spike") len = Math.max(len, 12);
        const reach = kind === "moving" ? 10 : 14;
        const center = clamp(lastCenter + between(g, -reach, reach), x0 + 7, x0 + W - 7);
        const plate = makePlate(g, sec, inColumn(center, len), y, len, kind);
        if (kind === "moving") {
            plate.low = Math.max(x0 + 1, plate.x - 6);
            plate.high = Math.min(x0 + W - len - 1, plate.x + 6);
        }
        plate.path = true;
        g.plates.push(plate);
        lastCenter = plate.x + plate.len / 2;

        if (rand(g) < 0.35) {
            const otherCenter = between(g, x0 + 7, x0 + W - 7);
            if (Math.abs(otherCenter - center) > 16) {
                const otherLen = whole(g, 9 - shrink, 14 - shrink);
                g.plates.push(makePlate(g, sec, inColumn(otherCenter, otherLen), y + whole(g, 1, 2), otherLen, rand(g) < 0.5 ? "crumble" : "plain"));
            }
        }
        if (rand(g) < 0.25) addStar(g, sec, safeCenter(plate), y + 2);
        if (g.hazards && y - from.y > 10 && rand(g) < 0.12 + 0.04 * shrink) addCreature(g, sec, plate, placeOf(sec.place).creature);
        y += whole(g, 3, Math.min(6, 4 + shrink));
    }
    let top;
    if (gate) {
        top = makePlate(g, sec, x0, y, W, "top");
        top.zone = sec.place + 1;
        gen.place += 1;
    } else {
        const len = 18;
        top = makePlate(g, sec, inColumn(clamp(lastCenter + between(g, -12, 12), x0 + 10, x0 + W - 10), len), y, len, "plain");
    }
    top.path = true;
    g.plates.push(top);
    sec.len = y - from.y;
    gen.dist += sec.len;
    gen.last = top;
    // after a climb the ground can head either way: whatever was down below is well out of sight by now
    gen.dir = rand(g) < 0.5 ? -1 : 1;
}

// lays the world out from the start: a long first plate, then section after section
export function startWorld(g) {
    g.sections = [];
    g.nextSection = 0;
    g.serial = 0;
    g.plates = [];
    g.stars = [];
    g.creatures = [];
    g.ropes = [];
    g.doors = [];
    const first = { kind: "run", dir: 1, x0: 4, y0: 0, start: 0, place: 0 };
    const start = makePlate(g, { ...first, id: -1 }, -12, 0, 40, "plain");
    start.sec = 0;
    start.path = true;
    g.plates.push(start);
    g.gen = { dist: 0, dir: 1, place: 0, step: 0, last: start, x0: 4 };
    // the start plate belongs to the first run, which then carries on from its far end
    buildAhead(g, 1);
    start.sec = g.sections[0].id;
}

// keeps the world built some way past a distance along the chain
export function buildAhead(g, upTo) {
    const { gen } = g;
    while (gen.dist < upTo) {
        const at = gen.step % PLACE_SECTIONS;
        if (at === CLIMB_SECTION || at === GATE_SECTION) buildClimb(g, at === GATE_SECTION);
        else buildRun(g);
        gen.step += 1;
    }
}

// what's gone far enough behind is dropped, so the game stays small; whatever's in a tunnel stays till Claude leaves it
export function tidy(g, behind) {
    const floor = g.best - behind;
    const keep = (o) => o.tunnel !== undefined || o.dist >= floor;
    g.plates = g.plates.filter((p) => keep(p) || p === g.claude.on);
    g.stars = g.stars.filter(keep);
    g.creatures = g.creatures.filter(keep);
    g.ropes = g.ropes.filter((r) => keep(r) || r.n === g.claude.rope?.n);
    g.doors = g.doors.filter(keep);
    g.sections = g.sections.filter((s) => s.kind === "tunnel" || s.start + s.len >= floor - 40 || s.id === g.sec);
}

// a short dark run underground in an old technology's colours: lots of stars, a few bugs, and a way out at the far end
export function digTunnel(g, door) {
    const surface = sectionOf(g, door.sec);
    const dir = surface?.dir ?? 1;
    const y0 = door.y - TUNNEL_DEPTH;
    const sec = addSection(g, { kind: "tunnel", dir, x0: door.x + 2, y0, start: door.dist, place: surface?.place ?? 0, era: door.era, door: door.n });
    const entry = makePlate(g, sec, door.x - 4, y0, 12, "plain");
    entry.path = true;
    g.plates.push(entry);
    let edge = dir > 0 ? entry.x + entry.len : entry.x;
    let y = y0;
    let last = entry;
    const pieces = whole(g, 5, 7);
    for (let i = 0; i < pieces; i++) {
        const len = whole(g, 7, 12);
        const near = edge + dir * whole(g, 3, 6);
        const x = dir > 0 ? near : near - len;
        y = clamp(y + whole(g, -1, 1), y0 - 2, y0 + 2);
        const plate = makePlate(g, sec, x, y, len, i === pieces - 1 ? "plain" : rand(g) < 0.25 ? "crumble" : "plain");
        plate.path = true;
        g.plates.push(plate);
        edge = dir > 0 ? x + len : x;
        last = plate;
        for (let s = whole(g, 1, 3); s > 0; s--) {
            const star = { x: Math.round(x + 1 + rand(g) * (len - 2)), y: y + whole(g, 2, 4), dist: sec.start, tunnel: sec.id };
            g.stars.push(star);
        }
        if (g.hazards && i > 0 && rand(g) < 0.35) {
            addCreature(g, sec, plate, eraOf(sec.era).creature);
        }
    }
    sec.exit = { x: Math.round(last.x + last.len / 2 - 2), y: last.y };
    sec.roof = y0 + TUNNEL_ROOF;
    sec.len = Math.abs(edge - sec.x0);
    return { sec, entry };
}

// where a tunnel comes back up: the first wide, solid stretch of ground some way past its door
export function tunnelExit(g, sec) {
    buildAhead(g, sec.start + 220);
    const skip = sec.start + 70;
    const ground = g.plates
        .filter((p) => p.tunnel === undefined && p.path && p.kind === "plain" && p.len >= 8 && p.dist >= skip && sectionOf(g, p.sec)?.kind === "run")
        .sort((a, b) => a.dist - b.dist)[0];
    return ground ?? g.plates.find((p) => p.tunnel === undefined && p.path && p.dist >= sec.start) ?? null;
}
