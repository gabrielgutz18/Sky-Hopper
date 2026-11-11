// run it: node --test test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { autopilot } from "./autopilot.mjs";
import { HEARTS, HURT_TICKS, MIN_WARN, bossFor } from "./bosses.mjs";
import { REGROW_TICKS, W, act, input, keysIn, newGame, scoreOf, step } from "./game.mjs";
import { SMOKE_TICKS, STRIKE_WARNING } from "./hazards.mjs";
import { ERAS, PLACES, codeFor, eraOf, placeOf } from "./places.mjs";
import { render } from "./terminal.mjs";
import { DISASTERS, WEATHERS, weatherAt } from "./weather.mjs";
import { buildAhead } from "./world.mjs";

const playing = (seed = 7, options) => {
    const g = newGame(seed, options);
    input(g, " ");
    return g;
};
const ticks = (g, n) => {
    for (let i = 0; i < n; i++) step(g);
};
let serial = 100000;
const plate = (y, x, len, kind = "plain", more = {}) => ({ n: serial++, sec: -1, y, x, len, kind, v: 0, t: 0, path: true, zone: 0, dist: 0, ...more });
const rope = (ax, ay, more = {}) => ({ n: serial++, sec: -1, ax, ay, len: 8, dist: 0, path: true, ...more });
const creature = (x, y, more = {}) => ({ kind: "bug", name: "bug", style: "fly", x, y, dir: 1, speed: 0, low: -50, high: 80, phase: "idle", t: 0, cool: 0, dist: 0, ...more });
// a world with nothing in it but the plates given, and nothing more ever built; Claude stands on the first
const sky = (...plates) => {
    const g = playing(7, { hazards: false });
    g.plates = plates;
    g.stars = [];
    g.creatures = [];
    g.strikes = [];
    g.ropes = [];
    g.doors = [];
    g.sections = [];
    g.sec = -1;
    g.gen.dist = Infinity;
    g.claude.x = 20;
    g.claude.y = plates[0].y + 1;
    g.claude.on = plates[0];
    g.groundY = plates[0].y;
    g.camera = plates[0].y - 5;
    return g;
};
const strip = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
// a game started in a world (counting from 0), with Claude put on that world's cloud top, which starts its boss fight
const fightAt = (world = 0, seed = 11, options = {}) => {
    const g = playing(seed, { world, ...options });
    let top;
    while (!(top = g.plates.find((p) => p.kind === "top" && !p.done))) buildAhead(g, g.gen.dist + 100);
    Object.assign(g.claude, { x: top.x + 4, y: top.y + 1, on: top, vy: 0 });
    g.sec = top.sec;
    g.lastDist = top.dist;
    g.best = Math.floor(top.dist);
    g.camera = top.y - 5;
    g.camX = top.x;
    step(g);
    return g;
};

// ---- moving about ----

test("Space starts the game and jumps; Claude comes back down onto its plate", () => {
    const g = newGame(1);
    assert.equal(g.phase, "title");
    input(g, " ");
    assert.equal(g.phase, "playing");
    input(g, " ");
    ticks(g, 2);
    assert.equal(g.claude.on, null);
    assert.ok(g.claude.y > 1);
    ticks(g, 40);
    assert.ok(g.claude.on, "landed again");
});

test("a jump goes up about seven rows and lands on the plate above", () => {
    const upper = plate(6, 10, 25);
    const g = sky(plate(0, 0, W), upper);
    input(g, " ");
    ticks(g, 40);
    assert.equal(g.claude.on, upper);
    assert.equal(g.claude.y, 7);
});

test("Claude passes up through a plate, and only lands coming down", () => {
    const g = sky(plate(0, 0, W), plate(2, 10, 25));
    input(g, " ");
    ticks(g, 6);
    assert.equal(g.claude.on, null);
    assert.ok(g.claude.y > 3);
});

test("A and D run left and right, with no walls: the world goes on both ways", () => {
    const g = sky(plate(0, -200, 400));
    for (let i = 0; i < 40; i++) {
        input(g, "a");
        step(g);
    }
    assert.ok(g.claude.x < -5, `only got to ${g.claude.x}`);
    for (let i = 0; i < 80; i++) {
        input(g, "d");
        step(g);
    }
    assert.ok(g.claude.x > 40, `only got to ${g.claude.x}`);
    assert.ok(g.camX > 10, "the camera follows sideways");
});

test("walking off a plate means falling; falling out of the picture ends the game", () => {
    const g = sky(plate(0, 20, 6));
    g.claude.x = 22;
    input(g, "d");
    ticks(g, 8);
    assert.equal(g.claude.on, null);
    ticks(g, 60);
    assert.equal(g.phase, "over");
    assert.match(g.cause, /fell/);
});

test("W flaps once per jump in the air; on a plate it jumps", () => {
    const g = sky(plate(0, 0, W));
    input(g, "w");
    ticks(g, 18);
    const speed = g.claude.vy;
    input(g, "w");
    assert.ok(g.claude.vy > speed);
    const flapped = g.claude.vy;
    ticks(g, 1);
    input(g, "w");
    assert.ok(g.claude.vy < flapped, "second flap does nothing");
});

test("S drops through a plate", () => {
    const lower = plate(0, 0, W);
    const g = sky(lower, plate(4, 0, W));
    g.claude.y = 5;
    g.claude.on = g.plates[1];
    input(g, "s");
    ticks(g, 30);
    assert.equal(g.claude.on, lower);
});

