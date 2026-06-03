let handPose;
let video;
let hands = [];
let numbers = [];
let particles = [];
let bgDecorations = []; // 背景幾何裝飾
let floatTexts = [];
let trail = []; // 用於記錄手指的拖影軌跡
let score = 0;
let displayScore = 0; // 用於分數平滑動畫
let gameState = 'start';
let maxTime = 45; // 定義最大時間
let playMode = 'hand'; // 'hand' 視訊手指模式, 'mouse' 滑鼠模式
let timer = maxTime;
let lastTime = 0;
let synth; // 合成器，用於發出音效
let mouseJustClicked = false; // 用於捕捉滑鼠瞬間點擊
let targetScore = 100; // 通關目標分數
let combo = 0; // 連擊數
let maxCombo = 0; // 最大連擊數
let screenShake = 0; // 畫面震動強度
let isFever = false; // 狂熱模式
let bgmEnabled = true; // 背景音樂開關
let sfxEnabled = true; // 音效開關
let bassSynth, bassFilter; // 用於生成 Cyberpunk BGM
let bgmStep = 0;
let bgmPattern = ['C2', 'C2', 'G2', 'C2', 'D#2', 'C2', 'F2', 'D#2']; // Synthwave Bass 節奏
let lastBgmTime = 0;
let clickZones = []; // 紀錄畫面上所有可點擊的按鈕區域
let prevFever = false;
let highScore = 0; // 本機最高分

// 全域色票設定
let cBg, cPanel, cEven, cOdd, cBonus, cText;

// 五聲音階，用於 Combo 連擊時的音調攀升
let pentaNotes = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7'];

function preload() {
  // 載入模型，限制只偵測一隻手以大幅提升效能
  handPose = ml5.handPose({ flipped: true, maxHands: 1 });
}

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  
  // 停用右鍵選單，讓滑鼠右鍵也能順暢遊玩
  canvas.elt.oncontextmenu = () => false;

  // 啟動視訊，維持較低解析度給 AI 運算以保持流暢，但畫面會放大到全螢幕
  video = createCapture(VIDEO, { flipped: true });
  video.size(640, 480);
  video.hide();
  
  // 持續偵測手部
  handPose.detectStart(video, results => {
    hands = results;
  });
  
  // 初始化音效與配樂系統
  initAudio();
  textAlign(CENTER, CENTER);

  // 嘗試讀取本地最高分
  let savedScore = getItem('cyberpunk_highscore');
  if (savedScore !== null) {
    highScore = savedScore;
  }
  
  // 初始化霓虹科幻色票
  cBg = color('#050814');      // 極深邃的星空黑
  cPanel = color('#0f172a');   // 暗藍色面板
  cEven = color('#00f3ff');    // 霓虹青
  cOdd = color('#ff007f');     // 霓虹粉紅
  cBonus = color('#ffea00');   // 霓虹金
  cText = color('#ffffff');

  // 初始化背景光塵
  for (let i = 0; i < 40; i++) {
    bgDecorations.push({
      x: random(windowWidth),
      y: random(windowHeight),
      r: random(2, 6),
      speedY: random(-0.2, -1.5),
      alpha: random(50, 150)
    });
  }
}

