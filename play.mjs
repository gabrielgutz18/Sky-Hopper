// run it: node play.mjs, or node play.mjs volcano (or any weather or disaster) to keep one on for a look at it, or
// node play.mjs world 5 to start in the fifth world
import { readFileSync, writeFileSync } from "node:fs";

import { autopilot } from "./autopilot.mjs";
import { TICK_MS, input, keysIn, newGame, scoreOf, step } from "./game.mjs";
import { MIN_COLUMNS, MIN_ROWS, render } from "./terminal.mjs";
import { DISASTERS, WEATHERS } from "./weather.mjs";

const { stdin, stdout } = process;

if (!stdin.isTTY || !stdout.isTTY) {
    console.error("Sky Hop needs a real terminal window. Open one and run: node play.mjs");
    process.exit(1);
}

const bestFile = new URL("./best.txt", import.meta.url);
const readRecord = () => {
    try {
        return Number(readFileSync(bestFile, "utf8")) || 0;
    } catch {
        return 0;
    }
};

const TAB_REPEAT_MS = 350;
let lastTab = 0;
let record = readRecord();
const args = process.argv.slice(2);
const startIn = args[0] === "world" ? Math.max(1, Math.floor(Number(args[1])) || 1) : 1;
const game = newGame(undefined, { world: startIn - 1 });
const held = args.join(" ").toLowerCase();
if ([...WEATHERS, ...DISASTERS].includes(held)) game.holdSky = held;

const saveRecord = () => {
    if (game.assisted || scoreOf(game) <= record) return;
    record = scoreOf(game);
    try {
        writeFileSync(bestFile, String(record));
    } catch {
        // no record saved; the game itself is fine
    }
};

const restore = () => {
    if (stdin.isRaw) stdin.setRawMode(false);
    stdout.write("\x1b[0m\x1b[?25h\x1b[?1049l");
};

const quit = () => {
    saveRecord();
    restore();
    console.log(`Thanks for playing! Score ${scoreOf(game)}, best ${record}.`);
    process.exit(0);
};

const draw = () => {
    const small = stdout.columns < MIN_COLUMNS || stdout.rows < MIN_ROWS;
    const lines = small
        ? [`Make this window at least ${MIN_COLUMNS} x ${MIN_ROWS}.`, `It's ${stdout.columns} x ${stdout.rows} now.`]
        : render(game, record);
    stdout.write(`\x1b[H${lines.join("\x1b[K\r\n")}\x1b[K\x1b[J`);
};

process.on("exit", restore);
stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J");
stdin.setRawMode(true);
stdin.setEncoding("utf8");
stdin.resume();

stdin.on("data", (data) => {
    if (data === "\x03") quit();
    for (const key of keysIn(data)) {
        // a held Tab repeats by itself, and must count as one press rather than flicking the autopilot on and off
        if (key === "\t") {
            const now = Date.now();
            const repeated = now - lastTab < TAB_REPEAT_MS;
            lastTab = now;
            if (repeated) continue;
        }
        if (key === "q") quit();
        if (key === "r") saveRecord();
        input(game, key);
    }
});

setInterval(() => {
    autopilot(game);
    step(game);
    if (game.phase === "over") saveRecord();
    draw();
}, TICK_MS);
