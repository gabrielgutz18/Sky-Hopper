// where Claude goes: seventeen worlds one after another, then round again. programming languages, places in tech, and
// git, mixed so every few minutes looks different; plus the old-tech tunnels under them
// a world's platforms are lines of what lives there, its words drift faintly behind them, and it has its own creature
// lines have no spaces, so a platform always reads as one solid run of text, and each has short ones for the short platforms
// the names are only words and colours: nothing here is anyone's logo
// look is for the 16-bit version in index.html: its sky from top to bottom, and its platforms; color is for the terminal
// a creature's style is how it moves (see creatures in game.mjs): fly back and forth, walk a platform, hop along one,
// drop from above, or swoop down at Claude. its id picks its picture in index.html and its letters in terminal.mjs

const PYTHON = {
    name: "Python",
    look: { sky: ["#0d1b3e", "#2a5d9e"], plate: "#3776ab", light: "#6aa6dc", dark: "#1e4a73", text: "#ffd43b" },
    color: 75,
    code: ["print('hop')", "self.jump()", "range(0,100)", "lambda:sky", "**kwargs", "sky.append(x)", "'''doc'''", "len(plates)", "pass", "None", "x=[]", "**kw", "yield"],
    words: ["def", "import", "lambda", "yield", "self", "None", "elif", "pass"],
    creature: { id: "snake", name: "snake", style: "walk", speed: 0.18 },
};
const JAVASCRIPT = {
    name: "JavaScript",
    look: { sky: ["#1a1033", "#6b2f78"], plate: "#f7df1e", light: "#fff59a", dark: "#a89400", text: "#1d1d1d" },
    color: 221,
    code: ["console.log(x);", "()=>{hop()}", "JSON.parse(s)", "[...plates]", "x===undefined", "arr.map(fn)", "Promise.all()", "setTimeout(f)", "x=>x", "{...}", "x++", "null", "[]"],
    words: ["const", "let", "async", "await", "=>", "null", "typeof", "this"],
    creature: { id: "nan", name: "NaN ghost", style: "swoop", speed: 0.22 },
};
const CPP = {
    name: "C++",
    look: { sky: ["#050d26", "#16457f"], plate: "#00599c", light: "#4a90d0", dark: "#003566", text: "#ffffff" },
    color: 33,
    code: ["std::cout<<x;", "#include<sky>", "std::vector<T>", "ptr->next", "template<T>", "i++;i<n;", "delete[]p;", "nullptr;", "i++", "x->y", "T&", "::", "&&"],
    words: ["std::", "int", "struct", "template", "const&", "nullptr", "virtual", "inline"],
    creature: { id: "pointer", name: "dangling pointer", style: "drop", speed: 0.6 },
};
const PHP = {
    name: "PHP",
    look: { sky: ["#17122b", "#4f4585"], plate: "#777bb4", light: "#aeb1de", dark: "#4f5390", text: "#ffffff" },
    color: 105,
    code: ["<?php", "echo$x;", "$this->hop()", "$arr['key']", "array_map()", "isset($x)", "$_GET['q']", "?>", "$x", "echo", "->", "=>", "$_"],
    words: ["$this", "echo", "function", "foreach", "->", "array", "public", "namespace"],
    creature: { id: "elephant", name: "elephant", style: "walk", speed: 0.1 },
};
const JAVA = {
    name: "Java",
    look: { sky: ["#2a0f05", "#93421a"], plate: "#5382a1", light: "#8db4cf", dark: "#35596f", text: "#ffe2b8" },
    color: 167,
    code: ["System.out.println()", "@Override", "String[]args", "List<Plate>", "this.jump();", "getClass()", "x.equals(y)", "new.Sky()", "@Test", "x++", "new", "void", "{}"],
    words: ["public", "static", "void", "class", "new", "final", "extends", "import"],
    creature: { id: "bean", name: "coffee bean", style: "hop", speed: 0.16 },
};
const RUST = {
    name: "Rust",
    look: { sky: ["#1c0d08", "#66291a"], plate: "#b7410e", light: "#e57a45", dark: "#7a2a08", text: "#fbe3c6" },
    color: 130,
    code: ["println!(\"hi\")", "Option<T>", "Ok(())", ".unwrap()", "Vec::new()", "impl<T>", "x.clone()", "&mut.self", "&str", "fn()", "'a", "Some", "mut"],
    words: ["fn", "let mut", "impl", "match", "Some", "&str", "crate", "trait"],
    creature: { id: "crab", name: "crab", style: "walk", speed: 0.32 },
};
const GO = {
    name: "Go",
    look: { sky: ["#042a33", "#0f7489"], plate: "#00add8", light: "#7fe0f7", dark: "#00708c", text: "#00262f" },
    color: 44,
    code: ["fmt.Println()", "err!=nil", "x:=<-ch", "chan<-int", "[]string{}", "ctx.Done()", "go.hop()", "defer.f()", "go", "<-ch", "nil", "func", ":="],
    words: ["func", "go", "chan", "defer", ":=", "struct", "package", "range"],
    creature: { id: "gopher", name: "gopher", style: "hop", speed: 0.2 },
};
const RUBY = {
    name: "Ruby",
    look: { sky: ["#22060a", "#78182a"], plate: "#cc342d", light: "#f27870", dark: "#8a1c17", text: "#ffffff" },
    color: 161,
    code: ["puts'hi'", ".each{|x|}", "attr_reader", "@sky", ":symbol", "nil?", "->(x){x}", "require'sky'", "end", "puts", "|x|", ":sym", "@x"],
    words: ["def", "end", "do", "|x|", "puts", "nil", "module", "yield"],
    creature: { id: "gem", name: "winged gem", style: "fly", speed: 0.34 },
};

