// ==================================================
// 게임 상태
// ==================================================

let gameState = "title"; // "title" | "driving" | "event" | "exitEvent" | "ending" | "finished"

let distance = 466;
let speed = 0;

// 정지 이벤트 진입 전 속도를 저장해뒀다가 복구할 때 사용
let drivingSpeedBeforeEvents = 0;

let gameTimer = null;

let npc1Changed = false;

//처음 시동 걸 때만 소리 들리도록 변경
let engineRunning = false;

// 이 플래그가 true인 동안에는 event 상태여도 가속이 허용됨
let allowAccelerateDuringEvent = false;

//화면에 보이는 목표거리 왜곡용
let distanceDisplayOffset = 35;

//화면에 보이는 목표거리 ???용
let distanceVisible = false;


// ==================================================
// NPC 진행 상태
// ==================================================

// 현재 차 안에 있는 NPC (NPC1 = 0, NPC2 = 1, ...)
let passengers = [];

// 현재 하차 진행 중인 NPC
let exitingNPCIndex = -1;

// 현재 화면에 "정지 이벤트"로 표시 중인 NPC (없으면 -1)
let activeNPCIndex = -1;

// 지금까지 만난 NPC 중 가장 마지막 번호 (UI 표시 / 엔딩 조건용)
let lastTriggeredNPCIndex = -1;

// NPC별 독립적인 진행 상태
// { triggered, eventIndex, scheduledDistance, finished }
let npcRuntime = [];

//세이브용
const saveButton =
  document.getElementById("saveButton");

const loadButton =
  document.getElementById("loadButton");

// ==================================================
// 세이브 / 로드
// ==================================================

const SAVE_KEY = "hitchhikerSaveData";

//이동 효과
const speedLines =
  document.getElementById("speedLines");


function updateDrivingFeedback() {

  const intensity = Math.min(speed / 100, 1);

  if (speedLines) {

    speedLines.style.opacity =
      speed > 0 ? (0.15 + intensity * 0.5) : 0;

    speedLines.style.animationDuration =
      speed > 0 ? `${Math.max(0.15, 0.6 - intensity * 0.45)}s` : "0s";
  }
}


function getChoiceSaveState() {

  // ------------------------------------------
  // NPC 이벤트 중 "선택지" 화면
  // ------------------------------------------
  if (
    gameState === "event" &&
    activeNPCIndex !== -1
  ) {

    const rt = npcRuntime[activeNPCIndex];

    if (!rt) {
      return null;
    }

    const event =
      npcs[activeNPCIndex].events[rt.eventIndex];

    // 현재 이벤트가 선택지여야 함
    if (!event || event.type !== "choice") {
      return null;
    }

    const buttons =
      [...choices.querySelectorAll("button")];

    const buttonTexts =
      buttons.map(button => button.textContent);

    const originalChoiceTexts =
      event.choices.map(choice => choice.text);

    // 아직 원래 선택지들이 표시 중인지 판단
    const isOriginalChoices =
      buttonTexts.length === originalChoiceTexts.length &&
      buttonTexts.every(
        (text, index) =>
          text === originalChoiceTexts[index]
      );

    return {
      kind: "npcEvent",

      // choices: 선택 전 원래 선택지 화면
      // next: 선택 후 대사와 "다음" 버튼이 있는 화면
      mode: isOriginalChoices ? "choices" : "next",

      // next 상태 복원용 화면 텍스트
      eventTitle: eventTitle.textContent,
      message: message.textContent,
      speaker: speaker.textContent,
      dialogueText: dialogueText.textContent
    };
  }

  // ------------------------------------------
  // 하차("같이 내릴까?") 이벤트 화면
  // ------------------------------------------
  if (
    gameState === "exitEvent" &&
    exitingNPCIndex !== -1
  ) {

    const buttons =
      [...choices.querySelectorAll("button")];

    const buttonTexts =
      buttons.map(button => button.textContent);

    // "같이 내린다" / "계속 운전한다" 버튼이 이미 떠 있는지 확인
    const isExitChoiceShown =
      buttonTexts.length === 2 &&
      buttonTexts[0] === "같이 내린다" &&
      buttonTexts[1] === "계속 운전한다";

    return {
      kind: "exitEvent",

      // choice: "같이 내릴까?" 버튼이 이미 표시된 화면
      // dialogue: 아직 도착 대사만 표시되고 버튼은 나오기 전 화면
      mode: isExitChoiceShown ? "choice" : "dialogue",

      eventTitle: eventTitle.textContent,
      message: message.textContent,
      speaker: speaker.textContent,
      dialogueText: dialogueText.textContent
    };
  }

  return null;
}

function getVisualState() {
  return {
    liquid: liquid.style.display === "block",
    web: web.style.display === "block",
    snow: snow.style.display === "block",
    moon: moon.style.display === "block",
    sakura: sakura.style.display === "block",
    bw: screenElement.classList.contains("bw-filter")
  };
}

function applyVisualState(v = {}) {
  liquid.style.display = v.liquid ? "block" : "none";
  web.style.display = v.web ? "block" : "none";
  snow.style.display = v.snow ? "block" : "none";
  moon.style.display = v.moon ? "block" : "none";
  sakura.style.display = v.sakura ? "block" : "none";
  screenElement.classList.toggle("bw-filter", !!v.bw);
}



function saveGame() {

  const choiceSaveState =
    getChoiceSaveState();

  // 운전 중 또는 선택지 화면에서만 저장 가능
  const canSave =
    gameState === "driving" ||
    choiceSaveState !== null;

  if (!canSave) {

    showMessage(
      "저장 불가",
      "운전 중이거나 선택지가 표시된 상태에서만 저장할 수 있습니다."
    );

    return;
  }

  const saveData = {

    version: 3,

    gameState,

    distance,
    speed,
    drivingSpeedBeforeEvents,
    npc1Changed,

    distanceVisible,                  // ← 추가
    distanceDisplayOffset,   

    passengers: [...passengers],

    exitingNPCIndex,
    activeNPCIndex,
    lastTriggeredNPCIndex,

    npcRuntime:
      npcRuntime.map(rt => ({ ...rt })),

    choiceSaveState,
      visuals: getVisualState()

  };

  try {

    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(saveData)
    );

    showMessage(
      "저장 완료",
      "현재 진행 상황이 저장되었습니다."
    );

    updateLoadButtonState();

  } catch (e) {

    showMessage(
      "저장 실패",
      "저장하는 중 오류가 발생했습니다."
    );
  }
}


function loadGame() {

  const raw =
    localStorage.getItem(SAVE_KEY);

  if (!raw) {

    showMessage(
      "불러오기 실패",
      "저장된 데이터가 없습니다."
    );

    return;
  }

  let saveData;

  try {

    saveData = JSON.parse(raw);

  } catch (e) {

    showMessage(
      "불러오기 실패",
      "저장 데이터가 손상되었습니다."
    );

    return;
  }

  // 저장 데이터 최소 검증
  if (
    typeof saveData.distance !== "number" ||
    !Array.isArray(saveData.passengers) ||
    !Array.isArray(saveData.npcRuntime)
  ) {

    showMessage(
      "불러오기 실패",
      "저장 데이터 형식이 올바르지 않습니다."
    );

    return;
  }

  clearInterval(gameTimer);

  distance = saveData.distance;
  speed = saveData.speed ?? 0;
  drivingSpeedBeforeEvents =
    saveData.drivingSpeedBeforeEvents ?? 0;

  npc1Changed =
    saveData.npc1Changed ?? false;
  
  distanceVisible =
    saveData.distanceVisible ?? false;

  distanceDisplayOffset =
    saveData.distanceDisplayOffset ?? 35;

  allowAccelerateDuringEvent = false;

  // 이미 달리던 상태였다면 시동음이 다시 나오지 않게
  engineRunning = (saveData.speed ?? 0) > 0;

  passengers =
    [...saveData.passengers];

  exitingNPCIndex =
    saveData.exitingNPCIndex ?? -1;

  activeNPCIndex =
    saveData.activeNPCIndex ?? -1;

  lastTriggeredNPCIndex =
    saveData.lastTriggeredNPCIndex ?? -1;

  npcRuntime =
    saveData.npcRuntime.map(
      rt => ({ ...rt })
    );

  startButton.style.display = "none";

  clearChoices();

  hideAllNPCImages();

  updateNPCImages();

  applyVisualState(saveData.visuals);

  // ------------------------------------------
  // NPC 이벤트(선택지) 진행 중 저장 데이터를 불러온 경우
  // ------------------------------------------
  if (
    saveData.gameState === "event" &&
    saveData.choiceSaveState &&
    saveData.choiceSaveState.kind === "npcEvent" &&
    activeNPCIndex >= 0 &&
    activeNPCIndex < npcs.length
  ) {

    gameState = "event";

    // 이벤트 중에는 정지 상태 유지
    speed = 0;

    setDistanceVisible(false);

    const choiceState =
      saveData.choiceSaveState;

    // 선택 전: 원래 선택지 버튼들을 다시 생성
    if (choiceState.mode === "choices") {

      playNPCEvent(activeNPCIndex);

    // 선택 후: 대사와 "다음" 버튼 복원
    } else {

      showMessage(
        choiceState.eventTitle,
        choiceState.message
      );

      showDialogue(
        choiceState.speaker,
        choiceState.dialogueText
      );

      clearChoices();

      addChoice(
        "다음",
        () => {
          nextNPCEvent();
        }
      );
    }

  // ------------------------------------------
  // 하차("같이 내릴까?") 이벤트 진행 중 저장 데이터를 불러온 경우
  // ------------------------------------------
  } else if (
    saveData.gameState === "exitEvent" &&
    saveData.choiceSaveState &&
    saveData.choiceSaveState.kind === "exitEvent" &&
    exitingNPCIndex >= 0 &&
    exitingNPCIndex < npcs.length
  ) {

    gameState = "exitEvent";

    speed = 0;

    setDistanceVisible(false);

    const choiceState =
      saveData.choiceSaveState;

    // "같이 내린다" / "계속 운전한다" 버튼이 이미 표시된 상태였다면 그대로 재생성
    if (choiceState.mode === "choice") {

      showExitChoice();

    // 아직 도착 대사만 보이던 상태였다면 화면을 복원하고
    // 잠시 뒤 선택 버튼이 다시 뜨도록 예약
    } else {

      showMessage(
        choiceState.eventTitle,
        choiceState.message
      );

      showDialogue(
        choiceState.speaker,
        choiceState.dialogueText
      );

      clearChoices();

      setTimeout(() => {
        showExitChoice();
      }, 500);
    }

  } else {

    // ------------------------------------------
    // 운전 중 저장 데이터를 불러온 경우
    // ------------------------------------------
    gameState = "driving";

    setDistanceVisible(true);

    showMessage(
      "불러오기 완료",
      "저장된 지점부터 다시 시작합니다."
    );

    showDialogue(
      "",
      "운전을 다시 이어간다."
    );
  }

  updateStatus();

  gameTimer =
    setInterval(gameTick, 1000);
}


function updateLoadButtonState() {

  if (!loadButton) {
    return;
  }

  loadButton.disabled =
    !localStorage.getItem(SAVE_KEY);
}


// 세이브 / 로드 버튼 연결
saveButton.addEventListener(
  "click",
  saveGame
);

loadButton.addEventListener(
  "click",
  loadGame
);


// 페이지를 열었을 때 불러오기 버튼 상태 갱신
updateLoadButtonState();


// ==================================================
// 공용 대사 헬퍼
// - 대사 출력 + "다음" 버튼 생성을 한 곳으로 모음
// - choice / dialogue / anomaly 모두 이걸 기반으로 동작
// ==================================================

// 대사를 보여주고 "다음" 버튼을 만든다. onNext를 생략하면 nextNPCEvent로 이어진다.
function sayThenNext(speakerName, text, onNext) {

  showDialogue(speakerName, text);

  clearChoices();

  addChoice("다음", onNext || nextNPCEvent);
}

// sayThenNext를 Promise로 감싼 버전 (async 흐름에서 순서대로 대사를 넘길 때 사용)
function waitForNext(speakerName, text) {

  return new Promise(resolve => {
    sayThenNext(speakerName, text, resolve);
  });
}


// ==================================================
// 이상현상: 종류별 표시 방법만 다르고, 흐름(진입 → 연출 → 대사 → 정리 → 복귀)은
// 완전히 동일하므로 kind로 등록해두고 runAnomaly() 하나로 재생한다.
// 컷신도 여기에 넣으면 될듯? (아직 key 사건 넣지 않음)
// ==================================================

const anomalyKinds = {

  // 종소리: 문구 + 사운드 재생 후 일정 시간 뒤 자동 종료
  bell: {
    show: (text, onDone) => {

      showMessage("이상현상", "...? 어디선가 종소리가 울렸다.");
      showDialogue("", text);

      try {
        bellSound.currentTime = 0;
        bellSound.play();
      } catch (e) {
        // 재생 실패해도 진행에는 지장 없도록 무시
      }

      setTimeout(onDone, 2700);
    },
    hide: () => {}
  },
  //라디오 지지직
  ra: {
    show: (text, onDone) => {

      showMessage("이상현상", "켜지 않은 라디오에서 소리가 난다.");
      showDialogue("", text);

      try {
        rad.currentTime = 0;
        rad.play();
      } catch (e) {
        // 재생 실패해도 진행에는 지장 없도록 무시
      } 
      sayThenNext("", text, () => {
        showMessage("이상현상", "라디오 버튼을 눌러 꺼야 한다!");
        clearChoices();

        waitForButtonOrTimeout(radio, 5000, (result) => {onDone(result);

        });
      });
    },
    hide: () => {},

    badEnding: {
      title: "이상현상",
      text: "치지직거리는 소리가 점점 커지더니, 정신이 아득해졌다."
    }
  },

  // 흑백 필터: 화면에 필터를 씌우고 "다음"을 눌러야 진행
  bw: {
    show: (text, onDone) => {

      screenElement.classList.add("bw-filter");

      showMessage("이상현상", "무언가 평소와 다르다.");

      sayThenNext("", text, onDone);
    },
    hide: () => {
      screenElement.classList.remove("bw-filter");
    }
  },
  //창문에서 검은 액체 발생
  lq: {
    show: (text, onDone) => {
      liquid.style.display = "block";
      showMessage("이상현상", "진득한 검은 액체가 흘러내리고 있다.");
      sayThenNext("",text,onDone);
      
    },
    hide: () => {
      liquid.style.display = "none";
    }
  },

  //손에서 피남
  blood: {
    show: (text, onDone) => {
      hand.style.display = "block";
      showMessage("이상현상", "손에서 피가...");
      sayThenNext("",text,onDone);
      
    },
    hide: () => {
      hand.style.display = "none";
    }
  },
  //거미줄 생김
  spider: {
    show: (text, onDone) => {
      web.style.display = "block";
      showMessage("이상현상", "거미줄이 붙어있다.");
      sayThenNext("",text,onDone);
      
    },
    hide: () => {
      web.style.display = "none";
    }
  },

  //큰 달
  nyx: {
    show: (text, onDone) => {
      moon.style.display = "block";
      showMessage("이상현상", "달이 다가온다.");
      sayThenNext("",text,onDone);
      
    },
    hide: () => {
      moon.style.display = "none";
    }
  },
  //눈 내려요
  snowing: {
    show: (text, onDone) => {
      snow.style.display = "block";
      showMessage("이상현상", "눈이 내리고 있다.");
      sayThenNext("",text,onDone);
    },
    hide: () => {
      snow.style.display = "none";
    }
  },

  //벚꽃
  he: {
    show: (text, onDone) => {
      sakura.style.display = "block";
      showMessage("이상현상", "벚꽃의 꽃말이 뭐였더라...");
      sayThenNext("",text,onDone);
      
    },
    hide: () => {
      sakura.style.display = "none";
      
    }
  }
};

// 이상현상 하나를 처음부터 끝까지 실행한다.
// text: 연출과 함께 보여줄 첫 문구
// dialogueLines: 연출시작이 끝난 뒤 순서대로 보여줄 추가 대사 [{speaker, text}, ...] (선택)
async function runAnomaly(kind, text, dialogueLines = []) {

  const thisNpcIndex = activeNPCIndex;

  const { show, hide, badEnding } = anomalyKinds[kind];

  const result = await new Promise(resolve => show(text, resolve));

  // 제한시간 초과 → 실패 엔딩
  if (result === "timeout") {

    hide();

    triggerAnomalyBadEnding(
      badEnding?.title ?? "이상현상",
      badEnding?.text ?? "결국 아무것도 하지 못했다."
    );

    return;
  }

  for (const line of dialogueLines) {
    await waitForNext(line.speaker ?? "", line.text);
  }

  hide();

  exitAnomalyEvent();
  nextAfterAnomaly(thisNpcIndex);
}

// ==================================================
// 이상현상 실패 엔딩 (제한시간 초과 시 공통으로 사용)
// ==================================================

function triggerAnomalyBadEnding(title, text) {

  gameState = "ending";

  clearInterval(gameTimer);

  speed = 0;

  clearChoices();

  setDistanceVisible(false);

  showMessage(title, "");

  showDialogue("", text);

  addChoice("끝내기", () => {

    gameState = "finished";

    startButton.textContent = "다시 시작";
    startButton.style.display = "block";
  });
}

// ==================================================
// 제한시간 안에 특정 버튼(기존 버튼이든, 새로 만든 선택지든)이
// 눌리길 기다리는 공용 함수
// buttonElement: 정답으로 인정할 버튼 엘리먼트
// timeLimitMs: 제한시간
// ==================================================

function waitForButtonOrTimeout(buttonElement, timeLimitMs, onDone) {

  const timeoutId = setTimeout(() => {

    buttonElement.removeEventListener("click", onClicked);

    onDone("timeout");   // 실패

  }, timeLimitMs);

  function onClicked() {

    clearTimeout(timeoutId);

    buttonElement.removeEventListener("click", onClicked);

    onDone();   // 성공
  }

  buttonElement.addEventListener("click", onClicked);
}

// 기존 addChoice는 그대로 두고, 버튼을 반환하는 버전을 하나 더 추가
function addChoiceAndReturn(text, action) {

  const button = document.createElement("button");

  button.textContent = text;

  button.addEventListener("click", action);

  choices.appendChild(button);

  return button;
} 

// 선택지를 보여주고, 고른 쪽의 대사 여러 줄을 순서대로 재생한 뒤 resolve
function waitForChoiceThen(promptText, options) {

  return new Promise(resolve => {

    showMessage("", promptText);
    showDialogue("", promptText);
    clearChoices();

    options.forEach(option => {

      addChoice(option.text, async () => {

        for (const line of option.lines) {
          await waitForNext(line.speaker ?? "", line.text);
        }

        resolve();
      });
    });
  });
}

// 제한시간 없이 그냥 버튼이 눌리길 기다림 (와이퍼로 액체 닦기 등)
function waitForButtonClick(buttonElement) {

  return new Promise(resolve => {

    function onClicked() {
      buttonElement.removeEventListener("click", onClicked);
      resolve();
    }

    buttonElement.addEventListener("click", onClicked);
  });
}

// 제한시간 없이, 속도가 threshold 이상이 될 때까지 폴링하며 기다림
function waitForSpeedAbove(threshold) {

  return new Promise(resolve => {

    const pollId = setInterval(() => {

      if (speed >= threshold) {

        clearInterval(pollId);
        resolve();
      }

    }, 200);
  });
}

// ==================================================
// NPC 데이터
// ==================================================

