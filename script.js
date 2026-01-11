// --- 状態変数 ---
let allData = []; 
let groupList = ["Default"]; // ユーザーが手動作成したグループ
let currentDeck = [];
let currentMode = "word"; 
let currentLevel = 1;
let currentXP = 0;
let currentQuestion = null;
let isProcessing = false;
let mySpirits = []; 
let stageStats = { totalTime: 0, questionCount: 0, retryCount: 0 };
let questionStartTime = 0;

// ショップ用
let myInventory = ["theme_default"];
let equippedTheme = "theme_default";
let lastSaveTime = Date.now();

// --- 起動処理 ---
window.onload = function() {
    try {
        loadData();      
        updateDataList(); // ここでデータを読み込み
        
        showPage('home');
        renderTerrarium();
        updateStatsUI();
        renderGroupOptions(); // ★データを読み込んだ後にリスト更新
        applyTheme(equippedTheme);
        checkIdleBonus();

    } catch (e) {
        console.error(e);
        if(typeof defaultData === 'undefined') {
            alert("エラー: data.js が読み込めません。");
        }
    }
};

// --- ★プレイリスト選択肢の表示（自動検出対応版） ---
function renderGroupOptions() {
    const questSelect = document.getElementById("quest-playlist-select");
    const addSelect = document.getElementById("add-target-group");
    if(!questSelect || !addSelect) return;

    questSelect.innerHTML = '<option value="all">全ての問題 (All)</option>';
    addSelect.innerHTML = '';

    // 1. データ内に存在する全てのグループ名を抽出して重複を消す
    const dataGroups = [...new Set(allData.map(d => d.group))];
    
    // 2. ユーザーが作成した(がまだデータがない)グループと合体
    // "Default" は必ず含める
    const allGroups = [...new Set(["Default", ...groupList, ...dataGroups])];

    // 3. 除外リスト（ショップで売る予定のグループは隠す場合など）
    // 今回は「Shop_」で始まるものは、購入済みチェックを通す
    
    // 定義：ショップアイテムID -> グループ名 の対応表
    const unlockMap = {
        "book_verbs": "Shop_Verbs",
        "book_part5_drill": "Shop_Part5_Drill"
    };
    // 購入済みグループのリストを作る
    const unlockedGroups = Object.keys(unlockMap)
        .filter(id => myInventory.includes(id))
        .map(id => unlockMap[id]);

    allGroups.forEach(group => {
        // 「Shop_」で始まるグループは、購入済みリストになければ表示しない
        if (group.startsWith("Shop_") && !unlockedGroups.includes(group)) {
            return; 
        }

        // クエスト画面用
        const opt1 = document.createElement("option");
        opt1.value = group;
        opt1.innerText = group;
        // ショップ購入分は色を変える
        if (group.startsWith("Shop_")) opt1.style.color = "#d35400";
        questSelect.appendChild(opt1);

        // 管理画面用（Shop系以外は追加可能にする）
        if (!group.startsWith("Shop_")) {
            const opt2 = document.createElement("option");
            opt2.value = group;
            opt2.innerText = group;
            addSelect.appendChild(opt2);
        }
    });
}

// --- ページ切り替え ---
function showPage(pageId) {
    isProcessing = false;
    enableButtons(true);

    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));

    document.getElementById(`page-${pageId}`).classList.add('active');
    
    if(pageId === 'home') navButtons[0]?.classList.add('active');
    if(pageId === 'manage') navButtons[1]?.classList.add('active');

    if(pageId === 'home') { renderTerrarium(); updateStatsUI(); }
    if(pageId === 'quest') { exitQuest(); }
    if(pageId === 'zukan') { renderZukan(); }
    if(pageId === 'shop') { renderShop(); }
}

// --- 放置ボーナス ---
function checkIdleBonus() {
    if (mySpirits.length === 0) return;
    const now = Date.now();
    const diffMinutes = Math.floor((now - lastSaveTime) / (1000 * 60));
    if (diffMinutes >= 1) {
        const totalLevels = mySpirits.reduce((sum, s) => sum + (s.level || 1), 0);
        const bonusXP = diffMinutes * totalLevels; 
        if (bonusXP > 0) {
            currentXP += bonusXP;
            saveGameStats();
            updateStatsUI();
            setTimeout(() => {
                alert(`【おかえりなさい！】\nコトダマたちが探索して\n${bonusXP} XPを見つけてきました！`);
            }, 500);
        }
    }
}