function draw() {
  clickZones = []; // 每個 frame 重新計算按鈕區域

  // 背景：將 640x480 的視訊拉伸/映射到全螢幕
  image(video, 0, 0, width, height);
  
  // 加上深色系半透明遮罩，Fever 模式下背景會稍微泛金光
  let overlay = color(cBg);
  overlay.setAlpha(isFever ? 200 : 230);
  background(overlay);

  // 繪製背景星塵
  push();
  noFill();
  for (let b of bgDecorations) {
    b.y += b.speedY * (isFever ? 3 : 1); // 狂熱模式粒子加速
    if (b.y < -50) {
      b.y = height + 50;
      b.x = random(width);
    }
    drawingContext.shadowBlur = 10;
    drawingContext.shadowColor = (isFever ? cBonus : cEven).toString();
    fill(255, b.alpha);
    circle(b.x, b.y, b.r);
  }
  pop();

  // 畫面震動特效 (利用 push/pop 包覆整個遊戲畫面)
  push();
  if (screenShake > 0.5) {
    translate(random(-screenShake, screenShake), random(-screenShake, screenShake));
    screenShake *= 0.9; // 震動逐漸衰減
  }

  // Fever 畫面特效
  if (isFever) {
    push();
    noFill();
    strokeWeight(15 + sin(frameCount * 0.3) * 10);
    stroke(cBonus);
    drawingContext.shadowBlur = 30;
    drawingContext.shadowColor = cBonus.toString();
    rect(width/2, height/2, width, height);
    pop();
  }

  // 取得座標並映射到全螢幕
  let pointer = null;
  let isActionActive = false; // 紀錄是否正在點擊或觸碰
  
  if (playMode === 'hand') {
    if (hands.length > 0) {
      let indexFinger = hands[0].index_finger_tip;
      pointer = {
        x: map(indexFinger.x, 0, 640, 0, width),
        y: map(indexFinger.y, 0, 480, 0, height)
      };
      isActionActive = true; // 手指模式下隨時都在觸碰
    }
  } else if (playMode === 'mouse') {
    pointer = { x: mouseX, y: mouseY };
    isActionActive = mouseIsPressed || mouseJustClicked; // 滑鼠模式下必須按著或點擊才算觸碰
    mouseJustClicked = false; // 判定後重置點擊狀態
  }

  if (gameState === 'start') {
    drawStartScreen();
  } else if (gameState === 'play') {
    playGame(pointer, isActionActive);
  } else if (gameState === 'end') {
    drawEndScreen();
  }
  
  // 畫出光暈游標 (任何狀態都顯示，增加互動感)
  if (pointer) drawPointer(pointer.x, pointer.y, isActionActive);
  pop(); // 結束震動影響範圍
}

// ================= 遊戲狀態處理 =================

function drawButton(txt, x, y, w, h, onClick, isHighlight = false) {
  // 判斷滑鼠是否懸停
  let isHover = mouseX > x - w/2 && mouseX < x + w/2 && mouseY > y - h/2 && mouseY < y + h/2;
  push();
  rectMode(CENTER);
  if (isHover || isHighlight) {
    fill(cBonus);
    stroke(255);
    drawingContext.shadowBlur = 20;
    drawingContext.shadowColor = cBonus.toString();
  } else {
    fill(cPanel);
    stroke(cEven);
    drawingContext.shadowBlur = 10;
    drawingContext.shadowColor = cEven.toString();
  }
  strokeWeight(2);
  rect(x, y, w, h, 10);
  
  noStroke();
  drawingContext.shadowBlur = 0;
  fill(isHover || isHighlight ? 0 : 255);
  textSize(h * 0.45);
  textFont('Noto Sans TC');
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  text(txt, x, y);
  pop();
  
  // 註冊按鈕點擊區域與事件
  clickZones.push({ x: x - w/2, y: y - h/2, w: w, h: h, action: onClick });
}