test("a crumbling plate gives way a moment after landing", () => {
    const crumble = plate(3, 10, 25, "crumble");
    const g = sky(crumble, plate(-1, 0, W));
    g.claude.y = 4.05;
    g.claude.on = null;
    g.claude.vy = -0.1;
    ticks(g, 2);
    assert.equal(g.claude.on, crumble);
    ticks(g, 20);
    assert.ok(!g.plates.includes(crumble));
    assert.notEqual(g.claude.on, crumble);
});

test("a crumbled plate grows back whole, so two gone in a row never leave Claude stuck", () => {
    const crumble = plate(3, 10, 25, "crumble");
    const g = sky(plate(-1, 0, W), crumble);
    crumble.t = 1;
    ticks(g, 2);
    assert.ok(!g.plates.includes(crumble));
    ticks(g, REGROW_TICKS);
    assert.ok(g.plates.includes(crumble), "back");
    assert.equal(crumble.t, 0, "and whole again");
});

test("a spring plate throws Claude far higher than a jump", () => {
    const g = sky(plate(0, 0, W, "spring"));
    g.claude.y = 1.05;
    g.claude.on = null;
    g.claude.vy = -0.1;
    ticks(g, 24);
    assert.ok(g.claude.y > 10);
});

test("a moving plate carries Claude", () => {
    const g = sky(plate(0, 10, 20, "moving", { v: 0.2, low: 1, high: 20 }));
    const before = g.claude.x;
    ticks(g, 10);
    assert.ok(g.claude.x > before + 1.5);
});

test("syntax errors, bugs and exceptions each end the game", () => {
    const spikes = sky(plate(0, 18, 12, "spike", { spikeX: 18, spikeLen: 8 }));
    step(spikes);
    assert.match(spikes.cause, /syntax error/);

    const bird = sky(plate(0, 0, W));
    bird.creatures = [creature(22, 1)];
    step(bird);
    assert.match(bird.cause, /bug/);

    const bolt = sky(plate(0, 0, W));
    bolt.bolts = [{ x: 21, t: 5 }];
    step(bolt);
    assert.match(bolt.cause, /exception/);
});

test("a bug flies back and forth over its own stretch", () => {
    const g = sky(plate(0, 0, W));
    g.creatures = [creature(30, 8, { speed: 0.4, low: 25, high: 32 })];
    ticks(g, 60);
    const [b] = g.creatures;
    assert.ok(b.x >= 25 && b.x <= 32, `bug wandered to ${b.x}`);
});

test("a lightning warning doesn't hurt; only the strike does", () => {
    const g = sky(plate(0, 0, W));
    g.bolts = [{ x: 21, t: 20 }];
    ticks(g, 5);
    assert.equal(g.phase, "playing");
});

test("stars score; reaching a cloud top starts its boss fight, and the next place waits till it's won", () => {
    const top = plate(3, 0, W, "top", { zone: 1 });
    const g = sky(top);
    g.claude.y = 4.05;
    g.claude.on = null;
    g.claude.vy = -0.1;
    g.stars = [{ x: 22, y: 5, dist: 0 }];
    ticks(g, 2);
    assert.ok(g.fight, "a fight");
    assert.equal(g.fight.boss.name, "King Snake");
    assert.equal(g.stage, 1);
    assert.ok(scoreOf(g) >= 50);
    assert.equal(g.stars.length, 0);
});

test("a spring that throws Claude straight past a cloud top still starts its fight, once", () => {
    const g = sky(plate(0, 0, W), plate(3, 0, W, "top", { zone: 1 }));
    g.claude.on = null;
    g.claude.vy = 1.4;
    for (let t = 0; t < 20 && !g.fight; t++) step(g);
    const fight = g.fight;
    assert.ok(fight);
    ticks(g, 40);
    assert.equal(g.fight, fight, "the same fight");
    assert.equal(g.stage, 1);
});

test("landing on the next place's ground past a cloud top pulls Claude back onto it to fight its boss", () => {
    const top = plate(10, -60, W, "top", { zone: 1 });
    const g = sky(plate(0, 0, W), top);
    const next = plate(2, 30, 14, "plain", { zone: 1 });
    g.plates.push(next);
    g.claude.on = null;
    g.claude.x = 32;
    g.claude.y = 3.5;
    ticks(g, 10);
    assert.ok(g.fight);
    assert.ok(g.claude.x >= top.x && g.claude.x <= top.x + top.len, "back over the cloud");
    assert.equal(g.stage, 1);
});

test("a cloud top far off to one side doesn't count", () => {
    const g = sky(plate(0, 0, W), plate(-3, 200, W, "top", { zone: 1 }));
    ticks(g, 5);
    assert.equal(g.stage, 1);
});

test("R restarts after a game over; arrow keys don't read as letters", () => {
    const g = playing();
    g.phase = "over";
    input(g, "r");
    assert.equal(g.phase, "playing");
    assert.equal(g.best, 0);
    assert.deepEqual(keysIn("\x1b[A"), []);
    assert.deepEqual(keysIn("D"), ["d"]);
});

// ---- ropes ----

// ground either side of a gap too wide to jump, and a rope over it
const ropeGap = () => {
    const near = plate(0, -20, 40);
    const far = plate(0, 52, 30);
    const g = sky(near, far);
    g.claude.x = 15;
    return { g, near, far, line: rope(33, 12) };
};
const runAndJump = (g) => {
    for (let t = 0; t < 70; t++) {
        input(g, "d");
        if (g.claude.x > 16.5 && g.claude.on) input(g, " ");
        step(g);
        if (g.claude.rope || g.phase !== "playing") return;
    }
};

