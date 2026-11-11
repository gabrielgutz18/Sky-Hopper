// the terminal Sky Hop: plain ASCII with a colour on each character, a W x H window onto the world wherever the camera is
// the weather is drawn only into empty cells, so it never hides anything that matters
import { BOLT_STRIKE, H, W, scoreOf, sectionOf } from "./game.mjs";
import { codeFor, eraOf, placeOf, themeOf, wordFor } from "./places.mjs";

export const MIN_COLUMNS = W + 2;
export const MIN_ROWS = H + 6;

// plain plates take their place's colour; the rest keep one colour everywhere, so a hazard looks the same in every place
const COLORS = { moving: 81, crumble: 180, spring: 213, spike: 196, top: 226 };
const CLAUDE_COLOR = 209;
const BUG_COLOR = 118;
const ROPE_COLOR = 180;
const DOOR_COLOR = 46;
const FAINT = 238;

const mod = (n, m) => ((n % m) + m) % m;
const hash = (n) => {
    let t = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    t ^= t >>> 13;
    t = Math.imul(t, 0xc2b2ae35);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
};

// what Claude is in right now: a tunnel's era, or the place it has reached
const themeNow = (g) => {
    const sec = g.tunnel !== null && sectionOf(g, g.tunnel);
    return sec ? eraOf(sec.era) : placeOf(g.stage - 1);
};

function plateText(p) {
    const chars = [];
    const theme = themeOf(p);
    // a moving plate keeps its arrows at both ends, so its code goes between them
    const code = p.kind === "moving" ? `<${codeFor(theme, p.n, p.len - 2)}>` : codeFor(theme, p.n, p.len);
    for (let i = 0; i < p.len; i++) {
        const at = Math.round(p.x) + i;
        let ch = code[i];
        let color = COLORS[p.kind] ?? theme.color;
        if (p.kind === "crumble") ch = p.t > 0 ? (i % 2 ? " " : ".") : "~";
        if (p.kind === "spring") ch = "+";
        if (p.kind === "top") ch = "#";
        if (p.kind === "spike") {
            // a syntax error at one end of an otherwise good line of code
            const inSpikes = p.x + i >= p.spikeX && p.x + i < p.spikeX + p.spikeLen;
            if (inSpikes) ch = i % 2 ? "\\" : "/";
            else color = theme.color;
        }
        chars.push([at, ch, color]);
    }
    if (p.kind === "top") {
        const next = placeOf(p.zone).name.toUpperCase();
        const text = p.done ? ` ${next} ZONE ` : ` UP NEXT: ${next} `;
        const from = Math.floor((p.len - text.length) / 2);
        [...text].forEach((ch, i) => chars[from + i] && (chars[from + i][1] = ch));
    }
    return chars;
}

const claudeLines = (g) => {
    const { claude } = g;
    // Claude: a rectangle with two eyes on top of four feet (in five letters its arms don't fit; the 16-bit version has them)
    if (g.phase === "over") return ["[x x]", "|| ||"];
    if (claude.rope) return ["\\o o/", " | | "];
    if (claude.on) return ["[o o]", "|| ||"];
    return claude.vy > 0 ? ["[^ ^]", "'' ''"] : ["[O O]", "/| |\\"];
};