function drawStartScreen() {
  push();
  // 畫圓角半透明對話框
  textFont('Noto Sans TC');
  let panelColor = color(cPanel);
  panelColor.setAlpha(210);
  fill(panelColor);
  stroke(cEven);
  strokeWeight(3);
  drawingContext.shadowBlur = 40;
  drawingContext.shadowColor = cEven.toString();
  rectMode(CENTER);
  rect(width / 2, height / 2, Math.min(width * 0.9, 850), 680, 30);
  
  drawingContext.shadowBlur = 0; // 重置陰影避免影響其他物件
  noStroke();
  fill(cText);
  textSize(50);
  textStyle(BOLD);
  text("✨ 數字指指看 ✨", width / 2, height / 2 - 260);
  
  fill(cBonus);
  textSize(20);
  textFont('Orbitron');
  text(`🏆 本機最高分：${highScore} 分`, width / 2, height / 2 - 210);
  
  fill(255, 200);
  textSize(24);
  textStyle(NORMAL);
  textFont('Orbitron'); // 混用字體增加科技感
  text(`目標：在 ${maxTime} 秒內突破 ${targetScore} 分！`, width / 2, height / 2 - 170);
  
  // 提前通關提示
  textSize(22);
  fill(cBonus);
  textFont('Noto Sans TC');
  text(`👑 隱藏目標：達到 180 分即可提前 S 級通關！`, width / 2, height / 2 - 150);
  
  // 規則說明區
  textSize(26);
  fill(cText);
  let actionText = playMode === 'hand' ? "手指碰到" : "滑鼠點擊";
  text(`🔵 ${actionText}【偶數】 👉 加分 & 累積 Combo！`, width / 2, height / 2 - 90);
  fill(cBonus);
  text(`🌟 ${actionText}【金色 偶數】 👉 分數兩倍！`, width / 2, height / 2 - 40);
  fill(cOdd);
  text(`❌ ${actionText}【奇數】 👉 扣分 & 破壞 Combo！`, width / 2, height / 2 + 10);
  
  // UI 設定按鈕與開始按鈕
  drawButton('🎵 配樂: ' + (bgmEnabled ? 'ON' : 'OFF'), width / 2 - 110, height / 2 + 100, 180, 45, () => bgmEnabled = !bgmEnabled);
  drawButton('🔊 音效: ' + (sfxEnabled ? 'ON' : 'OFF'), width / 2 + 110, height / 2 + 100, 180, 45, () => sfxEnabled = !sfxEnabled);
  
  drawButton('🕹️ 操作模式: ' + (playMode === 'hand' ? '✋ 視訊追蹤' : '🖱️ 滑鼠點擊'), width / 2, height / 2 + 170, 400, 45, () => {
    playMode = playMode === 'hand' ? 'mouse' : 'hand';
  });
  
  drawButton('🚀 開始遊戲', width / 2, height / 2 + 250, 300, 60, () => startGame(), true);
  pop();
}