const WWW = {
    name: "WWW",
    look: { sky: ["#0a1a3a", "#3a78d0"], plate: "#3c74d8", light: "#86b0f5", dark: "#1f4790", text: "#ffffff" },
    color: 75,
    code: ["http://", "<div>", "GET/", "200OK", "href=#", "?q=hop", ".html", "<p>", "</a>", "404", "www.", "<br>", "@media"],
    words: ["HTTP", "HTML", "URL", "DNS", "TCP/IP", "link", "<a>", "browser"],
    creature: { id: "spider", name: "web spider", style: "drop", speed: 0.5 },
};
const BIOS = {
    name: "BIOS",
    look: { sky: ["#000038", "#0000a8"], plate: "#aaaaaa", light: "#ffffff", dark: "#555555", text: "#0000a8" },
    color: 252,
    code: ["POST:OK", "F2=SETUP", "IRQ7", "INT13h", "CMOS", "BOOT", "C:\\>", "A:\\>", "640K", "BEEP", "DEL", "MBR", "DMA"],
    words: ["POST", "IRQ", "CMOS", "BOOT", "UEFI", "ROM", "CPU", "RAM"],
    creature: { id: "bug", name: "bug", style: "fly", speed: 0.32 },
};
const DARK_WEB = {
    name: "Dark Web",
    look: { sky: ["#040108", "#2a0b3a"], plate: "#3d1a52", light: "#7a3fa0", dark: "#1e0a2a", text: "#39ff14" },
    color: 92,
    code: ["*.onion", "tor://", "0xDEAD", "[REDACTED]", "proxy", "hidden", "cipher", "anon", "PGP", "~$", "***", "ssh", "???"],
    words: ["onion", "relay", "anon", "hidden", "cipher", "node", "mirror", "exit"],
    creature: { id: "phantom", name: "phantom", style: "swoop", speed: 0.26 },
};
const AWS = {
    name: "AWS Cloud",
    look: { sky: ["#141e30", "#e0883a"], plate: "#232f3e", light: "#4a5a70", dark: "#11181f", text: "#ff9900" },
    color: 214,
    code: ["s3://", "us-east-1", "lambda", "t2.micro", "arn:aws", "EC2", "IAM", "VPC", "ELB", "RDS", "SQS", "CDK", "AZ"],
    words: ["S3", "EC2", "region", "bucket", "scale", "IAM", "serverless", "cloud"],
    creature: { id: "storm", name: "storm cloud", style: "fly", speed: 0.24 },
};
const IBM = {
    name: "IBM",
    look: { sky: ["#061226", "#1f3f7a"], plate: "#1f70c1", light: "#78a9ff", dark: "#0f3c73", text: "#ffffff" },
    color: 33,
    code: ["z/OS", "//JOB", "CICS", "AS/400", "LPAR", "ISPF", "3270", "JCL", "DB2", "MVS", "RPG", "PL/I", "z16"],
    words: ["mainframe", "THINK", "z/OS", "JCL", "batch", "tape", "terminal", "Watson"],
    creature: { id: "reel", name: "tape-reel robot", style: "walk", speed: 0.14 },
};
const NVIDIA = {
    name: "Nvidia",
    look: { sky: ["#030802", "#2c5a0c"], plate: "#76b900", light: "#a6e13a", dark: "#3f6600", text: "#0a0a0a" },
    color: 112,
    code: ["__global__", "<<<>>>", "tensor", "TFLOPS", "CUDA", "GPU0", "nvcc", "VRAM", "fp16", "RTX", "warp", "SM", "core"],
    words: ["CUDA", "GPU", "tensor", "kernel", "shader", "RTX", "warp", "AI"],
    creature: { id: "chip", name: "overheating chip", style: "hop", speed: 0.22 },
};

