/**
 * JNLang — the .jn modding language
 * ---------------------------------
 * VoxelCraft's own little scripting language: Lua's friendliness with JS's
 * muscles. It transpiles to JavaScript and runs against the mod API, with
 * every game function available as a bare word and variables that just exist
 * the moment you assign them (no let/var/local required).
 *
 *   -- Taco rain, in JN
 *   chat("🌮 Taco rain!")
 *   every 0.5 do
 *     drop("taco", 1, player.x + random(-8, 8), player.y + 14, player.z + random(-8, 8))
 *   end
 *
 *   count = 0
 *   on break do
 *     count = count + 1
 *     if count % 10 == 0 then chat("Broke " .. count .. " blocks!") end
 *   end
 *
 * Syntax:
 *   comments      -- like Lua   or   // like JS
 *   blocks        if <cond> then … elseif … else … end
 *                 while <cond> do … end
 *                 for i = 1, 10 do … end       (optional step: for i = 0, 8, 2 do)
 *                 fn name(a, b) … end          (functions)
 *   events        every <seconds> do … end
 *                 on tick do … end   on break do … end   on place do … end
 *   operators     and or not   ~= (or !=)   .. (string glue)   true false nil
 *
 * Variables: assignment creates them (count = 0). Reading an unset variable
 * gives nil, exactly like Lua. All JS globals (Math, JSON, …) still work.
 */

/** Bare words JN exposes from the mod api (the "instant" vocabulary). */
export const JN_BUILTINS = [
  'chat', 'print', 'give', 'drop', 'spawn', 'setblock', 'getblock', 'ground',
  'tp', 'heal', 'hurt', 'feed', 'effect', 'jumpboost', 'speed', 'time',
  'command', 'random', 'killallmobs', 'image', 'billboard', 'hud',
  'every', 'ontick', 'onbreak', 'onplace'
];

/**
 * Transpile JN source into a JavaScript function body.
 * Structural lines are rewritten with a small block stack (so `end` knows
 * whether it closes `{` or a callback's `})`), then expression-level sugar is
 * swapped in with string literals protected.
 * @param {string} src
 * @returns {string} JavaScript
 */