function playGame(pointer, isActionActive) {
  isFever = (combo >= 10); // 更新 Fever 狀態
  
  // 背景音樂 Synthwave Loop (獨立於 frameRate，確保節奏穩定)
  if (bgmEnabled && millis() - lastBgmTime > 130) {
    let note = bgmPattern[bgmStep % bgmPattern.length];
    let velocity = isFever ? 0.8 : 0.4;
    bassFilter.freq(isFever ? 2500 : 400); // Fever 時解開 Filter 釋放能量
    bassSynth.play(note, velocity, 0, 0.1);
    bgmStep++;
    lastBgmTime = millis();
  }
  
  if (isFever && !prevFever) {
    playSound('fever_start');
    floatTexts.push({x: width/2, y: height/2, txt: "🔥 FEVER TIME! 🔥", c: cBonus, alpha: 255, s: 2.0});
  }
  prevFever = isFever;

  // 平滑分數顯示
  displayScore = lerp(displayScore, score, 0.15);

  // 倒數計時邏輯
  if (millis() - lastTime > 1000) {
    timer--;
    lastTime = millis();
    if (timer <= 10 && timer > 0) playSound('tick');
  }
  
  // 動態難度與產生邏輯
  let spawnRate = isFever ? 25 : 40; // Fever 時掉落超快
  if (frameCount % spawnRate === 0) spawnNumber();
  if (timer <= 20 && frameCount % 50 === 0) spawnNumber();

  // 緊張感倒數特效：背景出現跳動的巨大數字與紅光
  if (timer <= 10 && timer > 0) {
    push();
    let dangerAlpha = 20 + sin(frameCount * 0.3) * 30;
    fill(cOdd.levels[0], cOdd.levels[1], cOdd.levels[2], dangerAlpha);
    rect(0, 0, width, height);
    
    fill(cOdd.levels[0], cOdd.levels[1], cOdd.levels[2], 60);
    textFont('Orbitron');
    textSize(min(width, height) * 0.8);
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    text(timer, width/2, height/2);
    pop();
  }

  if (timer <= 0 || score >= 180) {
    gameState = 'end';
    // 更新最高分紀錄
    if (score > highScore) {
      highScore = score;
      try { storeItem('cyberpunk_highscore', highScore); } catch(e){}
    }
    playSound(score >= targetScore || score >= 180 ? 'win' : 'lose');
  }

  // 顯示分數與時間
  drawUI();

  // 處理與繪製掉落的數字
  for (let i = numbers.length - 1; i >= 0; i--) {
    let n = numbers[i];
    
    // 動態速度
    let currentSpeed = (timer <= 10 || isFever) ? n.speed * 1.3 : n.speed;
    let currentSway = isFever ? 4 : 2;
    n.y += currentSpeed;
    n.x += sin(frameCount * 0.05 + n.phase) * currentSway;
    n.rot += n.rotSpeed; 
    
    // 畫數字泡泡 (空心霓虹玻璃感)
    push();
    translate(n.x, n.y);
    rotate(n.rot);
    let bubbleColor = n.isBonus ? cBonus : (n.isEven ? cEven : cOdd);
    
    // 霓虹外發光
    drawingContext.shadowBlur = n.isBonus ? 30 + sin(frameCount * 0.2) * 20 : 25; 
    drawingContext.shadowColor = bubbleColor.toString();
    
    fill(0, 0, 0, 150); // 暗色微透明核心
    stroke(bubbleColor);
    strokeWeight(n.isBonus ? 5 : 3);
    
    let sides = n.sides;
    beginShape();
    for(let a = 0; a < TWO_PI; a += TWO_PI / sides) {
      vertex(cos(a) * n.r, sin(a) * n.r);
    }
    endShape(CLOSE);
    pop();
    
    // 數字繪製 (使用科技字體)
    push();
    drawingContext.shadowBlur = 15;
    drawingContext.shadowColor = bubbleColor.toString();
    fill(255);
    textFont('Orbitron');
    textSize(n.r * 0.9);
    textStyle(BOLD);
    text(n.val, n.x, n.y);
    pop();

    // 檢查碰撞 (必須要有 pointer 且 點擊/觸碰狀態為 true)
    let hit = false;
    if (pointer && isActionActive) {
      let d = dist(pointer.x, pointer.y, n.x, n.y);
      if (d < n.r + 25) { 
        hit = true;
        if (n.isEven) {
          combo++;
          let bonus = floor(combo / 3) * 5; // 每 3 Combo 多 5 分
          let points = (10 + bonus) * (n.isBonus ? 2 : 1);
          score += points;
          createSparks(n.x, n.y, bubbleColor, n.isBonus ? 40 : 20); // 生成雷射火花
          let txt = n.isBonus ? `+${points} BONUS!` : `+${points}`;
          floatTexts.push({x: n.x, y: n.y, txt: txt, c: n.isBonus ? cBonus : cEven, alpha: 255, s: 1.0});
          if (combo >= 3) {
            floatTexts.push({x: n.x, y: n.y - 40, txt: `${combo} COMBO!`, c: cBonus, alpha: 255, s: 1.5});
          }
          if (combo > maxCombo) maxCombo = combo;
          playSound('correct', combo); // 傳入 combo 提升音階
        } else {
          combo = 0;
          score -= 10;
          screenShake = 25; // 觸發強烈震動
          createSparks(n.x, n.y, cOdd, 30);
          floatTexts.push({x: n.x, y: n.y, txt: "-10", c: cOdd, alpha: 255, s: 1.2});
          playSound('wrong');
        }
      }
    }

    // 如果被碰到或是掉出畫面底部，就從陣列中移除
    if (hit || n.y > height + n.r) {
      if (!hit && n.isEven && n.y > height + n.r) {
        combo = 0; // 漏接正確的偶數，Combo 歸零！
      }
      numbers.splice(i, 1);
    }
  }
  
  // 更新與繪製特效
  updateParticles();
  updateFloatTexts();
}

