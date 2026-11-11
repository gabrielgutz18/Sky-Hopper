// who's playing and what they're wearing: the characters, the hats, eyewear and clothes, and the wardrobe that picks
// them. it's all looks: every character is the same size and plays the same, so nothing here touches the rules.
// the characters are AI models drawn as little pixel creatures in their own colours; names and colours only, no logos.
// each front end draws them in its own way (index.html in pixels, terminal.mjs in letters); the terminal's letters live
// here, beside the names, so both versions always have the same line-up

// ascii: the two rows of letters for the terminal, head then feet; on the head the middle three are the eyes, which
// the pose and any eyewear change. color: the terminal colour (xterm 256)
export const CHARACTERS = [
    { id: "claude", name: "Claude", ascii: ["[o o]", "|| ||"], color: 209 },
    { id: "gpt", name: "GPT", ascii: ["(o o)", "|| ||"], color: 79 },
    { id: "qwen", name: "Qwen", ascii: ["(o o)", " | | "], color: 135 },
    { id: "grok", name: "Grok", ascii: ["[- -]", "|| ||"], color: 252 },
    { id: "hugging", name: "Hugging Face", ascii: ["\\^ ^/", " | | "], color: 220 },
    { id: "openclaw", name: "OpenClaw", ascii: ["Vo oV", "/| |\\"], color: 196 },
    { id: "gemini", name: "Gemini", ascii: ["{o o}", "|| ||"], color: 75 },
    { id: "deepseek", name: "DeepSeek", ascii: ["(o o)", "~' ' "], color: 33 },
    { id: "llama", name: "Llama", ascii: ["{o o}", "|| ||"], color: 223 },
    { id: "mistral", name: "Mistral", ascii: ["[o o]", "|| ||"], color: 208 },
    { id: "copilot", name: "Copilot", ascii: ["(o o)", "|| ||"], color: 44 },
];

// each slot starts with nothing at all. a hat sits on the row over the head in the terminal (text, centred), eyewear
// takes the place of the eyes, clothes go over the feet row (or behind, for a cape); colors are xterm 256
export const HATS = [
    { id: "none", name: "No hat" },
    { id: "cap", name: "Cap", text: " ===-", color: 33 },
    { id: "tophat", name: "Top hat", text: " [#] ", color: 245 },
    { id: "crown", name: "Crown", text: " www ", color: 220 },
    { id: "beanie", name: "Beanie", text: " (@) ", color: 161 },
    { id: "wizard", name: "Wizard hat", text: "  ^  ", color: 63 },
    { id: "party", name: "Party hat", text: "  A  ", color: 213 },
    { id: "propeller", name: "Propeller cap", text: " -+- ", color: 45 },
    { id: "spiky", name: "Spiky hair", text: "/\\/\\/", color: 245 },
    { id: "golden", name: "Golden spikes", text: "/\\/\\/", color: 226 },
];
export const EYEWEAR = [
    { id: "none", name: "No eyewear" },
    { id: "sunglasses", name: "Sunglasses", text: "#-#", color: 244 },
    { id: "round", name: "Round glasses", text: "O-O", color: 255 },
    { id: "visor", name: "VR visor", text: "===", color: 51 },
    { id: "monocle", name: "Monocle", text: "o @", color: 220 },
    { id: "pixel", name: "Pixel shades", text: "%=%", color: 244 },
    { id: "3d", name: "3D glasses", text: "r-b", colors: [196, 255, 33] },
];
export const CLOTHES = [
    { id: "none", name: "No clothes" },
    { id: "tie", name: "Tie", feet: " |v| ", color: 196 },
    { id: "bowtie", name: "Bow tie", feet: " >o< ", color: 201 },
    { id: "scarf", name: "Scarf", feet: " ~~~ ", color: 39 },
    { id: "hoodie", name: "Hoodie", feet: "|| ||", color: 61, hood: true },
    { id: "cape", name: "Cape", feet: "|| ||", color: 160, behind: ">" },
    { id: "labcoat", name: "Lab coat", feet: "/| |\\", color: 255 },
];

// the wardrobe's rows, top to bottom, and what each picks from
export const SLOTS = [
    { key: "character", name: "Character", options: CHARACTERS },
    { key: "hat", name: "Hat", options: HATS },
    { key: "eyewear", name: "Eyewear", options: EYEWEAR },
    { key: "clothes", name: "Clothes", options: CLOTHES },
];

export const DEFAULT_LOOK = Object.freeze({ character: "claude", hat: "none", eyewear: "none", clothes: "none" });
export const newLook = () => ({ ...DEFAULT_LOOK });

const find = (list, id) => list.find((o) => o.id === id) ?? list[0];
// what a look is made of, as the entries themselves
export const lookParts = (look = DEFAULT_LOOK) => ({
    character: find(CHARACTERS, look.character),
    hat: find(HATS, look.hat),
    eyewear: find(EYEWEAR, look.eyewear),
    clothes: find(CLOTHES, look.clothes),
});

// a look as text, for saving: four ids with commas between; and back, with anything unknown left at its plain default
export const lookToText = (look) => SLOTS.map((s) => look[s.key]).join(",");
export function lookFromText(text) {
    const look = newLook();
    const ids = String(text ?? "").trim().split(",");
    SLOTS.forEach((slot, i) => {
        if (slot.options.some((o) => o.id === ids[i])) look[slot.key] = ids[i];
    });
    return look;
}

// the next option along in a slot, going round past the end
export function turn(look, slotKey, by) {
    const slot = SLOTS.find((s) => s.key === slotKey);
    const at = Math.max(0, slot.options.findIndex((o) => o.id === look[slotKey]));
    look[slotKey] = slot.options[(at + by + slot.options.length) % slot.options.length].id;
}

// anyone in anything; random is a function giving 0 to 1, Math.random unless a test hands it one
export function randomLook(random = Math.random) {
    const look = newLook();
    for (const slot of SLOTS) look[slot.key] = slot.options[Math.floor(random() * slot.options.length)].id;
    return look;
}

// a key in the wardrobe: W and S (or the arrows) pick a row, A and D change it, X dresses at random, and Space, Enter, C
// or Escape close it. g.wardrobe is { row } while it's open; the look itself is g.look
export function dress(g, key) {
    const w = g.wardrobe;
    if (key === "w") w.row = (w.row + SLOTS.length - 1) % SLOTS.length;
    else if (key === "s") w.row = (w.row + 1) % SLOTS.length;
    else if (key === "a" || key === "d") turn(g.look, SLOTS[w.row].key, key === "a" ? -1 : 1);
    else if (key === "x") g.look = randomLook();
    else if (key === " " || key === "\r" || key === "c" || key === "\x1b") g.wardrobe = null;
}