const npcs = [

  // ==================================================
  // NPC 1 데스(파로스)
  // ==================================================

  {
    id: "npc1",
    name: "??",
    triggerDistance: 459,
    destinationDistance: 0,

    events: [
      // 등장 직후 총격 → 문 열림 → 탑승까지, 대사 5줄을 한 이벤트로 묶음.
      // 줄마다 필요한 만큼만 action을 붙이면 된다.
      {
        type: "dialogue",
        lines: [
          {
            speaker: " ",
            text: "밖에서 굉음이 들린다.",
            action: () => {
              try {
                boom.currentTime = 0;
                boom.volume = 0.2;
                boom.play();
              } catch (e) {}

              try {
                gun.currentTime = 0;
                gun.volume = 0.3;
                gun.play();
              } catch (e) {}

              setTimeout(() => { boom.pause(); }, 2000);
              setTimeout(() => { gun.pause(); }, 1000);
            }
          },
          {
            speaker: " ",
            text: "타탕탕탕탕, 쾅!"
          },
          {
            speaker: " ",
            text: "문이 억지로 열리더니 무언가가 뒤에 탔다.",
            action: () => addPassenger(0)
          },
          {
            text: "... ... ......"
          },
          {
            speaker: " ",
            text: "아무래도 좋으니 계속 가도록 하자."
          }
        ]
      },

      {
        type: "wait",
        move: 20,
        text: "차 안에서 냉기가 감돌고 있다."
      },

      {
        type: "effect",
        action: () => {
          changeNPC1Appearance();
        }
      },

      {
        type: "wait",
        move: 10,
        text: "시선이 느껴진다. "
      },

      {
        type: "dialogue",
        speaker: "수수께끼의 남자아이",
        text: "안녕?"
      },

      // 선택지: reply만 적으면 "대사 출력 → 다음 → nextNPCEvent"가 자동으로 처리된다.
      // 복잡한 분기가 필요하면 이전처럼 action()을 직접 써도 된다(하위호환).
      // ===== 첫인사: 이름 묻기 =====
      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "누구야?",
            speaker: "수수께끼의 남자아이",
            reply: "글쎄, 나도 스스로를 뭐라 정의해야 할 지 모르겠네."
          },
          {
            text: "왜 이 차에?",
            speaker: "수수께끼의 남자아이",
            reply: "내가 의도한 건 아니야. 정신을 차리고 보니 여기에 있었거든."
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: "수수께끼의 남자아이", text: "그래도 잘 부탁해. 당분간은 너와 함께할 운명인 모양이야." },
          { speaker: "수수께끼의 남자아이", text: "기억나는 건 많이 없지만… 나도 이 길로 나아가야 하는 건 분명해." },
          { speaker: "수수께끼의 남자아이", text: "그리고 이 차는 시트가 푹신해서 마음에 드는걸." }
        ]
      },

      // ===== 첫인사: 어린애 같다는 반응 =====
      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "어린애답네.",
            speaker: "수수께끼의 남자아이",
            reply: "감상을 솔직히 말한 것 뿐이야. 물론 그런 모습을 아이라 받아들이는 건 네 자유지만."
          },
          {
            text: "아무래도 상관없어.",
            speaker: "수수께끼의 남자아이",
            reply: "다행이네. 혹시 내가 방해나 위협으로 느껴지면 곤란했거든. 난 너와 친하게 지내면 좋겠다고 생각했으니까."
          },
          {
            text: "나도 잘 부탁해.",
            speaker: "수수께끼의 남자아이",
            reply: "그런 답을 들으니 기뻐. 어쩌면 이런 걸 이상적인 첫만남이라고 하는 걸까?"
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: "수수께끼의 남자아이", text: "아, 운전을 방해해서 미안해. 하지만 말해줘야 하는 게 있어서." },
          { speaker: "수수께끼의 남자아이", text: "앞으로 길이 겹쳐질 때마다 여러 사람이 네 차에 타고 내리겠지." },
          { speaker: "수수께끼의 남자아이", text: "어떤 도로는 울퉁불퉁할지도 모르고." },
          { speaker: "수수께끼의 남자아이", text: "특히 이 길에선 뭐가 일어날지 모르거든." },
          { speaker: "수수께끼의 남자아이", text: "예를 들어 한 사람은 누군가가 아무도 없어야 할 밑에서…" },
          { speaker: "수수께끼의 남자아이", text: "차가운 손이 자기의 발목을 잡는 걸 느꼈다나 봐. 보통 이런 걸 괴담이라고 하지?" },
          { speaker: "수수께끼의 남자아이", text: "뜬소문일 뿐이고, 사람들끼리의 말이 와전된 결과가 대부분이지만…" },
          { speaker: "수수께끼의 남자아이", text: "말과 생각에는 힘이 있다고 하잖아." },
          { speaker: "수수께끼의 남자아이", text: "누군가가 정말 그런 게 있다고 믿는다면, 그리고 그 사람들이 늘어난다면 진실이 될 지도 모르는 일이지." },
          { speaker: "수수께끼의 남자아이", text: "운전만으로도 힘든데, 괜한 방해까지 생기면 가는 길이 내내 피곤해질걸." },
          { speaker: "수수께끼의 남자아이", text: "네 목적지가 얼마나 멀리 있는진 모르겠지만 조심하는 걸 추천해." }
        ]
      },

      // ===== 첫인사: 경고에 대한 반응 =====
      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "겁을 주는 거야?",
            speaker: "수수께끼의 남자아이",
            reply: "그렇게 느꼈어? 곤란하네… 그런 의도는 없었거든."
          },
          {
            text: "조심할게.",
            speaker: "수수께끼의 남자아이",
            reply: "응, 그 정도로만 마음에 담아줘."
          },
          {
            text: "아무래도 상관없어.",
            speaker: "수수께끼의 남자아이",
            reply: "너는 꽤 대담한 모양이네. 그렇다고는 해도 그게 맞는 반응일지 모르지."
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: "수수께끼의 남자아이", text: "내 말을 새길 필요까진 없어. 대부분은 이런 경고 없이 길을 잘 헤쳐나가니까." },
          { speaker: "수수께끼의 남자아이", text: "자, 너에게 하고 싶은 얘기는 이걸로 끝이야." },
          { speaker: "수수께끼의 남자아이", text: "이제 조용히 있을게. 밖을 구경하고 싶어졌어." }
        ]
      },

      {
        type: "wait",
        move: 20,
        text: "지나치게 조용하다."
      },

      // ===== 자기소개 =====
      {
        type: "dialogue",
        lines: [
          { speaker: "수수께끼의 남자아이", text: "왜인지 지루해진 표정을 하고 있네?" },
          { speaker: "수수께끼의 남자아이", text: "어라, 갑자기 말을 걸어서 놀란거야? 아니면 단순히 내 착각일까?" },
          { speaker: "수수께끼의 남자아이", text: "졸음운전은 위험하잖아. 나랑 말을 하는 쪽이 나을지 몰라. 어때?" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "아무래도 상관없어.",
            speaker: "수수께끼의 남자아이",
            reply: "그건 동의한다는 말로 이해해도 되는 답이네."
          },
          {
            text: "싫어.",
            speaker: "수수께끼의 남자아이",
            reply: "너무하네. 이래 봬도 난 널 정말로 걱정하는 중인걸."
          },
          {
            text: "고마워.",
            speaker: "수수께끼의 남자아이",
            reply: "이럴 때는 천만에, 라고 답하는 거겠지? 하지만 나야말로 네 대답에 고맙다고 얘기하고 싶어졌어."
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: "수수께끼의 남자아이", text: "네게 관심이 있어. 그러니 친구라는 관계로 우리 둘 사이의 이름을 바꾸고 싶었는데…" },
          { speaker: "수수께끼의 남자아이", text: "지금에서야 깨달았거든. 우리 둘 사이의 첫단추를 제대로 끼우지 못 했다는 걸." },
          { speaker: "수수께끼의 남자아이", text: "친구가 되고싶다, 그런 것치곤 아직 난 네 이름도 소개받지 못했잖아." },
          { speaker: "수수께끼의 남자아이", text: "이제야 정한 내 이름을 알려주지도 못했고." },
          { speaker: "수수께끼의 남자아이", text: "물론 마코토, 난 네 이름을 이미 알고 있지만… 형식이라는 건 단순한 겉치레에 불과한 게 아니라 일종의 선언이기도 하잖아." },
          { speaker: "수수께끼의 남자아이", text: "새로운 인연을 맺고 싶다는 의지가 드러나는 모습이니까." },
          { speaker: "수수께끼의 남자아이", text: "넌 어떻게 생각해?" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "아무래도 상관없어.",
            speaker: "수수께끼의 남자아이",
            reply: "응, 그럼 다시 해보자. 소개는 내가 먼저 시작할게."
          },
          {
            text: "이제와서?",
            speaker: "수수께끼의 남자아이",
            replies: [
              { speaker: "수수께끼의 남자아이", text: "너무 늦은 것처럼 느껴지려나. 하지만 왜일까, 마코토 너와는 친해지고 싶다는 생각이 들어버렸어." },
              { speaker: "수수께끼의 남자아이", text: "지금 이 시간은 나한텐 낭비로 느껴지지 않을거야. 너에게도 그랬으면 좋겠는데." },
              { speaker: " ", text: "잠시 망설이다 고개를 끄덕였다." },
              { speaker: "수수께끼의 남자아이", text: "다행이네, 그럼 소개는 내가 먼저 시작할게." }
            ]
          },
          {
            text: "이름을 정해?",
            speaker: "수수께끼의 남자아이",
            replies: [
              {text: "응, 그전까지는 이름의 필요성을 몰랐지만..."},
              {text: "이젠 알 수 있을 것 같아. 분명 너와 나를 구분하기 위해서 필요한 첫걸음이겠지."},
              {text: "이런 이유로 정했다는 건 이상하게 느껴져?"},
              {text: "난 내가 이런 결정을 내렸다는 게 기뻐. 네 영향을 받았다는 이야기니까."},
              {text: "언젠가 헤어지더라도 내가 너로 인해 변한 부분은 흔적으로 남아있을 거야."},
              {speaker: " ", text: "어깨를 으쓱했다."},
              {text: "음, 네 말로 한다면 아무래도 상관없다는 얘기겠지."},
              {text: "알았어. 본론으로 돌아갈까. 소개는 내가 먼저 할게."}
            ]

          }
        ]
      },

      // 이름 정하기 / 공개 (단일 수사 질문이라 일반 대사로 처리, 이후 '파로스'로 호칭 전환)
      {
        type: "dialogue",
        lines: [
          { speaker: "파로스", text: "내 이름은 파로스. 응, 그렇게 정했어. 너는?" },
          { speaker: " ", text: "유키 마코토." },
          { speaker: "파로스", text: "그럼 다시 한 번, 친구로서 잘 부탁해. 마코토." },
          { speaker: " ", text: "고개를 끄덕이자 파로스는 즐거운 듯이 웃고있다." },
          { speaker: "파로스", text: "마코토, 그거 알아? 네가 가는 길은 조용하지만 다채로워서 즐거워." },
          { speaker: "파로스", text: "계속 캄캄한 밤길인데 무슨 소리냐는 표정이네." },
          { speaker: "파로스", text: "하지만 나한테는 보여. 원래 이런 건 타인이 먼저 깨닫는 모양이니까." },
          { speaker: "파로스", text: "마지막까지 구경하고 싶은 풍경이야. 누구의 도착지가 먼저 나올지, 언제 길이 갈라지게 될지는 모르지만." },
          { speaker: " ", text: "파로스가 어두운 창 밖으로 고개를 돌리는 게 백미러를 통해 보인다." },
          { speaker: "파로스", text: "하지만 그때가 되어도 우리가 친구라는 건 변하지 않겠지." }
        ]
      },

      {
        type: "wait",
        move: 10,
        text: "작은 웃음소리가 간간이 들리는 듯하다."
      },

      // ===== 이상현상: 검은 액체 =====
      {
        type: "anomaly",
        action: async () => {

          const thisNpcIndex = activeNPCIndex;

          liquid.style.display = "block";

          await waitForNext(" ", "끈적거리는 검은 무언가가 천장에서부터 새는 것처럼 앞유리를 타고 흘러내리고 있다.");
          await waitForNext(" ", "대처가 늦는다면 새까맣게 시야를 뒤덮을 것 같다.");
          await waitForNext("파로스", "아무래도 방해가 나타난 모양이네.");
          await waitForNext("파로스", "서둘러 해결하는 게 좋아.");
          await waitForNext("파로스", "차를 잠깐 멈추는 건 문제가 되지 않지만, 너무 오랜 시간이 지나면 되돌릴 수 없을지 모르거든.");
          await waitForNext("파로스", "그렇게 된다면… 네 차는 이곳에서 멈춰야 할 거야. 목적지라고 생각하기엔 아쉬운 곳이지.");
          await waitForNext("파로스", "동시에 섣불리 내리지도 말고, 자칫하다가 길을 잃어버리면 곤란하니까.");
          await waitForNext("파로스", "닻이 되어주거나 길을 알려줄 누군가가 있다면 직접 나가서 해결하는 것도 도움이 되겠지만…");
          await waitForNext("파로스", "지금은 의미가 없는 조언이고, 누군가가 있더라도 나가는 건 조심해야 해.");
          await waitForNext("파로스", "하지만 내 조언을 믿는 건 어디까지나 마코토, 네가 결정할 일이야.");

          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "네가 길을 알려주는 역할을 하면 안 되는거야?",
              lines: [
                { speaker: "파로스", text: "아쉽게도 나로는 부족해. 오히려 더 길을 헤매게 만들지도 몰라." },
                { speaker: "파로스", text: "그럴 의도를 품지 않았는데도 말이야." },
                { speaker: "파로스", text: "길잡이가 되어 줄 수 있는 건, 분명 너와 비슷한 운명을 가진 사람만이 가능한 일이겠지." }
              ]
            },
            {
              text: "친구니까 믿어.",
              lines: [
                { speaker: "파로스", text: "네가 친구라는 말을 직접 꺼낸 건 처음이네." },
                { speaker: "파로스", text: "고마워, 마코토." },
                { speaker: "파로스", text: "아직 제대로 기억해내지 못했어도… 너랑 친구가 된 건 신기한 것 같아." },
                { speaker: "파로스", text: "다른 사람의 차에 탔다면 내가 이렇게 지낼 수 있었을까?" },
                { speaker: " ", text: "파로스는 미소짓고 있다." }
              ]
            },
            {
              text: "뭘 알고 있는 거야?",
              lines: [
                {speaker: "파로스", text: "미안, 제대로 답할 수 없어."},
                {speaker: "파로스", text: "어디까지나 떠올린 것에 불과하거든."},
                {speaker: "파로스", text: "당연히 알아야 하는 지식인것마냥, 방금의 현상이 일어나자마자 네게 경고해야 한다고 생각했어."},
                {speaker: "파로스", text: "왜 알고 있는지도 기억나지 않아."}
              ]
            }
          ]);

          await waitForNext("파로스", "얘기하는 동안에도 시간이 지체되고 있으니까.");
          await waitForNext("파로스", "우선 지금 일을 해결해보자.");
          await waitForNext("파로스", "너라면 어떻게 할 거야?");
          await waitForNext("파로스", "차에 있는 기능을 쓰는게 도움이 될지도 몰라.");

          // 와이퍼를 눌러야 해결됨
          showMessage("이상현상", "차에 있는 기능을 사용해보자.");
          showDialogue("", "차에 있는 기능을 사용해보자.");
          clearChoices();

          await waitForButtonClick(wiper);
          liquid.style.display = "none";

          await waitForNext(" ", "질척거렸던 액체가 시간이 지나자 말끔하게 닦였다.");
          await waitForNext("파로스", "다행이네. 지금 일은 이걸로 끝인가 봐.");
          await waitForNext("파로스", "이 길을 계속 가는 이상 앞으로도 비슷한 방해가 많이 일어나겠지만… 너라면 괜찮을 거야.");
          await waitForNext("파로스", "지금도 침착하게 대응했잖아.");

          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "네가 알려준 덕분이야.",
              lines: [
                { speaker: "파로스", text: "정말 그렇다고 생각해?" },
                { speaker: "파로스", text: "이상하네, 정말 기쁜데… 어딘가 어색하다는 기분이 들어." },
                { speaker: " ", text: "파로스는 한 손으로 머리를 짚었다." },
                { speaker: "파로스", text: "…기억을 잃기 전 나는 대체 뭐였을까." }
              ]
            },
            {
              text: "내가 원래 그래.",
              lines: [
                { speaker: "파로스", text: "자신감을 가지는 건 좋은 일이야." },
                { speaker: "파로스", text: "그러고보니 자신감은 어떤 사람들은 지나치고, 어떤 사람들은 모자라서 문제라곤 하지." },
                { speaker: "파로스", text: "어려운 일이네. 적당량을 유지해야 한다는 건." },
                { speaker: "파로스", text: "관계에도 적당량이라는 게 있을까?" },
                { speaker: "파로스", text: "그렇다면 우리는…" },
                { speaker: "파로스", text: "잘 모르겠네. 기억을 더 되찾아야 깊게 이야기할 수 있을 거 같아." }
              ]
            },
            {
              text: "와이퍼로 닦을 수 있는 느낌이 아니었는데.",
              lines: [
                {speaker: "파로스", text: "너무 신경쓰지 않아도 돼."},
                {speaker: "파로스", text: "그렇게 따지면 저 액체가 갑자기 생겨난 것부터 이상하니까."},
                {speaker: "파로스", text: "대부분의 사람들이 앞유리에 묻은 액체는 와이퍼로 닦인다...라고 생각하는 이상 아무런 문제도 없을 거야."}
              ]
            }
          ]);

          await waitForNext("파로스", "그럼 다시 출발하는 게 좋겠어.");
          await waitForNext("파로스", "아, 하나 더.");
          await waitForNext("파로스", "몸 조심해. 너라면 잘 할 거라고 방금까지 말했지만…그래도 얘기해주고 싶었어.");
          await waitForNext("파로스", "평범하게 친구로서, 어색하지 않지?");
          await waitForNext(" ", "파로스는 창 밖으로 시선을 돌렸다.");
          await waitForNext(" ", "운전을 계속하자.");

          exitAnomalyEvent();
          nextAfterAnomaly(thisNpcIndex);
        }
      },

      {
        type: "wait",
        move: 20,
        text: "자꾸만 뒤로 시선이 쏠린다."
      },

      // ===== 이상현상: 라디오 =====
      {
        type: "anomaly",
        action: async () => {

          const thisNpcIndex = activeNPCIndex;

          try {
            rad.currentTime = 0;
            rad.loop = true;
            rad.play();
          } catch (e) {}

          await waitForNext(" ", "라디오에서 치직거리는 소리가 난다.");
          await waitForNext(" ", "치지직 칙,");
          await waitForNext(" ", "…환자가 증가하는 추세입니다.");
          await waitForNext(" ", "미나토구를 중심으로…");
          await waitForNext(" ", "치익, 치지지직,");
          await waitForNext(" ", "으, 으악, 으아아아악!");
          await waitForNext(" ", "이후로 사람의 비명과 물컹한 무언가가 바닥을 기는 소리, 알아들을 수 없는 말을 속삭이는 소리가 섞여 나오고 있다…");

          showMessage("이상현상", "라디오의 소리가 점점 커진다. 빠르게 꺼야 할 것 같다.");
          showDialogue("", "라디오의 소리가 점점 커진다. 빠르게 꺼야 할 것 같다.");
          clearChoices();

          const result = await new Promise(resolve => {
            waitForButtonOrTimeout(radio, 5000, resolve);
          });

          try {
            rad.pause();
            rad.loop = false;
          } catch (e) {}

          if (result === "timeout") {

            triggerAnomalyBadEnding(
              "이상현상",
              "라디오 속 비명은 끝내 멈추지 않았다."
            );

            return;
          }

          await waitForNext("파로스", "이전과 달리 잔뜩 소란스러웠네. 하지만 해결했으니 다행이야.");
          await waitForNext("파로스", "어때, 무사히 넘어간 감상은?");

          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "도와주지 않는 거야?",
              lines: [
                { speaker: "파로스", text: "결국 이 길은 네가 나아가야 하니까." },
                { speaker: "파로스", text: "실은 말을 걸려고 했는데… 몸이 움직이지 않았어." },
                { speaker: "파로스", text: "조언까지는 허용했어도 그 이상 간섭하는 건 무리라는 뜻이겠지." },
                { speaker: " ", text: "파로스는 어깨를 늘어뜨리며 작게 한숨을 쉬었다." },
                { speaker: "파로스", text: "실망했다면 미안." }
              ]
            },
            {
              text: "문제없어.",
              lines: [
                { speaker: "파로스", text: "그건 다행인 일이네." },
                { speaker: "파로스", text: "조금 더 안심하고 너를 지켜봐도 되겠어." },
                { speaker: "파로스", text: "티가 나지 않았으려나. 나도 꽤 너를 걱정하고 있는데." }
              ]
            },
            {
              text: "놀랐어.",
              lines: [
                { speaker: "파로스", text: "그래? 표정에는 전혀 티가 나지 않았는걸." },
                { speaker: " ", text: "파로스가 고개를 옆으로 기울였다." },
                { speaker: "파로스", text: "그리고 네 마음 속에서도 동요하는 기색이 없었고." },
                { speaker: "파로스", text: "왜인지 몰라도 네 생각은 나에게 바로 느껴지거든." },
                { speaker: "파로스", text: "너무 당황스러워 하지 마, 일심동체라는 말도 있잖아?" },
                { speaker: "파로스", text: "우리가 그 정도로 깊은 인연을 맺었다는 뜻일지도 몰라." }
              ]
            }
          ]);

          await waitForNext("파로스", "그나저나 무슨 일이 생기고 있는걸까?");
          await waitForNext("파로스", "너와 함께 이 길을 나아갈수록 목적지에 가까워지고 있다는 건 느껴져.");
          await waitForNext("파로스", "정확히 어디인지 말할 수준은 되지 못하면서도…");
          await waitForNext(" ", "파로스는 턱을 괴고 골똘히 생각하고 있다.");
          await waitForNext("파로스", "계속 가다보면 모든 걸 깨닫는 날이 오겠지.");
          await waitForNext("파로스", "안 그래?");

          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "올 거야.",
              lines: [
                { speaker: "파로스", text: "너는 다정하네." },
                { speaker: "파로스", text: "사람의 말에는 힘이 깃들어 있다는데, 무슨 뜻인지 알 거 같아." },
                { speaker: "파로스", text: "네가 단언할 때마다 안심이 되거든." },
                { speaker: " ", text: "파로스는 미소짓고 있다." }
              ]
            },
            {
              text: "그때까지 같이 기다리자.",
              lines: [
                { speaker: "파로스", text: "그 전까진 쭉 함께해주겠다는 말이야?" },
                { speaker: "파로스", text: "어떡하지, 어쩌면 이대로도 괜찮겠다는 생각이 들어." },
                { speaker: "파로스", text: "시간은 흘러가기 마련이니, 그런 일은 불가능하겠지만 말이야." },
                { speaker: "파로스", text: "그냥… 내가 그 정도로 네 말에 기뻤다는 걸 알아줬으면 해." },
                { speaker: "파로스", text: "아쉽네. 너는 내 말을 통해서야 감정을 짐작할 수 있다니." },
                { speaker: "파로스", text: "왜 너와 나는 이런 곳에서 차이가 나는 걸까…" },
                { speaker: "나", text: "파로스는 나를 바라보고 있다." }
              ]
            },
            {
              text: "뭔가 힌트도 없어?",
              lines: [ 
                { speaker: "파로스", text: "너와 함께해야 한다는 걸 빼면… 아무것도." },
                { speaker: "파로스", text: "가능성을 따져보자면 방금 전의 이상한 현상에서 뭔가 알아낼 수도 있으려나." },
                { speaker: " ", text: "파로스는 고개를 저었다." },
                { speaker: "파로스", text: "그렇다고 해도 나한테 도움이 되진 않을 거라는 생각이 들어." },
                { speaker: "파로스", text: "운명은 정해져 있으니까." },
                { speaker: "파로스", text: "조금의 늦고 빠름은 내 역할에 차이를 줄 수 없겠다는… 그런…" },
                { speaker: "파로스", text: "미안해, 어쩐지 조금 괴로운 기분이 드네." },
                { speaker: " ", text: "파로스는 어딘가 슬픈 표정을 짓고 있다." }
              ]
            }
          ]);

          await waitForNext("파로스", "이제 문제는 해결했으니까, 계속 가자.");
          await waitForNext("파로스", "날 너무 신경쓰지 않아도 돼.");
          await waitForNext("파로스", "지금은 네 길을 나아가는 게 더 중요하니까.");
          await waitForNext(" ", "파로스는 눈을 감은 채 뒷좌석에 완전히 등을 기댔다.");
          await waitForNext(" ", "그 말대로 계속 나아가자.");

          exitAnomalyEvent();
          nextAfterAnomaly(thisNpcIndex);
        }
      },

      {
        type: "wait",
        move: 20,
        text: "..."
      },

      // ===== 번장/페고 오기 직전 =====
      {
        type: "dialogue",
        lines: [
          { speaker: "파로스", text: "어라, 다른 사람과 길이 겹친 모양이네." },
          { speaker: "파로스", text: "이미 많은 사람이 스쳐갔지만, 이번엔 조금 다른 모양이야." },
          { speaker: "파로스", text: "너와 깊은 인연이 있어서 그럴지, 혹은 운명 자체가 그런 종류인 걸지…" },
          { speaker: "파로스", text: "나는 조용히 지켜보고 있을게." }
        ]
      },

      {
        type: "wait",
        move: 175,
        text: "..."
      },
      // ===== 번장 & 페고 내린 후 =====
      // ===== 번장 & 페고 내린 후 =====
      {
        type: "dialogue",
        lines: [
          { speaker: "파로스", text: "둘 다 따라가지 않는 길을 고른거야?" },
          { speaker: "파로스", text: "물론 어디까지나 네 선택과 책임이라고 하지만…" },
          { speaker: "파로스", text: "새로운 길에 동승하는 것도 나쁘진 않았을 거 같거든." },
          { speaker: "파로스", text: "다른 이들이라면 몰라도, 그들은 헤매지 않게 자신의 길로 끌어갈 능력이 있어 보였으니까." },
          { speaker: "파로스", text: "음… 하지만 그건 너도 마찬가지이니 의미가 없으려나." }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "내가 갔으면 좋겠어?",
            replies: [
              { speaker: "파로스", text: "……" },
              { speaker: " ", text: "파로스는 고민하고 있다." },
              { speaker: "파로스", text: "아니, 그건 아니야." },
              { speaker: "파로스", text: "난 마코토 네가 남았으면 좋겠다고 생각했어." },
              { speaker: "파로스", text: "그런데… 왜일까, 길을 나아갈수록 불안한 마음도 커져가서." },
              { speaker: "파로스", text: "너를 지켜보는 일은 늘 즐거운데도 말야." },
              { speaker: " ", text: "파로스는 영문을 모르겠다는 듯 고개를 푹 숙였다." }
            ]
          },
          {
            text: "아무래도 상관없으니까.",
            replies: [
              { speaker: "파로스", text: "마코토, 너다운 대답이네." },
              { speaker: "파로스", text: "하지만 남들에게도 그렇게 답하면 널 오해할지도 몰라." },
              { speaker: "파로스", text: "나는 너와 연결되어 있으니까 그 말을 하면서도, 책임을 버리지 않으려는 마음을 느끼거든." },
              { speaker: "파로스", text: "그런데 다른 사람과의 관계는 이런 연결이 보통, 이 아닌 거잖아." },
              { speaker: "파로스", text: "아. 너라면 이것마저 아무래도 상관없다고 하려나?" },
              { speaker: " ", text: "파로스는 어깨를 으쓱였다." }
            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: "파로스", text: "그럼 네가 선택한 길이야." },
          { speaker: "파로스", text: "앞으로 무슨 일이 기다린다고 해도 변하지 않는 게 있겠지." },
          { speaker: "파로스", text: "지금 내가 너에게 느끼는 감정처럼…" },
          { speaker: "파로스", text: "자, 쭉 나아가자." },
          { speaker: " ", text: "목적지를 향해 다시 출발하자." }
        ]
      },

      {
        type: "wait",
        move: 20,
        text: "..."
      },

      // ===== 이상현상: 종소리 (파로스와의 작별) =====
      {
        type: "anomaly",
        action: async () => {

          const thisNpcIndex = activeNPCIndex;

          try {
            bellSound.currentTime = 0;
            bellSound.play();
          } catch (e) {}

          await waitForNext(" ", "어디선가 종소리가 울렸다.");
          await waitForNext(" ", "…갑자기 무슨 소리지?");
          await waitForNext("파로스", "…시간이 됐네.");
          await waitForNext("파로스", "마코토, 방금 건 신호야.");
          await waitForNext("파로스", "이곳에서 내려야 할 때를 알려주는 신호.");
          await waitForNext("파로스", "너와 헤어져야 한다는 건 슬프지만… 어쩔 수 없어.");
          await waitForNext("파로스", "누구에게나 그래야만 하는 일이 있기 마련이잖아.");

          // ===== 선택지 묶음: 셋 중 하나만 선택 =====
          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "계속 있어도 돼.",
              lines: [
                { speaker: "파로스", text: "고마워, 그 말만으로도 기뻐." },
                { speaker: "파로스", text: "하지만 그건 불가능해." },
                { speaker: "파로스", text: "내가 선택할 수 있는 길이 아니거든." },
                { speaker: " ", text: "파로스의 표정에 아쉬운 기색이 가득하다…" }
              ]
            },
            {
              text: "어디로 가는데?",
              lines: [
                { speaker: "파로스", text: "끝을 향해서." },
                { speaker: "파로스", text: "누구나 각자의 길을 가지고, 목적지를 향해 나아가잖아." },
                { speaker: "파로스", text: "그 과정에서 타인과 함께하고 헤어지는 건 달이 뜨고 지는 것과 같이 당연한 순리이고." },
                { speaker: "파로스", text: "그래도 너무 서운하게 생각하지 말아줘." },
                { speaker: "파로스", text: "우리는 무언가를 분명 남겼잖아." },
                { speaker: "파로스", text: "서로에게. 그렇지?" },
                { speaker: " ", text: "파로스는 작게 미소지었다." }
              ]
            },
            {
              text: "이 종소리가 뭐길래?",
              lines: [
                { speaker: "파로스", text: "네가 이해할 수 있는 비유로 말해보자면…" },
                { speaker: "파로스", text: "내비게이션의 알림음에 가까워." },
                { speaker: "파로스", text: "다만 나에게는… 절대적인 규칙이기도 하고." },
                { speaker: "파로스", text: "어라, 그런 눈으로 보지 말아줘." },
                { speaker: "파로스", text: "무조건 지켜야 한다는 건 불행하다는 뜻과 같지 않아." },
                { speaker: " ", text: "파로스는 안심시키려는 듯 미소짓고 있다…" }
              ]
            }
          ]);

          await waitForNext("파로스", "날 걱정하지 않아도 돼.");
          await waitForNext("파로스", "오히려 지금까지의 일이 기적에 가깝다는 걸, 이제 깨달았거든.");
          await waitForNext("파로스", "널 만나서 다양한 생각을 할 수 있게 되고, 여러 감정을 마주하고…");
          await waitForNext("파로스", "이런 게 운명일걸까.");
          await waitForNext("파로스", "있잖아, 마코토. 미리 말해둘게.");
          await waitForNext("파로스", "어디에 내가 도착하더라도… 그리고 네가 목적지에 도착하게 되더라도.");
          await waitForNext("파로스", "우리의 인연이 끊어지는 건 아니야, 그렇지?");
          await waitForNext(" ", "고개를 끄덕였다.");
          await waitForNext("파로스", "그리고 길은 늘 예상치 못한 곳에서 이어지잖아.");
          await waitForNext("파로스", "지금이 마지막 이별이 아닐지도 몰라.");
          await waitForNext("파로스", "그러니까… 영원한 작별이라는 말은 하지 않을게.");
          await waitForNext("파로스", "단순한 인사가 좋겠어.");
          await waitForNext("파로스", "마코토, 안녕.");
          removePassenger(0);  
          await waitForNext(" ", "…파로스는 어두운 샛길 속으로 사라졌다.");
          await waitForNext(" ", "이제부턴 혼자 나아가도록 하자.");

          exitAnomalyEvent();
          nextAfterAnomaly(thisNpcIndex);
        }
      }
    ]
  },

  // =====
  // NPC 2 번장
  //=====
  {
    id: "npc2",
    name: "침착한 소년",
    triggerDistance: 356,
    destinationDistance: 0,

    events: [

  // ===== 첫인사 =====
      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "누군가가 길가에 손을 들고 서 있는 모습이 보인다." },
          { speaker: " ", text: "잠시 멈추도록 하자." },
          { speaker: "침착한 소년", text: "갑작스럽게 미안한데, 얻어탈 수 있을까?" },
          { speaker: "침착한 소년", text: "외길인데, 한눈에 보기에도 수상하잖아." },
          { speaker: "침착한 소년", text: "겹치는 곳까진 누군가와 함께 있는 게 나을 것 같았거든." },
          { speaker: "침착한 소년", text: "엇, 혹시나 싶어 말하자면 난 수상하지 않아." },
          { speaker: "침착한 소년", text: "…" },
          { speaker: "침착한 소년", text: "…이걸 본인이 말하는 게 잘못된 선택이었을까?" },
          { speaker: "침착한 소년", text: "범인처럼 얘기해 버린 것 같아서." },
          { speaker: "침착한 소년", text: "음, 우연을 증명하는 건 어려운데… 추리에는 자신이 있지만." },
          { speaker: " ", text: "침착한 소년은 혼자 고민에 빠져 중얼거리고 있다." }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "난 혼자가 아닌데.",
            replies: [
              { speaker: "침착한 소년", text: "응? 하지만 차 안에 다른 사람은 보이지 않잖아." },
              { speaker: "침착한 소년", text: "혹시 내가 모르는 방식의 농담이야?" },
              { speaker: "침착한 소년", text: "미안, 최근 시골에서 지내는 중이라 유행이 느려." },
              { speaker: " ", text: "아무래도 파로스가 보이지 않는 모양이다." }
            ]
          },
          {
            text: "아무래도 상관없어.",
            replies: [
              { speaker: "침착한 소년", text: "호쾌한 대답이네." },
              { speaker: "침착한 소년", text: "다른 모두에게도 그렇게 대하는 편이야?" },
              { speaker: "침착한 소년", text: "아니, 별로 문제는 없어." },
              { speaker: "침착한 소년", text: "그냥 조금 특이하다고 생각했을 뿐이야." },
              { speaker: "침착한 소년", text: "어쨌든 고마워. 그럼 신세 좀 질게." }
            ]
          },
          {
            text: "어떻게 여기에?",
            replies: [
              { speaker: "침착한 소년", text: "앞으로 가다보니 여기였어." },
              { speaker: "침착한 소년", text: "한순간에 풍경이 바뀐 건 당황스럽지만… 어쨌든 멈춰있을 순 없다고 생각했지." },
              { speaker: "침착한 소년", text: "그 전엔 어땠냐고? 이렇게 깜깜하지 않았거든." },
              { speaker: "침착한 소년", text: "대신 안개가 잔뜩 껴있었어. 시야가 확보되지 않는 건 똑같았네." }
          

            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "파로스를 돌아보자 상관없다는 듯 시선이 창문 밖을 향하고 있다." },
          { speaker: " ", text: "…" },
          {
            speaker: " ",
            text: "침착한 소년을 태웠다.",
            action: () => addPassenger(1)
          }
        ]
      },

      { type: "wait", move: 20, text: "..." },

      // ===== 자기소개 =====
      {
        type: "dialogue",
        lines: [
          { speaker: "침착한 소년", text: "잠깐 얘기할 수 있을까?" },
          { speaker: "침착한 소년", text: "생각해보니 소개를 잊은 것 같아서." },
          { speaker: "침착한 소년", text: "이름 정도는 알고 있으면 좋잖아." },
          { speaker: "침착한 소년", text: "모처럼의 인연이니, 너와 친해지고 싶기도 하고." }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "아무래도 상관없어.",
            replies: [
              { speaker: "침착한 소년", text: "고민해봤는데…" },
              { speaker: "침착한 소년", text: "혹시 그 대답은 네가 말버릇으로 밀고 있는거야?" },
              { speaker: "침착한 소년", text: "꽤 괜찮네. 쿨해 보이잖아." },
              { speaker: " ", text: "묘하게 진지한 눈에 흘깃 향했던 시선을 돌렸다." },
              { speaker: "침착한 소년", text: "아니었나?" },
              { speaker: "침착한 소년", text: "그래도 괜찮다는 말은 진심이야. 믿어줘." }
            ]
          },
          {
            text: "먼저 해.",
            replies: [
              { speaker: "침착한 소년", text: "재촉하지 않아도 그럴 생각이었어." },
              { speaker: "침착한 소년", text: "말을 꺼낸 쪽이 나서야지, 그게 아니라면 남에게 떠넘기는 일이 되잖아." },
              { speaker: "침착한 소년", text: "그나저나 먼저 하라는 건, 내 소개가 끝나면 너도 해주겠다는 거지?" },
              { speaker: " ", text: "침착한 소년은 왜인지 만족한 표정이다." }
            ]
          },
          {
            text: "굳이?",
            replies: [
              { speaker: "침착한 소년", text: "설마… 거절하는 건가?" },
              { speaker: "침착한 소년", text: "아니, 물론 거절해도 괜찮아." },
              { speaker: "침착한 소년", text: "다만 이 분위기라면 승낙하지 않으려나, 하고 멋대로 짐작해버렸거든." },
              { speaker: "침착한 소년", text: "내 불찰이야." },
              { speaker: " ", text: "아니. 별로 상관없어." },
              { speaker: "침착한 소년", text: "그래? 다행이다." },
              { speaker: "침착한 소년", text: "그럼 나부터 할게." }
            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: "나루카미 유우", text: "나루카미 유우라고 해. 부르는 건 편하게 유우로도 괜찮아." },
          { speaker: "나루카미 유우", text: "너는?" },
          { speaker: " ", text: "유키 마코토." },
          { speaker: "나루카미 유우", text: "그럼 난 마코토라고 부를게." },
          { speaker: " ", text: "고개를 끄덕인 후 운전을 이어갔다." },
          { speaker: " ", text: "유우는 그것만으로 충분하다는 듯한 표정을 짓고 있다." }
        ]
      },

      { type: "wait", move: 15, text: "길은 여전히 조용하다." },

      // ===== 이상현상 - 거미줄 =====
      {
        type: "anomaly",
        action: async () => {

          const thisNpcIndex = activeNPCIndex;

          web.style.display = "block";

          await waitForNext(" ", "갑작스레 거미줄이 앞유리를 뒤덮었다.");
          await waitForNext(" ", "…방금, 작은 벌레같은 게 발 옆을 기어간 거 같은데.");
          await waitForNext(" ", "불길한 예감이 든다. 서둘러 거미줄을 치워야 할 거 같다.");
          await waitForNext("나루카미 유우", "이게 무슨…");
          await waitForNext("나루카미 유우", "네 길도 만만치 않나 보네.");
          await waitForNext("나루카미 유우", "음… 잘 모르겠지만 와이퍼로 닦아보는 건 어때?");
          await waitForNext("나루카미 유우", "의외로 단순하게 가는 게 해결책일지도 몰라.");

          showMessage("이상현상", "와이퍼를 사용해보자.");
          showDialogue("", "와이퍼를 사용해보자.");
          clearChoices();

          await waitForButtonClick(wiper);

          web.style.display = "none";

          await waitForNext("나루카미 유우", "아, 무사히 끝나서 다행이야.");
          await waitForNext("나루카미 유우", "정 안되면 직접 나가서 닦아야겠다고 생각했어.");
          await waitForNext("나루카미 유우", "아니면 거미를 하나하나 손으로 잡을 각오도 되어 있었고.");
          await waitForNext("나루카미 유우", "곤충잡기는 꽤 자신있거든. 도감도 다 읽었는걸.");
          await waitForNext("나루카미 유우", "무슨 일로 잡냐고? 시간을 때우기에 괜찮은 취미인데.");
          await waitForNext("나루카미 유우", "낚시 미끼로 쓰면 유용해. 최근엔 바다의 수호신을 잡기 위해 연습하는 중이라.");
          await waitForNext(" ", "상상하는 것만으로 의욕이 넘치는지 유우의 눈이 반짝이고 있다…");
          await waitForNext("나루카미 유우", "미안, 너무 내 말만 했네.");
          await waitForNext("나루카미 유우", "너는 보통 뭘 하고 지내? 취미가 따로 있을까?");

          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "식당을 돌아다녀.",
              lines: [
                { speaker: "나루카미 유우", text: "확실히 맛있는 밥은 중요하지." },
                { speaker: "나루카미 유우", text: "나도 이것저것 먹는 건 좋아하거든." },
                { speaker: "나루카미 유우", text: "주위가 너무 많이 먹는 게 아니냐고도 하는데… 그 점은 잘 모르겠어." },
                { speaker: "나루카미 유우", text: "아직 스페셜 고기덮밥도 다 못 먹으니까." },
                { speaker: "나루카미 유우", text: "응? 마코토 너도 관심이 있는거야?" },
                { speaker: "나루카미 유우", text: "그럼 한 번 놀러와봐." },
                { speaker: "나루카미 유우", text: "비오는날 한정이지만 온다면 내 전달력으로 설득해볼게." },
                { speaker: "나루카미 유우", text: "대신 충분한 준비는 해야 해." },
                { speaker: "나루카미 유우", text: "용기와 끈기. 관용, 전달력, 지식…" },
                { speaker: "나루카미 유우", text: "그 모든 게 갖춰져야 완식할 수 있는 게 바로 스페셜 고기덮밥이니까." },
                { speaker: "나루카미 유우", text: "…너한텐 그런 건 필요없다고?" },
                { speaker: " ", text: "유우는 깊이 고민하는 표정이다." },
                { speaker: "나루카미 유우", text: "지지 않도록 나도 더 노력해야겠네." },
                { speaker: "나루카미 유우", text: "나 혼자만 완식을 못한다면 부끄럽잖아." },
                { speaker: " ", text: "왜인지 유우는 각오를 다지고 있다." }
              ]
            },
            {
              text: "옥상에서 텃밭을 돌봐.",
              lines: [
                { speaker: "나루카미 유우", text: "그건 나랑 겹치는 일이네." },
                { speaker: "나루카미 유우", text: "기숙사의 동료들과… 확실히 즐거운 일인 거 같아." },
                { speaker: "나루카미 유우", text: "아, 나는 주로 나나코와 함께 집 옆에 텃밭을 가꾸고 있어." },
                { speaker: "나루카미 유우", text: "나나코는 내 사촌동생, 그리고 천사고." },
                { speaker: " ", text: "잔잔한 어조로 천사라 얘기하는 유우의 눈은 진지하다." },
                { speaker: " ", text: "그냥 넘어가기로 했다." },
                { speaker: "나루카미 유우", text: "가끔 삼촌도 도와주시지만… 바쁘시니까." },
                { speaker: "나루카미 유우", text: "요즘따라 사건이 많이 일어나거든. 범인을 빨리 잡아야지." },
                { speaker: "나루카미 유우", text: "어쨌든, 기른 채소나 과일은 그대로 먹어도 맛있지 않아?" },
                { speaker: "나루카미 유우", text: "왜인지 정신력이 차는 것 같고, 몸이 단단해지는 기분도 들잖아." },
                { speaker: " ", text: "고개를 끄덕여 동의를 표했다." },
                { speaker: "나루카미 유우", text: "어쩌면 다같이 키워서 그런 걸지도 몰라." },
                { speaker: "나루카미 유우", text: "정성을 다한 마음이 맛에 깃들었다는 거겠지." }
              ]
            },
            {
              text: "자정에 끝없는 탑을 올라야해.",
              lines: [
                { speaker: "나루카미 유우", text: "자정? 그리고 탑?" },
                { speaker: "나루카미 유우", text: "음, 그럼 난 텔레비전에 들어가는 게 의무라고 볼 수 있는데." },
                { speaker: "나루카미 유우", text: "아니아니, 나도 농담이니까. 너무 진지한 표정으로 보지 말아줘." },
                { speaker: "나루카미 유우", text: "그런 일이 현실에서, 음, 가능할 리 없잖아." },
                { speaker: "나루카미 유우", text: "……" },
                { speaker: "나루카미 유우", text: "물론 가끔 현실은 비현실보다 특이하지만 말이야." },
                { speaker: "나루카미 유우", text: "그게 진실이든 아니든, 무사히 끝났으면 좋겠네." },
                { speaker: "나루카미 유우", text: "다른 시간도 아니고 자정은 피곤하잖아." },
                { speaker: "나루카미 유우", text: "네가 해야만 한다고 결심했으면 내가 말릴 생각은 없어." },
                { speaker: "나루카미 유우", text: "네 의지로 결정한 거니까." },
                { speaker: "나루카미 유우", text: "하지만 그게 아니라면…" },
                { speaker: " ", text: "유우의 눈동자가 내 얼굴을 뚫어져라 바라보고 있다." }
              ]
            }
          ]);

          await waitForNext("나루카미 유우", "너무 말이 길었으려나.");
          await waitForNext("나루카미 유우", "어쨌든 문제는 해결됐으니까 계속 가자.");
          await waitForNext("나루카미 유우", "아쉽네, 주위에 식당이라도 있었으면 기념으로 뒷풀이를 했을텐데.");
          await waitForNext("나루카미 유우", "각자 요리를… 아니, 내가 요리를 만들어서 말이야.");
          await waitForNext(" ", "안 좋은 기억이 떠오른 건지 유우의 표정이 어두워지다 돌아왔다.");
          await waitForNext(" ", "…계속 나아가자.");

          exitAnomalyEvent();
          nextAfterAnomaly(thisNpcIndex);
        }
      },

      { type: "wait", move: 15, text: "밤공기가 차 안으로 스며든다." },

      // ===== 잡담 =====
      {
        type: "dialogue",
        lines: [
          { speaker: "나루카미 유우", text: "헛, 기분 탓인가?" },
          { speaker: "나루카미 유우", text: "아니, 놀라게 해서 미안해." },
          { speaker: "나루카미 유우", text: "갑자기 뒤에서 인기척이 난 기분이라…" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "넌 안 보여?",
            replies: [
              { speaker: "나루카미 유우", text: "왜 정말로 뭐가 있다는 듯이…" },
              { speaker: "나루카미 유우", text: "맞다고 해도 이상해. 나도 영감은 있다고 생각했는데." },
              { speaker: "나루카미 유우", text: "설마 여우와 얘기할 수 있는 정도로는 부족한건가?" }
            ]
          },
          {
            text: "줄무늬 옷을 입은 남자아이 유령이 있어.",
            replies: [
              { speaker: "나루카미 유우", text: "농담으로 치부하기엔 신기할 정도로 자세하네." },
              { speaker: "나루카미 유우", text: "정말이라면 나도 인사를 해야할까?" },
              { speaker: "나루카미 유우", text: "나보다 먼저 타 있던 거야? 아니면 중간에 갑자기?" },
              { speaker: "나루카미 유우", text: "인사말은 뭘로 해야…" },
              { speaker: " ", text: "유우를 말렸다." }
            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "파로스는 아무것도 못 들었다는 듯이 딴청을 피우고 있다." },
          { speaker: " ", text: "…소동이 일단락됐으니 계속 나아가자." }
        ]
      },

      { type: "wait", move: 15, text: "..." },

      // ===== 떠나기 직전 대화 =====
      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "길에 안개가 끼기 시작했다." },
          { speaker: "나루카미 유우", text: "슬슬 내가 내릴 때가 됐나 봐." },
          { speaker: "나루카미 유우", text: "드디어 너와 꽤 친해졌다고 생각했는데, 아쉽네." },
          { speaker: "나루카미 유우", text: "얼마 안 남은 시간이지만…" },
          { speaker: "나루카미 유우", text: "네게 묻고 싶은 게 있어." },
          { speaker: "나루카미 유우", text: "운전하는 모습을 계속 지켜보고, 얘기를 나누면서 궁금해진 게 생겼거든." },
          { speaker: "나루카미 유우", text: "마코토, 넌 그저 관성에 따라 나아가고 있는거야?" },
          { speaker: "나루카미 유우", text: "목적지가 보이지 않는 건 모두가 똑같아." },
          { speaker: "나루카미 유우", text: "당장 나만 해도 안개에 가려있으니까." },
          { speaker: "나루카미 유우", text: "하지만… 그럼에도 나아가겠다고 선택했고, 이건 온전히 나와 친구들의 의지라고 믿을 수 있어." },
          { speaker: "나루카미 유우", text: "어떤 결과가 나오더라도 눈을 돌리지 않고 받아들일 준비도 되어있고." },
          { speaker: "나루카미 유우", text: "음… 하하, 나도 직접 겪지 않은 이상, 허세나 허울처럼 들릴지 모르겠지만 말이야." },
          { speaker: "나루카미 유우", text: "넌, 미래로부터 눈을 돌리고 있어?" },
          { speaker: "나루카미 유우", text: "만약 그렇다고 대답한다면, 나와 함께 가자. 널 혼자 둘 수 없다고 생각해." },
          { speaker: " ", text: "여기선 대답을 잘 선택해야 할 것 같다…" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [

          // 정상 경로: 혼자 남고, 유우만 하차
          {
            text: "괜찮아.",
            action: async () => {

              await waitForNext("나루카미 유우", "그 말은 진심인 것 같네.");
              await waitForNext("나루카미 유우", "그럼 마지막으로 하나 더 물어볼게.");
              await waitForNext("나루카미 유우", "기댈 수 있는 동료가 옆에 있을까?");
              await waitForNext(" ", "……");
              await waitForNext("나루카미 유우", "응, 그 표정이라면 됐어.");
              await waitForNext("나루카미 유우", "다행이네. 내 걱정이 기우에 불과해서.");
              await waitForNext("나루카미 유우", "너도 나도, 좋은 친구들을 뒀나봐.");
              await waitForNext("나루카미 유우", "하지만 필요하면 나한테 연락해도 되니까.");
              await waitForNext("나루카미 유우", "지금 만난 건 우연이라고 해도, 필연으로 만드는 건 우리의 선택이잖아.");
              await waitForNext(" ", "유우는 안개가 짙게 낀 길로 사라졌다.");
              await waitForNext(" ", "계속 가도록 하자.");

              removePassenger(1);
              nextNPCEvent();
            }
          },

          // 특수엔딩 경로: 같이 하차
          {
            text: "…따라갈게.",
            action: async () => {

              await waitForNext("나루카미 유우", "응. 그럼 같이 내리자.");
              await waitForNext("나루카미 유우", "걱정하지 마, 다들 반겨줄 거니까.");
              await waitForNext("나루카미 유우", "우선은… 복잡한 걸 미뤄두고 식사부터 하러 가면 좋겠네.");

              specialEnding(1);
            }
          }
        ]
      }
    ]
  },

  //=====
  // NPC3 페고
  //=====
  {
    id: "npc3",
    name: "안경을 쓴 소년",
    triggerDistance: 266,
    destinationDistance: 0,

    events: [

      // ===== 첫인사 =====
      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "도로변에서 누군가가 손을 흔들고 있다." },
          { speaker: " ", text: "잠시 멈추도록 하자." },
          { speaker: "안경을 쓴 소년", text: "아, 다행이야." },
          { speaker: "안경을 쓴 소년", text: "잠깐 신세질 수 있을까?" },
          { speaker: "안경을 쓴 소년", text: "언제까지 같은 길이 이어질진 모르겠지만… 혼자보단 여럿이 낫잖아." },
          { speaker: "안경을 쓴 소년", text: "그리고 나만 태워달라는 건 아니야." },
          { speaker: "안경을 쓴 소년", text: "야식으로 준비한 카레랑 커피도 있어. 이것까지 포함해서 어때?" },
          { speaker: "안경을 쓴 소년", text: "보온병에 담아놔서 여전히 따뜻하거든." }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "얼마나 있는데?",
            replies: [
              { speaker: "안경을 쓴 소년", text: "꽤 많아. 원래라면 다같이 탐험할 때 나눠먹을 용도였거든." },
              { speaker: "안경을 쓴 소년", text: "거기에 르블랑의 카레는 언제나 호평이었으니까." },
              { speaker: "안경을 쓴 소년", text: "들어본 적이 없어?" },
              { speaker: "안경을 쓴 소년", text: "내가 장담할게, 아니, 이건 의미가 없겠네." },
              { speaker: "안경을 쓴 소년", text: "먹었을 때 맛이 없으면 그 즉시 내리라고 해도 괜찮아." },
              { speaker: " ", text: "안경을 쓴 소년은 자신만만하게 웃고 있다." }
            ]
          },
          {
            text: "아이가 타고있는 건 신경 안 써?",
            replies: [
              { speaker: "안경을 쓴 소년", text: "아이? 어디에 타고 있다는 거야?" },
              { speaker: "안경을 쓴 소년", text: "사람이 더 있는 것처럼은 안 보이는데…" },
              { speaker: "안경을 쓴 소년", text: "유령이라고 한다면 괜찮아." },
              { speaker: "안경을 쓴 소년", text: "진료소에 드나들면서 배짱을 꽤 키웠거든." },
              { speaker: "안경을 쓴 소년", text: "거기에 네가 태우기로 결정한 거면 나쁜 사람… 아니. 나쁜 유령일 거 같지 않으니까." },
              { speaker: "안경을 쓴 소년", text: "일종의 직감이야." },
              { speaker: "안경을 쓴 소년", text: "그런 걸 잘 믿냐고?" },
              { speaker: "안경을 쓴 소년", text: "음… 아, 그, 직업병이야. 빠른 판단이 자주 필요해서." },
              { speaker: "안경을 쓴 소년", text: "직업? 직업은… 그냥 평범한데…… 하하..." },
              { speaker: " ", text: "안경을 쓴 소년은 말을 버벅거리더니 머쓱한 표정을 짓고 있다." }
            ]
          },
          {
            text: "아무래도 상관없어.",
            replies: [
              { speaker: "안경을 쓴 소년", text: "그걸로 괜찮은거야?" },
              { speaker: "안경을 쓴 소년", text: "아니, 나야 당연히 고맙지." },
              { speaker: "안경을 쓴 소년", text: "하지만 네 대답을 멋대로 해석하는 거면 곤란하니까." },
              { speaker: " ", text: "안경을 쓴 소년은 눈을 가만히 마주하고 있다." },
              { speaker: "안경을 쓴 소년", text: "예를 들어 거절하는 걸 힘들어 하는 사람이 있잖아." },
              { speaker: "안경을 쓴 소년", text: "이 정도는 참을 수 있으니까, 하고 생각하는 경우도 있고." },
              { speaker: "안경을 쓴 소년", text: "그런데 아무것도 모르는 척 내 이득을 챙기는 건 원하지 않거든." },
              { speaker: "안경을 쓴 소년", text: "…" },
              { speaker: "안경을 쓴 소년", text: "훗, 그렇다고 쳐도 너무 거창하게 말했네." },
              { speaker: "안경을 쓴 소년", text: "네 표정을 보니 정말 상관없는 모양인데 말야." },
              { speaker: "안경을 쓴 소년", text: "괜한 참견을 했나 봐. 적당히 흘려들어도 되는 이야기야." },
              { speaker: " ", text: "안경을 쓴 소년은 가볍게 어깨를 으쓱거렸다." }
            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "파로스를 확인하자 창문에 머리를 기대고 있다." },
          { speaker: " ", text: "이번에도 관여하지 않겠다는 태도처럼 보인다." },
          { speaker: " ", text: "…" },
          {
            speaker: " ",
            text: "안경을 쓴 소년을 태웠다.",
            action: () => addPassenger(2)
          }
        ]
      },

      { type: "wait", move: 20, text: "향긋한 커피 냄새가 난다." },

      // ===== 자기소개 =====
      {
        type: "dialogue",
        lines: [
          { speaker: "안경을 쓴 소년", text: "맞아, 그러고보니 이름은 묻지 않아도 괜찮은거야?" },
          { speaker: "안경을 쓴 소년", text: "아무것도 모르는 사람을 태웠잖아." },
          { speaker: "안경을 쓴 소년", text: "물론 내가 요청한 일이고 카레와 커피로 유혹까지 했지만…" },
          { speaker: "안경을 쓴 소년", text: "조금 신경쓰이는데, 지금이라도 자기소개를 해보면?" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "아무래도 상관없어.",
            replies: [
              { speaker: "안경을 쓴 소년", text: "정말로 아무 생각이 없는거야?" },
              { speaker: "안경을 쓴 소년", text: "특이하네…" },
              { speaker: "안경을 쓴 소년", text: "아니, 대답하는 내용치고 너는 똑바로 앞을 향하고 있으니까. 조금 신기했어." },
              { speaker: "안경을 쓴 소년", text: "내가 모르는 곳에서 분명히 추구하는게 있다는 거겠지." },
              { speaker: "안경을 쓴 소년", text: "함께 있는 동안 네 목표를 나도 알고 싶어." },
              { speaker: "안경을 쓴 소년", text: "너만의, 흠… 따지자면 보물같은 무언가니까." },
              { speaker: "안경을 쓴 소년", text: "그런 거엔 흥미가 있어." }
            ]
          },
          {
            text: "그래.",
            replies: [
              { speaker: "안경을 쓴 소년", text: "빠른 대답이네, 고마워." },
              { speaker: "안경을 쓴 소년", text: "그럼 내가 먼저 할 테니까, 너도 이름 정도만 알려줘." },
              { speaker: "안경을 쓴 소년", text: "미리 얘기하자면, 그거 말고 더 캐묻진 않을 거야." },
              { speaker: "안경을 쓴 소년", text: "이후에 대화를 더 해나가다 궁금한 점이 있으면 말은 꺼내보겠지만, 꼭 대답할 필요도 없고." },
              { speaker: "안경을 쓴 소년", text: "누구에게나 숨기고 싶은 면은 있잖아." },
              { speaker: "안경을 쓴 소년", text: "안 그래?" }
            ]
          },

          {
            text: "굳이?",
            replies: [
              { speaker: "안경을 쓴 소년", text: "응, 굳이." },
              { speaker: "안경을 쓴 소년", text: "솔직히 말하자면, 네가 궁금해진 것도 있거든." },
              { speaker: "안경을 쓴 소년", text: "그런데 나를 소개하지도 않고 호기심을 채우는 건 정당하지 않잖아." },
              { speaker: "안경을 쓴 소년", text: "이쪽이 더 싫을까?" },
              { speaker: "안경을 쓴 소년", text: "그렇다면 무시해도 괜찮아." },
              { speaker: " ", text: "…" },
              { speaker: " ", text: "......" },
              { speaker: " ", text: "…상관없다는 듯이 고개를 까딱였다." },
              { speaker: "안경을 쓴 소년", text: "후후, 그럼 나부터 할게." }
            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: "안경을 쓴 소년", text: "그리고 져 줘서 고마워." },
          { speaker: " ", text: "안경을 쓴 소년은 씨익 미소지었다." },
          { speaker: "아마미야 렌", text: "나는 아마미야 렌이라고 해." },
          { speaker: "아마미야 렌", text: "아마미야는 길지? 그냥 렌이라고 불러줘." },
          { speaker: " ", text: "유키 마코토." },
          { speaker: "아마미야 렌", text: "유키 마코토… 응, 다 외웠어." },
          { speaker: "아마미야 렌", text: "나도 마코토라 불러도 되는걸까?" },
          { speaker: " ", text: "렌의 시선에 고개를 끄덕였다." },
          { speaker: "아마미야 렌", text: "그럼 계속 가볼까, 마코토." },
          { speaker: "아마미야 렌", text: "아아, 그, 너무 손님치고 멋을 부린 말투였네. …방금 말은 잊어줘." },
          { speaker: " ", text: "렌은 안경을 고쳐썼다…" },
          { speaker: " ", text: "모른 척하며 계속 가자." }
        ]
      },

      { type: "wait", move: 20, text: "길은 평온하게 이어진다." },

      // ===== 이상현상 - 흑백 (+모습 변화) =====
      {
        type: "anomaly",
        action: async () => {

          const thisNpcIndex = activeNPCIndex;

          screenElement.classList.add("bw-filter");
          changeNPC3Appearance();

          await waitForNext(" ", "…? 한순간에 시야의 색이 바랬다.");
          await waitForNext(" ", "온통 잿빛이다…");
          await waitForNext(" ", "속도를 천천히 낮추며 옆을 보니 렌의 옷이 바뀌어 있다.");
          await waitForNext("아마미야 렌", "이건…");
          await waitForNext("아마미야 렌", "아니, 내 옷은 크게 신경쓰지 않아도 돼.");
          await waitForNext("아마미야 렌", "그보다… 꽤 갑작스럽게 마주한 사태네, 이건.");
          await waitForNext("아마미야 렌", "위험한 것 같긴 하지만 해야 할 일이 딱히 보이지도 않고 말이야.");
          await waitForNext("아마미야 렌", "흠, 기다려줘. 주위를 한 번 둘러볼게.");
          await waitForNext("아마미야 렌", "눈치채지 못한 변화가 더 있을지도 모르잖아.");
          await waitForNext(" ", "잘 모르겠지만 렌의 눈빛이 날카로워진 것 같다.");
          await waitForNext("아마미야 렌", "현상은 아마도 이 장소에 한정된거고…");
          await waitForNext("아마미야 렌", "그러니 여기만 벗어나면 괜찮아질 거야.");
          await waitForNext("아마미야 렌", "다만… 점점 범위가 커져가고 있으니, 빠른 속도가 중요하겠네.");
          
          speed = 20;
          updateStatus();
          // 가속 페달로 일정 속도 이상이 되어야 해결
          showMessage("이상현상", "속도를 올려야 한다!");
          showDialogue("", "속도를 올려야 한다!");
          clearChoices();
          allowAccelerateDuringEvent = true;  

          await waitForSpeedAbove(60);   // 임계 속도는 원하는 값으로 조정
          allowAccelerateDuringEvent = false;   

          await waitForNext("아마미야 렌", "좋아, 쇼타임이다!");
          await waitForNext(" ", "풍경이 다시 돌아오고…");
          await waitForNext(" ", "렌의 옷도 원래대로 바뀌었다.");

          screenElement.classList.remove("bw-filter");
          revertNPC3Appearance();

          await waitForNext(" ", "…");
          await waitForNext("아마미야 렌", "큼, 크흠.");

          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "원래 그런 텐션이야?",
              lines: [
                { speaker: "아마미야 렌", text: "어? 아, 아니." },
                { speaker: "아마미야 렌", text: "그냥, 예측대로 해결이 되니까 기분이 좋은 것뿐이야." },
                { speaker: "아마미야 렌", text: "마코토가 신경쓸 필요까지 없다고 보는데..." },
                { speaker: "아마미야 렌", text: "하하, 아하하…" },
                { speaker: " ", text: "렌은 어색하게 웃고 있다." },
                { speaker: "아마미야 렌", text: "다 말할 수는 없지만, 간단하게 설명하자면 내가 있는 곳에서 리더 역할을 했어." },
                { speaker: "아마미야 렌", text: "조금 화려하게 날뛰어야 할 일이 많았고." },
                { speaker: "아마미야 렌", text: "그래야 우울해하거나 낙담하지 않고 텐션을 올려서 갈 수 있잖아." },
                { speaker: "아마미야 렌", text: "…왜 그래야 하는지 궁금한 표정이네." },
                { speaker: "아마미야 렌", text: "뭐, 사람마다 일의 방향성은 다른 법이잖아?" },
                { speaker: "아마미야 렌", text: "페르소나를 때에 맞춰서 바꿔끼는 건 내 장기이기도 하고." },
                { speaker: "아마미야 렌", text: "저것도 내가 가진 일면이니까 너무 이상하게 생각하진 말아줘, 마코토." }
              ]
            },
            {
              text: "옷은 왜 바뀌는 거야?",
              lines: [
                { speaker: "아마미야 렌", text: "글쎄, 영화 속이라고 해도 방심하지 말라고 그런 거 아닐까." },
                { speaker: "아마미야 렌", text: "그러니까, 음… TPO를 갖추라는 뜻일지도 모르고." },
                { speaker: " ", text: "렌은 주저하며 말을 이어나가고 있다." },
                { speaker: "아마미야 렌", text: "…하아아, 역시 이걸로는 설명이 안 되지?" },
                { speaker: "아마미야 렌", text: "나도 가끔은 궁금하거든. 꼭 저 옷이어야 할지." },
                { speaker: "아마미야 렌", text: "꽤 멋있다고 생각할 때도 있지만, 가끔은 눈에 너무 띄어서 말이야." },
                { speaker: "아마미야 렌", text: "내가 일을 해야 할 때 입어야 하는 옷인데… 마음대로 바꿀 수가 없어서." },
                { speaker: " ", text: "…" },
                { speaker: "아마미야 렌", text: "아니아니, 고생이 많다는 눈으로 보지 않아도 괜찮아." },
                { speaker: "아마미야 렌", text: "일 자체는 뿌듯한데다 충분히 보람차." },
                { speaker: "아마미야 렌", text: "덕분에 알게된 친구도 많고… 훗, 보아하니 너도 그런 경험이 있는 거 같은데." },
                { speaker: "아마미야 렌", text: "봐. 웃고 있잖아." }
              ]
            },
            {
              text: "……계속 갈까.",
              lines: [
                { speaker: "아마미야 렌", text: "…응, 고마워." },
                { speaker: " ", text: "…" },
                { speaker: " ", text: "……" },
                { speaker: " ", text: "………" },
                { speaker: " ", text: "어색한 침묵이 둘 사이를 채우고 있다." },
                { speaker: "아마미야 렌", text: "한 가지만 말해도 된다면…" },
                { speaker: "아마미야 렌", text: "그, 저런 모습도 나이긴 하지만," },
                { speaker: "아마미야 렌", text: "평상시는 지금이 맞으니까." },
                { speaker: "아마미야 렌", text: "응, 그러니까 왜 이렇게 들떴지…하는 표정으로는 그만 쳐다봐줬으면 좋겠다고, 할…까…..." },
                { speaker: "아마미야 렌", text: "물론 네가 날 바라보는 것 자체엔 문제가 없고, 그러니까, 음…" },
                { speaker: "아마미야 렌", text: "아니, 괜찮아." },
                { speaker: "아마미야 렌", text: "…" },
                { speaker: "아마미야 렌", text: "지금은 나야말로 아무래도 좋다고 얘기해야 할 것 같네…" },
                { speaker: " ", text: "렌은 무언갈 포기한 표정으로 시트에 푹 기댄 채 앉아있다." }
              ]
            }
          ]);

          await waitForNext("아마미야 렌", "아무튼, 방금 일은 뭘 의도한 거였을까?");
          await waitForNext("아마미야 렌", "마치… 흑백영화 속에 들어간 느낌이었어.");
          await waitForNext(" ", "렌은 턱을 괴고 진지하게 고민하고 있다.");
          await waitForNext("아마미야 렌", "평소에 움직일 때도 이정도면 영화에 나올 법하다고 생각한 적은 있지만…");
          await waitForNext("아마미야 렌", "어디까지나 비유였지, 실제로 바란 적은 없는데 말야.");
          await waitForNext("아마미야 렌", "정해진 시나리오대로 움직인다고 생각하면 별로잖아.");

          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "네가 주인공이라고 해도?",
              lines: [
                { speaker: "아마미야 렌", text: "그건 꽤 매혹적인 조건이네." },
                { speaker: "아마미야 렌", text: "늘 정의의 편에 서서, 옳은 일만 한다는 거잖아." },
                { speaker: " ", text: "렌은 가볍게 미소짓고 있다." },
                { speaker: "아마미야 렌", text: "하지만… 그렇다고 해도 바라지 않아." },
                { speaker: "아마미야 렌", text: "결과적으로 나에게 좋은 일만 생긴다고 해도, 남에게 휘둘리는 건 사양이니까." },
                { speaker: "아마미야 렌", text: "난 오롯이 내가 결정해서, 물론 동료들과 고민하고 선택하는 일을 포함해서 말야, 지금까지 행동해왔어." },
                { speaker: "아마미야 렌", text: "무슨 결말이 따라오라도 책임은 내가 져야겠지." },
                { speaker: "아마미야 렌", text: "하지만 마코토, 난 자유롭게 선택한 그 때를 후회하지 않을 거야." },
                { speaker: "아마미야 렌", text: "반성하고 앞으로 나아갈 수는 있겠지만… 없던 일인 척 눈을 가리는 건 불가능하니까." },
                { speaker: "아마미야 렌", text: "그게 내 욕심이야. 어때?" }
              ]
            }
          ]);

          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "동의해.",
              lines: [
                { speaker: "아마미야 렌", text: "다행이네, 혹시 너라면…" },
                { speaker: "아마미야 렌", text: "이번 질문에 아무래도 상관없어, 라고 할 줄 알았거든." },
                { speaker: " ", text: "렌은 꽤나 그럴듯하게 따라했다…" },
                { speaker: "아마미야 렌", text: "역시 괜한 걱정이었나봐." },
                { speaker: "아마미야 렌", text: "아아, 너무 주위에 신경을 쓰는 것처럼 보이나." },
                { speaker: "아마미야 렌", text: "그것보다는 보고도 못 본 척이 서투른 쪽에 가까워." },
                { speaker: "아마미야 렌", text: "내 스스로는 나쁜 버릇이라 생각한 적도 없고, 자동으로 바꿀 생각도 없지만." },
                { speaker: "아마미야 렌", text: "너라면 이해해 주겠어?" }
              ]
            },
            {
              text: "아무래도 상관없어.",
              lines: [
                { speaker: "아마미야 렌", text: "…" },
                { speaker: "아마미야 렌", text: "정말로?" },
                { speaker: "아마미야 렌", text: "물론 네 생각에 토를 달 수는 없겠지." },
                { speaker: "아마미야 렌", text: "하지만 내가 보는 너는… 아무래도 된다고 대답하면서도 주위를 잘 살피는 사람같거든." },
                { speaker: "아마미야 렌", text: "혹은 방금 대답은 주위가 괜찮다면, 누가, 무엇이 이끌든 상관없다는 뜻이려나." },
                { speaker: "아마미야 렌", text: "그건…" },
                { speaker: " ", text: "렌은 곰곰이 생각에 빠져있다." }
              ]
            }
          ]);

          await waitForNext(" ", "…렌을 바라보다가 다시 고개를 돌렸다.");
          await waitForNext(" ", "어쨌든, 계속 가야겠네.");
          await waitForNext(" ", "이상현상이 뒤따라오진 않더라도, 이젠 앞으로 나아갈 시간이다.");

          exitAnomalyEvent();
          nextAfterAnomaly(thisNpcIndex);
        }
      },

      { type: "wait", move: 10, text: "카레 냄새가 은은하게 퍼진다." },

      // ===== 잡담 (카레) =====
      {
        type: "dialogue",
        lines: [
          { speaker: "아마미야 렌", text: "잠깐 쉬면서 카레를 먹지 않을래?" },
          { speaker: "아마미야 렌", text: "내가 대접하겠다고 약속했잖아." },
          { speaker: " ", text: "렌이 보온병과 통을 꺼내 열자, 맛있는 냄새가 풍긴다." },
          { speaker: " ", text: "잠시 멈추고 먹는 시간을 가지자." },
          { speaker: "아마미야 렌", text: "어때? 르블랑 특제 카레의 맛은." },
          { speaker: " ", text: "렌이 자신만만한 표정으로 바라보고 있다…" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "맛있어.",
            replies: [
              { speaker: "아마미야 렌", text: "응, 그럴 줄 알았어." },
              { speaker: "아마미야 렌", text: "내가 여기서 내릴 일은 안 생기겠네." },
              { speaker: "아마미야 렌", text: "…조금 덜어갈 수 있냐고? 줄 사람, 아니 유령이 있어?" },
              { speaker: "아마미야 렌", text: "자, 여기 덜어줄게." },
              { speaker: " ", text: "주머니 속에서 종이컵과 종이로 접어 만든 스푼이 나왔다." },
              { speaker: "아마미야 렌", text: "유령이라고 해도 마코토의 친구인 거잖아." },
              { speaker: "아마미야 렌", text: "그럼 내가 뭐라 할 수 없지." },
              { speaker: "아마미야 렌", text: "나도 유령은 아니지만 주변이 쉽게 믿지 못하는 동료가 있기도 하고." }
            ]
          },
          {
            text: "커피랑 잘 어울리네.",
            replies: [
              { speaker: "아마미야 렌", text: "다행이네, 둘 다 맛을 잘 살린 모양이야." },
              { speaker: "아마미야 렌", text: "전부 최근에 배운 거라서 조금 걱정했거든." },
              { speaker: "아마미야 렌", text: "물론 꽤 따라잡긴 했다, 라는 말은 들었어." },
              { speaker: "아마미야 렌", text: "레시피에 있는 비결이 어딜 가지도 않고." },
              { speaker: "아마미야 렌", text: "르블랑의 카레를 연습하면서 갈고닦은 실력이 있으니까." },
              { speaker: "아마미야 렌", text: "흐음… 그렇게 마음에 들었다면 나중에 르블랑에 와 봐." },
              { speaker: "아마미야 렌", text: "내가 지인가로 대접할게." }
            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "파로스에게 카레 약간을 덜어 건넸다." },
          { speaker: " ", text: "렌이 의아해하는 눈빛으로 쳐다보는 건 신경쓰지 말자." }
        ]
      },

      { type: "wait", move: 10, text: "샛길로 이어지는 입구가 보이기 시작한다." },

      // ===== 떠나기 직전 대화 =====
      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "지하로 이어지는 샛길이 보인다." },
          { speaker: "아마미야 렌", text: "아, 난 저 앞에서 내려야겠네." },
          { speaker: "아마미야 렌", text: "미리 얘기해놓을게, 태워줘서 고마워." },
          { speaker: "아마미야 렌", text: "조금 아쉽기도 하네. 너랑 더 친해지고 싶었거든." },
          { speaker: "아마미야 렌", text: "…" },
          { speaker: "아마미야 렌", text: "마지막이니까 마코토, 너한테 물어야 한다고 생각한 게 있어." },
          { speaker: "아마미야 렌", text: "넌, 네가 선택해서 이 길로 나아가는 거야?" },
          { speaker: "아마미야 렌", text: "누군가가 이대로 가야한다고 말해서 그런 게 아니라?" },
          { speaker: "아마미야 렌", text: "네가 다른 사람들의 욕심에 의해 떠밀린건지… 마코토, 난 알고 싶어." },
          { speaker: "아마미야 렌", text: "아니, 알아야 한다고 생각해." },
          { speaker: "아마미야 렌", text: "네 자신의 의지로 고른 게 맞는지." },
          { speaker: "아마미야 렌", text: "만약 타인에 의해 왜곡된 결과라면… 나와 함께 가자." },
          { speaker: "아마미야 렌", text: "진심으로 하는 말이야." },
          { speaker: " ", text: "여기선 대답을 잘 선택해야 할 것 같다…" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [

          // 정상 경로: 혼자 남고, 렌만 하차
          {
            text: "괜찮아.",
            action: async () => {

              await waitForNext("아마미야 렌", "…그렇네, 진심인 모양이야.");
              await waitForNext("아마미야 렌", "그거 알아, 마코토? 너랑은 꽤 닮았다는 생각이 들어.");
              await waitForNext("아마미야 렌", "운전대를 다른 이에게 맡기지 않는 것도, 공통점 중에 하나겠지.");
              await waitForNext("아마미야 렌", "하지만 그렇기에 알 수 있는 점도 있어.");
              await waitForNext("아마미야 렌", "너한테도 등 뒤에 서줄 든든한 동료들이 있다는 거.");
              await waitForNext("아마미야 렌", "그게 아니라면 자꾸 뒤를 돌아보고 싶어질 테니까.");
              await waitForNext("아마미야 렌", "정했으면 당당히 맞서 싸워.");
              await waitForNext("아마미야 렌", "뭐, 거창하게 얘기했지만, 나도 그럴만한 처지는 아니긴 해.");
              await waitForNext("아마미야 렌", "그래도 도움이 필요하면 기댈 곳이 될 수 있도록 노력할게.");
              await waitForNext("아마미야 렌", "인연이라는 건 쉽게 사라지지 않는 법이잖아.");
              await waitForNext(" ", "렌은 지하도로로 내려갔다.");
              await waitForNext(" ", "계속 가도록 하자.");

              removePassenger(2);
              nextNPCEvent();
            }
          },

          // 특수엔딩 경로: 같이 하차
          {
            text: "…따라갈게.",
            action: async () => {

              await waitForNext("아마미야 렌", "그래, 그리고 미리 예고할게.");
              await waitForNext("아마미야 렌", "내가 널 반드시 개심시키겠다고.");
              await waitForNext("아마미야 렌", "이 말을 기억하고 있어준다면 됐어.");
              await waitForNext("아마미야 렌", "…아, 가서 르블랑에 먼저 들릴까? 아니면 빅뱅버거?");

              specialEnding(2);
            }
          }
        ]
      }

    ]
},

  //=====
  //NPC 4 료지
  //=====

  {
    id: "npc4",
    name: "목도리를 두른 소년",
    triggerDistance: 135,
    destinationDistance: 0,

    events: [

      // ===== 첫인사 =====
      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "누군가가 열심히 손을 흔들며 소리치고 있다." },
          { speaker: "목도리를 두른 소년", text: "아~ 잠시만! 여기여기!" },
          { speaker: " ", text: "잠시 멈추도록 하자." },
          { speaker: "목도리를 두른 소년", text: "휴우, 큰일나는 줄 알았어." },
          { speaker: "목도리를 두른 소년", text: "날 모른 척하고 지나가면 어떡하나 싶었거든." },
          { speaker: "목도리를 두른 소년", text: "이런 길을 혼자 걸어가긴 외롭잖아." },
          { speaker: "목도리를 두른 소년", text: "그래도 네가 제대로 멈춰줬으니 다행이야." },
          { speaker: "목도리를 두른 소년", text: "응? 혹시 안 태워줄 생각이야?" },
          { speaker: "목도리를 두른 소년", text: "하지만 난…" },
          { speaker: "목도리를 두른 소년", text: "너를 기다리고 있었다는 생각이 드는데…" },
          { speaker: "목도리를 두른 소년", text: "으음, 정말로 안돼?" },
          { speaker: " ", text: "목도리를 두른 소년은 간절한 눈빛으로 빤히 바라보고 있다." }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "아무래도 상관없어.",
            replies: [
              { speaker: "목도리를 두른 소년", text: "그 말… 왜인지 귀에 익숙하네." },
              { speaker: "목도리를 두른 소년", text: "이전에 너와 스친 적이 있던걸까?" },
              { speaker: "목도리를 두른 소년", text: "너를 한참 전부터 알았을지도 모르겠다는 기분이 드는데…" },
              { speaker: "목도리를 두른 소년", text: "그렇다고 하면 어디서……" },
              { speaker: " ", text: "목도리를 두른 소년은 말끝을 흐리며 생각에 잠겼다." },
              { speaker: "목도리를 두른 소년", text: "미안해. 기억이 어렴풋하게만 나네." },
              { speaker: "목도리를 두른 소년", text: "하지만 인연은 지금부터 쌓으면 되는 거잖아?" },
              { speaker: "목도리를 두른 소년", text: "그리고 아무래도 상관없다는 말은, 내가 타도 된다는 뜻일거고." },
              { speaker: "목도리를 두른 소년", text: "음… 아, 시작하기엔 이 말이 제일 좋겠다." },
              { speaker: "목도리를 두른 소년", text: "잘 부탁해." }
            ]
          },
          {
            text: "기다린 사람이 정말 내가 맞아?",
            replies: [
              { speaker: "목도리를 두른 소년", text: "아하하, 물론이야." },
              { speaker: "목도리를 두른 소년", text: "비록 누구를 기다리는진 잊어버렸지만…" },
              { speaker: "목도리를 두른 소년", text: "너한테는… 왜인지 그리운 기분이 들거든." },
              { speaker: "목도리를 두른 소년", text: "어쩌면 아주 예전에 인연이 있었던걸까?" },
              { speaker: "목도리를 두른 소년", text: "그렇다면 지금 다시 친해질 수 있는 기회가 와서 다행이라는 생각이 드네." },
              { speaker: "목도리를 두른 소년", text: "아, 너무 내 직감에 의존했다면…" },
              { speaker: "목도리를 두른 소년", text: "다른 증거로, 이 한적한 길을 지나다니는 사람이 더 있을 것 같지도 않잖아?" },
              { speaker: " ", text: "목도리를 두른 소년의 시선이 도로를 살피다가 이내 돌아왔다." },
              { speaker: "목도리를 두른 소년", text: "그러니까, 잘 부탁해." }
            ]
          },
          {
            text: "처음 본 사람 모두한테 그렇게 말해?",
            replies: [
              { speaker: "목도리를 두른 소년", text: "앗, 혹시 이상한 오해를 불러일으켰을까?" },
              { speaker: "목도리를 두른 소년", text: "미안해. 이런 길에서 처음 만난 사람에게 뭐를 다음으로 해야 보통인지 잘 모르겠어." },
              { speaker: "목도리를 두른 소년", text: "…처음?" },
              { speaker: "목도리를 두른 소년", text: "아니, 왜인지 이전부터 너를 알고 있던 것 같은 기분이 들지만…" },
              { speaker: "목도리를 두른 소년", text: "어디까지나 느낌뿐이니까, 너도 나를 알고 있는 눈치는 아니고." },
              { speaker: "목도리를 두른 소년", text: "하지만 기다렸다는 말은 네게만 했을거야." },
              { speaker: "목도리를 두른 소년", text: "그야 본 순간 정답이라는 생각이 떠올랐는걸." },
              { speaker: "목도리를 두른 소년", text: "그리고 너랑 꼭 친해지고 싶다는 마음도 같이 들었어." },
              { speaker: "목도리를 두른 소년", text: "그게 전부야. 어때, 받아줄래?" },
              { speaker: " ", text: "…고개를 끄덕였다." },
              { speaker: "목도리를 두른 소년", text: "아하하, 기뻐." },
              { speaker: "목도리를 두른 소년", text: "그럼 당분간… 잘 부탁해." }
            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          {
            speaker: " ",
            text: "목도리를 두른 소년을 차에 태웠다.",
            action: () => addPassenger(3)
          },
          { speaker: " ", text: "나풀거리는 노란 천조각이 사이드 브레이크를 잡은 손을 간지럽힌다." },
          { speaker: " ", text: "…무시하고 나아가자." }
        ]
      },

      { type: "wait", move: 5, text: "차 안이 소란스럽다..." },

      // ===== 자기소개 =====
      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "옆에서 목도리를 두른 소년이 부담스럽게 쳐다보고 있다." },
          { speaker: " ", text: "…말을 걸어보자." },
          { speaker: "목도리를 두른 소년", text: "앗, 마음이 통했네?" },
          { speaker: "목도리를 두른 소년", text: "나도 너한테 말을 걸려 했어." },
          { speaker: "목도리를 두른 소년", text: "엄청 중요한 순서를 하나 건너뛰었으니까." },
          { speaker: "목도리를 두른 소년", text: "보통을 운운할 것도 없이, 친구라면 이름을 알고 있어야 하잖아." },
          { speaker: "목도리를 두른 소년", text: "그러니까… 서로 소개하는 시간을 갖지 않을래?" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "우리가 친구야?",
            replies: [
              { speaker: "목도리를 두른 소년", text: "와… 엄청 너무해." },
              { speaker: "목도리를 두른 소년", text: "조금 상처받았을지도." },
              { speaker: "목도리를 두른 소년", text: "하지만 네가 친구가 아니라고 생각했다면… 지금부터 그 생각을 바꾸게 만들면 되는 거겠네." },
              { speaker: "목도리를 두른 소년", text: "내 끈기는 충분하니까 걱정하지 마." },
              { speaker: "목도리를 두른 소년", text: "아, 그래! 친구가 되는 첫걸음을 자기소개로 하자." },
              { speaker: "목도리를 두른 소년", text: "하나하나 단계를 밟아 보면 언젠가 네 입으로 나를 친구라 하는 날이 오지 않겠어?" },
              { speaker: "목도리를 두른 소년", text: "그리고 이미 난 네 길 위에 있는걸. 너무 피하려고만 하지 말아줘." },
              { speaker: "목도리를 두른 소년", text: "아하하, 말이 길어졌네." },
              { speaker: "목도리를 두른 소년", text: "소개는 나부터 할게. 다음으로 이어서 꼭 해주는거다?" }
            ]
          },
          {
            text: "아무래도 상관없어.",
            replies: [
              { speaker: "목도리를 두른 소년", text: "응응, 그럼 내가 먼저 얘기하면 다음으로 네가 하는 걸로 하자." },
              { speaker: "목도리를 두른 소년", text: "소개한다고 해도 대단한 건 없지만…" },
              { speaker: "목도리를 두른 소년", text: "난 이런 사건 자체가 인연을 특별하게 만들어주는 거라고 생각해." },
              { speaker: "목도리를 두른 소년", text: "지금은 그런 무뚝뚝한 표정이라고 해도, 함께 있는 시간이 늘어나다보면 또 모르는 일이잖아?" },
              { speaker: "목도리를 두른 소년", text: "네가 날 소중한 친구로 생각할지도." },
              { speaker: "목도리를 두른 소년", text: "아하하, 그렇게 대놓고 황당하다는 시선으로 바라보지 말아줘." },
              { speaker: "목도리를 두른 소년", text: "…그래도 말야, 현실은 늘 상상을 뛰어넘는 법이니까." },
              { speaker: "목도리를 두른 소년", text: "이건 너한테만 해당하는 아니라… 음, 어쩌면 나에게도……" },
              { speaker: "목도리를 두른 소년", text: "……" },
              { speaker: "목도리를 두른 소년", text: "앗, 미안해. 말이 너무 멀리 나갔네." },
              { speaker: "목도리를 두른 소년", text: "가끔 생각말고 다른 게 앞서는 경우가 있거든." },
              { speaker: "목도리를 두른 소년", text: "방금도 그랬던 거 같아." }
            ]
          },
          {
            text: "그래",
            replies: [
              { speaker: "목도리를 두른 소년", text: "바로 허락해주는 거야? 고마워." },
            { speaker: "목도리를 두른 소년", text: "아하하, 너는 정말 다정하네." },
            { speaker: "목도리를 두른 소년", text: "만난지 오래되지는 않았지만, 조금 신기해." },
            { speaker: "목도리를 두른 소년", text: "나를 바로 태워준 것도 그렇고… 지금 내 얘기를 다 받아준 것도 그렇고." },
            { speaker: "목도리를 두른 소년", text: "대부분이 다 그런걸까? 아니면 너만 특별히?" },
            { speaker: "목도리를 두른 소년", text: "궁금하네… 아직 내가 모르는 게 많아서 말이야." },
            { speaker: "목도리를 두른 소년", text: "으음, 이럴 때 보통은… 글쎄, 주의하라고 얘기해주는게 맞는 거려나?" },
            { speaker: "목도리를 두른 소년", text: "하지만 지금은 내가 그 친절에 기대고 있는 처지니까 말을 더 얹지 않을게." }
          

            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: "모치즈키 료지", text: "그럼… 모치즈키 료지라고 해." },
          { speaker: "모치즈키 료지", text: "간단하게 료지라고 불러줘?" },
          { speaker: "모치즈키 료지", text: "이 편이 친한 사람들끼리 부르는 방법이라 들었거든." },
          { speaker: "모치즈키 료지", text: "자, 이제 네 차례야." },
          { speaker: " ", text: "유키 마코토." },
          { speaker: "모치즈키 료지", text: "그럼 나는 마코토라고 부르는게 맞는거지?" },
          { speaker: "모치즈키 료지", text: "아하하, 입에서 네 이름을 굴려보니까 엄청 즐거워졌어." },
          { speaker: "모치즈키 료지", text: "유키 쪽도 물론 난 좋아하지만, 마코토… 응, 마코토가 역시 입에 잘 붙네." },
          { speaker: " ", text: "료지는 기분이 좋아 보인다." },
          { speaker: " ", text: "…어쨌든, 소개가 끝났으니 계속 나아가는데 집중하자." }
        ]
      },

      { type: "wait", move: 10, text: "길 주위가 캄캄하다." },

      // ===== 잡담2 (잡담1보다 먼저 배치) =====
      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "료지는 창문 너머로부터 시선을 떼지 못하고 있다." },
          { speaker: "모치즈키 료지", text: "네 길은 엄청 알록달록해서 예쁘네." },
          { speaker: "모치즈키 료지", text: "보고만 있어도 여러 색이 나한테까지 물드는 기분이야." },
          { speaker: "모치즈키 료지", text: "아직 흐릿하다고 해도… 나한테는 잘 보여." },
          { speaker: " ", text: "다시 창밖을 쳐다봐도 길 주위는 캄캄하다." },
          { speaker: " ", text: "실루엣이 겨우 구분될 정도이다." },
          { speaker: "모치즈키 료지", text: "앗, 그래? 나만 잘 구분할 수 있는 거야?" },
          { speaker: "모치즈키 료지", text: "왜라고 물어봐도 할 말이 안 떠오르는데." },
          { speaker: "모치즈키 료지", text: "으음… 네 차에 탄 순간부터 자연스럽게 보인 풍경이니까…" },
          { speaker: "모치즈키 료지", text: "이상하게 생각할 틈도 없었어." },
          { speaker: "모치즈키 료지", text: "일종의 이상현상일까?" },
          { speaker: "모치즈키 료지", text: "하지만 눈이 즐겁기만 하지, 딱히 나한테 해를 끼치지도 않는 걸." },
          { speaker: "모치즈키 료지", text: "마코토 너한테는 아무런 영향도 안 주는 모양이고." },
          { speaker: "모치즈키 료지", text: "음….." },
          { speaker: "모치즈키 료지", text: "아, 역시 내가 널 기다린 게 맞다는 증명일지도 몰라!" },
          { speaker: " ", text: "료지는 주먹을 쥔 손을 반대쪽 손바닥으로 탁, 소리가 나도록 쳤다." },
          { speaker: " ", text: "다른 머리칼과 어울리지 않는 앞머리 두 가닥도 방금 전보다 꼿꼿하게 서있다." },
          { speaker: " ", text: "…이건 왜?" },
          { speaker: " ", text: "아무튼 료지는 머리 위에서 전구가 반짝인듯한 표정이다." },
          { speaker: "모치즈키 료지", text: "퍼즐이 딱 맞춰지는 기분이네. 응응, 이건가봐." },
          { speaker: "모치즈키 료지", text: "역시 마코토와 만난 건 운명이 이끌어준 거였어." },
          { speaker: " ", text: "…료지는 들뜬 채 냅두고 계속 가자." }
        ]
      },

      { type: "wait", move: 10, text: "차 안이 다시 소란스럽다..." },

      // ===== 잡담1 =====
      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "차 안이 소란스럽다…" },
          { speaker: "모치즈키 료지", text: "운전만 하기엔 심심하지 않아?" },
          { speaker: "모치즈키 료지", text: "조금 지루한 표정인 거 같아서." },
          { speaker: "모치즈키 료지", text: "뭐라도 얘기하자, 마코토." },
          { speaker: "모치즈키 료지", text: "으음… 아, 좋아하는 사람에 대해서라든가!" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "……",
            replies: [
              { speaker: "모치즈키 료지", text: "어라, 이런 주제는 별로야?" },
              { speaker: "모치즈키 료지", text: "하지만 너무 궁금한걸." },
              { speaker: "모치즈키 료지", text: "이 길의 끝까지 함께하고 싶은 사람이 누구일지 말야." },
              { speaker: "모치즈키 료지", text: "물론 좋아한다고 해서 전부 이뤄지는 건 아니라는 건 알아." },
              { speaker: "모치즈키 료지", text: "이 차에 태운다고 해도 언제 내릴지 모를거고…" },
              { speaker: "모치즈키 료지", text: "하지만 정답을 모르는 목적지에 함께 가고 싶은 사람이 있다니 멋지잖아." },
              { speaker: "모치즈키 료지", text: "거기에 네가 바라는 인연이라면 꼭 이루어질 거 같아서, 미리 묻고 싶었어." },
              { speaker: "모치즈키 료지", text: "하하, 칭찬해도 소용없다는 표정으로 바라보고 있네." },
              { speaker: "모치즈키 료지", text: "하지만 처음부터 끝까지 다 내 진심이야." },
              { speaker: "모치즈키 료지", text: "누가 마코토 널 거절하는 장면이 도저히 안 떠오르는데 어떡해." }
            ]
          },
          {
            text: "없어.",
            replies: [
              { speaker: "모치즈키 료지", text: "정말로? 숨기는 게 아니고?" },
              { speaker: "모치즈키 료지", text: "아니아니, 추궁하려는 의도는 없어." },
              { speaker: "모치즈키 료지", text: "그냥 의아하다고 생각해서." },
              { speaker: "모치즈키 료지", text: "왜냐하면… 너는 많은 사람들과 다양한 인연으로 이어져 있잖아." },
              { speaker: "모치즈키 료지", text: "그 중 좋아하는 사람과 같은 감정으로 맺어지는 형태를 연인이라고 하지?" },
              { speaker: "모치즈키 료지", text: "그러니까, 네가 가진 많은 인연의 종류 중에 연인은 당연히 채워져 있을 줄 알았다고 해야하나…" },
              { speaker: "모치즈키 료지", text: "연인이라는 건 특별한 관계이긴 해도, 널리 알려진만큼 보편적이기도 하니까." },
              { speaker: "모치즈키 료지", text: "예를 들어 우연히 만난 누군가를 사귀는 건 다들 놀라움을 금방 잊고 축하하겠지만…" },
              { speaker: "모치즈키 료지", text: "똑같이 우연히 만난 나이차이가 많이 나는 사람과 가족처럼 대하는 사이가 됐다고 하면 신기해하는 것처럼 말이야." },
              { speaker: "모치즈키 료지", text: "하지만 너라고 해도 금방 만날 수는 없나보네." },
              { speaker: "모치즈키 료지", text: "열심히 찾을수록 인연이 금방 나타나는 세계라면 좋을텐데 말이야." },
              { speaker: "모치즈키 료지", text: "앗, 너라면 오히려 인연찾기 순서에서 뒤로 밀려나려나? 하하." },
              { speaker: "모치즈키 료지", text: "지금은 크게 신경쓰지 않는 얼굴이니까." },
              { speaker: "모치즈키 료지", text: "하지만… 누군가에게 불공평하더라도, 분명 정해진 법칙이 없기에 세상이 더 다채로워지는 법이겠지." },
              { speaker: "모치즈키 료지", text: "어려운 일이네. 여러가지를 더 겪어봐야 할 거 같아." }
            ]
          },
          {
            text: "너는?",
            replies: [
              { speaker: "모치즈키 료지", text: "나? 나는…" },
              { speaker: "모치즈키 료지", text: "음……" },
              { speaker: " ", text: "료지는 스카프를 입가까지 올린채 한참동안 고민하고 있다." },
              { speaker: "모치즈키 료지", text: "아직은 잘 모르겠어." },
              { speaker: "모치즈키 료지", text: "아하하, 내가 말을 꺼냈으면서 이렇게 대답하는 건 맥빠질까?" },
              { speaker: "모치즈키 료지", text: "그런데 진지하게 생각할수록 대답이 입에서 안 나와." },
              { speaker: "모치즈키 료지", text: "이건 또 새로운 경험이네." },
              { speaker: "모치즈키 료지", text: "역시 설명도 없이 말을 멈춰버리는 건 안 좋겠지." },
              { speaker: "모치즈키 료지", text: "사실… 떠오르는 사람은 있어." },
              { speaker: "모치즈키 료지", text: "하지만 내가 만난 사람 수 자체도 적었어서, 겨우 이정도로 떠오르는 사람을 얘기하면 안된다는 생각이… 들어버렸거든." },
              { speaker: "모치즈키 료지", text: "너무 내 선택이 가볍게 보일 것 같아서." },
              { speaker: "모치즈키 료지", text: "나뿐만 아니라 상대에게도 그런 식으로 보일 것 같은게… 조금 싫네." },
              { speaker: "모치즈키 료지", text: "조금 더 세상을 겪어보고, 또 이것저것 배워보고, 사람을 만나면서도…" },
              { speaker: "모치즈키 료지", text: "떠오르는 사람이 변하지 않을 때, 그때 말하고 싶어." },
              { speaker: "모치즈키 료지", text: "하하, 너무 진지했나?" }
            ]
          }
        ]
      },
      {
        type: "dialogue",
        lines: [
          { speaker: "모치즈키 료지", text: "어라, 생각보다 더 오래 얘기했네." },
          { speaker: "모치즈키 료지", text: "이 정도면 운전에 도움이 아니라 방해가 됐으려나?" },
          { speaker: " ", text: "료지는 볼을 긁적였다." },
          { speaker: "모치즈키 료지", text: "미안해, 그래도 어울려줘서 고마워." },
          { speaker: "모치즈키 료지", text: "이제 조용히 있으면 되는거지?" },
          { speaker: " ", text: "료지는 입을 다물곤 시트 위에서 편안한 자세를 찾아 부스럭거리고 있다." },
          { speaker: " ", text: "…몸을 움직일 때마다 앞머리가 더듬이처럼 흔들리는 게 눈에 띈다." }
        ]
      },

      { type: "dialogue", speaker: " ", text: "아무튼 계속 가자." },

      { type: "wait", move: 15, text: "..." },

      // ===== 이상현상 - 눈 =====
      {
        type: "anomaly",
        action: async () => {

          const thisNpcIndex = activeNPCIndex;

          snow.style.display = "block";

          await waitForNext(" ", "눈이 내리고 있다…");
          await waitForNext(" ", "와이퍼를 켜서 눈을 치워도 금방 다시 쌓이고 있다.");
          await waitForNext("모치즈키 료지", "와아~ 이런 눈을 함박눈이라고 하는거지?");
          await waitForNext("모치즈키 료지", "마코토, 너랑 같이 볼 수 있어서 다행이네.");
          await waitForNext("모치즈키 료지", "밖이 어두운데도 자동차 불빛 덕에 눈이 반짝거리는게 예쁘잖아.");
          await waitForNext("모치즈키 료지", "아, 이런 걸 어디서는 운치가 있다고 얘기하던가?");
          await waitForNext(" ", "료지는 몸을 완전히 옆으로 돌린채 빤히 쳐다보고 있다.");
          await waitForNext(" ", "미소짓는 얼굴과는 반대로 고민하는 것처럼 보인다.");
          await waitForNext("모치즈키 료지", "…");
          await waitForNext("모치즈키 료지", "있잖아, 너는 계속 나아가야 하는 이유가 있어?");
          await waitForNext("모치즈키 료지", "이 길이 어디로 끝맺는지도, 얼마나 더 가야할지도 모른다고 했잖아.");
          await waitForNext("모치즈키 료지", "하지만 멈출 이유가 없고, 다른 사람들과 함께 나아가고 싶다는 기대가 점점 생겨서 계속 운전을 하고 있다고.");
          await waitForNext("모치즈키 료지", "목적지에 대해서도, 처음엔 아무 생각 없었지만 이제는 가끔 상상해본다고… 그랬었지?");
          await waitForNext("모치즈키 료지", "……");
          await waitForNext("모치즈키 료지", "사실 네가 향하던 목적지가 아름답지도 않고, 도착한 보람이 있는 곳도 아니면 어떡해?");
          await waitForNext("모치즈키 료지", "오히려 온 걸 후회할 정도로 최악의 장소라면?");
          await waitForNext("모치즈키 료지", "그렇다면 지금처럼 마음에 드는 장소에서 내려버리는 게 나을지도 모르는 일 아닐까?");
          await waitForNext("모치즈키 료지", "눈을 맞으면서 걸어가는 건 조금 차가울 순 있겠지만…");
          await waitForNext("모치즈키 료지", "아니아니, 걱정할 일은 따로 있네. 네가 눈사람이 되어버리면 훨씬 더 곤란할거야.");
          await waitForNext("모치즈키 료지", "마코토 너라면 눈이 머리 위에 잔~뜩 쌓여도 무시한 채 걸을 거 같으니까.");
          await waitForNext("모치즈키 료지", "아하하, 너무 지레짐작일지도 모르겠네.");
          await waitForNext("모치즈키 료지", "하하……");
          await waitForNext("모치즈키 료지", "미안해. 갑자기 횡설수설거렸지.");
          await waitForNext("모치즈키 료지", "난 그냥…");

          await waitForChoiceThen("뭐라고 답할까?", [
            {
              text: "뭘 알고있는거야?",
              lines: [
                { speaker: "모치즈키 료지", text: "어? 아니, 그러니까…" },
                { speaker: "모치즈키 료지", text: "그게, 내가 정확하게 안다고 말할 수 있는 건 아무것도 없어." },
                { speaker: "모치즈키 료지", text: "안다고 말해봤자, 갑자기 머릿속에서 떠올랐을 뿐이니까." },
                { speaker: "모치즈키 료지", text: "증거도 없고, 그저 생각났을 뿐인 내용을… 그것도 불길한 방향이라면…" },
                { speaker: "모치즈키 료지", text: "너한테 무작정 털어놓고 싶지 않아." },
                { speaker: "모치즈키 료지", text: "멋대로 책임지고 달래달라고 어리광부리는 거 같잖아." },
                { speaker: "모치즈키 료지", text: "지금까진 안 그랬냐고? 그 소리는 너무해, 마코토…" },
                { speaker: " ", text: "료지는 다 티나게 엉엉거리고 있다." },
                { speaker: " ", text: "이후 눈 하나 깜짝하지 않자 료지는 뒤늦게 고개를 들었다." },
                { speaker: "모치즈키 료지", text: "하하, 이런 건 이상하지? 나도 그렇게 생각해." },
                { speaker: "모치즈키 료지", text: "하지만 네 차에 탄 뒤로 늘 그랬어." },
                { speaker: "모치즈키 료지", text: "지금까지는 내가 잊고 있었던 기억이 돌아왔을 뿐이라고 생각했지만…" },
                { speaker: "모치즈키 료지", text: "으음, 너무 낙관적으로 보고 있었던 거려나." },
                { speaker: " ", text: "료지는 목도리를 끌어당겨 입가를 가리고 있다…" },
                { speaker: "모치즈키 료지", text: "그래도 너무 걱정하진 말아줘." },
                { speaker: "모치즈키 료지", text: "모든 게 확실해지면 바로 마코토에게 말할 테니까." },
                { speaker: "모치즈키 료지", text: "난… 마코토에게 거짓말쟁이라고 미움받기 싫은걸." },
                { speaker: "모치즈키 료지", text: "약속할게." }
              ]
            },
            {
              text: "내린다면 너도 같이 갈 거야?",
              lines: [
                { speaker: "모치즈키 료지", text: "어, 나도?" },
                { speaker: "모치즈키 료지", text: "그래도 돼?" },
                { speaker: "모치즈키 료지", text: "같이 쭉 걸을 수 있으면, 응, 나도 엄청 기쁠거야." },
                { speaker: "모치즈키 료지", text: "마코토랑 함께라면 해보고 싶은 것도 많이 있는걸." },
                { speaker: "모치즈키 료지", text: "잠깐 멈춰서 눈사람을 만들고 간다거나…" },
                { speaker: "모치즈키 료지", text: "눈싸움은… 으음, 아무래도 내가 일방적으로 질 거 같은데…" },
                { speaker: "모치즈키 료지", text: "아, 바닥에 누워서 팔을 저으면 천사 모양처럼 자국이 남는다는 것도 해보고 싶네." },
                { speaker: " ", text: "상상하는 것만으로 들뜬 듯 료지의 얼굴이 붉게 상기되어 있다." },
                { speaker: "모치즈키 료지", text: "분명 추운 건 신경쓰이지 않을 정도로 즐겁겠지." },
                { speaker: "모치즈키 료지", text: "너도 그렇게 생각해준다면 좋을텐데." },
                { speaker: "모치즈키 료지", text: "하지만… 잘 모르겠어." },
                { speaker: "모치즈키 료지", text: "그게 가능한 일일까?" },
                { speaker: "모치즈키 료지", text: "아, 거절이 아니야!" },
                { speaker: "모치즈키 료지", text: "난 정말로 너랑 같이면 뭐든지 즐거울 거 같다고 생각하니까!" },
                { speaker: "모치즈키 료지", text: "계속 여기에 있고 싶고…" },
                { speaker: "모치즈키 료지", text: "…마, 말하고 보니 고백같네." },
                { speaker: "모치즈키 료지", text: "아니아니, 방금 건 전혀 신경쓰지 않아도 돼!" },
                { speaker: "모치즈키 료지", text: "아무튼 난, 정말로… 가능하다면 정말로 너랑 같이 가고 싶어." },
                { speaker: "모치즈키 료지", text: "아직은 기억나는 것도 정확하지 않고, 왜 이런 말을 갑자기 했는지도 모르겠고, 그래서 제대로 확답을 줄 수 없지만…" },
                { speaker: "모치즈키 료지", text: "내 생각은 바뀌지 않을거야." },
                { speaker: "모치즈키 료지", text: "그것만… 기억해줘." }
              ]
            },
            {
              text: "내가 내렸으면 좋겠어?",
              lines: [
                { speaker: "모치즈키 료지", text: "…어?" },
                { speaker: "모치즈키 료지", text: "난, 그게, 그러니까…" },
                { speaker: "모치즈키 료지", text: "…" },
                { speaker: "모치즈키 료지", text: "잘 모르겠어… 미안해." },
                { speaker: "모치즈키 료지", text: "내리는 걸 권유해야겠다는 생각이 들다가도, 이건 내가 정할 게 아니라는 생각도 들고…" },
                { speaker: "모치즈키 료지", text: "애초에 왜 내려야하는지 정확한 근거를 댈 수조차 없으니까." },
                { speaker: "모치즈키 료지", text: "단순히 내가 불길했다는 이유만으로 널 밀어붙이고 싶지 않아…" },
                { speaker: "모치즈키 료지", text: "이전까지만 해도 즐거웠는데, 왜 갑자기 이런 생각이 드는지도 모르겠는걸." },
                { speaker: "모치즈키 료지", text: "내가 기억하지 못하는 중요한 일이 있던 걸까?" },
                { speaker: "모치즈키 료지", text: "음… 머리가 아프네." },
                { speaker: "모치즈키 료지", text: "…너무 걱정하는 눈으로 보지 말아줘." },
                { speaker: "모치즈키 료지", text: "그래도, 지금은 너와 함께 계속 갈 수 있어서 기쁘다는 마음이 더 크거든." },
                { speaker: "모치즈키 료지", text: "무슨 연이 있을진 모르겠지만, 그래도 너를 무의식 속에서도 기억하고 있었으니 다행이야." },
                { speaker: "모치즈키 료지", text: "너도 그렇게 생각해주려나?" },
                { speaker: "모치즈키 료지", text: "아하하, 그 표정이면 충분해." }
              ]
            }
          ]);

          await waitForNext("모치즈키 료지","…마코토라면, 계속 갈 거지?");

          await waitForNext(" ", "……");
          await waitForNext(" ", "앞으로 나아가자.");

          exitAnomalyEvent();
          nextAfterAnomaly(thisNpcIndex);
        }
      },

      { type: "wait", move: 28, text: "눈이 그치지 않는다." },

      // ===== 떠나기 직전 대화 =====
      {
        type: "dialogue",
        lines: [
          { speaker: "모치즈키 료지", text: "…시간이 됐어." },
          { speaker: "모치즈키 료지", text: "내가 잊었던 것들… 왜 너를 운명이라 생각했는지…" },
          { speaker: "모치즈키 료지", text: "전부 떠올랐거든." },
          { speaker: "모치즈키 료지", text: "그리고 너에게 경고할 수 있는 마지막 기회이기도 하고." },
          { speaker: "모치즈키 료지", text: "마코토, 네가 경고를 듣고도 계속 가기를 원한다면… 내가 어디로 가야 하는지 길을 알려줄게." },
          { speaker: "모치즈키 료지", text: "이전에 했던 말 기억해?" },
          { speaker: "모치즈키 료지", text: "네가 향하는 목적지가 어쩌면 무섭고 기대에 못 미치는 장소일지도 모른다고…" },
          { speaker: "모치즈키 료지", text: "응, 그 말 그대로야." },
          { speaker: "모치즈키 료지", text: "사람은 각자의 길을 나아가고, 그 사이에 들리는 곳은 다양할지 모르지만 늘 향하는 끝은 똑같아." },
          { speaker: "모치즈키 료지", text: "결국엔 내… 혹은 어머니의 품이라고 말할 수 있는 곳에 안기니까." },
          { speaker: "모치즈키 료지", text: "지금까지는 당연한 섭리였어. 문제가 될 일도 없었고." },
          { speaker: "모치즈키 료지", text: "하지만 상황이 바뀌었어." },
          { speaker: "모치즈키 료지", text: "어머니는 더 이상 기다리지 않고 모두를 찾아가기로 했거든." },
          { speaker: "모치즈키 료지", text: "인간들의 의지가 그걸 바라기 때문에…" },
          { speaker: "모치즈키 료지", text: "대부분은 여행의 끝이 오는지도 모를거야." },
          { speaker: "모치즈키 료지", text: "어느 순간 도착해있고, 각자의 발걸음이 멈추겠지." },
          { speaker: "모치즈키 료지", text: "하지만 너는 달라. 넌… 어머니에게 현혹되지 않을 거야." },
          { speaker: "모치즈키 료지", text: "여느 길과 다름없는 풍경에 속지도 않겠지." },
          { speaker: "모치즈키 료지", text: "모두가 편안함을 느낄 때 너 혼자만 두려움을 느껴야 한다는 건 괴롭잖아." },
          { speaker: "모치즈키 료지", text: "다른 곳으로 길이 꺾일 거라는 상상도 하지 못할거고…" },
          { speaker: "모치즈키 료지", text: "어머니를 가장 올바르게 쳐다보는 인물이 될 텐데... 그건… 버티기 힘든 일이야." },
          { speaker: "모치즈키 료지", text: "그러니까 부탁할게. 이곳에서 함께 내리자." },
          { speaker: "모치즈키 료지", text: "함께 오래 있지는 못할거야. 나는 결국 다른 길로 나아가야 하니까…" },
          { speaker: "모치즈키 료지", text: "하지만, 어쩌면 그게… 너를 위한 선택일 거라고…" },
          { speaker: "모치즈키 료지", text: "적어도 난, 난 그렇게 믿고있어." },
          { speaker: "모치즈키 료지", text: "마코토, 부탁이야…" },
          { speaker: " ", text: "여기선 대답을 잘 선택해야 할 것 같다…" }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [

          // 정상 경로: 료지만 하차
          {
            text: "계속 나아가야 해.",
            action: async () => {

              await waitForNext("모치즈키 료지", "응, 너라면 그걸 고를 줄 알고 있었어.");
              await waitForNext("모치즈키 료지", "그런 너니까… 내가 마코토로 인해 바뀔 수 있었겠지.");
              await waitForNext("모치즈키 료지", "이렇게나 인간적으로… 아하하, 내가 말하기엔 어색한 내용이려나.");
              await waitForNext("모치즈키 료지", "이제 약속을 지켜야겠네.");
              await waitForNext("모치즈키 료지", "난 마코토에게 거짓말쟁이로 남기 싫은 걸.");
              await waitForNext("모치즈키 료지", "길을 표시해둘게.");
              distanceVisible = true;
              updateStatus();
              await waitForNext("모치즈키 료지", "이제부터 네가 어디에 언제 도착할지… 정확히 알 수 있을거야.");
              await waitForNext("모치즈키 료지", "너에게 도움이 됐으면 좋겠어.");
              await waitForNext("모치즈키 료지", "……");
              await waitForNext("모치즈키 료지", "정말로 더 미룰 수 없어.");
              await waitForNext("모치즈키 료지", "난 내려야해, 마코토.");
              await waitForNext("모치즈키 료지", "…미안해.");
              await waitForNext("모치즈키 료지", "계속 이 말만 하는 것도, 정말 미안해.");
              await waitForNext("모치즈키 료지", "그럼… 갈게.");
              removePassenger(3);
              await waitForNext(" ", "료지는 내린 이후 사라졌다.");
              await waitForNext(" ", "목적지가 분명해졌다.");
              await waitForNext(" ", "이제 앞으로 나아가야만 한다.");

              
              nextNPCEvent();
            }
          },

          // 특수엔딩 경로: 같이 하차
          {
            text: "그래, 내리자.",
            action: async () => {

              await waitForNext("모치즈키 료지", "고마워, 정말로…");
              await waitForNext("모치즈키 료지", "마코토, 나를 마지막까지 믿어줘서 고마워.");
              await waitForNext("모치즈키 료지", "걱정하지 않아도 돼.");
              await waitForNext("모치즈키 료지", "내려서 몇 발자국만 걸어가면 금방 괜찮아질거야.");
              await waitForNext("모치즈키 료지", "그럼… 같이 내리자.");
              await waitForNext("모치즈키 료지", "분명 모든 걱정이 다 사라질테니까.");

              specialEnding(3);
            }
          }
        ]
      }

    ]
  },

  //=====
  // NPC 5 아이기스
  //=====
  {
    id: "npc5",
    name: "아이기스",
    triggerDistance: 65,
    destinationDistance: -5,
    
    events: [
      {
        type: "dialogue",
        lines: [
          {
            speaker: " ",
            text: "길 위에 누군가가 서있다."
          },
          {
            speaker: " ",
            text: "멈추도록 하자."
          },
          {
            speaker: "아이기스",
            text: "잠시 실례하겠습니다."
          },
          {
            speaker: "아이기스",
            text: "…제가 마코토님의 옆을 지켜도 될까요?"
          },
          {
            speaker: "아이기스",
            text: "어디까지나 저 혼자 정한 소망이라는 건 알고 있습니다. "
          },
          {
            speaker: "아이기스",
            text: "그렇지만…"
          },
        ]
      },
      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "타도 돼.",
            replies: [
              {speaker: "아이기스", text: "아… 감사합니다!"},
              {speaker: "아이기스", text: "이제와 제가 무슨 도움이 될 수 있는지는 모르겠어요."},
              {speaker: "아이기스", text: "하지만… 그럼에도 옆에 있고 싶으니까요."},
              {speaker: "아이기스", text: "당신의 안전을 위해 언제나 최선을 다하겠습니다!"}
            ]
          }, 
          {
              text: "영광이야.",
              replies: [
                {speaker: "아이기스", text: "그러한 말은 제가 해야 한다고 생각합니다."},
                {speaker: "아이기스", text: "칭찬을 받을 정도의 기계가 되지 못했으니까요."},
                {speaker: "아이기스", text: "처음부터 끝까지, 마코토님의 도움은커녕…"},
                {speaker: "아이기스", text: "하지만 이번에야말로, 만회할 수 있는 기회라 생각합니다."},
                {speaker: "아이기스", text: "이길 수 있는지는 모릅니다."},
                {speaker: "아이기스", text: "그렇다 하더라도…"},
                {speaker: "아이기스", text: "후회하지 않도록, 마지막까지 마코토님을 지킬 테니까요! "}

              ]
          
          }
        ]

      },
      {
        type: "dialogue",
        lines: [
          {
            speaker: " ",
            text: "아이기스를 태웠다.",
            action: () => addPassenger(4)
          },
          {speaker: " ", text: "점점 끝이 다가오고 있다."}
        ]
      },

      {
        type: "wait",
        move: 5,
        text: "소녀에게서 웅웅거리는 소리가 난다. 왜인지 따뜻하게 느껴진다."
      },
      {
        type: "dialogue",
        lines: [
          { speaker: "아이기스", text: "갑작스럽지만…" },
          { speaker: "아이기스", text: "마코토님, 정말 이대로 나아가도 된다고 생각하시나요?" },
          { speaker: "아이기스", text: "저는 각오가 되어 있습니다." },
          { speaker: "아이기스", text: "여전히 두렵고… 무력하다는 생각이 들지만…" },
          { speaker: "아이기스", text: "제 사명을 정했으니까요." },
          { speaker: "아이기스", text: "하지만 마코토님의 의견이 궁금합니다." },
          { speaker: "아이기스", text: "혹시 제가 이런 사명을 말하는 게 오히려 부담이 되진 않을지…" },
          { speaker: "아이기스", text: "앞으로 떠미는 의도처럼 느껴질까 걱정이 돼요." },
          { speaker: "아이기스", text: "전… 그럴 생각이 없었지만, 마코토님께 지나치게 의지하고 있는게 아닌지…" },
          { speaker: "아이기스", text: "이전에도, 지금도…" },
          { speaker: " ", text: "아이기스는 머뭇거리며 말을 이어가고 있다." },
          { speaker: "아이기스", text: "제가 제 생각을 표현하는 게 힘든 건 인간적…으로 되어가기 때문일까요." }
        ]
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",
        choices: [
          {
            text: "괜찮아. 모두와 다음을 약속했으니까.",
            replies: [
              { speaker: "아이기스", text: "약속을… 네! 그렇죠." },
              { speaker: "아이기스", text: "전 마코토님으로부터, 모든 분으로부터 삶을 배웠으니까요." },
              { speaker: "아이기스", text: "분명 다들 저보다 굳게 그 약속을 믿고 있겠죠." },
              { speaker: "아이기스", text: "제가 아는 지식에 따르면 마코토님은 선생님, 이라고도 부를 수 있습니다." },
              { speaker: "아이기스", text: "그리고 전 앞으로도 마코토님께 이런저런 것들을 많이 배우고 싶습니다." },
              { speaker: "아이기스", text: "그러니, 약속을 지키는 건 당연히 해야 할 일이겠네요." }
            ]
          },
          {
            text: "나도 아이기스에게 의지하고 있어.",
            replies: [
              { speaker: "아이기스", text: "그건… 아, 죄송합니다." },
              { speaker: "아이기스", text: "쿨러가 빠르게 작동 중이기에 보통보다 약 114.5%의 소음이 발생하고 있습니다." },
              { speaker: "아이기스", text: "기쁘기 때문에 할 말이 없어지는 일도 있는 법이군요." },
              { speaker: "아이기스", text: "준페이님에게 배운 어휘로 설명하자면, 상당한 파괴력입니다." },
              { speaker: "아이기스", text: "……" },
              { speaker: "아이기스", text: "더 의지해 주세요." },
              { speaker: "아이기스", text: "그렇다면 마코토님의 기대에 부응하기 위해… 저, 아이기스는 더 힘을 낼 수 있을 테니까요." },
              { speaker: "아이기스", text: "대답해주셔서 감사합니다." },
              { speaker: "아이기스", text: "이제 지체할 시간이 없으니, 전진하도록 합시다." },
              { speaker: "아이기스", text: "괜찮아요. 제가 늘 마코토님의 곁을 지킬 테니까요." }
            ]
          }
        ]
      },

      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "……" },
          { speaker: " ", text: "이제 곧 끝이 다가온다." }
        ]
      },
      {
        type: "wait",
        move: 25,
        text: "..."
      },

      {
        type: "anomaly",
        action: async () => {
          const thisNpcIndex = activeNPCIndex;

          moon.style.display = "block";

          await waitForNext(" ", "하늘이 초록빛으로 물들고 있다.");
          await waitForNext(" ", "거대한 달의 중심부에서부터 균열이 커지는 모습이 보인다.");
          await waitForNext(" ", "아니, 균열이 아니다. 지금까지 닫혀있었기에 몰랐던…");
          await waitForNext(" ", "주변의 소음이 완전히 잦아들었다.");
          await waitForNext(" ", "달의 탈을 쓴 거대한 눈동자가 나를 지켜보고 있다.");
          await waitForNext(" ", "……");
          await waitForNext(" ", "내려야 한다.");

          await waitForNext("아이기스", "마코토님? 대체, 지금…");
          await waitForNext(" ", "괜찮아.");
          await waitForNext("아이기스", "잠시만… 기다려 주세요!");
          await fadeBlack(true, 200);
          moon.style.display = "none";
          await sleep(700);
          await fadeBlack(false, 300);


          
          exitAnomalyEvent();                    // ← 추가
          nextAfterAnomaly(thisNpcIndex);   
        }
      },

      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "…" },
          { 
            speaker: " ", text: "앞으로 조금만 더.",
            action: () => {
            distanceDisplayOffset = 2;
            updateStatus();
            }
          }
        ]
      },
      //수정수정수정
      {
        type: "wait",
        move: 33,
        text: "아이기스는 울 것 같은 표정이다."
      },
      {
        //수정수정
        type: "anomaly",
        action: async () => {
          const thisNpcIndex = activeNPCIndex;
          sakura.style.display = "block";
          await waitForNext(" ", "벚꽃잎이 도착을 환영하듯 흩날린다.");
          await waitForNext(" ", "이제 속도를 줄여야 한다.");
          await waitForNext(" ", "곧 도착이다.");
          await waitForNext(" ", "아이기스. 이걸 받아.");
          await waitForNext("아이기스", "…네?");

          exitAnomalyEvent();                    // ← 추가
          nextAfterAnomaly(thisNpcIndex);   
        }
      },
      {
        type: "dialogue",
        lines: [
          { speaker: " ", text: "난 이제 내릴거야." },
          { speaker: " ", text: "걱정할 필요는 없어." },
          { speaker: " ", text: "내가 기대했던 것보다… 훨씬 더 멋진 목적지에 도착했으니까." },
          { speaker: " ", text: "그리고 아이기스는 내 옆에서 계속 지켜주겠다고 했잖아." },
          { speaker: " ", text: "약속, 기억하고 있을게." },
          { speaker: "아이기스", text: "…네, 반드시." },
          { speaker: "아이기스", text: "무슨 일이 있더라도, 제 사명이니까요." },
          { speaker: " ", 
            text: "…고마워.",
            action: () => normalEnding()
          }
        ]
      }
    ]
  }
];
// ==================================================
// HTML 요소
// ==================================================