function drawEndScreen() {
  push();
  textFont('Noto Sans TC');
  let panelColor = color(cPanel);
  panelColor.setAlpha(240);
  fill(panelColor);
  let isWin = score >= targetScore || score >= 180;
  stroke(isWin ? cEven : cOdd);
  strokeWeight(4);
  drawingContext.shadowBlur = 40;
  drawingContext.shadowColor = (isWin ? cEven : cOdd).toString();
  rectMode(CENTER);
  rect(width / 2, height / 2, 600, 580, 30);
  
  let titleText = "💥 挑戰失敗 💥";
  if (score >= 180) titleText = "👑 S級 完美通關 👑";
  else if (score >= targetScore) titleText = "🎉 挑戰成功！ 🎉";

  drawingContext.shadowBlur = 0;
  noStroke();
  fill(isWin ? cBonus : cText);
  textSize(50);
  textStyle(BOLD);
  text(titleText, width / 2, height / 2 - 180);
  
  textSize(24);
  fill(200);
  text(`目標分數: ${targetScore}`, width / 2, height / 2 - 110);
  
  let rank = "C級 請多讀書 📚";
  if (score >= 180) rank = "S級 你超棒 🏆";
  else if (score >= 150) rank = "A級 很不錯 🌟";
  else if (score >= targetScore) rank = "B級 要加油 👍";
  
  textSize(55);
  fill(isWin ? cEven : cOdd);
  textFont('Orbitron');
  text(`總分: ${score} 分`, width / 2, height / 2 - 40);
  
  textSize(24);
  fill(cBonus);
  text(`最大連擊: ${maxCombo} COMBO`, width / 2, height / 2 + 25);
  
  // 破紀錄提示
  if (score >= highScore && score > 0) {
    fill(cOdd);
    textStyle(BOLD);
    text(`🔥 NEW RECORD! 🔥`, width / 2, height / 2 + 65);
  }
  
  textSize(32);
  fill(255);
  textFont('Noto Sans TC');
  text(`評價: ${rank}`, width / 2, height / 2 + 115);
  
  // 按鈕區
  drawButton('🕹️ 操作模式: ' + (playMode === 'hand' ? '✋ 視訊' : '🖱️ 滑鼠'), width / 2, height / 2 + 180, 350, 45, () => {
    playMode = playMode === 'hand' ? 'mouse' : 'hand';
  });
  drawButton('🔄 再次挑戰', width / 2, height / 2 + 250, 300, 60, () => startGame(), true);
  pop();
}

function startGame() {
  gameState = 'play';
  score = 0;
  displayScore = 0;
  combo = 0;
  maxCombo = 0;
  screenShake = 0;
  timer = maxTime;
  numbers = [];
  particles = [];
  floatTexts = [];
  trail = [];
  lastTime = millis();
  lastBgmTime = millis();
}

// ================= 使用者互動 =================

function mousePressed() {
  userStartAudio(); 
  
  let clickedUI = false;
  // 檢查所有互動按鈕
  for (let z of clickZones) {
    if (mouseX >= z.x && mouseX <= z.x + z.w && mouseY >= z.y && mouseY <= z.y + z.h) {
      z.action();
      playSound('ui_click');
      clickedUI = true;
      break; // 確保每次點擊只觸發一個按鈕
    }
  }
  
  // 如果沒有點擊在 UI 上，才算作遊戲中的實體點擊
  if (!clickedUI) {
    mouseJustClicked = true;
  }
}

// 監聽鍵盤按鍵來切換模式
function keyPressed() {
  if (key === ' ' || keyCode === 32) {
    playMode = playMode === 'hand' ? 'mouse' : 'hand';
  }
}

// 當視窗大小改變時，自動調整畫布
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ================= 物件與特效邏輯 =================