export function transpileJN(src) {
  /* -- 1. Protect string literals so keywords inside them survive. -------- */
  const strings = [];
  let code = String(src).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => {
    strings.push(m);
    return '\x01' + (strings.length - 1) + '\x01'; // sentinel survives every pass
  });

  /* -- 2. Strip comments (Lua -- and JS //). ------------------------------ */
  code = code.replace(/--[^\n]*/g, '').replace(/\/\/[^\n]*/g, '');

  /* -- 3. Structural pass, line by line, with a block-close stack. -------- */
  const out = [];
  const stack = []; // '}' for plain blocks, '});' for callback blocks
  for (let raw of code.split('\n')) {
    let line = raw.trim();
    if (!line) { out.push(''); continue; }

    // Multiple `end`s can share a line with other code; treat `end` greedily
    // at line edges. Simplest robust rule: split standalone `end` tokens.
    // Handle the common single-line form `if x then y end` first.
    let m;

    if ((m = line.match(/^every\s+(.+?)\s+do$/))) {
      out.push(`every(${m[1]}, () => {`);
      stack.push('});');
    } else if ((m = line.match(/^on\s+tick\s+do$/))) {
      out.push('ontick((dt) => {');
      stack.push('});');
    } else if ((m = line.match(/^on\s+break\s+do$/))) {
      out.push('onbreak((x, y, z, id) => {');
      stack.push('});');
    } else if ((m = line.match(/^on\s+place\s+do$/))) {
      out.push('onplace((x, y, z, id) => {');
      stack.push('});');
    } else if ((m = line.match(/^fn\s+([A-Za-z_]\w*)\s*\(([^)]*)\)$/))) {
      out.push(`function ${m[1]}(${m[2]}) {`);
      stack.push('}');
    } else if ((m = line.match(/^if\s+(.+?)\s+then\s+(.+?)\s+end$/))) {
      out.push(`if (${expr(m[1])}) { ${expr(m[2])} }`); // one-liner if
    } else if ((m = line.match(/^if\s+(.+?)\s+then$/))) {
      out.push(`if (${expr(m[1])}) {`);
      stack.push('}');
    } else if ((m = line.match(/^elseif\s+(.+?)\s+then$/))) {
      out.push(`} else if (${expr(m[1])}) {`);
    } else if (line === 'else') {
      out.push('} else {');
    } else if ((m = line.match(/^while\s+(.+?)\s+do$/))) {
      out.push(`while (${expr(m[1])}) {`);
      stack.push('}');
    } else if ((m = line.match(/^for\s+([A-Za-z_]\w*)\s*=\s*(.+?),\s*(.+?),\s*(.+?)\s+do$/))) {
      out.push(`for (let ${m[1]} = ${expr(m[2])}; ${m[1]} <= ${expr(m[3])}; ${m[1]} += ${expr(m[4])}) {`);
      stack.push('}');
    } else if ((m = line.match(/^for\s+([A-Za-z_]\w*)\s*=\s*(.+?),\s*(.+?)\s+do$/))) {
      out.push(`for (let ${m[1]} = ${expr(m[2])}; ${m[1]} <= ${expr(m[3])}; ${m[1]}++) {`);
      stack.push('}');
    } else if (line === 'end') {
      out.push(stack.pop() || '}');
    } else {
      out.push(expr(line) + ';');
    }
  }
  // Auto-close anything the author forgot (friendly, like Lua REPLs aren't).
  while (stack.length) out.push(stack.pop());

  let js = out.join('\n');

  /* -- 4. Restore strings. ------------------------------------------------ */
  js = js.replace(/\x01(\d+)\x01/g, (_, i) => strings[i]);
  return js;

  /** Expression-level sugar (operates on structural fragments). */
  function expr(s) {
    return s
      .replace(/\bnot\s+/g, '!')
      .replace(/\band\b/g, '&&')
      .replace(/\bor\b/g, '||')
      .replace(/~=/g, '!==')
      .replace(/\.\./g, '+')          // string glue
      .replace(/\bnil\b/g, 'null');
  }
}

/**
 * Build the `with`-scope environment that makes JN "just know" every word:
 * builtins resolve to the mod api, assignments create variables on the fly,
 * unknown reads give nil, and JS globals (Math, JSON…) still shine through.
 * @param {Object} api the ModLoader api for this mod
 * @returns {Proxy}
 */
export function buildJNEnv(api) {
  const vars = Object.create(null);
  const builtins = {
    chat: api.chat, print: api.chat,
    give: api.give,
    drop: (type, count, x, y, z) => {
      if (x === undefined) { const p = api.player(); x = p.x; y = p.y + 1; z = p.z; }
      api.dropItem(type, count ?? 1, { x, y, z });
    },
    spawn: api.spawnMob,
    setblock: api.setBlock, getblock: api.getBlock, ground: api.groundAt,
    tp: api.tp, heal: api.heal, hurt: api.hurt, feed: api.feed,
    effect: api.effect, jumpboost: api.jumpBoost, speed: api.speed,
    time: api.time, command: api.command, random: api.random,
    killallmobs: api.killAllMobs,
    image: api.image, billboard: api.billboard, hud: api.hudImage,
    every: api.every, ontick: api.onTick, onbreak: api.onBreak, onplace: api.onPlace
  };
  return new Proxy(vars, {
    has: () => true, // every identifier routes through this scope
    get(t, k) {
      if (k === Symbol.unscopables) return undefined;
      if (k === 'player') return api.player();       // live position, always fresh
      if (k in t) return t[k];
      if (k in builtins) return builtins[k];
      return globalThis[k];                          // Math, JSON, console, …
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

/**
 * Run a JN mod: transpile, wrap in a with-scope, execute.
 * @param {string} src JN source
 * @param {Object} api mod api
 */
export function runJN(src, api) {
  const js = transpileJN(src);
  // Sloppy mode on purpose: `with` is the magic that makes bare words work.
  const fn = new Function('__jn', `with (__jn) {\n${js}\n}`);
  fn(buildJNEnv(api));
}

export default { transpileJN, runJN, buildJNEnv, JN_BUILTINS };