// --- テラリウム ---
function renderTerrarium() {
    const area = document.getElementById("terrarium-container");
    if(!area) return;
    area.innerHTML = ""; 
    if (!mySpirits || mySpirits.length === 0) {
        area.style.justifyContent = "center"; area.style.alignItems = "center";
        area.innerHTML = "<div style='color:white; font-weight:bold; text-shadow:0 0 5px rgba(0,0,0,0.2);'>クエストをクリアして<br>仲間を集めよう！</div>";
        return;
    }
    area.style.justifyContent = "flex-start"; area.style.alignItems = "flex-end";
    mySpirits.forEach((spirit, index) => {
        const el = document.createElement("div");
        el.className = `spirit ${spirit.css}`;
        const lv = spirit.level || 1;
        const badgeHtml = lv > 1 ? `<span class="lvl-badge">Lv.${lv}</span>` : "";
        el.innerHTML = `${badgeHtml}${spirit.char}`;
        const size = 40 + (lv - 1) * 2;
        el.style.fontSize = `${size}px`;
        const delay = Math.random() * 2;
        el.style.animationDelay = `-${delay}s`;
        el.onclick = () => { alert(`【${spirit.name}】\nLv.${lv}\nタイプ: ${spirit.char}\n「もっと強くなりたいな！」`); };
        area.appendChild(el);
    });
}

// --- 図鑑 ---
function renderZukan() {
    const container = document.getElementById("zukan-container");
    if(!container) return;
    container.innerHTML = "";
    const masterSpiritList = [
        { char: "🐇", name: "瞬速のウサギ", desc: "回答スピードが速いと現れる。" },
        { char: "🐢", name: "堅実なカメ", desc: "間違いを直して粘り強く解くと現れる。" },
        { char: "🦉", name: "月光のフクロウ", desc: "夜（20時〜5時）に勉強すると現れる。" },
        { char: "🐕", name: "忠実なイヌ", desc: "バランス良く勉強すると現れる。" }
    ];
    masterSpiritList.forEach(item => {
        const found = mySpirits.find(s => s.char === item.char);
        const div = document.createElement("div");
        if (found) {
            div.className = "zukan-item";
            const maxLv = mySpirits.filter(s => s.char === item.char).reduce((max, s) => Math.max(max, s.level || 1), 0);
            div.innerHTML = `<div class="zukan-icon">${item.char}</div><h4>${item.name}</h4><p>Max Lv.${maxLv}</p><p>${item.desc}</p>`;
        } else {
            div.className = "zukan-item locked";
            div.innerHTML = `<div class="zukan-icon">${item.char}</div><h4>???</h4><p>発見条件: 秘密</p><p>${item.desc}</p>`;
        }
        container.appendChild(div);
    });
}