function spawnNumber() {
  // 強制 60% 機率出偶數，40% 機率出奇數
  let isEven = random() < 0.6;
  let val;
  if (isEven) {
    val = floor(random(1, 50)) * 2; // 2 ~ 98 之間的偶數
  } else {
    val = floor(random(0, 50)) * 2 + 1; // 1 ~ 99 之間的奇數
  }
  
  numbers.push({
    x: random(100, width - 100),
    y: -50,
    val: val,
    isEven: isEven,
    isBonus: isEven && random() < 0.15, // 15% 機率為 Bonus 偶數
    r: random(40, 60), // 稍微變化大小
    speed: random(3.0, 6.0), // 掉落速度微調
    phase: random(TWO_PI), // 給 sin 用的初始相位
    rot: random(TWO_PI),   // 自轉角度
    rotSpeed: random(-0.05, 0.05), // 自轉速度
    sides: floor(random(3, 8)) // 隨機 3 到 7 邊形
  });
  
  if (numbers[numbers.length - 1].isBonus) {
    playSound('bonus_spawn'); // Bonus 出現時有專屬提示音
  }
}

function drawUI() {
  push();
  textFont('Orbitron');
  // 分數與時間底框
  let uiBg = color(cPanel);
  uiBg.setAlpha(200);
  fill(uiBg);
  stroke(isFever ? cBonus : cEven);
  strokeWeight(2);
  drawingContext.shadowBlur = 15;
  drawingContext.shadowColor = (isFever ? cBonus : cEven).toString();
  rect(10, 10, 220, 70, 15);
  rect(width - 190, 10, 180, 70, 15);
  
  // 目標進度條
  drawingContext.shadowBlur = 5;
  let progress = map(score, 0, targetScore, 0, 160);
  progress = constrain(progress, 0, 160);
  noStroke();
  fill(50, 50, 50);
  rect(20, 85, 200, 10, 5); // 底條
  let barColor = score >= targetScore ? cBonus : cEven;
  drawingContext.shadowColor = barColor.toString();
  fill(barColor);
  rect(20, 85, map(displayScore, 0, targetScore, 0, 200), 10, 5); // 動態進度
  
  drawingContext.shadowBlur = 0;
  fill(cText);
  textSize(36);
  textStyle(BOLD);
  textAlign(LEFT, CENTER);
  text(`SCORE: ${floor(displayScore)}`, 25, 45);
  textAlign(RIGHT, CENTER);
  fill(timer <= 10 ? cOdd : cEven);
  text(`TIME: ${timer}s`, width - 25, 45);
  
  // 畫面底部顯示當前遊玩模式
  textFont('Noto Sans TC');
  let modeText = playMode === 'hand' ? '✋ 當前模式: 視訊手指追蹤' : '🖱️ 當前模式: 滑鼠操作 (左右鍵皆可)';
  let modeBg = color(cPanel);
  modeBg.setAlpha(200);
  fill(modeBg);
  rect(width / 2, height - 30, 380, 40, 15);
  noStroke();
  fill(cText);
  textSize(18);
  textAlign(CENTER, CENTER);
  text(modeText, width / 2, height - 30);
  pop();
}

function drawPointer(x, y, isActive) {
  // 更新拖影
  trail.push({x: x, y: y, alpha: 255});
  if (trail.length > 15) trail.shift();
  
  push();
  noStroke();
  // 畫拖影
  for (let i = 0; i < trail.length; i++) {
    let p = trail[i];
    fill(cEven.levels[0], cEven.levels[1], cEven.levels[2], p.alpha * (i / trail.length) * 0.5);
    circle(p.x, p.y, 15 * (i / trail.length));
  }
  
  // 雷達準星特效
  let targetColor = isActive ? cEven : color(150);
  drawingContext.shadowBlur = 15;
  drawingContext.shadowColor = targetColor.toString();
  stroke(targetColor);
  strokeWeight(3);
  noFill();
  let ringSize = isActive ? 50 + sin(frameCount * 0.5) * 10 : 30;
  circle(x, y, ringSize);
  line(x - 10, y, x + 10, y);
  line(x, y - 10, x, y + 10);
  pop();
}