const distanceText =
  document.getElementById("distance");

const distanceDisplay =
  document.getElementById("distanceDisplay");

const speedText =
  document.getElementById("speed");

const eventTitle =
  document.getElementById("eventTitle");

const message =
  document.getElementById("message");

const speaker =
  document.getElementById("speaker");

const dialogueText =
  document.getElementById("dialogueText");

const choices =
  document.getElementById("choices");

const startButton =
  document.getElementById("startButton");

const accelerator =
  document.getElementById("accelerator");

const brake =
  document.getElementById("brake");

const wiper =
  document.getElementById("wiper");

const radio =
  document.getElementById("radio");

const bgm =
  document.getElementById("bgm");


// ==================================================
// NPC 이미지
// ==================================================

const npcImages = [

  document.getElementById("npc1Image"),

  document.getElementById("npc2Image"),

  document.getElementById("npc3Image"),

  document.getElementById("npc4Image"),

  document.getElementById("npc5Image"),

  document.getElementById("npc6Image")

];

const npc1Image=
  document.getElementById("npc1Image");

const npc1Image2 = 
  document.getElementById("npc1Image2");
const npc3Image = document.getElementById("npc3Image");
  
const npc3Image2 =
  document.getElementById("npc3Image2");

//번개 번쩍
const lightningFlash = 
  document.getElementById("lightningFlash");