// --- ショップ ---
function renderShop() {
    const container = document.getElementById("shop-container");
    container.innerHTML = "";
    document.getElementById("shop-xp").innerText = currentXP;
    const shopItems = [
        { id: "book_verbs", name: "📕 頻出動詞セット", type: "book", cost: 500, desc: "TOEICによく出る動詞", unlockGroup: "Shop_Verbs" },
        { id: "book_part5_drill", name: "📘 Part5 強化ドリル", type: "book", cost: 800, desc: "文法問題を集中特訓！", unlockGroup: "Shop_Part5_Drill" },
        { id: "theme_default", name: "青空 (Default)", type: "bg", cost: 0, css: "theme-default" },
        { id: "theme_sunset", name: "夕暮れ", type: "bg", cost: 300, css: "theme-sunset" },
        { id: "theme_forest", name: "癒やしの森", type: "bg", cost: 800, css: "theme-forest" },
        { id: "theme_night", name: "静寂の夜", type: "bg", cost: 1500, css: "theme-night" },
        { id: "theme_space", name: "広大な宇宙", type: "bg", cost: 3000, css: "theme-space" }
    ];
    shopItems.forEach(item => {
        const div = document.createElement("div");
        const isOwned = myInventory.includes(item.id);
        const isEquipped = (equippedTheme === item.id);
        div.className = `shop-item ${isEquipped ? 'equipped' : ''}`;
        
        let previewHtml = item.type === "book" 
            ? `<div class="shop-preview" style="display:flex; align-items:center; justify-content:center; font-size:30px; background:#f9f9f9;">📚</div>`
            : `<div class="shop-preview ${item.css}"></div>`;

        let btnHtml = "";
        if (item.type === "bg") {
            if (isEquipped) { btnHtml = `<button class="buy-btn" disabled>装備中</button>`; }
            else if (isOwned) { btnHtml = `<button class="buy-btn equip-btn" onclick="equipItem('${item.id}')">装備する</button>`; }
            else { const canBuy = currentXP >= item.cost; btnHtml = `<button class="buy-btn" ${canBuy ? '' : 'disabled'} onclick="buyItem('${item.id}', ${item.cost}, 'bg')">購入 (${item.cost} XP)</button>`; }
        } else {
            if (isOwned) { btnHtml = `<button class="buy-btn" disabled style="background:#bdc3c7; color:#fff;">購入済み</button>`; }
            else { const canBuy = currentXP >= item.cost; btnHtml = `<button class="buy-btn" ${canBuy ? '' : 'disabled'} onclick="buyItem('${item.id}', ${item.cost}, 'book')">購入 (${item.cost} XP)</button>`; }
        }
        const descHtml = item.desc ? `<p style="font-size:10px; color:#999; margin:5px 0;">${item.desc}</p>` : "";
        div.innerHTML = `${previewHtml}<h4>${item.name}</h4>${descHtml}${btnHtml}`;
        container.appendChild(div);
    });
}

function buyItem(itemId, cost, type) {
    if(currentXP < cost) return alert("XPが足りません！");
    if(confirm(`${cost} XPを使って購入しますか？`)) {
        currentXP -= cost; myInventory.push(itemId); saveGameStats(); updateStatsUI(); renderShop();
        if(type === "book") {
            alert("購入しました！プレイリストに追加されました。");
            renderGroupOptions();
        } else { alert("購入しました！"); }
    }
}
function equipItem(itemId) { equippedTheme = itemId; applyTheme(itemId); saveGameStats(); renderShop(); }
function applyTheme(itemId) {
    const cssMap = { "theme_default": "theme-default", "theme_sunset": "theme-sunset", "theme_forest": "theme-forest", "theme_night": "theme-night", "theme_space": "theme-space" };
    const terra = document.getElementById("terrarium-container");
    if(terra && cssMap[itemId]) { terra.className = ""; terra.classList.add(cssMap[itemId]); }
}

