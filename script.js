// --- 状態変数 ---
let allData = []; 
let groupList = [];
let currentDeck = [];
let currentMode = "word"; 
let currentLevel = 1;
let currentXP = 0;
let currentQuestion = null;
let isProcessing = false;
let mySpirits = []; 
let stageStats = { totalTime: 0, questionCount: 0, retryCount: 0 };
let questionStartTime = 0;

let myInventory = ["theme_default"];
let equippedTheme = "theme_default";
let lastSaveTime = Date.now();

// リスト管理 (text|group のユニークキーで管理)
let weakList = [];
let bookmarkList = [];

// クエスト設定
let questLimit = 5;

// --- 起動処理 ---
window.onload = function() {
    try {
        loadData();      
        updateDataList();
        
        showPage('home');
        renderTerrarium();
        updateStatsUI();
        renderGroupOptions();
        applyTheme(equippedTheme);
        checkIdleBonus();
        updateQuestMenu();

    } catch (e) {
        console.error(e);
        if(typeof defaultData === 'undefined') {
            alert("エラー: data.js が読み込めません。");
        }
    }
};

// --- クエストメニュー更新 ---
function updateQuestMenu() {
    const weakBtn = document.getElementById("quest-weak-btn");
    const bookBtn = document.getElementById("quest-bookmark-btn");
    
    if (weakList.length > 0) {
        weakBtn.style.display = "flex";
        document.getElementById("weak-count").innerText = weakList.length;
    } else {
        weakBtn.style.display = "none";
    }

    if (bookmarkList.length > 0) {
        bookBtn.style.display = "flex";
        document.getElementById("bookmark-count").innerText = bookmarkList.length;
    } else {
        bookBtn.style.display = "none";
    }
}