//이상현상 모음
//검은 액체
const liquid = 
  document.getElementById("liquid");

//피 흘리는 손
const hand = 
  document.getElementById("hand");
//큰 달
const moon = 
  document.getElementById("moon");
//거미줄
const web = 
  document.getElementById("web");
//벚꽃
const sakura = 
  document.getElementById("sakura");

//눈
const snow = 
  document.getElementById("snow");

//컷신 (엔딩 포함)
const key=
  document.getElementById("key");

// 흑백 현상 동안에만 모습이 바뀜 (NPC1의 영구 변신과 달리 원래대로 되돌아옴)
function changeNPC3Appearance() {

  npc3Image.style.display = "none";
  npc3Image2.style.display = "block";
}

function revertNPC3Appearance() {

  npc3Image2.style.display = "none";
  npc3Image.style.display = "block";
}

function changeNPC1Appearance() {

  // 변신 상태를 실제로 저장 (이후 UI 갱신 시에도 유지됨)
  npc1Changed = true;

  try{
    thunder.currentTime = 0;
    thunder.play();

  } catch(e) {}
  // 번개 효과 시작
  lightningFlash.classList.remove("lightning-active");

  // 애니메이션을 다시 시작하기 위한 코드
  void lightningFlash.offsetWidth;

  lightningFlash.classList.add("lightning-active");


  // 번개가 번쩍이는 순간에 이미지 변경
  setTimeout(() => {

    npc1Image.style.display = "none";
    npc1Image2.style.display = "block";

  }, 120);

}