// --- クエストロジック ---
function startQuest(mode) {
    currentMode = mode;
    const selectedGroup = document.getElementById("quest-playlist-select").value;
    const filteredData = allData.filter(d => {
        const isTypeMatch = d.type === mode;
        const isGroupMatch = (selectedGroup === "all") ? true : (d.group === selectedGroup);
        return isTypeMatch && isGroupMatch;
    });
    if (filteredData.length === 0) { alert(`問題がありません。`); return; }
    currentDeck = [...filteredData]; currentDeck.sort(() => Math.random() - 0.5);
    stageStats = { totalTime: 0, questionCount: 0, retryCount: 0 };
    document.getElementById("quest-menu").style.display = "none";
    document.getElementById("quest-play-area").style.display = "block";
    nextQuestion();
}
function exitQuest() { document.getElementById("quest-menu").style.display = "block"; document.getElementById("quest-play-area").style.display = "none"; }
function nextQuestion() {
    const resultMsg = document.getElementById("result-msg");
    if(resultMsg) resultMsg.innerText = "";
    if (!currentDeck || currentDeck.length === 0) { determineSpiritEvolution(); exitQuest(); return; }
    currentQuestion = currentDeck.pop();
    questionStartTime = Date.now();
    const qDisplay = document.getElementById("question-display");
    qDisplay.innerHTML = "";
    const textSpan = document.createElement("span"); textSpan.innerText = currentQuestion.text; qDisplay.appendChild(textSpan);
    const speakBtn = document.createElement("button"); speakBtn.className = "speaker-btn"; speakBtn.innerHTML = "🔊"; speakBtn.onclick = function(e) { e.stopPropagation(); speakText(currentQuestion.text); }; qDisplay.appendChild(speakBtn);
    if (currentQuestion.type === "part5") { qDisplay.className = "question-text type-part5"; renderOptions(currentQuestion.options); }
    else { qDisplay.className = "question-text type-word"; generateWordOptions(); }
    updateStatsUI(); isProcessing = false; enableButtons(true);
}
function speakText(text) { if ('speechSynthesis' in window) { speechSynthesis.cancel(); const utter = new SpeechSynthesisUtterance(text); utter.lang = 'en-US'; speechSynthesis.speak(utter); } }
function renderOptions(optionsArray) { const optionsDiv = document.getElementById("options-container"); optionsDiv.innerHTML = ""; let shuffled = [...optionsArray].sort(() => Math.random() - 0.5); shuffled.forEach(option => { const btn = document.createElement("button"); btn.className = "option-btn"; btn.innerText = option; btn.onclick = function() { checkAnswer(option); }; optionsDiv.appendChild(btn); }); }
function generateWordOptions() { let wrongOptions = []; let potentialWrongs = allData.filter(d => d.type === "word" && d.answer !== currentQuestion.answer); potentialWrongs.sort(() => Math.random() - 0.5); potentialWrongs.slice(0, 3).forEach(w => wrongOptions.push(w.answer)); while(wrongOptions.length < 3) wrongOptions.push("Other"); renderOptions([currentQuestion.answer, ...wrongOptions]); }
function checkAnswer(selectedOption) { if (isProcessing) return; const timeTaken = Date.now() - questionStartTime; isProcessing = true; enableButtons(false); const msgDiv = document.getElementById("result-msg"); if (selectedOption === currentQuestion.answer) { msgDiv.innerText = "Correct! ⭕️"; msgDiv.className = "correct"; stageStats.questionCount++; stageStats.totalTime += timeTaken; gainXP(10); setTimeout(nextQuestion, 800); } else { msgDiv.innerText = `正解は... 「${currentQuestion.answer}」`; msgDiv.className = "wrong"; stageStats.retryCount++; setTimeout(nextQuestion, 2000); } }
function determineSpiritEvolution() {
    if(stageStats.questionCount < 3) return; 
    const avgTime = stageStats.totalTime / stageStats.questionCount; const hour = new Date().getHours(); 
    let spiritType = "🌱"; let spiritClass = ""; let nickname = "見習い";
    if (stageStats.retryCount > 1) { spiritType = "🐢"; spiritClass = "effect-rock"; nickname = "堅実なカメ"; }
    else if (avgTime < 4000) { spiritType = "🐇"; spiritClass = "effect-shine"; nickname = "瞬速のウサギ"; }
    else if (hour <= 5 || hour >= 20) { spiritType = "🦉"; spiritClass = "effect-moon"; nickname = "月光のフクロウ"; }
    else { spiritType = "🐕"; nickname = "忠実なイヌ"; }
    if(currentMode === "part5") nickname = "博識な" + nickname.split("の")[1];
    
    const existingSpirit = mySpirits.find(s => s.name === nickname && s.char === spiritType);
    if (existingSpirit) { if (!existingSpirit.level) existingSpirit.level = 1; existingSpirit.level++; alert(`🎉 ステージクリア！\n既存の「${nickname}」が\nLv.${existingSpirit.level} にレベルアップ！`); }
    else { const newSpirit = { char: spiritType, css: spiritClass, name: nickname, level: 1 }; mySpirits.push(newSpirit); alert(`🎉 ステージクリア！\n新しい仲間: ${nickname} (${spiritType})\nがテラリウムに加わりました！`); }
    localStorage.setItem("toeicSpirits", JSON.stringify(mySpirits)); renderTerrarium();
}

