// Matika — math practice game (Czech). Vanilla JS, single-file.
// Persistence via localStorage. No remote calls.

(() => {
  'use strict';

  // -----------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------

  const MAX_LEVEL = 10;
  const LIVES_PER_LEVEL = 3;
  const EXERCISES_PER_LEVEL = 10;
  const STORAGE_PLAYERS = 'matika.players';
  const STORAGE_CURRENT = 'matika.currentId';

  // The character roster — must match assets/characters/<id>/lv<n>.png
  const CHARACTERS = [
    { id: 'steve',    name: 'Štěpán' },
    { id: 'alex',     name: 'Alex' },
    { id: 'zombie',   name: 'Zombík' },
    { id: 'skeleton', name: 'Kostlivec' },
    { id: 'creeper',  name: 'Creeper' },
    { id: 'enderman', name: 'Enderman' },
    { id: 'witch',    name: 'Čarodějnice' },
    { id: 'pigman',   name: 'Prasečák' },
    { id: 'wither',   name: 'Wither' },
    { id: 'villager', name: 'Vesničan' },
    { id: 'pillager', name: 'Drancíř' },
    { id: 'knight',   name: 'Rytíř' },
  ];

  function spritePath(charId, level) {
    const lvl = Math.min(Math.max(level, 1), MAX_LEVEL);
    return `assets/characters/${charId}/lv${lvl}.png`;
  }

  // Pixel-art Minecraft-style heart (9x7 logical, scaled by viewBox)
  const HEART_GRID = [
    '.RR...RR.',
    'RLLRRRRRR',
    'LRRRRRRRR',
    '.RRRRRRR.',
    '..RRRRR..',
    '...RRR...',
    '....R....',
  ];

  // On a Czech QWERTZ keyboard, the top row produces diacritics unshifted
  // (+ ě š č ř ž ý á í é) and digits only with Shift. For the numeric answer
  // input, treat the physical top row as digits regardless of Shift.
  function remapCzechDigit(ev) {
    if (ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (!ev.code || !ev.code.startsWith('Digit')) return;
    const digit = ev.code.slice(5);  // 'Digit3' -> '3'
    if (digit.length !== 1 || digit < '0' || digit > '9') return;
    ev.preventDefault();
    const input = ev.target;
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd   ?? input.value.length;
    input.value = input.value.slice(0, start) + digit + input.value.slice(end);
    const pos = start + 1;
    input.setSelectionRange(pos, pos);
  }

  function heartSVG(empty) {
    const red   = empty ? '#3a3a3a' : '#d63b3b';
    const light = empty ? '#6a6a6a' : '#ffb3b3';
    const colors = { R: red, L: light };
    let rects = '';
    for (let y = 0; y < HEART_GRID.length; y++) {
      const row = HEART_GRID[y];
      for (let x = 0; x < row.length; x++) {
        const c = colors[row[x]];
        if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 7" shape-rendering="crispEdges">${rects}</svg>`;
  }

  function timerSecondsFor(level) {
    // 30s on lv1, gentle decline, floor 6s on lv9+
    return Math.max(6, 33 - level * 3);
  }

  function randInt(lo, hi) {
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  }

  // Available math games. Each defines its own exercise generator.
  const GAMES = {
    add_sub_999: {
      id: 'add_sub_999',
      name: 'Sčítání a odčítání 0–999',
      short: '0–999',
      description: 'Sčítání a odčítání s rostoucí obtížností až do 999.',
      generate: (level) => {
        const maxN = Math.min(999, 20 + level * 100);
        const ops = level <= 1 ? ['+'] : ['+', '-'];
        const op = ops[Math.floor(Math.random() * ops.length)];
        let a, b, answer;
        if (op === '+') {
          a = randInt(0, maxN);
          b = randInt(0, Math.min(maxN, 999 - a));
          answer = a + b;
        } else {
          a = randInt(0, maxN);
          b = randInt(0, a);
          answer = a - b;
        }
        return { a, b, op, answer };
      },
    },
    add_10: {
      id: 'add_10',
      name: 'Sčítání 0–10',
      short: '0–10',
      description: 'Sčítání i odčítání, čísla 0 až 10. Pro začátečníky.',
      generate: () => {
        const op = Math.random() < 0.5 ? '+' : '-';
        let a, b, answer;
        if (op === '+') {
          a = randInt(0, 10);
          b = randInt(0, 10);
          answer = a + b;
        } else {
          a = randInt(0, 10);
          b = randInt(0, a);
          answer = a - b;
        }
        return { a, b, op, answer };
      },
    },
  };
  const GAME_LIST = Object.values(GAMES);
  const DEFAULT_GAME = 'add_sub_999';

  function gameFor(player) {
    return GAMES[player.gameId] || GAMES[DEFAULT_GAME];
  }

  // Reward labels — what new item the player gets by reaching level N
  const REWARDS = {
    2:  'Kožená helma',
    3:  'Kožený krunýř',
    4:  'Dřevěný meč',
    5:  'Železná helma',
    6:  'Železný krunýř',
    7:  'Železný meč',
    8:  'Diamantová zbroj',
    9:  'Diamantový meč a plášť',
    10: 'Zlatá koruna a aura',
  };

  function nextRewardFor(level) {
    return REWARDS[level + 1] || null;
  }

  // -----------------------------------------------------------------
  // State
  // -----------------------------------------------------------------

  const state = {
    screen: 'register',          // 'register' | 'home' | 'exercise' | 'levelUp' | 'levelFailed' | 'completed'
    players: [],
    currentId: null,
    // transient run state (set on 'exercise' screen)
    run: null,                   // { lives, progress, exercise, deadline, lastFeedback }
  };

  // -----------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------

  function loadPlayers() {
    try {
      const raw = localStorage.getItem(STORAGE_PLAYERS);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function savePlayers() {
    localStorage.setItem(STORAGE_PLAYERS, JSON.stringify(state.players));
    if (state.currentId) {
      localStorage.setItem(STORAGE_CURRENT, state.currentId);
    } else {
      localStorage.removeItem(STORAGE_CURRENT);
    }
  }

  function currentPlayer() {
    return state.players.find(p => p.id === state.currentId) || null;
  }

  function newId() {
    return 'p_' + Math.random().toString(36).slice(2, 9);
  }

  // -----------------------------------------------------------------
  // Exercise generator (delegates to the player's current game)
  // -----------------------------------------------------------------

  function generateExercise(player) {
    return gameFor(player).generate(player.level);
  }

  // -----------------------------------------------------------------
  // Timer
  // -----------------------------------------------------------------

  let rafHandle = null;
  let revealCleanup = null;

  function stopTimer() {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  }

  function clearRevealListener() {
    if (revealCleanup) {
      revealCleanup();
      revealCleanup = null;
    }
  }

  function startTimer(durationSec, onTick, onExpire) {
    stopTimer();
    const start = performance.now();
    const total = durationSec * 1000;
    function tick(now) {
      const elapsed = now - start;
      const remaining = Math.max(0, total - elapsed);
      onTick(remaining / total, remaining / 1000);
      if (remaining <= 0) {
        rafHandle = null;
        onExpire();
        return;
      }
      rafHandle = requestAnimationFrame(tick);
    }
    rafHandle = requestAnimationFrame(tick);
  }

  // -----------------------------------------------------------------
  // DOM helpers
  // -----------------------------------------------------------------

  const app = () => document.getElementById('app');

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== false && v != null) {
        node.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (child == null || child === false) continue;
      if (Array.isArray(child)) {
        for (const c of child) if (c != null) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      } else if (typeof child === 'string') {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  // -----------------------------------------------------------------
  // Screen renderers
  // -----------------------------------------------------------------

  function render() {
    stopTimer();
    clearRevealListener();
    const root = app();
    root.innerHTML = '';
    let view;
    switch (state.screen) {
      case 'register':    view = renderRegister(); break;
      case 'home':        view = renderHome(); break;
      case 'exercise':    view = renderExercise(); break;
      case 'levelUp':     view = renderLevelUp(); break;
      case 'levelFailed': view = renderLevelFailed(); break;
      case 'completed':   view = renderCompleted(); break;
      default:            view = renderRegister(); break;
    }
    root.appendChild(view);
  }

  // ---------------- Register / character pick ----------------------

  let registerDraft = { name: '', charId: 'steve', gameId: DEFAULT_GAME };

  function renderRegister() {
    const panel = el('div', { class: 'panel' });
    panel.appendChild(el('h1', {}, 'Matika v Minecraftu'));
    panel.appendChild(el('p', { class: 'intro' },
      'Vítej! Vyber si hru, postavu a napiš si jméno. Postava se bude vyvíjet, jak budeš zvládat příklady.'));

    const nameRow = el('div', { class: 'name-row' },
      el('label', { for: 'pname' }, 'Jméno:'),
      el('input', {
        id: 'pname', type: 'text', maxlength: '20',
        placeholder: 'Tvoje jméno', value: registerDraft.name,
        oninput: (e) => { registerDraft.name = e.target.value; updateStartBtn(); },
      }),
    );
    panel.appendChild(nameRow);

    // Game picker
    panel.appendChild(el('div', { class: 'section-label' }, 'Vyber hru:'));
    const games = el('div', { class: 'games-row' });
    for (const g of GAME_LIST) {
      games.appendChild(el('div', {
        class: 'game-card' + (g.id === registerDraft.gameId ? ' selected' : ''),
        onclick: () => { registerDraft.gameId = g.id; render(); },
      },
        el('div', { class: 'name' }, g.name),
        el('div', { class: 'desc' }, g.description),
      ));
    }
    panel.appendChild(games);

    panel.appendChild(el('div', { class: 'section-label' }, 'Vyber postavu:'));
    const grid = el('div', { class: 'char-grid' });
    for (const c of CHARACTERS) {
      const card = el('div', {
        class: 'char-card' + (c.id === registerDraft.charId ? ' selected' : ''),
        onclick: () => { registerDraft.charId = c.id; render(); },
      },
        el('img', { src: spritePath(c.id, 1), alt: c.name }),
        el('div', { class: 'name' }, c.name),
      );
      grid.appendChild(card);
    }
    panel.appendChild(grid);

    const startBtn = el('button', {
      id: 'start-btn',
      class: 'btn primary',
      onclick: createPlayerAndStart,
    }, 'Začít hraní');
    if (!registerDraft.name.trim()) startBtn.disabled = true;

    const buttons = el('div', { class: 'btn-row' }, startBtn);
    if (state.players.length > 0) {
      buttons.appendChild(el('button', {
        class: 'btn ghost',
        onclick: () => { state.screen = 'home'; render(); },
      }, 'Zpět'));
    }
    panel.appendChild(buttons);

    return panel;

    function updateStartBtn() {
      const btn = document.getElementById('start-btn');
      if (!btn) return;
      btn.disabled = !registerDraft.name.trim();
    }
  }

  function createPlayerAndStart() {
    const name = registerDraft.name.trim();
    if (!name) return;
    const player = {
      id: newId(),
      name,
      charId: registerDraft.charId,
      level: 1,
      gameId: registerDraft.gameId || DEFAULT_GAME,
    };
    state.players.push(player);
    state.currentId = player.id;
    savePlayers();
    registerDraft = { name: '', charId: 'steve', gameId: DEFAULT_GAME };
    state.screen = 'home';
    render();
  }

  // ----------------------- Home ------------------------------------

  function renderHome() {
    const player = currentPlayer();
    if (!player) {
      state.screen = 'register';
      return renderRegister();
    }

    const panel = el('div', { class: 'panel' });
    panel.appendChild(el('h1', {}, 'Domov'));

    const homeArea = el('div', { class: 'home' });

    homeArea.appendChild(el('div', { class: 'character-display' },
      el('img', { class: 'player-sprite', src: spritePath(player.charId, player.level), alt: player.name }),
      el('div', { class: 'name', style: 'font-weight:bold;font-size:18px;' }, player.name),
    ));

    const info = el('div', { class: 'info' });
    info.appendChild(el('div', { class: 'row' },
      el('div', { class: 'label' }, 'Úroveň'),
      el('div', { class: 'value' }, `${player.level} / ${MAX_LEVEL}`),
    ));
    info.appendChild(el('div', { class: 'row' },
      el('div', { class: 'label' }, 'Hra'),
      el('div', {}, gameFor(player).name),
    ));
    info.appendChild(el('div', { class: 'row' },
      el('div', { class: 'label' }, 'Životy na úroveň'),
      el('div', {}, `${LIVES_PER_LEVEL}`),
    ));
    info.appendChild(el('div', { class: 'row' },
      el('div', { class: 'label' }, 'Příkladů na úroveň'),
      el('div', {}, `${EXERCISES_PER_LEVEL}`),
    ));
    info.appendChild(el('div', { class: 'row' },
      el('div', { class: 'label' }, 'Časový limit'),
      el('div', {}, `${timerSecondsFor(player.level)} s`),
    ));

    const startBtn = el('button', {
      class: 'btn primary',
      style: 'flex:1',
      onclick: () => startLevel(player),
    }, player.level > MAX_LEVEL ? 'Hotovo!' : 'Začít úroveň');
    if (player.level > MAX_LEVEL) startBtn.disabled = true;

    const trainBtn = el('button', {
      class: 'btn',
      style: 'flex:1',
      onclick: () => startTraining(player),
      title: 'Procvičování bez časového limitu — neposouvá úrovně',
    }, 'Trénink');

    info.appendChild(el('div', {
      style: 'display:flex; gap:10px; margin-top:16px;',
    }, startBtn, trainBtn));

    homeArea.appendChild(info);
    panel.appendChild(homeArea);

    // Game switcher — switching resets the level
    panel.appendChild(el('h2', { style: 'margin-top:30px;' }, 'Hra'));
    const games = el('div', { class: 'games-row' });
    const currentGameId = gameFor(player).id;
    for (const g of GAME_LIST) {
      games.appendChild(el('div', {
        class: 'game-card' + (g.id === currentGameId ? ' selected' : ''),
        onclick: () => changeGame(player, g.id),
      },
        el('div', { class: 'name' }, g.name),
        el('div', { class: 'desc' }, g.description),
      ));
    }
    panel.appendChild(games);
    panel.appendChild(el('p', { class: 'small muted center', style: 'margin-top:6px;' },
      'Změna hry resetuje úroveň postavy na 1.'));

    // Players list
    panel.appendChild(el('h2', { style: 'margin-top:30px;' }, 'Hráči'));
    const list = el('div', { class: 'players-list' });
    for (const p of state.players) {
      const row = el('div', {
        class: 'player-row' + (p.id === state.currentId ? ' active' : ''),
        onclick: (ev) => {
          if (ev.target.classList.contains('del')) return;
          state.currentId = p.id;
          savePlayers();
          render();
        },
      },
        el('img', { src: spritePath(p.charId, p.level), alt: p.name }),
        el('div', { class: 'name' }, p.name),
        el('div', { class: 'lvl' }, `úroveň ${p.level}`),
        el('button', {
          class: 'del',
          title: 'Smazat hráče',
          onclick: (ev) => { ev.stopPropagation(); deletePlayer(p.id); },
        }, 'Smazat'),
      );
      list.appendChild(row);
    }
    panel.appendChild(list);

    panel.appendChild(el('div', { class: 'btn-row', style: 'margin-top:16px;' },
      el('button', {
        class: 'btn',
        onclick: () => { state.screen = 'register'; render(); },
      }, 'Přidat hráče'),
    ));

    return panel;
  }

  function changeGame(player, newGameId) {
    if (!GAMES[newGameId] || player.gameId === newGameId) return;
    const msg = player.level > 1
      ? `Změna hry resetuje úroveň postavy ${player.name} z ${player.level} na 1. Pokračovat?`
      : `Přepnout na hru "${GAMES[newGameId].name}"?`;
    if (!confirm(msg)) return;
    player.gameId = newGameId;
    player.level = 1;
    savePlayers();
    render();
  }

  function deletePlayer(id) {
    if (!confirm('Opravdu chceš smazat tohoto hráče?')) return;
    state.players = state.players.filter(p => p.id !== id);
    if (state.currentId === id) {
      state.currentId = state.players[0]?.id || null;
    }
    savePlayers();
    if (state.players.length === 0) {
      state.screen = 'register';
    }
    render();
  }

  // --------------------- Exercise ----------------------------------

  function startLevel(player) {
    state.run = {
      mode: 'level',
      lives: LIVES_PER_LEVEL,
      progress: 0,
      exercise: generateExercise(player),
      timerSec: timerSecondsFor(player.level),
      phase: 'asking',          // 'asking' | 'wrong-pause' | 'wrong-reveal'
      flashCorrect: false,
      isTimeout: false,
    };
    state.screen = 'exercise';
    render();
  }

  function startTraining(player) {
    state.run = {
      mode: 'training',
      correct: 0,
      incorrect: 0,
      exercise: generateExercise(player),
      phase: 'asking',
      flashCorrect: false,
      isTimeout: false,
    };
    state.screen = 'exercise';
    render();
  }

  function renderExercise() {
    const player = currentPlayer();
    if (!player || !state.run) {
      state.screen = 'home';
      return renderHome();
    }
    const run = state.run;
    const phase = run.phase || 'asking';
    const isTraining = run.mode === 'training';
    const panel = el('div', { class: 'panel' });
    panel.appendChild(el('h2', {},
      isTraining ? `Trénink (úroveň ${player.level}) – ${player.name}`
                 : `Úroveň ${player.level} – ${player.name}`,
    ));

    // Reward strip — show current character; reward preview only in level mode
    const reward = nextRewardFor(player.level);
    const strip = el('div', { class: 'reward-strip' });
    strip.appendChild(el('div', { class: 'col' },
      el('img', { src: spritePath(player.charId, player.level), alt: player.name }),
      el('div', { class: 'label' }, isTraining ? 'Trénink' : `Úroveň ${player.level}`),
      el('div', { class: 'name' }, player.name),
    ));
    if (isTraining) {
      strip.appendChild(el('div', { class: 'badge-max' }, 'Bez časového limitu'));
    } else if (reward) {
      strip.appendChild(el('div', { class: 'arrow' }, '→'));
      const previewLvl = Math.min(player.level + 1, MAX_LEVEL);
      strip.appendChild(el('div', { class: 'col preview' },
        el('img', { class: 'preview', src: spritePath(player.charId, previewLvl), alt: 'Náhled' }),
        el('div', { class: 'label' }, 'Za splnění úrovně'),
        el('div', { class: 'reward-name' }, reward),
      ));
    } else {
      strip.appendChild(el('div', { class: 'badge-max' }, '★ Vrcholová úroveň ★'));
    }
    panel.appendChild(strip);

    // HUD
    if (isTraining) {
      panel.appendChild(el('div', { class: 'hud' },
        el('div', {}, `Správně: ${run.correct}`),
        el('div', {}, `Špatně: ${run.incorrect}`),
      ));
    } else {
      const lives = el('div', { class: 'lives' });
      for (let i = 0; i < LIVES_PER_LEVEL; i++) {
        const empty = i >= run.lives;
        lives.appendChild(el('span', {
          class: 'heart' + (empty ? ' empty' : ''),
          html: heartSVG(empty),
        }));
      }
      const pips = el('div', { class: 'progress-pips' });
      for (let i = 0; i < EXERCISES_PER_LEVEL; i++) {
        pips.appendChild(el('span', { class: 'pip' + (i < run.progress ? ' done' : '') }));
      }
      panel.appendChild(el('div', { class: 'hud' },
        el('div', {}, 'Životy:', lives),
        el('div', {}, 'Postup:', pips),
      ));
    }

    // Timer bar — level mode only
    const isAsking = phase === 'asking';
    let bar = null;
    if (!isTraining) {
      bar = el('div', { class: 'timer-bar' + (isAsking ? '' : ' paused') },
        el('div', { class: 'timer-bar-fill', style: 'width:' + (isAsking ? '100%' : '0%') }),
      );
      panel.appendChild(bar);
    }

    // Question — reveal the answer in 'wrong-reveal' phase
    const ex = run.exercise;
    const reveal = phase === 'wrong-reveal';
    panel.appendChild(el('div', { class: 'question center' },
      reveal ? `${ex.a} ${ex.op} ${ex.b} = ${ex.answer}` : `${ex.a} ${ex.op} ${ex.b} = ?`,
    ));

    if (phase === 'asking') {
      const flash = run.flashCorrect;
      run.flashCorrect = false;

      const input = el('input', {
        id: 'answer-input',
        type: 'text',
        inputmode: 'numeric',
        pattern: '-?[0-9]*',
        autocomplete: 'off',
        onkeydown: (ev) => {
          if (ev.key === 'Enter') { submitAnswer(); return; }
          remapCzechDigit(ev);
        },
      });
      const submitBtn = el('button', { class: 'btn primary', onclick: submitAnswer }, 'Odeslat');
      panel.appendChild(el('div', { class: 'answer-row' }, input, submitBtn));
      if (flash) {
        panel.appendChild(el('div', { class: 'feedback ok flash' }, 'Správně!'));
      } else {
        panel.appendChild(el('div', { class: 'feedback' }));
      }

      setTimeout(() => input.focus(), 0);
      if (bar) {
        const fill = bar.querySelector('.timer-bar-fill');
        startTimer(run.timerSec, (frac) => {
          fill.style.width = (frac * 100).toFixed(1) + '%';
          bar.classList.toggle('warn', frac < 0.5 && frac >= 0.25);
          bar.classList.toggle('danger', frac < 0.25);
        }, () => {
          if (state.run !== run || run.phase !== 'asking') return;
          handleAnswer(null, true);
        });
      }

    } else if (phase === 'wrong-pause') {
      panel.appendChild(el('div', { class: 'feedback bad' },
        run.isTimeout ? 'Čas vypršel!' : 'Špatně!'));

    } else if (phase === 'wrong-reveal') {
      panel.appendChild(el('div', { class: 'feedback bad' },
        run.isTimeout ? 'Čas vypršel!' : 'Špatně!'));
      panel.appendChild(el('div', { class: 'small center muted', style: 'margin-top:4px;' },
        'Stiskni libovolnou klávesu pro další příklad.'));
      const contBtn = el('button', { class: 'btn primary', onclick: continueAfterReveal }, 'Další příklad');
      panel.appendChild(el('div', { class: 'btn-row' }, contBtn));
      setTimeout(() => contBtn.focus(), 0);

      const keyListener = (ev) => {
        if (state.run !== run || state.run.phase !== 'wrong-reveal') return;
        ev.preventDefault();
        continueAfterReveal();
      };
      document.addEventListener('keydown', keyListener);
      revealCleanup = () => document.removeEventListener('keydown', keyListener);
    }

    // Quit button
    panel.appendChild(el('div', { class: 'btn-row', style: 'margin-top:16px;' },
      el('button', { class: 'btn ghost', onclick: quitToHome },
        isTraining ? 'Ukončit trénink' : 'Ukončit úroveň'),
    ));

    return panel;
  }

  function quitToHome() {
    stopTimer();
    clearRevealListener();
    state.run = null;
    state.screen = 'home';
    render();
  }

  function submitAnswer() {
    const run = state.run;
    if (!run || run.phase !== 'asking') return;
    const input = document.getElementById('answer-input');
    if (!input) return;
    const raw = input.value.trim();
    if (raw === '') return;
    const val = parseInt(raw, 10);
    if (Number.isNaN(val)) return;       // silently ignore non-numeric
    handleAnswer(val, false);
  }

  function handleAnswer(value, isTimeout) {
    const run = state.run;
    const player = currentPlayer();
    if (!run || !player) return;
    stopTimer();

    const correct = !isTimeout && value === run.exercise.answer;
    const isTraining = run.mode === 'training';

    if (correct) {
      if (isTraining) {
        run.correct += 1;
      } else {
        run.progress += 1;
        if (run.progress >= EXERCISES_PER_LEVEL) {
          completeLevel(player);
          return;
        }
      }
      run.exercise = generateExercise(player);
      run.flashCorrect = true;
      run.phase = 'asking';
      render();
      return;
    }

    // Wrong or timeout — pause 2s, then reveal
    if (isTraining) {
      run.incorrect += 1;
    } else {
      run.lives -= 1;
    }
    run.isTimeout = isTimeout;
    run.phase = 'wrong-pause';
    render();

    setTimeout(() => {
      if (!state.run || state.run !== run) return;
      if (!isTraining && run.lives <= 0) {
        failLevel(player);
        return;
      }
      run.phase = 'wrong-reveal';
      render();
    }, 2000);
  }

  function continueAfterReveal() {
    const run = state.run;
    const player = currentPlayer();
    if (!run || !player || run.phase !== 'wrong-reveal') return;
    run.exercise = generateExercise(player);
    run.phase = 'asking';
    render();
  }

  function completeLevel(player) {
    state.run = null;
    if (player.level >= MAX_LEVEL) {
      player.level = MAX_LEVEL; // stay capped, but flag completion
      savePlayers();
      state.screen = 'completed';
    } else {
      player.level += 1;
      savePlayers();
      state.screen = 'levelUp';
    }
    render();
  }

  function failLevel(player) {
    state.run = null;
    state.screen = 'levelFailed';
    render();
  }

  // ------------------- Level-up / Failed / Done --------------------

  function renderLevelUp() {
    const player = currentPlayer();
    if (!player) { state.screen = 'register'; return renderRegister(); }
    const panel = el('div', { class: 'panel celebrate win' });
    panel.appendChild(el('h2', {}, `Postup na úroveň ${player.level}!`));
    panel.appendChild(el('img', { src: spritePath(player.charId, player.level), alt: player.name }));
    panel.appendChild(el('div', { class: 'fanfare' },
      el('p', {}, `Skvělá práce, ${player.name}!`),
      el('p', {}, 'Tvoje postava získala lepší výbavu.'),
    ));
    panel.appendChild(el('div', { class: 'btn-row' },
      el('button', { class: 'btn primary', onclick: () => { state.screen = 'home'; render(); } }, 'Pokračovat'),
      el('button', { class: 'btn', onclick: () => startLevel(player) }, 'Hned další úroveň'),
    ));
    return panel;
  }

  function renderLevelFailed() {
    const player = currentPlayer();
    if (!player) { state.screen = 'register'; return renderRegister(); }
    const panel = el('div', { class: 'panel celebrate lose' });
    panel.appendChild(el('h2', {}, 'Úroveň se nezdařila'));
    panel.appendChild(el('img', { src: spritePath(player.charId, player.level), alt: player.name }));
    panel.appendChild(el('div', { class: 'fanfare' },
      el('p', {}, 'Ztratil/a jsi všechny životy.'),
      el('p', {}, 'Zkus to znovu — žádné body se neztrácí.'),
    ));
    panel.appendChild(el('div', { class: 'btn-row' },
      el('button', { class: 'btn primary', onclick: () => startLevel(player) }, 'Zkusit znovu'),
      el('button', { class: 'btn', onclick: () => { state.screen = 'home'; render(); } }, 'Zpět domů'),
    ));
    return panel;
  }

  function renderCompleted() {
    const player = currentPlayer();
    if (!player) { state.screen = 'register'; return renderRegister(); }
    const panel = el('div', { class: 'panel celebrate win' });
    panel.appendChild(el('h2', {}, 'Gratulujeme!'));
    panel.appendChild(el('img', { src: spritePath(player.charId, MAX_LEVEL), alt: player.name }));
    panel.appendChild(el('div', { class: 'fanfare' },
      el('p', {}, `${player.name}, dokončil/a jsi všech ${MAX_LEVEL} úrovní!`),
      el('p', {}, 'Tvoje postava je v plné královské zbroji.'),
      el('p', {}, 'Můžeš si zopakovat poslední úroveň, kdykoli budeš chtít.'),
    ));
    panel.appendChild(el('div', { class: 'btn-row' },
      el('button', { class: 'btn primary', onclick: () => startLevel(player) }, 'Hrát znovu poslední úroveň'),
      el('button', { class: 'btn', onclick: () => { state.screen = 'home'; render(); } }, 'Zpět domů'),
    ));
    return panel;
  }

  // -----------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------

  function init() {
    state.players = loadPlayers();
    state.currentId = localStorage.getItem(STORAGE_CURRENT) || null;
    // Validate current
    if (state.currentId && !state.players.find(p => p.id === state.currentId)) {
      state.currentId = state.players[0]?.id || null;
    }
    state.screen = state.players.length === 0 ? 'register' : 'home';
    render();
  }

  init();
})();