// ==================================================
// 게임 시작
// ==================================================

startButton.addEventListener(
  "click",
  startGame
);


function startGame() {

  clearInterval(gameTimer);

  engineRunning = false;

  gameState = "driving";

  distance = 466;

  distanceDisplayOffset = 35;

  speed = 0;

  drivingSpeedBeforeEvents = 0;

  distanceVisible = false;

  npc1Changed = false;

  passengers = [];

  exitingNPCIndex = -1;

  activeNPCIndex = -1;

  lastTriggeredNPCIndex = -1;

  // NPC별 독립 진행 상태 초기화
  npcRuntime = npcs.map(() => ({
    triggered: false,
    eventIndex: 0,
    scheduledDistance: null,
    finished: false
  }));

  startButton.style.display = "none";

  clearChoices();

  hideAllNPCImages();

  sakura.style.display = "none";
  moon.style.display = "none";

  updateStatus();

  showMessage(
    "운전 시작",
    "어두운 밤길을 달리고 있다."
  );

  showDialogue(
    "",
    "목적지까지 가야 한다."
  );

  setDistanceVisible(true);

  gameTimer =
    setInterval(gameTick, 1000);
}


// ==================================================
// 게임 틱
// ==================================================

function gameTick() {

  // 운전 중이 아니면 이동하지 않음
  if (gameState !== "driving") {
    return;
  }


  // 현재 속도만큼 이동
  distance -= speed / 60;


  if (distance < 0) {
    distance = 0;
  }


  // ------------------------------------------
  // 승객 목적지 확인
  // ------------------------------------------

  checkPassengerDestinations();


  // 하차 이벤트가 발생했다면 중단
  if (gameState !== "driving") {

    updateStatus();

    return;
  }


  // ------------------------------------------
  // NPC별 예약된 이벤트(등장 / wait 예약) 확인
  // ------------------------------------------

  checkScheduledEvents();


  // NPC 이벤트가 시작됐다면 중단
  if (gameState !== "driving") {

    updateStatus();

    return;
  }


  // ------------------------------------------
  // 최종 목적지
  // ------------------------------------------

  if (
    distance <= 0 &&
    lastTriggeredNPCIndex >= npcs.length - 1 &&
    passengers.length === 0
  ) {

    arriveAtDestination();

    return;
  }


  updateStatus();
}