function createSparks(x, y, baseColor, amount = 20) {
  for (let i = 0; i < amount; i++) {
    let angle = random(TWO_PI);
    let speed = random(5, 20);
    particles.push({
      x: x, y: y,
      vx: cos(angle) * speed, vy: sin(angle) * speed, 
      c: color(baseColor.toString()), // 複製顏色
      life: 255,
      weight: random(2, 6)
    });
  }
}

function updateParticles() {
  push();
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.92; // 阻力
    p.vy *= 0.92; 
    p.life -= 12; // 快速消散
    
    p.c.setAlpha(p.life);
    stroke(p.c);
    strokeWeight(p.weight);
    drawingContext.shadowBlur = 10;
    drawingContext.shadowColor = p.c.toString();
    
    // 畫出光速線條
    line(p.x, p.y, p.x - p.vx * 2, p.y - p.vy * 2);
    
    if (p.life <= 0) particles.splice(i, 1);
  }
  pop();
}

function updateFloatTexts() {
  textStyle(BOLD);
  textFont('Orbitron'); // 浮動字體也用科技風
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    let ft = floatTexts[i];
    ft.y -= 2;
    ft.alpha -= 5;
    ft.s += 0.02; // 稍微放大
    ft.c.setAlpha(ft.alpha);
    fill(ft.c);
    drawingContext.shadowBlur = 15;
    drawingContext.shadowColor = ft.c.toString();
    textSize(36 * ft.s);
    text(ft.txt, ft.x, ft.y);
    if (ft.alpha <= 0) floatTexts.splice(i, 1);
  }
}

function initAudio() {
  synth = new p5.PolySynth();
  bassSynth = new p5.MonoSynth();
  bassFilter = new p5.LowPass();
  bassFilter.freq(400);
  bassSynth.disconnect();
  bassSynth.connect(bassFilter); // 將 Bass 加入低通濾波，製造悶悶的電子感
}

function playSound(type, hitCombo = 0) {
  if (!synth || !sfxEnabled) return;
  if (type === 'correct') {
    // 根據 Combo 數來爬升音階，產生極度舒適的疊加感
    let noteIndex = min(hitCombo, pentaNotes.length - 1);
    let note = pentaNotes[noteIndex];
    synth.play(note, 0.8, 0, 0.15);
  } else if (type === 'wrong') {
    synth.play('C3', 0.8, 0, 0.2);
    setTimeout(() => synth.play('G2', 0.8, 0, 0.3), 100);
  } else if (type === 'tick') {
    synth.play('C6', 0.3, 0, 0.05);
  } else if (type === 'ui_click') {
    synth.play('E5', 0.5, 0, 0.05);
  } else if (type === 'bonus_spawn') {
    synth.play('C6', 0.1, 0, 0.1);
  } else if (type === 'fever_start') {
    // Fever 進入時的特殊高潮和弦音效
    synth.play('G5', 0.5, 0, 0.1);
    setTimeout(() => { if(sfxEnabled) synth.play('C6', 0.5, 0, 0.1); }, 100);
    setTimeout(() => { if(sfxEnabled) synth.play('E6', 0.5, 0, 0.2); }, 200);
  } else if (type === 'end') {
    synth.play('C5', 0.8, 0, 0.2);
    setTimeout(() => synth.play('E5', 0.8, 0, 0.2), 200);
    setTimeout(() => synth.play('G5', 0.8, 0, 0.2), 400);
    setTimeout(() => synth.play('C6', 0.8, 0, 0.4), 600);
  } else if (type === 'lose') {
    synth.play('G3', 0.8, 0, 0.3);
    setTimeout(() => synth.play('E3', 0.8, 0, 0.3), 300);
    setTimeout(() => synth.play('C3', 0.8, 0, 0.6), 600);
  }
}