test("a rope gap is too wide to jump, even at a full run", () => {
    const { g } = ropeGap();
    runAndJump(g);
    ticks(g, 80);
    assert.equal(g.phase, "over");
});

test("running and jumping at a rope catches it", () => {
    const { g, line } = ropeGap();
    g.ropes = [line];
    runAndJump(g);
    assert.ok(g.claude.rope, "didn't catch the rope");
    assert.equal(g.claude.rope.n, line.n);
    assert.ok(g.claude.rope.w > 0, "keeps swinging the way it was going");
});

test("a rope swings like a pendulum, and leaning into it swings it higher", () => {
    const { g, line } = ropeGap();
    g.ropes = [line];
    g.claude.on = null;
    g.claude.rope = { n: line.n, a: 0.5, w: 0, len: 8 };
    let lowest = Infinity;
    for (let t = 0; t < 80; t++) {
        step(g);
        lowest = Math.min(lowest, Math.abs(g.claude.rope.a));
    }
    assert.ok(lowest < 0.05, "swings back through the middle");
    const free = Math.max(...Array.from({ length: 80 }, () => (step(g), Math.abs(g.claude.rope.a))));
    for (let t = 0; t < 200; t++) {
        input(g, g.claude.rope.w >= 0 ? "d" : "a");
        step(g);
    }
    const pumped = Math.max(...Array.from({ length: 80 }, () => (step(g), Math.abs(g.claude.rope.a))));
    assert.ok(pumped > free + 0.15, `leaning in only took it from ${free} to ${pumped}`);
});

test("letting go flies off with the swing, and the same rope can't be caught straight back", () => {
    const { g, line } = ropeGap();
    g.ropes = [line];
    g.claude.on = null;
    g.claude.rope = { n: line.n, a: 0.2, w: 0.08, len: 8 };
    input(g, " ");
    assert.equal(g.claude.rope, null);
    assert.ok(g.claude.vx > 0.5, "flies off forwards");
    assert.ok(g.claude.vy > 0.3, "and up");
    ticks(g, 3);
    assert.equal(g.claude.rope, null);
});

test("the autopilot swings across a rope gap and lands on the far side", () => {
    const { g, far, line } = ropeGap();
    g.ropes = [line];
    far.dist = 60;
    line.dist = 30;
    g.plates[0].dist = 0;
    g.lastDist = 0;
    input(g, "\t");
    let swung = false;
    for (let t = 0; t < 400 && g.claude.on !== far && g.phase === "playing"; t++) {
        autopilot(g);
        step(g);
        swung ||= Boolean(g.claude.rope);
    }
    assert.ok(swung, "never caught the rope");
    assert.equal(g.claude.on, far, g.cause);
});

// ---- tunnels ----

// stands Claude in the first door of a world
function atDoor(seed) {
    for (let s = seed; s < seed + 50; s++) {
        const g = playing(s, { hazards: false });
        const door = g.doors[0];
        if (!door) continue;
        const ground = g.plates.find((p) => p.y === door.y && p.x <= door.x && p.x + p.len >= door.x + 4);
        g.claude.x = door.x + 2 - 2.5;
        g.claude.y = door.y + 1;
        g.claude.on = ground;
        return { g, door };
    }
    throw new Error("no world with a door");
}

test("S in a doorway goes down into that door's old-tech tunnel", () => {
    const { g, door } = atDoor(3);
    input(g, "s");
    assert.notEqual(g.tunnel, null);
    assert.ok(g.claude.on, "lands on the tunnel floor");
    assert.ok(g.claude.y < door.y - 300, "far below the world");
    assert.equal(g.claude.on.era, door.era);
    assert.ok(door.used, "the door is shut behind");
    assert.match(strip(render(g, 0)[1]), new RegExp(`\\[ ${eraOf(door.era).name} tunnel \\]`));
});

test("reaching a tunnel's exit brings Claude back up a good way further on, with a bonus", () => {
    const { g, door } = atDoor(5);
    input(g, "s");
    const bonus = g.bonus;
    const sec = g.sections.find((s) => s.id === g.tunnel);
    const floor = g.plates.find((p) => p.tunnel === sec.id && p.y === sec.exit.y && p.x <= sec.exit.x && p.x + p.len >= sec.exit.x + 4);
    g.claude.x = sec.exit.x;
    g.claude.y = sec.exit.y + 1;
    g.claude.on = floor;
    step(g);
    assert.equal(g.tunnel, null);
    assert.equal(g.phase, "playing");
    assert.ok(g.best >= door.dist + 60, `only came up at ${g.best}, the door was at ${door.dist}`);
    assert.ok(g.bonus >= bonus + 100);
    assert.ok(!g.plates.some((p) => p.tunnel !== undefined), "the tunnel is gone");
});

test("away from a door, S still just drops through the ground", () => {
    const g = sky(plate(0, 0, W), plate(-4, 0, W));
    input(g, "s");
    assert.equal(g.tunnel, null);
    assert.equal(g.claude.on, null);
});

// ---- the world ----

test("the world is a chain of runs and climbs, each starting where the last left off, runs going both ways", () => {
    const dirs = new Set();
    for (let seed = 1; seed <= 20; seed++) {
        const g = playing(seed * 37);
        buildAhead(g, 2000);
        for (let i = 1; i < g.sections.length; i++) {
            const [a, b] = [g.sections[i - 1], g.sections[i]];
            assert.equal(b.start, a.start + a.len, `seed ${seed}: section ${i} doesn't start where ${i - 1} ended`);
        }
        assert.deepEqual(g.sections.slice(0, 3).map((s) => s.kind), ["run", "climb", "run"]);
        for (const s of g.sections) if (s.kind === "run" && s.id > 0) dirs.add(s.dir);
    }
    assert.deepEqual([...dirs].sort(), [-1, 1], "runs go left as well as right");
});