// ==================================================
// NPC별 예약 이벤트 확인
// (같은 거리에 여러 NPC가 겹치면 번호 순서대로 처리)
// ==================================================

function checkScheduledEvents() {

  if (gameState !== "driving") {
    return;
  }

  for (let i = 0; i < npcs.length; i++) {

    const rt = npcRuntime[i];

    if (rt.finished) {
      continue;
    }

    // 아직 만나지 않은 NPC → 등장 거리 확인
    if (!rt.triggered) {

      if (distance <= npcs[i].triggerDistance) {

        triggerNPCDiscovery(i);

        // 정지 이벤트로 진입했으므로 이번 틱은 여기서 종료
        return;
      }

      continue;
    }

    // 이미 만난 NPC → wait로 예약된 다음 이벤트 확인
    if (
      rt.scheduledDistance !== null &&
      distance <= rt.scheduledDistance
    ) {

      rt.scheduledDistance = null;

      playNPCEvent(i);

      // 정지 이벤트(대화/선택지)로 전환됐다면 이번 틱 종료
      if (gameState !== "driving") {
        return;
      }

      // effect/wait 처럼 계속 운전 중이라면
      // 다음 NPC도 이어서 같은 틱에서 확인한다
    }
  }
}


// ==================================================
// NPC 최초 등장
// ==================================================