// --- クエスト設定 ---
function setQuestLength(num, btn) {
    questLimit = num;
    document.querySelectorAll('.len-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// --- クエスト開始ロジック ---
function startQuest(mode) {
    currentMode = mode;
    const selectedGroup = document.getElementById("quest-playlist-select").value;
    let filteredData = [];

    // モードによるデータ抽出
    if (mode === 'weak') {
        filteredData = allData.filter(d => weakList.includes(`${d.text}|${d.group}`));
        if (filteredData.length === 0) return alert("データが見つかりません");
    } else if (mode === 'bookmark') {
        filteredData = allData.filter(d => bookmarkList.includes(`${d.text}|${d.group}`));
        if (filteredData.length === 0) return alert("データが見つかりません");
    } else {
        // 通常モード ('word' or 'part5')
        filteredData = allData.filter(d => {
            const isTypeMatch = d.type === mode;
            const isGroupMatch = (selectedGroup === "all") ? true : (d.group === selectedGroup);
            return isTypeMatch && isGroupMatch;
        });
    }
    
    if (filteredData.length === 0) { alert(`問題がありません。`); return; }

    // シャッフル & 枚数制限
    let deck = [...filteredData];
    deck.sort(() => Math.random() - 0.5);

    if (questLimit < deck.length) {
        deck = deck.slice(0, questLimit);
    }

    currentDeck = deck;
    stageStats = { totalTime: 0, questionCount: 0, retryCount: 0 };
    document.getElementById("quest-menu").style.display = "none";
    document.getElementById("quest-play-area").style.display = "block";
    nextQuestion();
}

// --- ブックマーク機能 ---
function toggleBookmark() {
    if (!currentQuestion) return;
    const key = `${currentQuestion.text}|${currentQuestion.group}`;
    const btn = document.getElementById("bookmark-toggle-btn");
    
    if (bookmarkList.includes(key)) {
        bookmarkList = bookmarkList.filter(k => k !== key);
        btn.classList.remove("active");
        btn.innerText = "☆";
    } else {
        bookmarkList.push(key);
        btn.classList.add("active");
        btn.innerText = "★";
    }
    saveGameStats();
}

function updateBookmarkButtonState() {
    const btn = document.getElementById("bookmark-toggle-btn");
    const key = `${currentQuestion.text}|${currentQuestion.group}`;
    if (bookmarkList.includes(key)) {
        btn.classList.add("active"); btn.innerText = "★";
    } else {
        btn.classList.remove("active"); btn.innerText = "☆";
    }
}

// --- クイズ進行 ---
function nextQuestion() {
    document.getElementById("explanation-area").style.display = "none";
    document.getElementById("next-btn").style.display = "none";
    document.getElementById("options-container").style.display = "grid";
    const resultMsg = document.getElementById("result-msg");
    if(resultMsg) resultMsg.innerText = "";
    
    if (!currentDeck || currentDeck.length === 0) { 
        determineSpiritEvolution(); 
        exitQuest(); 
        return; 
    }
    
    currentQuestion = currentDeck.pop();
    questionStartTime = Date.now();
    updateBookmarkButtonState();

    const qDisplay = document.getElementById("question-display");
    qDisplay.innerHTML = "";
    const textSpan = document.createElement("span"); textSpan.innerText = currentQuestion.text; qDisplay.appendChild(textSpan);
    const speakBtn = document.createElement("button"); speakBtn.className = "speaker-btn"; speakBtn.innerHTML = "🔊"; speakBtn.onclick = function(e) { e.stopPropagation(); speakText(currentQuestion.text); }; qDisplay.appendChild(speakBtn);

    if (currentQuestion.type === "part5") { qDisplay.className = "question-text type-part5"; renderOptions(currentQuestion.options); }
    else { qDisplay.className = "question-text type-word"; generateWordOptions(); }
    
    updateStatsUI(); 
    isProcessing = false; 
    enableButtons(true);
}

// --- 答え合わせ (苦手リスト連動) ---
function checkAnswer(selectedOption) {
    if (isProcessing) return;
    const timeTaken = Date.now() - questionStartTime;
    isProcessing = true;
    enableButtons(false);
    
    const msgDiv = document.getElementById("result-msg");
    const uniqueKey = `${currentQuestion.text}|${currentQuestion.group}`;

    if (selectedOption === currentQuestion.answer) {
        msgDiv.innerText = "Correct! ⭕️";
        msgDiv.className = "correct";
        stageStats.questionCount++;
        stageStats.totalTime += timeTaken;
        gainXP(10); 
        
        // 正解したら苦手リストから削除
        if (weakList.includes(uniqueKey)) {
            weakList = weakList.filter(k => k !== uniqueKey);
            saveGameStats();
        }

        if (currentQuestion.type === "part5" && currentQuestion.explanation) { showExplanation(); } else { setTimeout(nextQuestion, 800); }
    } else {
        msgDiv.innerText = `正解は... 「${currentQuestion.answer}」`;
        msgDiv.className = "wrong";
        stageStats.retryCount++;
        
        // 間違えたら苦手リストに追加
        if (!weakList.includes(uniqueKey)) {
            weakList.push(uniqueKey);
            saveGameStats();
        }
        
        showExplanation();
    }
}

// --- クエスト終了 ---
function exitQuest() { 
    document.getElementById("quest-menu").style.display = "block"; 
    document.getElementById("quest-play-area").style.display = "none";
    updateQuestMenu(); 
}

// --- 放置ボーナス ---
function checkIdleBonus() {
    if (mySpirits.length === 0) return;
    const now = Date.now();
    const diffMinutes = Math.floor((now - lastSaveTime) / (1000 * 60));

    if (diffMinutes >= 1) {
        const totalLevels = mySpirits.reduce((sum, s) => sum + (s.level || 1), 0);
        let bonusXP = diffMinutes * totalLevels;
        const maxXP = currentLevel * 100;
        if (bonusXP > maxXP) bonusXP = maxXP;
        
        if (bonusXP > 0) {
            currentXP += bonusXP;
            saveGameStats();
            updateStatsUI();
            setTimeout(() => {
                alert(`【おかえりなさい！】\nコトダマたちが探索して\n${bonusXP} XPを見つけてきました！\n(上限: ${maxXP})`);
            }, 500);
        }
    }
}

// --- テラリウム ---
function renderTerrarium() {
    const area = document.getElementById("terrarium-container");
    if(!area) return;
    area.innerHTML = '<div class="bg-decor"></div>'; // 背景装飾再生成
    
    if (!mySpirits || mySpirits.length === 0) {
        const msg = document.createElement("div");
        msg.style.position = "absolute"; msg.style.width = "100%"; msg.style.textAlign = "center"; msg.style.top = "40%";
        msg.innerHTML = "<div style='color:white; font-weight:bold; text-shadow:0 0 5px rgba(0,0,0,0.2);'>クエストをクリアして<br>仲間を集めよう！</div>";
        area.appendChild(msg);
        return;
    }

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

// --- その他の共通関数 (省略なし) ---
function showPage(pageId) {
    isProcessing = false; enableButtons(true);
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));
    document.getElementById(`page-${pageId}`).classList.add('active');
    if(pageId === 'home') navButtons[0]?.classList.add('active');
    if(pageId === 'manage') { navButtons[1]?.classList.add('active'); updateEditorSelect(); }
    if(pageId === 'home') { renderTerrarium(); updateStatsUI(); }
    if(pageId === 'quest') { exitQuest(); renderGroupOptions(); }
    if(pageId === 'zukan') { renderZukan(); }
    if(pageId === 'shop') { renderShop(); }
    if(pageId === 'wordbook') { updateWordbookFilter(); renderWordbook(); }
}

function showExplanation() {
    const expArea = document.getElementById("explanation-area");
    const nextBtn = document.getElementById("next-btn");
    let content = "";
    if (currentQuestion.translation) { content += `<strong>【訳】</strong><br>${currentQuestion.translation}<br><br>`; }
    if (currentQuestion.explanation) { content += `<strong>【解説】</strong><br>${currentQuestion.explanation}`; }
    if (content === "") { setTimeout(nextQuestion, 2000); return; }
    expArea.innerHTML = content; expArea.style.display = "block"; nextBtn.style.display = "block";
}
function speakText(text) { if ('speechSynthesis' in window) { speechSynthesis.cancel(); const utter = new SpeechSynthesisUtterance(text); utter.lang = 'en-US'; speechSynthesis.speak(utter); } }
function renderOptions(optionsArray) { const optionsDiv = document.getElementById("options-container"); optionsDiv.innerHTML = ""; let shuffled = [...optionsArray].sort(() => Math.random() - 0.5); shuffled.forEach(option => { const btn = document.createElement("button"); btn.className = "option-btn"; btn.innerText = option; btn.onclick = function() { checkAnswer(option); }; optionsDiv.appendChild(btn); }); }
function generateWordOptions() { let wrongOptions = []; let potentialWrongs = allData.filter(d => d.type === "word" && d.answer !== currentQuestion.answer); potentialWrongs.sort(() => Math.random() - 0.5); potentialWrongs.slice(0, 3).forEach(w => wrongOptions.push(w.answer)); while(wrongOptions.length < 3) wrongOptions.push("Other"); renderOptions([currentQuestion.answer, ...wrongOptions]); }
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
function renderZukan() {
    const container = document.getElementById("zukan-container"); if(!container) return; container.innerHTML = "";
    const masterSpiritList = [{ char: "🐇", name: "瞬速のウサギ", desc: "回答スピードが速いと現れる。" }, { char: "🐢", name: "堅実なカメ", desc: "間違いを直して粘り強く解くと現れる。" }, { char: "🦉", name: "月光のフクロウ", desc: "夜（20時〜5時）に勉強すると現れる。" }, { char: "🐕", name: "忠実なイヌ", desc: "バランス良く勉強すると現れる。" }];
    masterSpiritList.forEach(item => { const found = mySpirits.find(s => s.char === item.char); const div = document.createElement("div"); if (found) { div.className = "zukan-item"; const maxLv = mySpirits.filter(s => s.char === item.char).reduce((max, s) => Math.max(max, s.level || 1), 0); div.innerHTML = `<div class="zukan-icon">${item.char}</div><h4>${item.name}</h4><p>Max Lv.${maxLv}</p><p>${item.desc}</p>`; } else { div.className = "zukan-item locked"; div.innerHTML = `<div class="zukan-icon">${item.char}</div><h4>???</h4><p>発見条件: 秘密</p><p>${item.desc}</p>`; } container.appendChild(div); });
}
function renderShop() {
    const container = document.getElementById("shop-container"); container.innerHTML = ""; document.getElementById("shop-xp").innerText = currentXP;
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
        const div = document.createElement("div"); const isOwned = myInventory.includes(item.id); const isEquipped = (equippedTheme === item.id); div.className = `shop-item ${isEquipped ? 'equipped' : ''}`;
        let previewHtml = item.type === "book" ? `<div class="shop-preview" style="display:flex; align-items:center; justify-content:center; font-size:30px; background:#f9f9f9;">📚</div>` : `<div class="shop-preview ${item.css}"></div>`;
        let btnHtml = "";
        if (item.type === "bg") { if (isEquipped) { btnHtml = `<button class="buy-btn" disabled>装備中</button>`; } else if (isOwned) { btnHtml = `<button class="buy-btn equip-btn" onclick="equipItem('${item.id}')">装備する</button>`; } else { const canBuy = currentXP >= item.cost; btnHtml = `<button class="buy-btn" ${canBuy ? '' : 'disabled'} onclick="buyItem('${item.id}', ${item.cost}, 'bg')">購入 (${item.cost} XP)</button>`; } } else { if (isOwned) { btnHtml = `<button class="buy-btn" disabled style="background:#bdc3c7; color:#fff;">購入済み</button>`; } else { const canBuy = currentXP >= item.cost; btnHtml = `<button class="buy-btn" ${canBuy ? '' : 'disabled'} onclick="buyItem('${item.id}', ${item.cost}, 'book')">購入 (${item.cost} XP)</button>`; } }
        div.innerHTML = `${previewHtml}<h4>${item.name}</h4>${btnHtml}`; container.appendChild(div);
    });
}
function buyItem(itemId, cost, type) { if(currentXP < cost) return alert("XPが足りません！"); if(confirm(`${cost} XPを使って購入しますか？`)) { currentXP -= cost; myInventory.push(itemId); saveGameStats(); updateStatsUI(); renderShop(); if(type === "book") { alert("購入しました！"); renderGroupOptions(); } else { alert("購入しました！"); } } }
function equipItem(itemId) { equippedTheme = itemId; applyTheme(itemId); saveGameStats(); renderShop(); }
function applyTheme(itemId) { const cssMap = { "theme_default": "theme-default", "theme_sunset": "theme-sunset", "theme_forest": "theme-forest", "theme_night": "theme-night", "theme_space": "theme-space" }; const terra = document.getElementById("terrarium-container"); if(terra && cssMap[itemId]) { terra.className = ""; terra.classList.add(cssMap[itemId]); } }
function renderGroupOptions() {
    const questSelect = document.getElementById("quest-playlist-select"); const addSelect = document.getElementById("add-target-group"); if(!questSelect || !addSelect) return;
    questSelect.innerHTML = '<option value="all">全ての問題 (All)</option>'; addSelect.innerHTML = '';
    const dataGroups = [...new Set(allData.map(d => d.group))]; const allGroups = [...new Set([...groupList, ...dataGroups])];
    const unlockMap = { "book_verbs": "Shop_Verbs", "book_part5_drill": "Shop_Part5_Drill" }; const unlockedGroups = Object.keys(unlockMap).filter(id => myInventory.includes(id)).map(id => unlockMap[id]);
    allGroups.forEach(group => {
        if (group.startsWith("Shop_") && !unlockedGroups.includes(group)) return;
        const opt1 = document.createElement("option"); opt1.value = group; opt1.innerText = group; if (group.startsWith("Shop_")) opt1.style.color = "#d35400"; questSelect.appendChild(opt1);
        if (!group.startsWith("Shop_")) { const opt2 = document.createElement("option"); opt2.value = group; opt2.innerText = group; addSelect.appendChild(opt2); }
    });
}
function createNewGroup() { const input = document.getElementById("new-group-name"); const newName = input.value.trim(); if(!newName) return alert("入力してください"); if(groupList.includes(newName)) return alert("既存です"); groupList.push(newName); localStorage.setItem("toeicGroups", JSON.stringify(groupList)); input.value = ""; alert("作成しました"); renderGroupOptions(); }
function switchAddMode() { const radios = document.querySelectorAll('input[name="addType"]'); let mode = "word"; radios.forEach(r => { if(r.checked) mode = r.value; }); document.getElementById("form-word").style.display = (mode === "word") ? "block" : "none"; document.getElementById("form-part5").style.display = (mode === "part5") ? "block" : "none"; }
function addNewData() { const radios = document.querySelectorAll('input[name="addType"]'); let mode = "word"; radios.forEach(r => { if(r.checked) mode = r.value; }); const targetGroup = document.getElementById("add-target-group").value; let newEntry = null; if (mode === "word") { const eng = document.getElementById("input-english").value.trim(); const jp = document.getElementById("input-japanese").value.trim(); if (!eng || !jp) return alert("入力してください"); newEntry = { type: "word", text: eng, answer: jp, group: targetGroup }; } else { const q = document.getElementById("input-p5-question").value.trim(); const a = document.getElementById("input-p5-answer").value.trim(); const wStr = document.getElementById("input-p5-wrong").value.trim(); const exp = document.getElementById("input-p5-explanation").value.trim(); if (!q || !a || !wStr) return alert("全て入力してください"); const options = [a, ...wStr.split(",")].map(s => s.trim()); newEntry = { type: "part5", text: q, answer: a, options: options, group: targetGroup, explanation: exp }; } let userItems = JSON.parse(localStorage.getItem("toeicUserItems") || "[]"); userItems.push(newEntry); localStorage.setItem("toeicUserItems", JSON.stringify(userItems)); document.getElementById("input-english").value = ""; document.getElementById("input-japanese").value = ""; document.getElementById("input-p5-question").value = ""; document.getElementById("input-p5-answer").value = ""; document.getElementById("input-p5-wrong").value = ""; const msg = document.getElementById("add-msg"); msg.innerText = "保存しました"; setTimeout(() => { msg.innerText = ""; }, 2000); updateDataList(); }
function copyTemplate() { const t = `word,Lv1_動詞,run,走る,,,\npart5,P5_Set1,I [ ] it.,did,do|did|done|doing,,過去の話。`; navigator.clipboard.writeText(t).then(() => alert("コピーしました")); }
function importCSV() { const raw = document.getElementById("csv-input").value.trim(); if(!raw) return alert("なし"); const lines = raw.split("\n"); let s=0, e=0; const newItems = []; lines.forEach((l)=>{ if(!l.trim())return; try{ const c=parseCSVLine(l); if(c.length<4)throw new Error("不足"); const item={type:c[0].trim(),group:c[1].trim(),text:c[2].trim(),answer:c[3].trim()}; if(item.type==="part5"){ item.options=c[4].split("|").map(s=>s.trim()); } if(c[5])item.translation=c[5].trim(); if(c[6])item.explanation=c[6].trim(); newItems.push(item); s++; }catch(err){e++;} }); if(s===0) return alert("失敗"); let u = JSON.parse(localStorage.getItem("toeicUserItems")||"[]"); u=[...u, ...newItems]; localStorage.setItem("toeicUserItems", JSON.stringify(u)); document.getElementById("csv-input").value=""; updateDataList(); renderGroupOptions(); alert(`成功:${s} 失敗:${e}`); }
function parseCSVLine(text) { const result = []; let current = ''; let inQuote = false; for (let i = 0; i < text.length; i++) { const char = text[i]; if (char === '"') { inQuote = !inQuote; } else if (char === ',' && !inQuote) { result.push(current); current = ''; } else { current += char; } } result.push(current); return result.map(col => { col = col.trim(); if (col.startsWith('"') && col.endsWith('"')) { return col.slice(1, -1).replace(/""/g, '"'); } return col; }); }
function updateEditorSelect() { const select = document.getElementById("edit-group-select"); if (!select) return; const currentVal = select.value; select.innerHTML = '<option value="">選択してください</option>'; const userItems = JSON.parse(localStorage.getItem("toeicUserItems") || "[]"); const savedGroups = JSON.parse(localStorage.getItem("toeicGroups") || "[]"); const itemGroups = userItems.map(i => i.group); const uniqueGroups = [...new Set([...savedGroups, ...itemGroups])]; uniqueGroups.forEach(g => { if(g === "Default") return; const opt = document.createElement("option"); opt.value = g; opt.innerText = g; select.appendChild(opt); }); select.value = currentVal; }
function renderEditorList() { const group = document.getElementById("edit-group-select").value; const list = document.getElementById("editor-list"); list.innerHTML = ""; if (!group) return; const userItems = JSON.parse(localStorage.getItem("toeicUserItems") || "[]"); const filteredItems = userItems.filter(i => i.group === group); if (filteredItems.length === 0) { list.innerHTML = "<div style='padding:10px; color:#aaa; text-align:center;'>データがありません</div>"; return; } filteredItems.forEach((item) => { const div = document.createElement("div"); div.className = "editor-item"; div.innerHTML = `<div class="editor-text"><span style="color:#3498db;">[${item.type}]</span> <b>${item.text}</b></div><button class="del-btn" onclick="deleteSingleItem('${item.text}', '${group}')">🗑️</button>`; list.appendChild(div); }); }
function deleteSingleItem(textToDelete, groupName) { if (!confirm(`削除しますか？`)) return; let userItems = JSON.parse(localStorage.getItem("toeicUserItems") || "[]"); const targetIndex = userItems.findIndex(i => i.text === textToDelete && i.group === groupName); if (targetIndex !== -1) { userItems.splice(targetIndex, 1); localStorage.setItem("toeicUserItems", JSON.stringify(userItems)); alert("削除しました。"); updateDataList(); renderEditorList(); renderGroupOptions(); } }
function deleteEntireGroup() { const group = document.getElementById("edit-group-select").value; if (!group) return alert("選択してください"); if (!confirm(`グループ「${group}」を削除しますか？`)) return; let userItems = JSON.parse(localStorage.getItem("toeicUserItems") || "[]"); const newItems = userItems.filter(i => i.group !== group); localStorage.setItem("toeicUserItems", JSON.stringify(newItems)); let savedGroups = JSON.parse(localStorage.getItem("toeicGroups") || "[]"); const newGroups = savedGroups.filter(g => g !== group); localStorage.setItem("toeicGroups", JSON.stringify(newGroups)); alert("削除しました"); updateDataList(); renderGroupOptions(); document.getElementById("edit-group-select").value = ""; updateEditorSelect(); renderEditorList(); }
function updateDataList() { const userItems = JSON.parse(localStorage.getItem("toeicUserItems") || "[]"); const savedGroups = JSON.parse(localStorage.getItem("toeicGroups")); if(savedGroups) groupList = savedGroups; else groupList = []; mySpirits = JSON.parse(localStorage.getItem("toeicSpirits") || "[]"); if(typeof defaultData !== 'undefined') { allData = [...defaultData, ...userItems]; } else { allData = [...userItems]; } }
function enableButtons(isEnabled) { const buttons = document.querySelectorAll(".option-btn"); buttons.forEach(btn => btn.disabled = !isEnabled); }
function gainXP(amount) { currentXP += amount; if (currentXP >= currentLevel * 100) currentLevel++; saveGameStats(); updateStatsUI(); }
function updateStatsUI() { document.getElementById("home-level").innerText = currentLevel; document.getElementById("home-xp").innerText = currentXP; if(currentDeck) document.getElementById("deck-status").innerText = `残り: ${currentDeck.length}`; }
function saveGameStats() { const data = { level: currentLevel, xp: currentXP, inventory: myInventory, equipped: equippedTheme, lastSaveTime: Date.now(), weakList: weakList, bookmarkList: bookmarkList }; localStorage.setItem("toeicQuestStats", JSON.stringify(data)); lastSaveTime = data.lastSaveTime; }
function loadData() { const savedStats = localStorage.getItem("toeicQuestStats"); if (savedStats) { const data = JSON.parse(savedStats); currentLevel = data.level; currentXP = data.xp; if(data.inventory) myInventory = data.inventory; if(data.equipped) equippedTheme = data.equipped; if(data.lastSaveTime) lastSaveTime = data.lastSaveTime; if(data.weakList) weakList = data.weakList; if(data.bookmarkList) bookmarkList = data.bookmarkList; } }
function resetGame() { if(confirm("全データを消去しますか？")) { localStorage.clear(); location.reload(); } }
function renderWordbook() { const list = document.getElementById("wordbook-list"); const filterGroup = document.getElementById("wordbook-filter").value; if(!list) return; list.innerHTML = ""; let displayData = allData; if (filterGroup !== "all") { displayData = allData.filter(d => d.group === filterGroup); } if (displayData.length === 0) { list.innerHTML = "<p style='text-align:center; padding:20px; color:#aaa;'>データがありません</p>"; return; } displayData.forEach(d => { const item = document.createElement("div"); if (d.type === "part5") { item.className = "word-item is-part5"; item.innerHTML = `<div class="word-left"><span class="word-tag">${d.group}</span>${d.text}</div><div class="word-right">A: ${d.answer}</div>`; } else { item.className = "word-item"; item.innerHTML = `<div class="word-left"><span class="word-tag">${d.group}</span>${d.text}</div><div class="word-right">${d.answer}</div>`; } item.onclick = () => { let msg = `【${d.text}】\n答え: ${d.answer}`; if(d.translation) msg += `\n\n訳: ${d.translation}`; if(d.explanation) msg += `\n\n解説: ${d.explanation}`; alert(msg); }; list.appendChild(item); }); }
function updateWordbookFilter() { const select = document.getElementById("wordbook-filter"); if(!select) return; select.innerHTML = '<option value="all">全て (All)</option>'; const groups = [...new Set(allData.map(d => d.group))]; groups.forEach(g => { const opt = document.createElement("option"); opt.value = g; opt.innerText = g; select.appendChild(opt); }); }