test("ropes, doors, stars and creatures all turn up", () => {
    const seen = { ropes: 0, doors: 0, stars: 0, creatures: 0 };
    for (let seed = 1; seed <= 20; seed++) {
        const g = playing(seed * 41);
        seen.ropes += g.ropes.length;
        seen.doors += g.doors.length;
        seen.stars += g.stars.length;
        seen.creatures += g.creatures.length;
    }
    for (const [what, n] of Object.entries(seen)) assert.ok(n > 5, `only ${n} ${what}`);
});

test("every spike plate has at least eight safe cells to land on", () => {
    let seen = 0;
    for (let seed = 1; seed <= 200; seed++) {
        for (const p of newGame(seed * 31).plates.filter((q) => q.kind === "spike")) {
            seen += 1;
            assert.ok(p.len - p.spikeLen >= 8, `seed ${seed}: ${p.len} long with ${p.spikeLen} spikes`);
            assert.ok(p.spikeX === p.x || p.spikeX === p.x + p.len - p.spikeLen, "spikes sit at one end");
        }
    }
    assert.ok(seen > 0);
});

test("every place's and era's lines are plain ASCII with no spaces, and fill a plate of any length", () => {
    assert.deepEqual(
        PLACES.map((p) => p.name),
        ["Python", "WWW", "Git", "JavaScript", "BIOS", "C++", "Dark Web", "GitHub", "PHP", "AWS Cloud", "Java", "IBM", "GitLab", "Rust", "Nvidia", "Go", "Ruby"],
    );
    for (const theme of [...PLACES, ...ERAS]) {
        // the shortest plates are six cells, and a moving one keeps two of those for its arrows
        assert.ok(theme.code.some((line) => line.length <= 4), `${theme.name} has no line short enough for a short plate`);
        for (const line of theme.code) assert.match(line, /^[\x21-\x7e]+$/, `${theme.name}: "${line}" must have no spaces`);
        for (const word of theme.words) assert.match(word, /^[\x20-\x7e]+$/);
        for (let len = 1; len <= W; len++) assert.equal(codeFor(theme, 37, len).length, len);
    }
    assert.equal(placeOf(PLACES.length).name, PLACES[0].name, "after the last place it starts over");
    assert.ok(ERAS.some((e) => e.name === "COBOL") && ERAS.some((e) => e.name === "Assembly"));
});

// ---- the screen ----

test("every frame is plain ASCII and fits the window, whatever the weather", () => {
    const g = playing();
    input(g, " ");
    ticks(g, 10);
    const skies = [null, ...WEATHERS.map((weather) => ({ weather, amount: 1, wind: 1, disaster: null, power: 0, age: 0 }))];
    skies.push(...DISASTERS.map((disaster) => ({ weather: "clear", amount: 0, wind: 1, disaster, power: 1, age: 10 })));
    for (const [i, sky] of skies.entries()) {
        for (const line of render(g, 0, sky && { ...sky, t: 40 + i })) {
            assert.ok(strip(line).length <= W + 2, strip(line));
            assert.match(strip(line), /^[\x20-\x7e]*$/);
        }
    }
});