function triggerNPCDiscovery(npcIndex) {

  const npc = npcs[npcIndex];
  const rt = npcRuntime[npcIndex];

  rt.triggered = true;

  lastTriggeredNPCIndex = npcIndex;

  // 이벤트 진입 전 속도 저장 후 정지
  drivingSpeedBeforeEvents = speed;

  speed = 0;

  gameState = "event";

  activeNPCIndex = npcIndex;

  setDistanceVisible(false);

  clearChoices();

  showMessage(
    "히치하이커 발견",
    `${npc.name}이(가) 길가에 서 있다.`
  );

  updateStatus();


  setTimeout(() => {

    playNPCEvent(npcIndex);

  }, 500);
}


// ==================================================
// NPC 이벤트 실행 (NPC별 독립 진행)
// ==================================================

function playNPCEvent(npcIndex) {

  const npc =
    npcs[npcIndex];

  const rt =
    npcRuntime[npcIndex];

  const event =
    npc.events[rt.eventIndex];


  // 이벤트가 모두 끝남
  if (!event) {

    rt.finished = true;
    rt.scheduledDistance = null;

    finishNPCFlow(npcIndex);

    return;
  }

  // ------------------------------------------
  // 이상현상 (kind만 지정하면 runAnomaly가 진입/연출/정리/복귀를 모두 처리)
  // ------------------------------------------

  if (
    event.type === "anomaly"
  ) {

    activeNPCIndex = npcIndex;

    enterAnomalyEvent();

    clearChoices();

      if (event.action) {
        event.action();          // ← 추가: 복잡한 흐름은 커스텀 action으로
      } else {
        runAnomaly(event.kind, event.text, event.dialogueLines);
      }

    return;
  }


  // ------------------------------------------
  // 대화 (정지) — lines가 있으면 여러 줄을 순서대로, 없으면 한 줄만 재생
  // ------------------------------------------

  if (
    event.type === "dialogue"
  ) {

    enterBlockingEvent(npcIndex);

    showMessage(
      npc.name,
      "대화"
    );

    const lines =
      event.lines ||
      [{ speaker: event.speaker, text: event.text, action: event.action }];

    (async () => {

      for (const line of lines) {

        await waitForNext(line.speaker ?? npc.name, line.text);

        if (line.action) {
          line.action();
        }
      }

      // 엔딩이 시작됐으면 이후 흐름을 이어가지 않는다
        if (gameState === "ending" || gameState === "finished") {
          return;
        }

      rt.eventIndex++;

      playNPCEvent(npcIndex);

    })();

    return;
  }

  // ------------------------------------------
  // 특수 효과 (속도 유지, 즉시 진행)
  // ------------------------------------------

  if (
    event.type === "effect"
  ) {

    setDistanceVisible(true);

    clearChoices();

    if (event.action) {
      event.action();
    }

    rt.eventIndex++;

    // 혹시 정지 상태였다면 "속도는 그대로 유지"한 채 운전 상태로 복귀
    exitBlockingKeepSpeed(npcIndex);

    setTimeout(() => {

      playNPCEvent(npcIndex);

    }, 500);

    return;
  }

  // ------------------------------------------
  // 선택지 (정지) — reply만 적으면 대사 출력 후 자동으로 nextNPCEvent로 이어짐.
  // 복잡한 분기가 필요할 때만 choice.action을 직접 사용한다.
  // ------------------------------------------

 // ------------------------------------------
// 선택지 (정지) — reply만 적으면 대사 출력 후 자동으로 nextNPCEvent로 이어짐.
// 복잡한 분기가 필요할 때만 choice.action을 직접 사용한다.
// ------------------------------------------

if (
  event.type === "choice"
) {

  enterBlockingEvent(npcIndex);

  showMessage(
    npc.name,
    event.text
  );

  showDialogue(
    npc.name,
    event.text
  );

  clearChoices();

  event.choices.forEach(
    choice => {

      addChoice(
        choice.text,
        () => {

          if (choice.action) {
            choice.action();
            return;
          }

          // 여러 줄(choice.replies)이 있으면 순서대로 재생
          if (choice.replies) {

            (async () => {

              for (const line of choice.replies) {

                await waitForNext(
                  line.speaker ?? choice.speaker ?? npc.name,
                  line.text
                );

                if (line.action) {
                  line.action();
                }
              }

              if (choice.next) {
                choice.next();
              } else {
                nextNPCEvent();
              }

            })();

            return;
          }

          // 기존처럼 한 줄만 있는 경우 (하위 호환)
          sayThenNext(
            choice.speaker || npc.name,
            choice.reply,
            choice.next
          );
        }
      );

    }
  );

  return;
}

  // ------------------------------------------
  // 일정 거리 운전 후 다음 이벤트 예약
  // ------------------------------------------

  if (
    event.type === "wait"
  ) {

    rt.eventIndex++;

    rt.scheduledDistance =
      Math.max(0, distance - event.move);

    showMessage(
      "운전 중",
      event.text
    );

    showDialogue(
      "",
      event.text
    );

    clearChoices();

    setDistanceVisible(true);

    // 이 NPC 때문에 정지해 있었다면 저장해둔 속도로 복구하며 운전 재개
    endBlockingIfActive(npcIndex);

    updateStatus();

    return;
  }
}