// the weather's mark for an empty cell, if any: rain slants, sand blows sideways, snow drifts, fog hangs about
function weatherCell(sky, col, row) {
    const t = sky.t;
    const n = col * 7919 + row * 104729;
    const roll = hash(n + Math.floor(t / 2) * 31);
    if (sky.disaster && sky.power > 0.2) {
        const d = sky.disaster;
        if (d === "volcano" && roll < 0.03 * sky.power) return [hash(n + t) < 0.5 ? "," : "'", 208];
        if (d === "wildfire" && roll < 0.025 * sky.power) return ["^", 202];
        if (d === "meteor shower" && hash(n * 3 + Math.floor(t / 3)) < 0.006 * sky.power) return ["\\", 229];
        if (d === "flood" && row >= H - 2) return [mod(col + Math.floor(t / 3) + row, 3) === 0 ? "~" : "-", 39];
        if (d === "tornado") {
            const center = mod(Math.floor(t / 4), W + 20) - 10 + Math.round(Math.sin(row / 2 + t / 6) * (row / 6));
            if (Math.abs(col - center) <= Math.floor((H - row) / 7)) return [row % 2 ? "(" : ")", 250];
        }
        if (d === "earthquake" && roll < 0.01 * sky.power) return [".", 137];
    }
    const a = sky.amount;
    if (a <= 0.05) return null;
    if (sky.weather === "rain" || sky.weather === "thunderstorm") {
        const heavy = sky.weather === "thunderstorm" ? 0.12 : 0.07;
        if (hash(n + mod(row + col - t, 97) * 13) < heavy * a) return ["/", 67];
    }
    if (sky.weather === "sandstorm" && hash(n + mod(col - t * 2, 211) * 17) < 0.09 * a) return [roll < 0.5 ? "-" : ".", 180];
    if (sky.weather === "snow" && hash(n + mod(row + Math.floor(t / 3), 89) * 11) < 0.05 * a) return [roll < 0.5 ? "*" : ".", 255];
    if (sky.weather === "fog" && mod(row + Math.floor(col / 6) + Math.floor(t / 10), 5) === 0 && roll < 0.5 * a) return ["~", 240];
    return null;
}

function board(g, sky) {
    const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => [" ", 0]));
    const bottom = Math.floor(g.camera);
    const left = Math.round(g.camX);
    const put = (x, worldY, ch, color) => {
        const row = H - 1 - (worldY - bottom);
        const col = Math.round(x) - left;
        if (row >= 0 && row < H && col >= 0 && col < W) grid[row][col] = [ch, color];
    };
    const theme = themeNow(g);

    // faint words of the place far behind, which stay put as Claude goes by
    for (let y = bottom; y < bottom + H; y++) {
        const x = mod(y * 37 + 11, W * 3);
        if (x >= W) continue;
        [...wordFor(theme, y)].forEach((ch, i) => ch !== " " && put(left + x + i, y, ch, FAINT));
    }
    // a tunnel's roof
    const tunnel = g.tunnel !== null && sectionOf(g, g.tunnel);
    if (tunnel) for (let x = left; x < left + W; x++) for (let y = tunnel.roof; y < bottom + H; y++) put(x, y, "#", 236);
    for (const b of g.bolts) {
        for (let y = bottom; y < bottom + H; y++) {
            if (b.t <= BOLT_STRIKE) {
                put(b.x, y, "|", 231);
                put(b.x + 1, y, y % 2 ? "/" : "\\", 231);
                put(b.x + 2, y, "|", 231);
            } else if (y % 2 === 0) {
                put(b.x + 1, y, "!", 226);
            }
        }
    }
    for (const p of g.plates) for (const [x, ch, color] of plateText(p)) put(x, p.y, ch, color);
    // doors: a dark doorway with its era's name over it
    for (const d of g.doors) {
        const color = d.used ? FAINT : DOOR_COLOR;
        for (let r = 1; r <= 2; r++) [..."|##|"].forEach((ch, i) => put(d.x + i, d.y + r, ch, color));
        const name = eraOf(d.era).name.toUpperCase();
        [...name].forEach((ch, i) => put(d.x + 2 - Math.floor(name.length / 2) + i, d.y + 3, ch, color));
    }
    if (tunnel) {
        const { x, y } = tunnel.exit;
        for (let r = 1; r <= 2; r++) [..."|  |"].forEach((ch, i) => put(x + i, y + r, ch, 226));
        [..."EXIT"].forEach((ch, i) => put(x + i, y + 3, ch, 226));
    }
    // ropes: tied at the top, hanging straight, or out at an angle with Claude on the end
    for (const r of g.ropes) {
        const held = g.claude.rope?.n === r.n ? g.claude.rope : null;
        const a = held ? held.a : 0;
        const len = held ? held.len : r.len;
        put(r.ax, r.ay, "o", ROPE_COLOR);
        const ch = Math.abs(a) < 0.3 ? "|" : a > 0 ? "\\" : "/";
        for (let k = 1; k <= len; k++) put(r.ax + k * Math.sin(a) * 1.5, Math.round(r.ay - k * Math.cos(a)), ch, ROPE_COLOR);
    }
    for (const s of g.stars) put(s.x, s.y, "*", 226);
    const flap = Math.floor(g.ticks / 4) % 2;
    for (const b of g.birds) {
        const x = Math.round(b.x);
        [...(flap ? "}o{" : "]o[")].forEach((ch, i) => put(x + i, b.y, ch, BUG_COLOR));
    }
    const feet = Math.round(g.claude.y);
    const cx = Math.round(g.claude.x);
    const [head, body] = claudeLines(g);
    const claudeColor = g.phase === "over" ? 196 : CLAUDE_COLOR;
    // on a rope the corners are empty, and whatever is behind shows through them
    const solid = (ch, i) => ch !== " " || (i > 0 && i < 4);
    [...head].forEach((ch, i) => solid(ch, i) && put(cx + i, feet + 1, ch, claudeColor));
    [...body].forEach((ch, i) => solid(ch, i) && put(cx + i, feet, ch, claudeColor));

    if (sky && !tunnel) {
        grid.forEach((cells, row) =>
            cells.forEach((cell, col) => {
                if (cell[0] !== " ") return;
                const mark = weatherCell(sky, col, row);
                if (mark) cells[col] = mark;
            }),
        );
    }
    // an earthquake shakes the whole board a cell either way
    if (sky?.disaster === "earthquake" && sky.power > 0.3 && !tunnel) {
        const shift = [0, 1, 0, -1][mod(sky.t, 4)];
        for (const cells of grid) {
            if (shift > 0) cells.unshift(cells.pop());
            if (shift < 0) cells.push(cells.shift());
        }
    }
    return grid;
}

