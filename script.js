(function () {
  // --- Parameters & Device Detection ---
  const params = new URLSearchParams(location.search);
  const competitionRaw = params.get("competition") || "low";
  const competition = competitionRaw.toLowerCase();
  const valence = params.get("valence") || "positive";
  const round = parseInt(params.get("round")) || 1;
  const mode = params.get("mode") || "vs"; // 'vs' or 'solo'
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);

  let plays = 0
  let gameTime = 0;
  let gameTimer = null;

  // Extract valence messages from URL parameters
  const winMsg = params.get("winMsg") || "Thanks for playing. That was great.";
  const lossMsg = params.get("lossMsg") || "Lol. I beat you. You lost.";
  const tieMsg = params.get("tieMsg") || "That was something.";
  console.log(`Game initialized: Competition=${competition} (raw: ${competitionRaw}), Round=${round}, Mode=${mode}`);
  console.log(`Full URL: ${location.href}`);
  console.log(`URL search params: ${location.search}`);
  console.log(`Valence Messages - Win: "${winMsg}", Loss: "${lossMsg}", Tie: "${tieMsg}"`);

  // --- Loading Sequence ---
  const loadingBarFg = document.getElementById("loadingBarFg");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingText = document.getElementById("loadingText");
  const scoreBarVertical = document.getElementById("scoreBarVertical");
  const timerPil = document.getElementById("timerPill");

  // Add debug logging for garbage system
  console.log("Garbage system enabled for high competition:", competition === "high" && mode === "vs");
  // --- Solo Mode Setup ---
  if (mode === "solo") {
    document.body.classList.add("solo-mode");
    document.getElementById("loadingText").textContent = "Loading Tetris...";
  }

  // --- Competition Mode Setup ---
  if (competition === "low") {
    scoreBarVertical.style.display = "none";
    document.body.classList.add("low-competition");
  } else if (competition === "high") {
    document.body.classList.add("high-competition");
  }

  // --- CPU Name & Pill Color ---
  const names = ["Opponent"];
  const cpuName = names[Math.floor(Math.random() * names.length)];
  const cpuPill = document.getElementById("cpuPill");

  if (mode === "vs") {
    cpuPill.innerHTML = `${cpuName}: <b><span id='cpuScorePill'>0</span> pts</b>`;
    if (competition === "low") {
      cpuPill.className = "pill purple";
      document.getElementById("cpuCanvas").style.borderColor = "purple";
    }
  }

  // --- Responsive Canvas Sizing ---
  if (mode === "vs") {
    if (isMobile && competition === "high") {
      document.getElementById("playerCanvas").style.maxWidth = "90vw";
      document.getElementById("cpuCanvas").style.maxWidth = "60vw";
    }
    if (isMobile && competition === "low") {
      // Show CPU canvas in low competition mode as well
      document.getElementById("cpuCanvas").style.maxWidth = "60vw";
    }
  }

  // Animate bar to full over 4 seconds
  requestAnimationFrame(() => (loadingBarFg.style.width = "100%"));

  // After 4s, show "Opponent Found" for 1s, then hide overlay and start countdown
  setTimeout(() => {
    if (mode === "solo") {
      loadingText.textContent = "Ready to Play!";
    } else {
      loadingText.textContent = "Opponent Found";
    }
    setTimeout(() => {
      loadingOverlay.style.display = "none";
      startCountdown();
    }, 1000);
  }, 4000);

  // --- Countdown for Game Start ---
  const countdownOverlay = document.getElementById("countdownOverlay");
  function startCountdown() {
    let count = 3;
    countdownOverlay.style.visibility = "visible";
    countdownOverlay.textContent = count;
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        countdownOverlay.textContent = count;
      } else {
        clearInterval(timer);
        countdownOverlay.style.visibility = "hidden";
        lastTime = performance.now();
        startTimer();
        requestAnimationFrame(gameLoop);
      }
    }, 1000);
  }

  // --- Tetris Logic (Shapes, Colors, Heuristics, Board Class) ---
  const SHAPES = {
    I: [[[1, 1, 1, 1]], [[1], [1], [1], [1]]],
    O: [
      [
        [1, 1],
        [1, 1],
      ],
    ],
    T: [
      [
        [0, 1, 0],
        [1, 1, 1],
      ],
      [
        [1, 0],
        [1, 1],
        [1, 0],
      ],
      [
        [1, 1, 1],
        [0, 1, 0],
      ],
      [
        [0, 1],
        [1, 1],
        [0, 1],
      ],
    ],
    S: [
      [
        [0, 1, 1],
        [1, 1, 0],
      ],
      [
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ],
    Z: [
      [
        [1, 1, 0],
        [0, 1, 1],
      ],
      [
        [0, 1],
        [1, 1],
        [1, 0],
      ],
    ],
    J: [
      [
        [1, 0, 0],
        [1, 1, 1],
      ],
      [
        [1, 1],
        [1, 0],
        [1, 0],
      ],
      [
        [1, 1, 1],
        [0, 0, 1],
      ],
      [
        [0, 1],
        [0, 1],
        [1, 1],
      ],
    ],
    L: [
      [
        [0, 0, 1],
        [1, 1, 1],
      ],
      [
        [1, 0],
        [1, 0],
        [1, 1],
      ],
      [
        [1, 1, 1],
        [1, 0, 0],
      ],
      [
        [1, 1],
        [0, 1],
        [0, 1],
      ],
    ],
  };
  const COLORS = { O: "blue", I: "purple", T: "orange", S: "pink", Z: "yellow", L: "red", J: "green", G: "gray" };

  function aggregateHeight(grid) {
    let h = 0;
    for (let c = 0; c < 10; c++) {
      for (let r = 0; r < 20; r++) {
        if (grid[r][c]) {
          h += 20 - r;
          break;
        }
      }
    }
    return h;
  }

  function countHoles(grid) {
    let holes = 0;
    for (let c = 0; c < 10; c++) {
      let seen = false;
      for (let r = 0; r < 20; r++) {
        if (grid[r][c]) seen = true;
        else if (seen) holes++;
      }
    }
    return holes;
  }

  function bumpiness(grid) {
    const heights = [];
    for (let c = 0; c < 10; c++) {
      let h = 0;
      for (let r = 0; r < 20; r++)
        if (grid[r][c]) {
          h = 20 - r;
          break;
        }
      heights.push(h);
    }
    let b = 0;
    for (let i = 0; i < 9; i++) b += Math.abs(heights[i] - heights[i + 1]);
    return b;
  }

  class TetrisBoard {
    constructor(id, mode) {
      this.ctx = document.getElementById(id).getContext("2d");
      this.mode = mode;
      this.grid = Array.from({ length: 20 }, () => Array(10).fill(0));
      this.score = 0;
      this.garbage = 0;
      this.heldPiece = null;
      this.lastDrawnHeldPiece = undefined; // Track what was last drawn to avoid unnecessary clears
      this.canHold = true;
      this.prevShape = null;
      this.gameOver = false;
      this.cpuTimer = 0;
      this.ready = mode === "human";
      this.readyTimer = 0; // Adjust CPU difficulty based on competition level
      if (mode === "cpu") {
        if (competition === "high") {
          this.readyDelay = 0; // Same as player (no delay for equal spawning speed)
          this.dropInterval = 500; // Same as player speed
          this.moveInterval = 200; // Same as player speed
          this.skillLevel = "expert"; // Expert AI
        } else {
          this.readyDelay = Math.random() * 1000 + 500; // Moderate start delay (0.5-1.5s)
          this.dropInterval = 1200; // Slower drop speed than player
          this.moveInterval = 800; // Slower move speed than player
          this.skillLevel = "expert"; // Expert AI (same smart logic as high competition)
        }
      } else {
        this.readyDelay = 0;
        this.dropInterval = 500; // Player drop speed
        this.moveInterval = 200; // Player move speed
        this.skillLevel = "human";
      }
      this.spawn();
      this.acc = 0;

      // Initialize hold canvas display
      this.drawHold();
    }
    spawn() {
      const keys = Object.keys(SHAPES);
      let p;
      do {
        p = keys[Math.floor(Math.random() * keys.length)];
      } while (p === this.prevShape);
      this.prevShape = p;
      this.shape = SHAPES[p];
      this.rot = 0;
      this.mat = this.shape[0];
      this.x = Math.floor((10 - this.mat[0].length) / 2);
      this.y = 0;
      this.canHold = true;
      if (!this.valid(this.mat, this.x, this.y)) this.gameOver = true;
      if (this.mode === "cpu") this.planCPU();
    }
    valid(mat, x, y) {
      for (let r = 0; r < mat.length; r++)
        for (let c = 0; c < mat[r].length; c++) {
          if (!mat[r][c]) continue;
          const X = x + c,
            Y = y + r;
          if (X < 0 || X >= 10 || Y < 0 || Y >= 20 || this.grid[Y][X]) return false;
        }
      return true;
    }
    clearLines() {
      const before = this.grid.length;
      this.grid = this.grid.filter((row) => row.includes(0));
      const L = 20 - this.grid.length;
      while (this.grid.length < 20) this.grid.unshift(Array(10).fill(0));
      return L;
    }
    lock() {
      for (let r = 0; r < this.mat.length; r++)
        for (let c = 0; c < this.mat[r].length; c++) {
          if (this.mat[r][c]) this.grid[this.y + r][this.x + c] = this.prevShape;
        }
      const L = this.clearLines();
      if (L) {
        this.score += L * 100;
        // Only add garbage in high competition mode and vs mode
        if (mode === "vs" && competition === "high") {
          // Send more garbage: 2x lines cleared
          this.garbage += L * 1;
          console.log(`${this.mode} cleared ${L} lines, added ${L * 1} garbage. Total garbage: ${this.garbage}`);
        } // In low competition, do not send garbage
        if (mode === "vs" && competition === "low") {
          this.garbage = 0;
        }
        // Only show Tetris alert in high competition mode
        if (L >= 4 && competition === "high") triggerTetrisAlert();
      }
      this.spawn();
    }
    move(dx, dy) {
      if (this.valid(this.mat, this.x + dx, this.y + dy)) {
        this.x += dx;
        this.y += dy;
        return true;
      }
      return false;
    }
    rotate() {
      const nr = (this.rot + 1) % this.shape.length;
      const nm = this.shape[nr];
      if (this.valid(nm, this.x, this.y)) {
        this.rot = nr;
        this.mat = nm;
      }
    }
    hardDrop() {
      while (this.move(0, 1));
      this.lock();
    }
    hold() {
      if (!this.canHold) {
        return;
      }

      if (this.heldPiece === null) {
        // First hold - just store current piece and spawn new one
        this.heldPiece = this.prevShape;
        this.spawn();
      } else {
        // Swap current piece with held piece
        const tempShape = this.heldPiece;
        this.heldPiece = this.prevShape;

        // Set up the swapped piece
        this.prevShape = tempShape;
        this.shape = SHAPES[tempShape];
        this.rot = 0;
        this.mat = this.shape[0];
        this.x = Math.floor((10 - this.mat[0].length) / 2);
        this.y = 0;

        // Check if the swapped piece can be placed
        if (!this.valid(this.mat, this.x, this.y)) {
          this.gameOver = true;
        }

        if (this.mode === "cpu") this.planCPU();
      }

      this.canHold = false;
    }
    planCPU() {
      let best = Infinity; // Always minimize score (same logic for both high and low competition)
      let plan = {};
      for (let r = 0; r < this.shape.length; r++) {
        const mat = this.shape[r];
        const w = mat[0].length;
        for (let x = 0; x <= 10 - w; x++) {
          let y = 0;
          while (this.valid(mat, x, y)) y++;
          y--;
          if (y < 0) continue;
          const g = this.grid.map((row) => row.slice());
          for (let rr = 0; rr < mat.length; rr++)
            for (let cc = 0; cc < mat[rr].length; cc++) {
              if (mat[rr][cc]) g[y + rr][x + cc] = this.prevShape;
            }
          // Count how many lines would be cleared
          const completeRows = g.filter((row) => row.every((cell) => cell !== 0));
          const lines = completeRows.length;
          let score; // Use smart AI logic for both high and low competition
          // Smart AI: maximize line clears, avoid holes, maintain flat surface
          score =
            aggregateHeight(g) * 0.5 + // Penalty for height
            countHoles(g) * 100.0 + // Massive penalty for holes - avoid at all costs
            bumpiness(g) * 2.0 - // Strong penalty for uneven surface
            lines * 1000 - // HUGE bonus for line clears
            (lines >= 4 ? 2000 : 0) - // Massive bonus for Tetris
            (lines >= 2 ? 500 : 0); // Extra bonus for double+ lines

          if (score < best) {
            best = score;
            plan = { rot: r, x, y };
          }
        }
      }

      this.cpuPlan = plan;
      console.log(`CPU (${competition}): Planned move - rot:${plan.rot}, x:${plan.x}, score:${best.toFixed(2)}`);

      // Additional debugging for line clearing
      if (competition === "high" || competition === "low") {
        // Test the planned move to see if it clears lines
        const testGrid = this.grid.map((row) => row.slice());
        const testMat = this.shape[plan.rot];
        for (let rr = 0; rr < testMat.length; rr++) {
          for (let cc = 0; cc < testMat[rr].length; cc++) {
            if (testMat[rr][cc]) {
              testGrid[plan.y + rr][plan.x + cc] = this.prevShape;
            }
          }
        }
        const linesCleared = testGrid.filter((row) => row.every((cell) => cell !== 0)).length;
        if (linesCleared > 0) {
          console.log(`CPU will clear ${linesCleared} lines with this move!`);
        }
      }
    }
    receiveGarbage(rows) {
      console.log(`${this.mode} receiving ${rows} garbage rows`);
      for (let i = 0; i < rows; i++) {
        this.grid.shift();
        // Create garbage row with random gap
        const garbageRow = Array(10).fill("G");
        const gapPos = Math.floor(Math.random() * 10);
        garbageRow[gapPos] = 0; // Leave one gap
        this.grid.push(garbageRow);
      }

      // Check if current piece is still valid after garbage
      if (!this.valid(this.mat, this.x, this.y)) {
        // Try to move the piece up
        this.y = Math.max(0, this.y - rows);
        if (!this.valid(this.mat, this.x, this.y)) {
          this.gameOver = true;
        }
      }
    }
    update(dt) {
      if (this.mode === "cpu" && !this.ready) {
        this.readyTimer += dt;
        if (this.readyTimer >= this.readyDelay) this.ready = true;
        else return;
      }
      if (this.gameOver) {
        return;
      }

      this.acc += dt;
      if (this.acc > this.dropInterval) {
        this.acc = 0;
        if (!this.move(0, 1)) this.lock();
      }
      if (this.mode === "cpu" && this.cpuPlan) {
        this.cpuTimer += dt;
        if (this.cpuTimer > this.moveInterval) {
          if (this.rot !== this.cpuPlan.rot) {
            this.rotate();
          } else if (this.x < this.cpuPlan.x) {
            this.move(1, 0);
          } else if (this.x > this.cpuPlan.x) {
            this.move(-1, 0);
          } else {
            // Both high and low competition use smart play - always hard drop for optimal placement
            this.hardDrop();
          }
          this.cpuTimer = 0;
        }
      }
    }
    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, 300, 600);
      for (let r = 0; r < 20; r++)
        for (let c = 0; c < 10; c++) {
          if (this.grid[r][c]) {
            ctx.fillStyle = COLORS[this.grid[r][c]];
            ctx.fillRect(c * 30, r * 30, 30, 30);
          }
          ctx.strokeStyle = "#333";
          ctx.strokeRect(c * 30, r * 30, 30, 30);
        }
      if (!this.gameOver) {
        ctx.fillStyle = COLORS[this.prevShape];
        for (let r = 0; r < this.mat.length; r++)
          for (let c = 0; c < this.mat[r].length; c++) {
            if (this.mat[r][c]) {
              ctx.fillRect((this.x + c) * 30, (this.y + r) * 30, 30, 30);
              ctx.strokeRect((this.x + c) * 30, (this.y + r) * 30, 30, 30);
            }
          }
      }
      // Only update hold canvas when heldPiece changes
      if (this.heldPiece !== this.lastDrawnHeldPiece) {
        this.drawHold();
        this.lastDrawnHeldPiece = this.heldPiece;
      }
    }
    drawHold() {
      // Check if we're on mobile (screen width <= 480px)
      const isMobile = window.innerWidth <= 480;
      const canvasId = isMobile ? "mobileHoldCanvas" : "holdCanvas";
      const hc = document.getElementById(canvasId);

      if (!hc) {
        console.error(`${canvasId} not found!`);
        return;
      }

      const ctx = hc.getContext("2d");
      // Always clear and redraw to ensure consistency
      const canvasSize = isMobile ? 100 : 64;
      ctx.clearRect(0, 0, canvasSize, canvasSize);
      if (!this.heldPiece) {
        // Draw empty state indicator in center
        ctx.fillStyle = "#888";
        const indicatorSize = isMobile ? 12 : 8;
        const centerX = (canvasSize - indicatorSize) / 2;
        const centerY = (canvasSize - indicatorSize) / 2;
        ctx.fillRect(centerX, centerY, indicatorSize, indicatorSize);
        return;
      }

      const mat = SHAPES[this.heldPiece][0];
      const maxDim = Math.max(mat.length, mat[0].length);
      const sz = Math.floor((canvasSize - 16) / maxDim); // Leave 16px margin

      // Center the piece in the canvas
      const offsetX = (canvasSize - mat[0].length * sz) / 2;
      const offsetY = (canvasSize - mat.length * sz) / 2;

      ctx.fillStyle = COLORS[this.heldPiece];
      ctx.strokeStyle = "#FFF";
      ctx.lineWidth = 2;

      for (let r = 0; r < mat.length; r++) {
        for (let c = 0; c < mat[r].length; c++) {
          if (mat[r][c]) {
            const x = offsetX + c * sz;
            const y = offsetY + r * sz;
            ctx.fillRect(x, y, sz, sz);
            ctx.strokeRect(x, y, sz, sz);
          }
        }
      }
    }
  }

  // --- Initialize Boards & Start Loop ---
  window.player = new TetrisBoard("playerCanvas", "human");
  if (mode === "vs") {
    window.cpu = new TetrisBoard("cpuCanvas", "cpu");
  }

  // Initialize scores to 0
  updateScores(0, 0);

  // Track who lost first - make it globally accessible
  window.gameWinner = null;

  let lastTime = performance.now();
  function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    window.player.update(dt);
    if (mode === "vs" && window.cpu) {
      window.cpu.update(dt);
    }

    if (mode === "vs" && competition === "high" && window.cpu) {
      // Send all garbage rows
      while (window.player.garbage > 0) {
        window.cpu.receiveGarbage(1);
        window.player.garbage--;
      }
      while (window.cpu.garbage > 0) {
        window.player.receiveGarbage(1);
        window.cpu.garbage--;
      }
    }

    window.player.draw();
    if (mode === "vs" && window.cpu) {
      window.cpu.draw();
      updateScores(window.player.score, window.cpu.score);
    } else {
      updateScores(window.player.score, 0);
    } // Check for game over and determine winner
    if (mode === "vs" && window.cpu) {
      if ((window.player.gameOver || window.cpu.gameOver) && window.gameWinner === null) {
        console.log("=== WINNER DETERMINATION (score-based) ===");
        console.log("Player game over:", window.player.gameOver, "Score:", window.player.score);
        console.log("CPU game over:", window.cpu.gameOver, "Score:", window.cpu.score);
        if (window.player.score > window.cpu.score) {
          window.gameWinner = "player";
          console.log("Player wins - Higher score");
        } else if (window.cpu.score > window.player.score) {
          window.gameWinner = "cpu";
          console.log("CPU wins - Higher score");
        } else {
          window.gameWinner = "tie";
          console.log("Tie game - Same scores");
        }
        console.log("Game winner set to:", window.gameWinner);
        console.log("===========================");
      }
    }

    if (mode === "solo") {
      if (!window.player.gameOver) {
        requestAnimationFrame(gameLoop);
      } else {
        plays++;
        showSoloGameOver();
      }
    } else {
      if (!window.player.gameOver && !window.cpu.gameOver) {
        requestAnimationFrame(gameLoop);
      } else {
        // this should post the scores to the parent windowAdd commentMore actions
        window.parent.postMessage(
          {
            type: "gameEnd",
            round: round, // existing `round` variable
            result: window.gameWinner, // 'player', 'cpu' or 'tie'
            score: window.player.score, // final player score
          },
          "*"
        );

        // show the chat
        showChat();
      }
    }
  }

  // --- Input Handling & Utilities ---  // Update score pills and show lead text
  function startTimer() {
    if (gameTimer) return; // Prevent multiple timers
    gameTime = 0;
    gameTimer = setInterval(() => {
      gameTime++;
      const minutes = Math.floor(gameTime / 60);
      const seconds = gameTime % 60;
      const timeText = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
      timerPil.textContent = timeText;

      if (gameTime >= 60) {
        clearInterval(gameTimer);
        if (mode === "solo") {
          window.player.gameOver = true;
        } else {
          window.player.gameOver = true;
          window.cpu.gameOver = true;
        }
      }
    }, 1000);
  }

  // --- Input Handling & Utilities ---  // Update score pills and show lead text
  function updateScores(p, c) {
    // Check for score increases in high competition mode
    const prevP = updateScores.prevPlayerScore || 0;
    const prevC = updateScores.prevCpuScore || 0;
    const playerScoreIncrease = p > prevP;
    const cpuScoreIncrease = c > prevC;

    document.getElementById("playerScorePill").textContent = p;
    if (mode === "vs") {
      document.getElementById("cpuScorePill").textContent = c;
    }
    // Update vertical score bars if present
    const playerBarLabel = document.getElementById("scoreBarPlayerLabel");
    const cpuBarLabel = document.getElementById("scoreBarCpuLabel");
    const cpuNameLabel = document.querySelector(".score-name-cpu");
    if (playerBarLabel) playerBarLabel.textContent = p;
    if (cpuBarLabel && mode === "vs") cpuBarLabel.textContent = c;
    if (cpuNameLabel && mode === "vs") cpuNameLabel.textContent = cpuName;
    // Update mobile score bars data attributes for CSS pseudo-elements
    const scoreBars = document.getElementById("scoreBars");
    if (scoreBars) {
      scoreBars.setAttribute("data-player-score", p);
      if (mode === "vs") {
        scoreBars.setAttribute("data-cpu-score", c);
      }
    }
    // Update mobile pill fill percentages
    if (competition !== "low") {
      const playerPill = document.getElementById("playerPill");
      const cpuPill = document.getElementById("cpuPill");
      if (playerPill || cpuPill) {
        let maxScore = Math.max(1000, p, c);
        if (maxScore === 0) maxScore = 1;
        const playerPct = (p / maxScore) * 100;
        const cpuPct = (c / maxScore) * 100;
        if (playerPill) {
          playerPill.style.setProperty("--fill-percentage", playerPct + "%");
        }
        if (cpuPill && mode === "vs") {
          cpuPill.style.setProperty("--fill-percentage", cpuPct + "%");
        }
      }
    }
    // Animate bar fill heights
    const playerInner = document.getElementById("scoreBarPlayerInner");
    const cpuInner = document.getElementById("scoreBarCpuInner");
    let maxScore = Math.max(1000, p, c);
    if (maxScore === 0) maxScore = 1;
    const playerPct = p / maxScore;
    const cpuPct = c / maxScore;
    if (playerInner) playerInner.style.height = playerPct * 100 + "%";
    if (cpuInner && mode === "vs") cpuInner.style.height = cpuPct * 100 + "%";

    // Add shake effect for score increases in high competition mode
    if (competition === "high") {
      // Shake vertical score bars when scores increase
      if (playerScoreIncrease && scoreBarVertical) {
        const playerBar = document.querySelector(".score-bar.player");
        const playerWrapper = playerBar?.closest(".score-bar-wrapper");
        if (playerWrapper) {
          playerWrapper.classList.remove("score-bar-pulse-shake");
          // Force reflow to restart animation
          playerWrapper.offsetHeight;
          playerWrapper.classList.add("score-bar-pulse-shake");
          setTimeout(() => playerWrapper.classList.remove("score-bar-pulse-shake"), 800);
        }
      }

      if (cpuScoreIncrease && mode === "vs" && scoreBarVertical) {
        const cpuBar = document.querySelector(".score-bar.cpu");
        const cpuWrapper = cpuBar?.closest(".score-bar-wrapper");
        if (cpuWrapper) {
          cpuWrapper.classList.remove("score-bar-pulse-shake");
          // Force reflow to restart animation
          cpuWrapper.offsetHeight;
          cpuWrapper.classList.add("score-bar-pulse-shake");
          setTimeout(() => cpuWrapper.classList.remove("score-bar-pulse-shake"), 800);
        }
      }
      // Shake mobile/horizontal score pills when scores increase
      if (competition !== "low") {
        if (playerScoreIncrease) {
          const playerPill = document.getElementById("playerPill");
          if (playerPill) {
            // Use different animation for mobile vs desktop
            const shakeClass = isMobile ? "score-bar-shake-mobile" : "score-bar-shake";
            const duration = isMobile ? 700 : 600;

            playerPill.classList.remove("score-bar-shake", "score-bar-shake-mobile");
            // Force reflow to restart animation
            playerPill.offsetHeight;
            playerPill.classList.add(shakeClass);
            setTimeout(() => playerPill.classList.remove(shakeClass), duration);
          }
        }
      }

      if (cpuScoreIncrease && mode === "vs") {
        const cpuPill = document.getElementById("cpuPill");
        if (cpuPill) {
          // Use different animation for mobile vs desktop
          const shakeClass = isMobile ? "score-bar-shake-mobile" : "score-bar-shake";
          const duration = isMobile ? 700 : 600;

          cpuPill.classList.remove("score-bar-shake", "score-bar-shake-mobile");
          // Force reflow to restart animation
          cpuPill.offsetHeight;
          cpuPill.classList.add(shakeClass);
          setTimeout(() => cpuPill.classList.remove(shakeClass), duration);
        }
      }
    }

    const lead = document.getElementById("leadText");
    if (mode === "vs" && competition === "high") {
      if (p > c && updateScores.last !== "p") {
        lead.textContent = "PLAYER TAKES THE LEAD!!";
        lead.style.display = "block";
        setTimeout(() => (lead.style.display = "none"), 3000);
        updateScores.last = "p";
      }
      if (c > p && updateScores.last !== "c") {
        lead.textContent = cpuName + " TAKES THE LEAD!!";
        lead.style.display = "block";
        setTimeout(() => (lead.style.display = "none"), 3000);
        updateScores.last = "c";
      }
    }

    // Store current scores for next comparison
    updateScores.prevPlayerScore = p;
    updateScores.prevCpuScore = c;
  }

  updateScores.last = null;
  updateScores.prevPlayerScore = 0;
  updateScores.prevCpuScore = 0;

  // Flash a TETRIS alert
  function triggerTetrisAlert() {
    const overlay = document.getElementById("tetrisOverlay");
    overlay.style.display = "block";
    setTimeout(() => (overlay.style.display = "none"), 1500);
  }

  // Show solo game over screen
  function showSoloGameOver() {
    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      background: "linear-gradient(135deg, #1e1e2f, #2e2e5e)",
      padding: "30px",
      borderRadius: "16px",
      zIndex: "999",
      fontFamily: "Arial, sans-serif",
      color: "#fff",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      minWidth: "320px",
      textAlign: "center",
      border: "2px solid #3a3a5e",
    });

    const title = document.createElement("h2");
    title.textContent = "Game Over!";
    title.style.margin = "0 0 16px 0";
    title.style.fontSize = "2rem";
    title.style.color = "#ff6b6b";
    title.style.textShadow = "0 2px 4px rgba(0,0,0,0.5)";
    const score = document.createElement("div");
    score.textContent = `Final Score: ${window.player.score}`;
    score.style.fontSize = "1.4rem";
    score.style.margin = "0 0 20px 0";
    score.style.fontWeight = "bold";
    score.style.color = "#4ecdc4";

    // playAgain should just be btn or something for clarity but cbf'd for now
    const playAgain = document.createElement("button");
    const isFinal = plays >= 2
    playAgain.textContent = isFinal ? 'Continue' : 'Play Again';
    Object.assign(playAgain.style, {
      backgroundColor: "#4ecdc4",
      color: "#1e1e2f",
      border: "none",
      padding: "12px 24px",
      borderRadius: "8px",
      fontSize: "1.1rem",
      fontWeight: "bold",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(78,205,196,0.3)",
      transition: "all 0.2s ease",
    });

    playAgain.addEventListener("click", () => {
      document.body.removeChild(box);   // hide overlay

      if (!isFinal) {
        // restart round 2
        window.player = new TetrisBoard('playerCanvas', 'human');
        lastTime = performance.now();
        startCountdown();
      } else {
        // after two rounds, go on to the next section
        window.parent.document
              .getElementById('NextButton')
              .click();
        // or if you want to just reload
        // location.reload();

      }
    });

    playAgain.addEventListener("mouseover", () => {
      playAgain.style.backgroundColor = "#45b7b8";
      playAgain.style.transform = "translateY(-2px)";
    });

    playAgain.addEventListener("mouseout", () => {
      playAgain.style.backgroundColor = "#4ecdc4";
      playAgain.style.transform = "translateY(0)";
    });

    box.appendChild(title);
    box.appendChild(score);
    box.appendChild(playAgain);
    document.body.appendChild(box);
  }

  // Show chat interface with typing animation
  function showChat() {
    const chatInterface = document.getElementById("chatInterface");
    const chatTitle = document.getElementById("chatTitle");
    const typingIndicator = document.getElementById("typingIndicator");
    const chatMessages = document.getElementById("chatMessages");
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendButton");
    const chatClose = document.getElementById("chatClose");

    // Update chat title with CPU name
    chatTitle.textContent = `Chat with ${cpuName}`;

    // Show the chat interface
    chatInterface.style.display = "flex";

    // Show typing indicator initially
    typingIndicator.style.display = "flex";
    typingIndicator.querySelector(".typing-text").textContent = `${cpuName} is typing...`;

    // After 2-4 seconds, hide typing and show message
    const typingDelay = Math.random() * 2000 + 2000; // 2-4 seconds
    setTimeout(() => {
      typingIndicator.style.display = "none";
      // Add CPU message
      const cpuMessage = document.createElement("div");
      cpuMessage.className = "message ash"; // Determine who won based on actual game outcome and use passed valence messages
      let text = tieMsg; // Default to tie message
      if (mode === "vs") {
        console.log("=== CHAT DEBUGGING ===");
        console.log("Game winner determined as:", window.gameWinner);
        console.log("Final scores - Player:", window.player.score, "CPU:", window.cpu.score);
        console.log("Player game over:", window.player.gameOver);
        console.log("CPU game over:", window.cpu.gameOver);
        console.log("Available valence messages - Win:", winMsg, "Loss:", lossMsg, "Tie:", tieMsg);
        console.log("====================");
        if (window.gameWinner === "player") {
          text = winMsg; // Player won, so CPU acknowledges player's victory
        } else if (window.gameWinner === "cpu") {
          text = lossMsg; // Player lost, so CPU comments on player's defeat
        } else {
          // Tie or undefined case
          text = tieMsg;
        }
      } else {
        // In solo mode, use win message (positive outcome)
        text = winMsg;
      }
      cpuMessage.textContent = text;
      chatMessages.appendChild(cpuMessage);

      // Send CPU message to parent window for data collection
      const cpuMessageData = {
        type: "opponentChat",
        round: round,
        valence: valence,
        text: text,
        sender: "cpu",
      };

      console.log("=== CPU CHAT DATA COLLECTION DEBUG ===");
      console.log("Sending CPU message with data:", cpuMessageData);
      console.log("CPU message text:", text);
      console.log("======================================");

      window.parent.postMessage(cpuMessageData, "*");

      // Enable input and send button
      messageInput.disabled = false;
      sendButton.disabled = false;
      messageInput.focus();

      // Scroll to bottom
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }, typingDelay);

    // Handle sending messages
    function sendMessage() {
      const text = messageInput.value.trim();
      if (!text) return;

      // Add player message
      const playerMessage = document.createElement("div");
      playerMessage.className = "message player";
      playerMessage.textContent = text;
      chatMessages.appendChild(playerMessage);

      // Clear input and disable controls
      messageInput.value = "";
      messageInput.disabled = true;
      sendButton.disabled = true;

      // Scroll to bottom
      chatMessages.scrollTop = chatMessages.scrollHeight; // Send response to parent window
      const messageData = {
        type: "chatResponse",
        round: round,
        valence: valence,
        text: text,
        sender: "player",
      };

      console.log("=== PLAYER CHAT DATA COLLECTION DEBUG ===");
      console.log("Sending postMessage with data:", messageData);
      console.log("Round:", round, "Type:", typeof round);
      console.log("Valence:", valence);
      console.log("Text:", text);
      console.log("Parent window exists:", window.parent !== window);
      console.log("=========================================");

      window.parent.postMessage(messageData, "*");
    }

    // Send button click handler
    sendButton.addEventListener("click", sendMessage);

    // Enter key handler
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !messageInput.disabled) {
        sendMessage();
      }
    });

    // Close button handler
    chatClose.addEventListener("click", () => {
      chatInterface.style.display = "none";
    });
  }

  // Desktop keyboard controls
  document.addEventListener("keydown", (e) => {
    if (window.player?.gameOver) return;
    switch (e.key) {
      case "a":
      case "ArrowLeft":
        window.player.move(-1, 0);
        break;
      case "d":
      case "ArrowRight":
        window.player.move(1, 0);
        break;
      case "s":
      case "ArrowDown":
        window.player.move(0, 1);
        break;
      case "w":
      case "ArrowUp":
        window.player.rotate();
        break;
      case " ":
        window.player.hardDrop();
        break;
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") window.player.hold();
  });

  // Mouse/touch drag & tap on player canvas
  let dragStartX = null;
  const pc = document.getElementById("playerCanvas");
  pc.addEventListener("pointerdown", (e) => {
    if (window.player?.gameOver) return;
    dragStartX = e.clientX;
    pc.setPointerCapture(e.pointerId);
  });
  pc.addEventListener("pointermove", (e) => {
    if (dragStartX === null) return;
    const dx = e.clientX - dragStartX;
    const cell = pc.clientWidth / 10;
    if (dx > cell) {
      window.player.move(1, 0);
      dragStartX = e.clientX;
    }
    if (dx < -cell) {
      window.player.move(-1, 0);
      dragStartX = e.clientX;
    }
  });
  pc.addEventListener("pointerup", (e) => {
    if (dragStartX !== null) {
      if (Math.abs(e.clientX - dragStartX) < 5) window.player.rotate();
      dragStartX = null;
    }
  });
  // Mobile control buttons
  document.querySelectorAll("#mobileControls button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      switch (cmd) {
        case "moveLeft":
          window.player.move(-1, 0);
          break;
        case "moveDown":
          window.player.move(0, 1);
          break;
        case "moveRight":
          window.player.move(1, 0);
          break;
        case "rotate":
          window.player.rotate();
          break;
        case "hardDrop":
          window.player.hardDrop();
          break;
        case "hold":
          window.player.hold();
          break;
      }
    });
  }); // --- Make Desktop Controls Functional ---
  document.getElementById("holdButton").onclick = () => {
    if (!window.player?.gameOver) window.player.hold();
  };
  document.getElementById("moveLeft").onclick = () => {
    if (!window.player?.gameOver) window.player.move(-1, 0);
  };
  document.getElementById("moveDown").onclick = () => {
    if (!window.player?.gameOver) window.player.move(0, 1);
  };
  document.getElementById("moveRight").onclick = () => {
    if (!window.player?.gameOver) window.player.move(1, 0);
  };
  document.getElementById("rotateButton").onclick = () => {
    if (!window.player?.gameOver) window.player.rotate();
  };
  document.getElementById("dropButton").onclick = () => {
    if (!window.player?.gameOver) window.player.hardDrop();
  };
})();