const GIT = {
    name: "Git",
    look: { sky: ["#1a0a06", "#7a2a14"], plate: "#f05033", light: "#ff8a70", dark: "#9a2a14", text: "#ffffff" },
    color: 202,
    code: ["<<<<<<<", ">>>>>>>", "=======", "rebase-i", "commit-m", "HEAD~1", "push-f", "cherry-pick", "stash", "merge", "fetch", "HEAD", "main", "diff"],
    words: ["commit", "branch", "merge", "rebase", "HEAD", "stash", "blame", "reflog"],
    creature: { id: "conflict", name: "merge conflict", style: "hop", speed: 0.18 },
};
const GITHUB = {
    name: "GitHub",
    look: { sky: ["#0d1117", "#2d333b"], plate: "#30363d", light: "#8b949e", dark: "#161b22", text: "#e6edf3" },
    color: 250,
    code: ["PR#42", "LGTM", "README.md", "issue#7", "actions", "fork", "star", "gist", "main", "pull", "push", "diff"],
    words: ["pull request", "fork", "star", "issue", "review", "actions", "release", "merge"],
    creature: { id: "drone", name: "bot drone", style: "swoop", speed: 0.28 },
};
const GITLAB = {
    name: "GitLab",
    look: { sky: ["#140a24", "#4a2a7a"], plate: "#fc6d26", light: "#fca326", dark: "#a8401a", text: "#1a0f2e" },
    color: 208,
    code: [".gitlab-ci.yml", "pipeline", "stage:", "MR!7", "runner", "deploy", "CI/CD", "job", "tag", "lint", "test"],
    words: ["pipeline", "runner", "stage", "job", "merge request", "deploy", "artifact", "CI"],
    creature: { id: "worm", name: "pipeline worm", style: "walk", speed: 0.16 },
};

// mixed: a language, a place, a git world, and round again
export const PLACES = [PYTHON, WWW, GIT, JAVASCRIPT, BIOS, CPP, DARK_WEB, GITHUB, PHP, AWS, JAVA, IBM, GITLAB, RUST, NVIDIA, GO, RUBY];