const color = (n) => (n ? `\x1b[38;5;${n}m` : "\x1b[0m");

function statusLines(g, sky) {
    if (g.phase === "title") {
        return ["SKY HOP: run, climb and swing through tech.", "A D move   SPACE jump   W flap   S drop", "SPACE to start   TAB to watch it play itself"];
    }
    if (g.phase === "over") {
        return ["GAME OVER", g.cause, g.auto ? "" : "Press R to try again, Q to quit."];
    }
    // nothing under the board while the autopilot flies; the blank lines keep the board from jumping about
    if (g.auto) return ["", "", ""];
    if (g.banner > 0 && g.tunnel !== null) return [`${themeNow(g).name} tunnel! Grab stars, find the EXIT.`, "", ""];
    if (g.banner > 0) return [`${placeOf(g.stage - 1).name} zone! Stage ${g.stage}: harder now.`, "", ""];
    if (sky?.disaster && sky.age < 60) return [`${sky.disaster.toUpperCase()}!`, "", ""];
    return ["A D move   SPACE jump/let go   W flap   S drop", "S in a |##| door: tunnel   o rope: swing over", "TAB autopilot   R restart   Q quit"];
}

// one frame of text; sky is the weather from weather.mjs plus t, the tick it's for, or nothing for a plain sky
export function render(g, record = 0, sky = null) {
    const shownBest = g.assisted ? record : Math.max(record, scoreOf(g));
    const hud = ` Stage ${g.stage}  Dist ${g.best}  Score ${scoreOf(g)}  Hi ${shownBest}`;
    const rows = board(g, sky).map((cells) => {
        let row = "";
        let last = -1;
        for (const [ch, c] of cells) {
            if (c !== last) row += color(c);
            row += ch;
            last = c;
        }
        return `|${row}\x1b[0m|`;
    });
    const line = "-".repeat(W);
    // the top edge names the place Claude is in, or the tunnel
    const label = g.tunnel !== null ? `[ ${themeNow(g).name} tunnel ]` : `[ ${placeOf(g.stage - 1).name} ]`;
    const top = `--${label}${"-".repeat(W - 2 - label.length)}`;
    return [hud, `+${top}+`, ...rows, `+${line}+`, ...statusLines(g, sky)];
}