// --- 管理・データ更新 ---
function createNewGroup() { const input = document.getElementById("new-group-name"); const newName = input.value.trim(); if(!newName) return alert("入力してください"); if(groupList.includes(newName)) return alert("既存です"); groupList.push(newName); localStorage.setItem("toeicGroups", JSON.stringify(groupList)); input.value = ""; alert("作成しました"); renderGroupOptions(); }
function switchAddMode() { const radios = document.querySelectorAll('input[name="addType"]'); let mode = "word"; radios.forEach(r => { if(r.checked) mode = r.value; }); document.getElementById("form-word").style.display = (mode === "word") ? "block" : "none"; document.getElementById("form-part5").style.display = (mode === "part5") ? "block" : "none"; }
function addNewData() { const radios = document.querySelectorAll('input[name="addType"]'); let mode = "word"; radios.forEach(r => { if(r.checked) mode = r.value; }); const targetGroup = document.getElementById("add-target-group").value; let newEntry = null; if (mode === "word") { const eng = document.getElementById("input-english").value.trim(); const jp = document.getElementById("input-japanese").value.trim(); if (!eng || !jp) return alert("入力してください"); newEntry = { type: "word", text: eng, answer: jp, group: targetGroup }; } else { const q = document.getElementById("input-p5-question").value.trim(); const a = document.getElementById("input-p5-answer").value.trim(); const wStr = document.getElementById("input-p5-wrong").value.trim(); if (!q || !a || !wStr) return alert("全て入力してください"); const options = [a, ...wStr.split(",")].map(s => s.trim()); newEntry = { type: "part5", text: q, answer: a, options: options, group: targetGroup }; } let userItems = JSON.parse(localStorage.getItem("toeicUserItems") || "[]"); userItems.push(newEntry); localStorage.setItem("toeicUserItems", JSON.stringify(userItems)); document.getElementById("input-english").value = ""; document.getElementById("input-japanese").value = ""; document.getElementById("input-p5-question").value = ""; document.getElementById("input-p5-answer").value = ""; document.getElementById("input-p5-wrong").value = ""; const msg = document.getElementById("add-msg"); msg.innerText = "保存しました"; setTimeout(() => { msg.innerText = ""; }, 2000); updateDataList(); }
function updateDataList() { const userItems = JSON.parse(localStorage.getItem("toeicUserItems") || "[]"); const savedGroups = JSON.parse(localStorage.getItem("toeicGroups")); if(savedGroups) groupList = savedGroups; else groupList = ["Default"]; mySpirits = JSON.parse(localStorage.getItem("toeicSpirits") || "[]"); if(typeof defaultData !== 'undefined') { allData = [...defaultData, ...userItems]; } else { allData = [...userItems]; } }
function enableButtons(isEnabled) { const buttons = document.querySelectorAll(".option-btn"); buttons.forEach(btn => btn.disabled = !isEnabled); }
function gainXP(amount) { currentXP += amount; if (currentXP >= currentLevel * 100) currentLevel++; saveGameStats(); updateStatsUI(); }
function updateStatsUI() { document.getElementById("home-level").innerText = currentLevel; document.getElementById("home-xp").innerText = currentXP; if(currentDeck) document.getElementById("deck-status").innerText = `残り: ${currentDeck.length}`; }
function saveGameStats() { const data = { level: currentLevel, xp: currentXP, inventory: myInventory, equipped: equippedTheme, lastSaveTime: Date.now() }; localStorage.setItem("toeicQuestStats", JSON.stringify(data)); lastSaveTime = data.lastSaveTime; }
function loadData() { const savedStats = localStorage.getItem("toeicQuestStats"); if (savedStats) { const data = JSON.parse(savedStats); currentLevel = data.level; currentXP = data.xp; if(data.inventory) myInventory = data.inventory; if(data.equipped) equippedTheme = data.equipped; if(data.lastSaveTime) lastSaveTime = data.lastSaveTime; } }
function resetGame() { if(confirm("全データを消去しますか？")) { localStorage.clear(); location.reload(); } }