// the tunnels go down into old technology: a dark screen glowing in one colour, like the terminals it ran on
// the bugs down there are the same old bug in every tunnel
const TUNNEL_BUG = { id: "bug", name: "bug", style: "fly", speed: 0.25 };
export const ERAS = [
    {
        name: "COBOL",
        look: { sky: ["#000000", "#021208"], plate: "#0c2a12", light: "#33ff66", dark: "#04140a", text: "#33ff66" },
        color: 46,
        code: ["PERFORM", "STOP-RUN.", "PIC-X(10)", "DIVISION.", "COMP-3", "01-REC", "GOTO", "ADD", "PIC", "EXIT"],
        words: ["IDENTIFICATION", "PROCEDURE", "WORKING-STORAGE", "MOVE", "PERFORM", "COMPUTE", "DISPLAY", "SECTION"],
        creature: TUNNEL_BUG,
    },
    {
        name: "Assembly",
        look: { sky: ["#000000", "#140b00"], plate: "#2a1800", light: "#ffb000", dark: "#140b00", text: "#ffb000" },
        color: 214,
        code: ["XORAX,AX", "INT21h", "0x7C00", "PUSHBP", "CALL", "JMP", "NOP", "RET", "CMP", "JNZ", "LEA", "POP"],
        words: ["MOV", "JMP", "INT", "PUSH", "POP", "XOR", "AX", "BX"],
        creature: TUNNEL_BUG,
    },
    {
        name: "FORTRAN",
        look: { sky: ["#000000", "#0a0a1e"], plate: "#1a1a3a", light: "#e8e8ff", dark: "#0a0a1e", text: "#e8e8ff" },
        color: 189,
        code: ["DO10I=1,N", "FORMAT(I5)", "WRITE(6,*)", "IMPLICIT", "REAL*8", "GOTO10", "CALL", "STOP", "END", "DIM"],
        words: ["DO", "CONTINUE", "FORMAT", "SUBROUTINE", "COMMON", "REAL", "INTEGER", "GOTO"],
        creature: TUNNEL_BUG,
    },
    {
        name: "Punch card",
        look: { sky: ["#0a0704", "#2a1e10"], plate: "#e8d9a8", light: "#fff4d0", dark: "#a8935e", text: "#5a4320" },
        color: 223,
        code: ["HOLLERITH", "|.|..||.", "IBM029", "80COL", "CARD#1", "::::", "|||", "..|.", "JOB", "EOF"],
        words: ["card", "hole", "column", "deck", "reader", "keypunch", "batch", "80"],
        creature: TUNNEL_BUG,
    },
    {
        name: "BASIC",
        look: { sky: ["#000020", "#181870"], plate: "#4040e0", light: "#a0a0ff", dark: "#20208a", text: "#d0d0ff" },
        color: 105,
        code: ["10PRINT", "20GOTO10", "LETX=1", "RND(1)", "GOSUB", "INPUT", "POKE", "PEEK", "RUN", "END", "CLS", "REM"],
        words: ["READY.", "PRINT", "GOTO", "GOSUB", "RETURN", "LOAD", "LIST", "RUN"],
        creature: TUNNEL_BUG,
    },
];

const mod = (n, m) => ((n % m) + m) % m;

export const placeOf = (index) => PLACES[mod(index, PLACES.length)];
export const eraOf = (index) => ERAS[mod(index, ERAS.length)];

// the world or tunnel era a platform belongs to
export const themeOf = (p) => (p.era === undefined ? placeOf(p.zone ?? 0) : eraOf(p.era));

// the line a platform this long shows, and how many cells in from its left it starts
// picked from the platform's own number, not the seed, so drawing never changes the game; only a platform too short for any line cuts one off
export const codeLine = (theme, n, len) => {
    const { code } = theme;
    const fits = code.filter((line) => line.length <= len);
    const pool = fits.length ? fits : code;
    // a scrambled number, so platforms near each other rarely show the same line
    const line = pool[mod((Math.imul(n ^ 0x5bd1e995, 0x9e3779b1) >>> 16) + len, pool.length)].slice(0, len);
    return { line, left: Math.floor((len - line.length) / 2) };
};

// the same line as the terminal draws it, centred on a platform of "="
export const codeFor = (theme, n, len) => {
    const { line, left } = codeLine(theme, n, len);
    return "=".repeat(left) + line + "=".repeat(len - left - line.length);
};

// the faint word on a row of background, if any
export const wordFor = (theme, y) => theme.words[mod(y * 13, theme.words.length)];