test("Claude is an orange rectangle on four feet, and the board's top edge names the place", () => {
    const frame = render(playing(9), 0);
    assert.match(strip(frame[1]), /\[ Python \]/);
    assert.equal(strip(frame[1]).length, W + 2);
    assert.match(frame.join("\n"), /\x1b\[38;5;209m\[o o\]/);
    assert.match(frame.join("\n"), /\x1b\[38;5;209m\|\| \|\|/);
});

test("while the autopilot plays, the screen shows no label and no notes, and they come back with Tab", () => {
    const words = (g) => render(g, 0).map(strip).join("\n");
    const g = playing(5);
    assert.match(words(g), /TAB autopilot/);
    input(g, "\t");
    ticks(g, 2);
    assert.doesNotMatch(words(g), /auto|tab|restart|quit|spring/i);
    assert.deepEqual(render(g, 0).slice(-3), ["", "", ""]);
    input(g, "\t");
    assert.match(words(g), /TAB autopilot/);
});

// ---- the weather ----

test("the same seed and tick always give the same sky, and all the weather and disasters turn up", () => {
    assert.deepEqual(weatherAt(42, 1234), weatherAt(42, 1234));
    assert.equal(weatherAt(42, 10).weather, "clear", "a run starts under a plain sky");
    assert.equal(weatherAt(42, 10).disaster, null, "and calm");
    const weathers = new Set();
    const disasters = new Set();
    for (let seed = 1; seed <= 6; seed++) {
        for (let t = 0; t < 60000; t += 37) {
            const sky = weatherAt(seed, t);
            assert.ok(sky.amount >= 0 && sky.amount <= 1 && sky.power >= 0 && sky.power <= 1);
            if (sky.amount > 0.5) weathers.add(sky.weather);
            if (sky.power > 0.5) disasters.add(sky.disaster);
        }
    }
    assert.deepEqual([...weathers].sort(), WEATHERS.filter((w) => w !== "clear").sort());
    assert.deepEqual([...disasters].sort(), [...DISASTERS].sort());
});

// ---- the autopilot ----

test("Tab from the title starts the autopilot, and Tab again hands Claude back", () => {
    const g = newGame(3);
    input(g, "\t");
    assert.equal(g.phase, "playing");
    assert.equal(g.auto, true);
    input(g, "\t");
    assert.equal(g.auto, false);
    input(g, " ");
    ticks(g, 2);
    assert.equal(g.claude.on, null, "the player's own Space works again");
});

test("the autopilot does nothing until Tab, and really gets going once it's on", () => {
    const g = playing(11, { hazards: false });
    for (let i = 0; i < 100; i++) {
        autopilot(g);
        step(g);
    }
    assert.equal(g.best, 0);
    input(g, "\t");
    for (let i = 0; i < 300; i++) {
        autopilot(g);
        step(g);
    }
    assert.ok(g.best > 60, `only got ${g.best} along`);
});

test("the player's keys are ignored while the autopilot plays", () => {
    const g = sky(plate(0, 0, W));
    input(g, "\t");
    const x = g.claude.x;
    input(g, "a");
    input(g, " ");
    ticks(g, 3);
    assert.equal(g.claude.x, x);
    assert.ok(g.claude.on);
});

test("a run the autopilot touched is marked, even after Tab hands it back; a fresh run isn't", () => {
    const g = playing();
    assert.equal(g.assisted, false);
    input(g, "\t");
    input(g, "\t");
    assert.equal(g.assisted, true);
    input(g, "r");
    assert.equal(g.assisted, false);
});

test("after a crash the autopilot starts a new run by itself, and stays on", () => {
    const g = playing();
    input(g, "\t");
    g.phase = "over";
    g.cause = "test";
    for (let i = 0; i < 59; i++) autopilot(g);
    assert.equal(g.phase, "over");
    autopilot(g);
    assert.equal(g.phase, "playing");
    assert.equal(g.auto, true);
    assert.equal(g.assisted, true);
});

test("the autopilot steps out from under a lightning bolt", () => {
    const g = sky(plate(0, 0, W));
    input(g, "\t");
    g.bolts = [{ x: 21, t: 30 }];
    for (let i = 0; i < 28; i++) {
        autopilot(g);
        step(g);
    }
    assert.equal(g.phase, "playing");
});

test("the autopilot gets out of the way of a bug heading straight for it", () => {
    const g = sky(plate(0, 0, W));
    input(g, "\t");
    g.creatures = [creature(12, 2, { speed: 0.4 })];
    for (let i = 0; i < 40; i++) {
        autopilot(g);
        step(g);
    }
    assert.equal(g.phase, "playing", g.cause);
});

test("thinking ahead never changes the real game", () => {
    const g = playing(21);
    input(g, "\t");
    const seed = g.seed;
    const plates = g.plates.length;
    autopilot(g);
    assert.equal(g.seed, seed);
    assert.equal(g.plates.length, plates);
    assert.equal(g.phase, "playing");
    assert.equal(g.best, 0);
});

// lets the shipped autopilot play until it crashes or reaches a stage
function bot(g, stage, limit = 40000) {
    g.auto = true;
    let tunnels = 0;
    for (let t = 0; t < limit && g.phase === "playing" && g.stage < stage; t++) {
        autopilot(g);
        step(g);
        if (g.tunnel !== null) tunnels += 1;
    }
    return { g, tunnels };
}

test("the autopilot keeps moving: it never freezes for long, and thinks far faster than a frame", () => {
    for (let seed = 1; seed <= 10; seed++) {
        const g = playing(seed * 2003);
        input(g, "\t");
        // how long it has stayed within a cell of one spot; waiting a few seconds for a creature to go by is fine
        let spot = null;
        let since = 0;
        for (let t = 0; t < 4000 && g.phase === "playing"; t++) {
            const started = performance.now();
            autopilot(g);
            assert.ok(performance.now() - started < 50, "took longer than one frame to think");
            step(g);
            const { claude } = g;
            if (g.fight || !spot || Math.abs(claude.x - spot.x) > 1 || Math.abs(claude.y - spot.y) > 1) {
                spot = { x: claude.x, y: claude.y };
                since = t;
            }
            assert.ok(t - since <= 160, `seed ${seed} stood still for ${(t - since) / 20}s in stage ${g.stage}`);
        }
    }
});

test("the world can really be crossed: all seventeen worlds and their bosses, and round to the first again", () => {
    for (let seed = 1; seed <= 2; seed++) {
        const { g, tunnels } = bot(playing(seed * 1009, { hazards: false }), PLACES.length + 1);
        assert.equal(g.phase, "playing", `seed ${seed} stopped in stage ${g.stage} at ${g.best}: ${g.cause}`);
        assert.equal(g.stage, PLACES.length + 1);
        assert.match(strip(render(g, 0)[1]), /\[ Python \]/, "back in the first world");
        assert.ok(tunnels > 0, `seed ${seed} never went down a tunnel`);
    }
});

test("with everything switched on, the autopilot still gets well along, tunnels and all", () => {
    const reached = [];
    let tunnels = 0;
    for (let seed = 1; seed <= 9; seed++) {
        const run = bot(playing(seed * 2003), 5, 8000);
        tunnels += run.tunnels;
        reached.push(run.g.best);
    }
    reached.sort((a, b) => a - b);
    console.log(`autopilot distances with everything on: ${reached.join(",")}`);
    assert.ok(reached[4] >= 600, `median ${reached[4]}: ${reached.join(",")}`);
    assert.ok(tunnels > 0, "never went down a tunnel");
});

test("a cloud top leads into the next place: its plates are that place's code", () => {
    const { g } = bot(playing(1009, { hazards: false }), 2);
    assert.equal(g.stage, 2);
    assert.match(strip(render(g, 0)[1]), /\[ WWW \]/);
    const www = g.plates.filter((p) => p.zone === 1 && p.kind === "plain");
    assert.ok(www.length > 0, "no WWW plates");
});

// ---- creatures ----

test("every world has a creature of its own, and between them they move all five ways", () => {
    assert.equal(new Set(PLACES.map((p) => p.creature.id)).size, PLACES.length, "two worlds share a creature");
    assert.deepEqual(new Set(PLACES.map((p) => p.creature.style)), new Set(["fly", "walk", "hop", "drop", "swoop"]));
    for (const p of PLACES) assert.ok(p.creature.name && p.creature.speed > 0, p.name);
});

test("a walker keeps to its platform, and a hopper leaves it and lands again", () => {
    const g = sky(plate(0, 0, W), plate(10, 25, 12));
    const walker = creature(25, 11, { style: "walk", speed: 0.3, low: 25, high: 34, ground: 11 });
    const hopper = creature(30, 11, { style: "hop", speed: 0.2, low: 25, high: 34, ground: 11 });
    g.creatures = [walker, hopper];
    let highest = 0;
    let landed = 0;
    for (let i = 0; i < 200; i++) {
        step(g);
        assert.ok(walker.x >= 25 && walker.x <= 34 && walker.y === 11, `walker at ${walker.x},${walker.y}`);
        highest = Math.max(highest, hopper.y);
        if (hopper.y === 11) landed += 1;
    }
    assert.ok(highest > 13, `the hopper only got to ${highest}`);
    assert.ok(landed > 50, "the hopper never came down");
});

test("a dropper hangs still until Claude passes under it, then drops", () => {
    const g = sky(plate(0, -20, 80));
    g.claude.x = 0;
    const dropper = creature(30, 9, { name: "web spider", style: "drop", speed: 0.5, top: 9, floor: 1, low: 30, high: 30 });
    g.creatures = [dropper];
    ticks(g, 30);
    assert.equal(dropper.y, 9, "it moved with nobody under it");
    g.claude.x = 28.5;
    for (let i = 0; i < 40 && g.phase === "playing"; i++) step(g);
    assert.match(g.cause ?? "", /web spider/);
});

test("a dropper climbs back up its thread after a drop", () => {
    const g = sky(plate(0, -20, 80));
    g.claude.x = 0;
    const dropper = creature(30, 1, { style: "drop", speed: 0.5, top: 9, floor: 1, low: 30, high: 30, phase: "wait", cool: 1 });
    g.creatures = [dropper];
    ticks(g, 100);
    assert.equal(dropper.y, 9);
    assert.equal(dropper.phase, "idle");
});

test("a swooper dives down at Claude from above", () => {
    const g = sky(plate(0, -20, 80));
    g.creatures = [creature(10, 7, { name: "NaN ghost", style: "swoop", speed: 0.25, home: 7 })];
    for (let i = 0; i < 60 && g.phase === "playing"; i++) step(g);
    assert.match(g.cause ?? "", /NaN ghost/);
});

// ---- disasters ----

// Claude on wide ground with a disaster held on and hazards switched on
const disaster = (name, ...plates) => {
    const g = sky(...(plates.length ? plates : [plate(0, -40, 120)]));
    g.hazards = true;
    g.holdSky = name;
    return g;
};

test("a meteor shows its target first, and only hurts where and when it lands", () => {
    const g = disaster("meteor shower");
    for (let i = 0; i < 200 && g.strikes.length === 0; i++) step(g);
    assert.ok(g.strikes.length > 0, "no meteor came");
    assert.equal(g.strikes[0].t, STRIKE_WARNING - 1, "its target shows for the whole warning");

    const hit = disaster("meteor shower");
    hit.strikes = [{ kind: "meteor", x: 21, y: 1, t: 10, plate: hit.plates[0].n, from: 1 }];
    ticks(hit, 9);
    assert.equal(hit.phase, "playing", "the target alone doesn't hurt");
    ticks(hit, 2);
    assert.match(hit.cause ?? "", /meteor/);

    const miss = disaster("meteor shower");
    miss.strikes = [{ kind: "meteor", x: 40, y: 1, t: 3, plate: miss.plates[0].n, from: 1 }];
    ticks(miss, 5);
    assert.equal(miss.phase, "playing", "a meteor away from Claude does no harm");
    assert.ok(!miss.plates[0].broken, "and the way on is never smashed");
});

test("a meteor smashes a platform off the way on", () => {
    const side = plate(5, 60, 10, "plain", { path: false });
    const g = disaster("meteor shower", plate(0, -40, 80), side);
    g.strikes = [{ kind: "meteor", x: 62, y: 6, t: 1, plate: side.n, from: 1 }];
    ticks(g, 3);
    assert.ok(side.broken);
});

test("a lava bomb leaves its patch burning, and walking into it burns", () => {
    const g = disaster("volcano");
    const [ground] = g.plates;
    g.strikes = [{ kind: "lava", x: 40, y: 1, t: 1, plate: ground.n, from: -1 }];
    step(g);
    assert.equal(g.phase, "playing");
    assert.ok(ground.fire, "no fire left behind");
    g.claude.x = 38;
    step(g);
    assert.match(g.cause ?? "", /burned/);
});

test("in a wildfire a platform smokes for a good while before it burns", () => {
    const ground = plate(0, 0, W);
    const g = disaster("wildfire", ground);
    let smoked = 0;
    for (let i = 0; i < 400 && g.phase === "playing"; i++) {
        step(g);
        if (ground.fire?.smoke > 0) smoked += 1;
    }
    assert.match(g.cause ?? "", /burned/);
    assert.ok(smoked >= SMOKE_TICKS - 1, `only smoked for ${smoked} ticks`);
});

test("a sandstorm's wind pushes Claude, harder in the air than on the ground", () => {
    const g = disaster("sandstorm", plate(0, -200, 400));
    step(g);
    const wind = g.sky.wind;
    const before = g.claude.x;
    ticks(g, 10);
    const ground = (g.claude.x - before) * wind;
    assert.ok(ground > 0.2, `only pushed ${ground} on the ground`);
    input(g, " ");
    const jumped = g.claude.x;
    ticks(g, 10);
    const air = (g.claude.x - jumped) * wind;
    assert.ok(air > ground * 2, `pushed ${air} in the air, ${ground} on the ground`);
});

test("with hazards off a disaster is only to look at", () => {
    for (const name of ["meteor shower", "volcano", "wildfire", "sandstorm"]) {
        const g = disaster(name);
        g.hazards = false;
        const x = g.claude.x;
        ticks(g, 400);
        assert.equal(g.phase, "playing", `${name}: ${g.cause}`);
        assert.equal(g.strikes.length, 0);
        assert.equal(g.claude.x, x, `${name} moved Claude`);
        assert.ok(!g.plates.some((p) => p.fire), `${name} set a fire`);
    }
});

// ---- the way under ----

test("past a door the ground gets very hard, and the door's tunnel comes up beyond it all", () => {
    let doors = 0;
    for (let seed = 1; seed <= 30; seed++) {
        const g = playing(seed * 53);
        for (const d of g.doors) {
            if (d.skipTo === undefined) continue;
            doors += 1;
            const hard = g.plates.filter((p) => p.hard && p.sec === d.sec);
            assert.ok(hard.length >= 3, `seed ${seed}: only ${hard.length} hard pieces after a door`);
            for (const p of hard) assert.ok(p.dist > d.dist && p.dist < d.skipTo, `seed ${seed}: hard piece outside the stretch`);
            for (const p of hard) assert.ok(p.len <= 12, "hard pieces are small");
        }
    }
    assert.ok(doors > 10, `only ${doors} doors`);
});

test("the autopilot goes down every door it comes to", () => {
    for (let seed = 1; seed <= 3; seed++) {
        const g = playing(seed * 1009, { hazards: false });
        g.auto = true;
        const doors = new Map();
        const taken = new Set();
        for (let t = 0; t < 3000 && g.phase === "playing"; t++) {
            autopilot(g);
            step(g);
            for (const d of g.doors) {
                doors.set(d.n, d.dist);
                if (d.used) taken.add(d.n);
            }
        }
        const reached = [...doors].filter(([, dist]) => g.best > dist + 5).map(([n]) => n);
        assert.ok(reached.length > 0, `seed ${seed} came to no door`);
        for (const n of reached) assert.ok(taken.has(n), `seed ${seed} walked past door ${n}`);
    }
});

// ---- boss fights ----

test("every world has a boss: a mini boss of its own creature, and a big one at the end of worlds 4, 8, 12, 16 and 17", () => {
    const big = PLACES.map((_, i) => bossFor(i)).filter((b) => b.big).map((b) => b.name);
    assert.deepEqual(big, ["Blue Screen", "Stack Overflow", "Y2K Bug", "Kernel Panic", "Legacy Monolith"]);
    assert.equal(new Set(PLACES.map((_, i) => bossFor(i).name)).size, PLACES.length, "seventeen different bosses");
    PLACES.forEach((place, i) => {
        const b = bossFor(i);
        if (!b.big) assert.equal(b.kind, place.creature.id);
    });
});

test("fireballs only fly in a boss fight, a few at a time, and only so fast", () => {
    const g = playing();
    act(g, "f");
    assert.equal(g.fight, null);
    const g2 = fightAt(0);
    act(g2, "f");
    assert.equal(g2.fight.shots.length, 0, "not while the boss's name is up");
    g2.fight.intro = 0;
    act(g2, "f");
    act(g2, "e");
    assert.equal(g2.fight.shots.length, 1, "one, then a moment's wait");
    let most = 0;
    for (let t = 0; t < 60; t++) {
        act(g2, "f");
        step(g2);
        most = Math.max(most, g2.fight?.shots.length ?? 0);
    }
    assert.ok(most <= 3, `${most} at once`);
});

test("fireballs fly at the boss and hurt it; beating it opens the cloud, with a bonus, and the ledges go", () => {
    const g = fightAt(0);
    const f = g.fight;
    const top = g.plates.find((p) => p.n === f.top);
    f.intro = 0;
    f.boss.rest = Infinity;
    f.boss.hp = 3;
    const bonus = g.bonus;
    assert.ok(g.plates.some((p) => p.arena), "ledges to dodge onto");
    for (let t = 0; t < 400 && g.fight; t++) {
        act(g, "f");
        f.hurt = 10;
        step(g);
    }
    assert.equal(g.fight, null, "beaten");
    assert.equal(g.stage, 2);
    assert.ok(top.done);
    assert.equal(g.bonus - bonus, 1500);
    assert.ok(!g.plates.some((p) => p.arena));
    assert.equal(g.beaten.name, "King Snake");
});

test("the arena holds Claude in: walls at both ends, and no dropping through its floor", () => {
    const g = fightAt(0);
    const f = g.fight;
    f.boss.rest = Infinity;
    for (let t = 0; t < 80; t++) {
        act(g, "a");
        f.hurt = 10;
        step(g);
    }
    assert.ok(g.claude.x >= f.x0 - 0.5, "the left wall");
    for (let t = 0; t < 120; t++) {
        act(g, "d");
        f.hurt = 10;
        step(g);
    }
    assert.ok(g.claude.x + 5 <= f.x1 + 0.5, "the right wall");
    ticks(g, 40);
    act(g, "s");
    ticks(g, 5);
    assert.ok(g.claude.y >= f.floor + 1, "still on the floor");
});

test("Claude has three hearts in a fight; a hit leaves a moment safe from the next, and the third ends the game", () => {
    const g = fightAt(0);
    const f = g.fight;
    f.intro = 0;
    f.boss.rest = Infinity;
    assert.equal(f.hearts, HEARTS);
    const hits = [];
    for (let t = 0; t < 600 && g.phase === "playing"; t++) {
        const was = f.hearts;
        // something nasty right where Claude is, every tick
        f.attacks = [{ kind: "row", x: g.claude.x, y: g.claude.y, w: 5, h: 2, vx: 0, warn: 0, life: 2 }];
        step(g);
        if (f.hearts < was) hits.push(t);
    }
    assert.equal(hits.length, 3);
    assert.equal(g.phase, "over");
    assert.match(g.cause, /King Snake/);
    for (let i = 1; i < hits.length; i++) assert.ok(hits[i] - hits[i - 1] >= HURT_TICKS, "a moment between hits");
});

test("every boss attack warns first, for long enough, on every lap", () => {
    for (const lap of [0, 1, 4]) {
        for (let world = 0; world < PLACES.length; world++) {
            const g = fightAt(world + lap * PLACES.length);
            const f = g.fight;
            f.intro = 0;
            const seen = new Set();
            let was = f.boss.act;
            for (let t = 0; t < 500 && g.fight === f; t++) {
                // Claude can't be hurt here, so the fight goes on long enough to see every move
                f.hurt = 1000;
                step(g);
                for (const a of f.attacks) {
                    if (seen.has(a)) continue;
                    seen.add(a);
                    assert.ok(a.warn >= MIN_WARN - 1, `${f.boss.name} lap ${lap + 1}: a ${a.kind} warned for only ${a.warn}`);
                }
                // a move that charges, leaps, dives or drops winds up first
                if (was === "idle" && f.boss.act !== "idle" && f.boss.windup > 0) assert.ok(f.boss.windup >= MIN_WARN - 1, `${f.boss.name}: a ${f.boss.act} wound up for only ${f.boss.windup}`);
                was = f.boss.act;
            }
            assert.ok(seen.size > 0 || ["charge", "leap", "drop", "dive"].includes(f.boss.moves[0]), `${f.boss.name} never attacked`);
        }
    }
});

test("the game never ends: each lap round the worlds the bosses are tougher, and the ground is harder", () => {
    for (let world = 0; world < PLACES.length; world++) {
        const hp = [0, 1, 2].map((lap) => bossFor(world + lap * PLACES.length).hp);
        assert.ok(hp[0] < hp[1] && hp[1] < hp[2], `${bossFor(world).name}: ${hp}`);
        assert.equal(bossFor(world + PLACES.length).lap, 2);
    }
    // the same worlds on the first lap and the third: shorter plates, fewer of them plain
    const look = (world) => {
        let plain = 0;
        let count = 0;
        let length = 0;
        for (const seed of [1, 2, 3]) {
            const g = newGame(seed, { world });
            buildAhead(g, 900);
            for (const p of g.plates) {
                if (p.kind === "top" || p.tunnel !== undefined) continue;
                count += 1;
                length += p.len;
                if (p.kind === "plain") plain += 1;
            }
        }
        return { plain: plain / count, length: length / count };
    };
    const first = look(5);
    const third = look(5 + 2 * PLACES.length);
    assert.ok(third.plain < first.plain, `plain ${first.plain} then ${third.plain}`);
    assert.ok(third.length < first.length, `length ${first.length} then ${third.length}`);
});

test("the autopilot beats every boss on the first lap, thinking fast", () => {
    for (let world = 0; world < PLACES.length; world++) {
        const g = fightAt(world);
        const name = g.fight.boss.name;
        g.auto = true;
        for (let t = 0; t < 4000 && g.phase === "playing" && g.stage === world + 1; t++) {
            const started = performance.now();
            autopilot(g);
            assert.ok(performance.now() - started < 50, "took longer than one frame to think");
            step(g);
        }
        assert.equal(g.phase, "playing", `${name}: ${g.cause}`);
        assert.equal(g.stage, world + 2, `${name} wasn't beaten`);
    }
});

test("a fight's frame fits the window, with the boss's name and health on top and hearts in the score line", () => {
    for (const world of [0, 3, 7, 11, 15, 16]) {
        const g = fightAt(world);
        g.fight.intro = 0;
        ticks(g, 60);
        if (!g.fight) continue;
        const lines = render(g, 0).map(strip);
        for (const line of lines) assert.ok(line.length <= W + 2, line);
        assert.ok(lines[1].includes(g.fight.boss.name), lines[1]);
        assert.match(lines[0], /<3/);
    }
});