// ==================================================
// 다음 NPC 이벤트 (현재 활성화된 NPC 기준)
// 기존 NPC 데이터의 nextNPCEvent() 호출부를 그대로 쓰기 위해
// activeNPCIndex를 참조한다
// ==================================================

function nextNPCEvent() {

  const npcIndex = activeNPCIndex;

  if (npcIndex === -1) {
    return;
  }

  npcRuntime[npcIndex].eventIndex++;

  playNPCEvent(npcIndex);
}


// ==================================================
// NPC 이벤트 전체 종료
// ==================================================

function finishNPCFlow(npcIndex) {

  clearChoices();

  const wasBlockingThis =
    gameState === "event" &&
    activeNPCIndex === npcIndex;

  if (wasBlockingThis || gameState === "driving") {

    showMessage(
      "운전 중",
      "다시 운전을 계속한다."
    );

    showDialogue(
      "",
      "다음 사건까지 운전한다."
    );
  }

  endBlockingIfActive(npcIndex);

  updateStatus();
}


// ==================================================
// 정지 이벤트 진입 / 종료 헬퍼
// ==================================================

// 정지 이벤트 진입: 속도 저장 후 0으로
function enterBlockingEvent(npcIndex) {

  if (gameState === "driving") {
    drivingSpeedBeforeEvents = speed;
  }

  speed = 0;

  gameState = "event";

  activeNPCIndex = npcIndex;

  setDistanceVisible(false);

  updateStatus();
}

// 정지 이벤트 종료: 저장해둔 속도로 복구 후 재확인
function endBlockingIfActive(npcIndex) {

  if (
    gameState === "event" &&
    activeNPCIndex === npcIndex
  ) {

    gameState = "driving";

    activeNPCIndex = -1;

    speed = drivingSpeedBeforeEvents;

    setDistanceVisible(true);

    updateStatus();

    // 같은 거리에 예약된 다른 NPC 이벤트가 있는지 즉시 재확인
    checkScheduledEvents();
  }
}

// 정지 이벤트 종료하되 속도는 그대로 유지 (effect 전용)
function exitBlockingKeepSpeed(npcIndex) {

  if (
    gameState === "event" &&
    activeNPCIndex === npcIndex
  ) {

    gameState = "driving";

    activeNPCIndex = -1;

    setDistanceVisible(true);

    updateStatus();

    checkScheduledEvents();
  }
}


// ==================================================
// 승객 추가
// ==================================================

function addPassenger(npcIndex) {

  // 이미 타고 있으면 추가하지 않음
  if (passengers.includes(npcIndex)) {
    return;
  }

  passengers.push(npcIndex);
  try{
    door.currentTime = 0;
    door.playbackRate = 1.5;
    door.play();
  } catch(e) {}

  updateNPCImages();
  updateStatus();
}

// ==================================================
// 승객 제거
// ==================================================

function removePassenger(npcIndex) {

  passengers =
    passengers.filter(
      index => index !== npcIndex
    );
  
  try {
    door.currentTime=0;
    door.playbackRate = 1.5;
    door.play()
  } catch(e) {}

  // 료지가 내리면 눈 그침
  if (npcIndex === 3) {
    snow.style.display = "none";
  }



  updateNPCImages();

  updateStatus();
}


// ==================================================
// NPC 이미지 업데이트
// ==================================================

function updateNPCImages() {

  npcImages.forEach((image, index) => {

    if (!image) {
      return;
    }

    if (passengers.includes(index)) {
      image.style.display = "block";
    } else {
      image.style.display = "none";
    }

  });

  // NPC1 모습 변경 상태 유지
  if (passengers.includes(0)) {

    if (npc1Changed) {
      npc1Image.style.display = "none";
      npc1Image2.style.display = "block";
    } else {
      npc1Image.style.display = "block";
      npc1Image2.style.display = "none";
    }

  } else {

    npc1Image.style.display = "none";
    npc1Image2.style.display = "none";

  }
}

// ==================================================
// 모든 NPC 이미지 숨기기
// ==================================================

function hideAllNPCImages() {

  npcImages.forEach(
    image => {

      if (!image) {
        return;
      }

      image.style.display =
        "none";

    }
  );
}


// ==================================================
// 승객 목적지 확인 (NPC 번호 순서로 확인)
// ==================================================

function checkPassengerDestinations() {

  if (
    passengers.length === 0
  ) {

    return;
  }

  for (let i = 0; i < npcs.length; i++) {

    if (!passengers.includes(i)) {
      continue;
    }

    if (distance <= npcs[i].destinationDistance) {

      startPassengerExit(i);

      return;
    }
  }
}


// ==================================================
// 승객 하차 시작
// ==================================================

function startPassengerExit(
  npcIndex
) {

  const npc =
    npcs[npcIndex];


  exitingNPCIndex =
    npcIndex;

  // 하차 이벤트 진입 전 속도 저장
  if (gameState === "driving") {
    drivingSpeedBeforeEvents = speed;
  }

  gameState =
    "exitEvent";

  speed = 0;

  setDistanceVisible(false);

  clearChoices();


  showMessage(
    npc.name,
    "목적지에 도착했다."
  );


  showDialogue(
    npc.name,
    getExitDialogue(npcIndex)
  );

  updateStatus();


  setTimeout(() => {

    showExitChoice();

  }, 500);
}


// ==================================================
// 하차 대사
// ==================================================

function getExitDialogue(
  npcIndex
) {

  switch (npcIndex) {

    case 0:
      return "아쉽지만 여기서 내려야 해. 하지만, 또 만나자?";

    case 1:
      return "아, 여기야. 벌써 도착했네.";

    case 2:
      return "이쯤에서 멈춰주면 돼. 네가 태워줘서 그런가, 정말 금방이네.";

    case 3:
      return "...이제 가야해. 마지막 기회야.";

    default:
      return "전 여기서 내려야 합니다.";
  }
}


// ==================================================
// 같이 내릴지 선택
// ==================================================

function showExitChoice() {

  const npc =
    npcs[exitingNPCIndex];


  showMessage(
    npc.name,
    "히치하이커가 차에서 내리려 한다."
  );


  showDialogue(
    " ",
    "같이 내릴까?"
  );


  clearChoices();


  addChoice(
    "같이 내린다",
    () => {

      specialEnding(
        exitingNPCIndex
      );

    }
  );


  addChoice(
    "계속 운전한다",
    () => {

      leavePassengerAndContinue();


    }
  );
}


// ==================================================
// 승객 하차 후 계속 운전 (기존 속도로 복구)
// ==================================================

function leavePassengerAndContinue() {

  const npcIndex =
    exitingNPCIndex;


  const npc =
    npcs[npcIndex];


  // 해당 NPC만 제거
  removePassenger(
    npcIndex
  );


  exitingNPCIndex = -1;

  gameState =
    "driving";

  // 하차 전 속도로 복구
  speed = drivingSpeedBeforeEvents;

  setDistanceVisible(true);

  clearChoices();


  showMessage(
    "하차",
    `${npc.name}이(가) 차에서 내렸다.`
  );


  showDialogue(
    "",
    "나는 다시 운전대를 잡았다."
  );


  updateStatus();


  // 혹시 같은 거리에서
  // 다른 승객의 목적지나 NPC 이벤트가 겹쳐 있다면 재확인
  setTimeout(() => {

    if (
      gameState === "driving"
    ) {

      checkPassengerDestinations();

      if (gameState === "driving") {
        checkScheduledEvents();
      }

    }

  }, 100);
}


// ==================================================
// 가속
// ==================================================

accelerator.addEventListener(
  "click",
  () => {

    if (
      gameState !== "driving" &&
      !allowAccelerateDuringEvent
    ) {

      return;
    }
    
    if (!engineRunning){

      engineRunning = true;
      try{
        start.currentTime = 0;
        start.play();
      } catch(e) {}
    }


    speed += 10;


    if (
      speed > 100
    ) {

      speed = 100;
    }


    showMessage(
      "운전 중",
      "가속 페달을 밟았다."
    );


    updateStatus();
  }
);


// ==================================================
// 브레이크
// ==================================================

brake.addEventListener(
  "click",
  () => {

    if (
      gameState !== "driving"
    ) {

      return;
    }


    speed -= 20;


    if (
      speed < 0
    ) {

      speed = 0;
    }


    showMessage(
      "운전 중",
      "브레이크를 밟았다."
    );


    updateStatus();
  }
);


// ==================================================
// 와이퍼
// ==================================================

wiper.addEventListener(
  "click",
  () => {

    if (
      gameState !== "driving"
    ) {

      return;
    }


    showMessage(
      "와이퍼",
      "와이퍼가 움직였다."
    );
  }
);


// ==================================================
// 라디오
// ==================================================

radio.addEventListener(
  "click",
  () => {

    if (
      gameState !== "driving"
    ) {

      return;
    }


    showMessage(
      "라디오",
      "치직... 치직..."
    );
  }
);


// ==================================================
// 최종 목적지 도착
// ==================================================

function arriveAtDestination() {

  // 혹시 승객이 남아 있으면 도착하지 않음
  if (
    passengers.length > 0
  ) {

    return;
  }


  gameState =
    "ending";


  clearInterval(
    gameTimer
  );


  speed = 0;

  setDistanceVisible(true);

  updateStatus();


  showMessage(
    "도착",
    "목적지에 도착했다."
  );


  showDialogue(
    "",
    "차를 세웠다."
  );


  clearChoices();


  addChoice(
    "끝내기",
    normalEnding
  );
}


// ==================================================
// 일반 엔딩
// ==================================================

function normalEnding() {

  gameState =
    "finished";


  showMessage(
    "END",
    "목적지에 도착했다. 나는 답을 찾았다."
  );


  showDialogue(
    "",
    "분명 이건 해피엔딩이라 불릴 수 있겠지."
  );


  clearChoices();


  startButton.textContent =
    "다시 시작";


  startButton.style.display =
    "block";
}


// ==================================================
// 특수 엔딩
// ==================================================

function specialEnding(
  npcIndex
) {

  const npc =
    npcs[npcIndex];


  gameState =
    "ending";


  clearInterval(
    gameTimer
  );


  speed = 0;

  clearChoices();

  setDistanceVisible(false);


  // 같이 내렸으므로 해당 NPC 제거
  removePassenger(
    npcIndex
  );


  exitingNPCIndex = -1;


  showMessage(
    "특수 엔딩",
    `${npc.name}과(와) 함께 차에서 내렸다.`
  );


  showDialogue(
    npc.name,
    getSpecialEndingText(npcIndex)
  );


  addChoice(
    "끝내기",
    () => {

      gameState =
        "finished";


      startButton.textContent =
        "다시 시작";


      startButton.style.display =
        "block";

    }
  );
}


// ==================================================
// NPC별 특수 엔딩 대사
// ==================================================

function getSpecialEndingText(
  npcIndex
) {

  switch (npcIndex) {

    case 0:
      return "따라오면 안 됐는데. 하지만 왜일까, 꽤 기쁘네.";

    case 1:
      return "우선 덮밥을 먹으러 가자. 주위도 널 반갑게 환영해줄거야.";

    case 2:
      return "이것도 훔치는 거에 해당되려나. 하지만 좋아, 우선 르블랑에 가자.";

    case 3:
      return "응, 드디어 이해해줬구나.";

    default:
      return "모든 게 원래대로 돌아갔습니다. 그러니 마코토님도 저와 함께 돌아가요.";
  }
}


// ==================================================
// 배경음악 재생 제어
// (운전 중이면서 speed !== 0 일 때만 재생)
// ==================================================

// 목표 볼륨 (원하는 음량으로 조절 가능)
const BGM_MAX_VOLUME = 0.6;

// 페이드에 걸리는 시간 (ms)
const BGM_FADE_MS = 800;

// 페이드 진행 중인 타이머 (겹쳐 실행되지 않도록 관리)
let bgmFadeTimer = null;

// play()/pause() 호출이 겹치는 것을 막기 위한 상태 플래그
let bgmIsStarting = false;


function fadeBGM(targetVolume, onDone) {

  if (!bgm) {
    return;
  }

  if (bgmFadeTimer) {
    clearInterval(bgmFadeTimer);
    bgmFadeTimer = null;
  }

  const steps = 20;
  const stepTime = BGM_FADE_MS / steps;
  const startVolume = bgm.volume;
  const diff = targetVolume - startVolume;

  let currentStep = 0;

  bgmFadeTimer = setInterval(() => {

    currentStep++;

    const ratio = currentStep / steps;

    let nextVolume = startVolume + diff * ratio;

    nextVolume = Math.max(0, Math.min(1, nextVolume));

    bgm.volume = nextVolume;

    if (currentStep >= steps) {

      clearInterval(bgmFadeTimer);
      bgmFadeTimer = null;

      bgm.volume = targetVolume;

      if (onDone) {
        onDone();
      }
    }

  }, stepTime);
}


function updateBGM() {

  if (!bgm) {
    return;
  }

  const shouldPlay =
    gameState === "driving" &&
    speed !== 0;

  if (shouldPlay) {

    if (bgm.paused && !bgmIsStarting) {

      bgmIsStarting = true;

      // 재생 시작 전에는 볼륨 0에서 시작해 서서히 올린다
      bgm.volume = 0;

      // 브라우저 자동재생 정책으로 재생이 막힐 수 있으므로
      // 실패해도 무시하고 다음 클릭(가속 등) 때 다시 시도되게 한다
      bgm.play()
        .then(() => {
          fadeBGM(BGM_MAX_VOLUME);
        })
        .catch(() => {})
        .finally(() => {
          bgmIsStarting = false;
        });
    }

  } else {

    if (!bgm.paused) {

      // 볼륨을 서서히 낮춘 뒤에 정지시켜 뚝 끊기는 느낌을 없앤다
      fadeBGM(0, () => {
        bgm.pause();
      });
    }
  }
}


// ==================================================
// 상태 업데이트
// ==================================================

function updateStatus() {

  updateBGM();
  updateDrivingFeedback();

  if (distanceVisible) {
    distanceText.textContent =
      Math.max(0, Math.ceil(distance - distanceDisplayOffset));
  } else {
    distanceText.textContent = "???";
  }

  speedText.textContent =
    Math.round(speed);

  updateNPCImages();
}



// ==================================================
// 거리 표시 / 숨김
// ==================================================

function setDistanceVisible(
  visible
) {

  if (!distanceDisplay) {

    return;
  }
  // 이벤트 중에도 항상 표시
  distanceDisplay.style.display = "block";
}


// ==================================================
// 메시지 출력
// ==================================================

// 이 제목일 때만 상단 반투명 창을 잠깐 띄운다
const TOAST_TITLES = [
  "도착",
  "저장 완료", "저장 불가", "저장 실패",
  "불러오기 완료", "불러오기 실패"
];

const TOAST_DURATION_MS = 800;
let toastTimer = null;

function showMessage(title, text) {

  // 목록에 없는 제목은 무시 (창이 뜨지 않음)
  if (!TOAST_TITLES.includes(title)) {
    return;
  }

  eventTitle.textContent = title;
  message.textContent = text;

  const box = eventTitle.parentElement;   // 반투명 창 요소
  box.classList.remove("toast-hidden");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.classList.add("toast-hidden");
  }, TOAST_DURATION_MS);
}

// 처음에는 숨겨두기
eventTitle.parentElement.classList.add("toast-hidden");



// ==================================================
// 대화 출력
// ==================================================

function showDialogue(
  speakerName,
  text
) {

  speaker.textContent =
    speakerName;

  dialogueText.textContent =
    text;
}


// ==================================================
// 선택지 제거
// ==================================================

function clearChoices() {

  choices.innerHTML =
    "";
}


// ==================================================
// 선택지 추가
// ==================================================

function addChoice(
  text,
  action
) {

  const button =
    document.createElement(
      "button"
    );


  button.textContent =
    text;


  button.addEventListener(
    "click",
    action
  );


  choices.appendChild(
    button
  );
}

//오디오
const thunder=
  document.getElementById("thunder");

const boom =
  document.getElementById("boom");

const gun = 
  document.getElementById("gun");

const door=
  document.getElementById("door");
const start = 
  document.getElementById("start");

//이상현상용 사운드 / 화면 필터 요소 (anomalyKinds에서 사용)
const bellSound =
  document.getElementById("bellSound");

const screenElement =
  document.getElementById("screen");

const rad = 
  document.getElementById("rad");


//암전

const blackout =
  document.getElementById("blackout");

const sleep = ms => new Promise(r => setTimeout(r, ms));

// on=true: 암전, false: 밝아짐
function fadeBlack(on, ms = 800) {
  return new Promise(resolve => {
    blackout.style.transition = `opacity ${ms}ms`;
    blackout.classList.toggle("on", on);
    setTimeout(resolve, ms);
  });
}



// ==================================================
// 이상현상 진입 / 종료
// ==================================================

function enterAnomalyEvent() {

  if (gameState === "driving") {
    drivingSpeedBeforeEvents = speed;
  }

  speed = 0;

  gameState = "event";

  setDistanceVisible(false);

  updateStatus();
}


function exitAnomalyEvent() {

  if (gameState !== "event") {
    return;
  }

  gameState = "driving";

  activeNPCIndex = -1;   // ← 이상현상이 끝났으니 활성 NPC 표시 해제

  speed = drivingSpeedBeforeEvents;

  setDistanceVisible(true);

  updateStatus();

  // 같은 시점에 예약된 다른 이벤트가 있으면 이어서 확인
  checkScheduledEvents();
}


// ==================================================
// 이상현상 종료 후 다음 이벤트로 안전하게 진행
// (nextNPCEvent() 대신 이걸 쓴다)
// ==================================================

function nextAfterAnomaly(npcIndex) {

  npcRuntime[npcIndex].eventIndex++;

  playNPCEvent(npcIndex);
}