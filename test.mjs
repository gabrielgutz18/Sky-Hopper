// run it: node --test test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { autopilot } from "./autopilot.mjs";
import { W, input, keysIn, newGame, scoreOf, step } from "./game.mjs";
import { ERAS, PLACES, codeFor, eraOf, placeOf } from "./places.mjs";
import { render } from "./terminal.mjs";
import { DISASTERS, WEATHERS, weatherAt } from "./weather.mjs";

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
// a world with nothing in it but the plates given, and nothing more ever built; Claude stands on the first
const sky = (...plates) => {
    const g = playing(7, { hazards: false });
    g.plates = plates;
    g.stars = [];
    g.birds = [];
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
    bird.birds = [{ x: 22, y: 1, dir: 1, speed: 0, low: 0, high: 40, dist: 0 }];
    step(bird);
    assert.match(bird.cause, /bug/);

    const bolt = sky(plate(0, 0, W));
    bolt.bolts = [{ x: 21, t: 5 }];
    step(bolt);
    assert.match(bolt.cause, /exception/);
});

test("a bug flies back and forth over its own stretch", () => {
    const g = sky(plate(0, 0, W));
    g.birds = [{ x: 30, y: 8, dir: 1, speed: 0.4, low: 25, high: 32, dist: 0 }];
    ticks(g, 60);
    const [b] = g.birds;
    assert.ok(b.x >= 25 && b.x <= 32, `bug wandered to ${b.x}`);
});

test("a lightning warning doesn't hurt; only the strike does", () => {
    const g = sky(plate(0, 0, W));
    g.bolts = [{ x: 21, t: 20 }];
    ticks(g, 5);
    assert.equal(g.phase, "playing");
});

test("stars score; reaching a cloud top starts the next place", () => {
    const top = plate(3, 0, W, "top", { zone: 1 });
    const g = sky(top);
    g.claude.y = 4.05;
    g.claude.on = null;
    g.claude.vy = -0.1;
    g.stars = [{ x: 22, y: 5, dist: 0 }];
    ticks(g, 2);
    assert.equal(g.stage, 2);
    assert.ok(scoreOf(g) >= 550);
    assert.equal(g.stars.length, 0);
});

test("a spring that throws Claude straight past a cloud top still counts it, once", () => {
    const g = sky(plate(0, 0, W), plate(3, 0, W, "top", { zone: 1 }));
    g.claude.on = null;
    g.claude.vy = 1.4;
    ticks(g, 40);
    assert.equal(g.stage, 2);
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
        for (let i = 1; i < g.sections.length; i++) {
            const [a, b] = [g.sections[i - 1], g.sections[i]];
            assert.equal(b.start, a.start + a.len, `seed ${seed}: section ${i} doesn't start where ${i - 1} ended`);
        }
        assert.deepEqual(g.sections.slice(0, 3).map((s) => s.kind), ["run", "climb", "run"]);
        for (const s of g.sections) if (s.kind === "run" && s.id > 0) dirs.add(s.dir);
    }
    assert.deepEqual([...dirs].sort(), [-1, 1], "runs go left as well as right");
});

test("ropes, doors, stars and bugs all turn up", () => {
    const seen = { ropes: 0, doors: 0, stars: 0, bugs: 0 };
    for (let seed = 1; seed <= 20; seed++) {
        const g = playing(seed * 41);
        seen.ropes += g.ropes.length;
        seen.doors += g.doors.length;
        seen.stars += g.stars.length;
        seen.bugs += g.birds.length;
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
    assert.deepEqual(PLACES.map((p) => p.name), ["WWW", "BIOS", "Dark Web", "AWS Cloud", "IBM", "Nvidia"]);
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
    const skies = [null, ...WEATHERS.map((weather) => ({ weather, amount: 1, disaster: null, power: 0, age: 0 }))];
    skies.push(...DISASTERS.map((disaster) => ({ weather: "clear", amount: 0, disaster, power: 1, age: 10 })));
    for (const [i, sky] of skies.entries()) {
        for (const line of render(g, 0, sky && { ...sky, t: 40 + i })) {
            assert.ok(strip(line).length <= W + 2, strip(line));
            assert.match(strip(line), /^[\x20-\x7e]*$/);
        }
    }
});

test("Claude is an orange rectangle on four feet, and the board's top edge names the place", () => {
    const frame = render(playing(9), 0);
    assert.match(strip(frame[1]), /\[ WWW \]/);
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

test("the weather is only to look at: the same seed and tick always give the same sky, and all of it turns up", () => {
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
    g.birds = [{ x: 12, y: 2, dir: 1, speed: 0.4, low: -50, high: 80, dist: 0 }];
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
        let still = 0;
        for (let t = 0; t < 4000 && g.phase === "playing"; t++) {
            const started = performance.now();
            autopilot(g);
            assert.ok(performance.now() - started < 50, "took longer than one frame to think");
            step(g);
            still = g.claude.on ? still + 1 : 0;
            assert.ok(still <= 100, `seed ${seed} stood still for ${still / 20}s`);
        }
    }
});

test("the world can really be crossed: all six places and round to the first again, on many worlds", () => {
    for (let seed = 1; seed <= 12; seed++) {
        const { g } = bot(playing(seed * 1009, { hazards: false }), PLACES.length + 1);
        assert.equal(g.phase, "playing", `seed ${seed} stopped in stage ${g.stage} at ${g.best}: ${g.cause}`);
        assert.equal(g.stage, PLACES.length + 1);
        assert.match(strip(render(g, 0)[1]), /\[ WWW \]/, "back in the first place");
    }
});

test("with everything switched on, the autopilot still gets well along, and never goes down a tunnel", () => {
    const reached = [];
    for (let seed = 1; seed <= 15; seed++) {
        const { g, tunnels } = bot(playing(seed * 2003), 5, 12000);
        assert.equal(tunnels, 0, `seed ${seed} went into a tunnel`);
        reached.push(g.best);
    }
    reached.sort((a, b) => a - b);
    console.log(`autopilot distances with everything on: ${reached.join(",")}`);
    assert.ok(reached[7] >= 600, `median ${reached[7]}: ${reached.join(",")}`);
});

test("a cloud top leads into the next place: its plates are that place's code", () => {
    const { g } = bot(playing(1009, { hazards: false }), 2);
    assert.equal(g.stage, 2);
    assert.match(strip(render(g, 0)[1]), /\[ BIOS \]/);
    const bios = g.plates.filter((p) => p.zone === 1 && p.kind === "plain");
    assert.ok(bios.length > 0, "no BIOS plates");
});
