// the weather and the odd natural disaster. it's worked out from its own seed and the game's tick count, never from the
// game's random numbers, so a seed still always builds the same world. most of it is only to look at; a sandstorm's
// wind, and a meteor shower, a volcano and a wildfire, are part of the rules too (see hazards.mjs)
// the weather changes every minute or so, fading in and out; a disaster comes after a long calm, lasts a while, and
// goes again

export const WEATHERS = ["clear", "rain", "thunderstorm", "sandstorm", "snow", "fog"];
export const DISASTERS = ["earthquake", "tornado", "volcano", "flood", "meteor shower", "wildfire"];

const FADE = 80;

const hash = (n) => {
    let t = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    t ^= t >>> 13;
    t = Math.imul(t, 0xc2b2ae35);
    t ^= t >>> 16;
    return (t >>> 0) / 4294967296;
};

// how strongly something lasting from start for length ticks shows at tick t: fading in, full, fading out
const strength = (t, start, length) => Math.max(0, Math.min(1, (t - start) / FADE, (start + length - t) / FADE));

// the stretch of a repeating schedule that tick t falls in; lengthOf(i) is how long stretch i lasts
function stretchAt(t, lengthOf) {
    let start = 0;
    for (let i = 0; ; i++) {
        const length = lengthOf(i);
        if (t < start + length) return { i, start, length };
        start += length;
    }
}

// what the sky is doing at tick t: { weather, amount, wind, disaster, power, age }, with amount and power from 0 to 1
export function weatherAt(seed, t) {
    // the first weather is clear, so a run starts with a plain sky; the second one always brings something
    const spell = stretchAt(t, (i) => 500 + Math.floor(hash(seed * 31 + i) * 700));
    const pick = spell.i === 0 ? 0 : 1 + Math.floor(hash(seed * 77 + spell.i * 7) * (WEATHERS.length - 1) * 1.3);
    const weather = WEATHERS[pick] ?? "clear";
    const amount = weather === "clear" ? 0 : strength(t, spell.start, spell.length);
    // which way a sandstorm blows
    const wind = hash(seed * 53 + spell.i) < 0.5 ? -1 : 1;

    // a calm, then a disaster, then a calm again: even stretches are calm
    const turn = stretchAt(t, (i) => (i % 2 === 0 ? 900 + Math.floor(hash(seed * 13 + i) * 1200) : 260 + Math.floor(hash(seed * 17 + i) * 180)));
    if (turn.i % 2 === 0) return { weather, amount, wind, disaster: null, power: 0, age: 0 };
    const disaster = DISASTERS[Math.floor(hash(seed * 101 + turn.i) * DISASTERS.length)];
    return { weather, amount, wind, disaster, power: strength(t, turn.start, turn.length), age: t - turn.start };
}

// one weather or disaster held on, for a look at it (the 16-bit version's ?sky=volcano); anything else leaves the sky be
export function holdSky(real, name) {
    if (WEATHERS.includes(name)) return { ...real, weather: name, amount: 1 };
    if (DISASTERS.includes(name)) return { ...real, disaster: name, power: 1, age: real.disaster === name ? real.age : 100 };
    return real;
}
