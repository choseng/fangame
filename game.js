// ==================================================
// 게임 상태
// ==================================================

let gameState = "title"; // "title" | "driving" | "event" | "exitEvent" | "ending" | "finished"

let distance = 350;
let speed = 0;

// 정지 이벤트 진입 전 속도를 저장해뒀다가 복구할 때 사용
let drivingSpeedBeforeEvents = 0;

let gameTimer = null;

let npc1Changed = false;

//처음 시동 걸 때만 소리 들리도록 변경
let engineRunning = false;

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

    version: 2,

    gameState,

    distance,
    speed,
    drivingSpeedBeforeEvents,
    npc1Changed,

    passengers: [...passengers],

    exitingNPCIndex,
    activeNPCIndex,
    lastTriggeredNPCIndex,

    npcRuntime:
      npcRuntime.map(rt => ({ ...rt })),

    choiceSaveState
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
      
    }
  }
};

// 이상현상 하나를 처음부터 끝까지 실행한다.
// text: 연출과 함께 보여줄 첫 문구
// dialogueLines: 연출시작이 끝난 뒤 순서대로 보여줄 추가 대사 [{speaker, text}, ...] (선택)
async function runAnomaly(kind, text, dialogueLines = []) {

  const thisNpcIndex = activeNPCIndex;

  const { show, hide } = anomalyKinds[kind];

  await new Promise(resolve => show(text, resolve));

  for (const line of dialogueLines) {
    await waitForNext(line.speaker ?? "", line.text);
  }

  hide();

  exitAnomalyEvent();
  nextAfterAnomaly(thisNpcIndex);
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
    triggerDistance: 343,
    destinationDistance: 100,

    events: [
      {
        type: "anomaly",
        kind: "lq",
        text: "기분이 나쁘다",
        dialogueLines: [
          { speaker: " ", text: "다른 문제는 없는 모양이지만..." },
          { speaker: " ", text: "와이퍼를 켜고 계속 가도록 하자." }
        ]
      },
      {
        type: "anomaly",
        kind: "blood",
        text: "손에 구멍이 뚫린 듯 피가 나고 있다.",
        dialogueLines: [
          { speaker: " ", text: "......" },
          { speaker: " ", text: "멈출 때까지 기다렸다 출발했다." }
        ]
      },
      {
        type: "anomaly",
        kind: "spider",
        text: "거미줄이 보인다. 점점 크기가 넓어지고 있다.",
        dialogueLines: [
          { speaker: " ", text: "거슬리네..." },
          { speaker: " ", text: "와이퍼를 켰다." }
        ]
      },

      {
        type: "anomaly",
        kind: "nyx",
        text: "달이 점점 커지고 있다.",
        dialogueLines: [
          { speaker: " ", text: "거대한 눈동자와 눈이 마주친 느낌이 든다." },
          { speaker: " ", text: "내려야 한다." }
        ]
      },
      {
        type: "anomaly",
        kind: "snowing",
        text: "눈발이 흩날린다.",
        dialogueLines: [
          { speaker: " ", text: "옆을 돌아봤지만 료지의 시선은 정면만을 향하고 있다." },
          { speaker: " ", text: "...계속 운전하자." }
        ]
      },
      {
        type: "anomaly",
        kind: "he",
        text: "벚꽃잎이 도착을 환영하듯 흩날린다.",
        dialogueLines: [
          { speaker: " ", text: "이제 속도를 줄여야 한다." },
          { speaker: " ", text: "곧 도착이다." }
        ]
      },
      

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
        move: 10,
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
        text: "시선이 느껴진다."
      },

      // 이상현상: 종소리 (kind만 지정하면 끝)
      {
        type: "anomaly",
        kind: "bell",
        text: "어디선가 종소리가 울렸다."
      },

      {
        type: "dialogue",
        speaker: " ",
        text: "갑자기 무슨 소리지?"
      },

      {
        type: "wait",
        move: 10,
        text: "어쨌거나 목적지까지는 아직 많이 남았다."
      },

      // 이상현상: 흑백 필터 + 뒤이은 대사 두 줄
      {
        type: "anomaly",
        kind: "bw",
        text: "...눈에 보이는 풍경이 이상하다.",
        dialogueLines: [
          { speaker: " ", text: "다른 문제는 없는 모양이지만..." },
          { speaker: " ", text: "운전에 문제는 없으니 계속 가도록 하자." }
        ]
      },

      {
        type: "wait",
        move: 10,
        text: "작은 웃음소리가 들려온다. "
      },

      {
        type: "dialogue",
        speaker: "수수께끼의 남자아이",
        text: "안녕?"
      },

      // 선택지: reply만 적으면 "대사 출력 → 다음 → nextNPCEvent"가 자동으로 처리된다.
      // 복잡한 분기가 필요하면 이전처럼 action()을 직접 써도 된다(하위호환).
      {
        type: "choice",
        text: "뭐라고 답할까?",

        choices: [
          {
            text: "누구야?",
            speaker: "수수께끼의 남자아이",
            reply: "글쎄, 나도 스스로를 뭐라 정의해야 할지 모르겠네."
          },
          {
            text: "왜 이 차에?",
            speaker: "수수께끼의 남자아이",
            reply: "내가 의도한 건 아니야. 정신을 차리고 보니 여기에 있었다고나 할까..."
          }
        ]
      },

      {
        type: "dialogue",
        speaker: "수수께끼의 남자아이",
        text: "그래도 잘 부탁해?"
      }
    ]
  },

  // =====
  // NPC 2 번장
  //=====
  {
    id: "npc2",
    name: "침착한 소년",
    triggerDistance: 220,
    destinationDistance: 180,

    events: [
      {
        type: "dialogue",
        lines: [
          {
            speaker: " ",
            text: "누군가가 손을 들고 서 있다."
          },
          {
            speaker: "침착한 소년",
            text: "실례지만 잠깐 얻어타도 될까?"
          },
          {
            speaker: "침착한 소년",
            text: "아아, 수상한 사람이라고 생각해 주진 않았으면 해. ...이걸 직접 말하면 신뢰가 더 사라지려나."
          },
          {
            speaker: "침착한 소년",
            text: "우연을 증명하려니 곤란하네. 믿어줄 수 있을까?"
          },

          {
            speaker: " ",
            text: "침착한 소년을 태웠다.",
            action: () => addPassenger(1)
          }
        ]
      },

      {
        type: "wait",
        move: 20,
        text: "어색한 침묵이 흐른다."
      },
      {
        type: "dialogue",
        speaker: "침착한 소년",
        text: "...기분 탓인가? 뒤에 누가 타고 있는 것 같은데."
      },

      {
        type: "choice",
        text: "뭐라고 답할까?",

        choices: [
          {
            text: "넌 안 보여?",
            speaker: "침착한 소년",
            reply: "왜 정말로 뭐가 있다는 듯이... 농담이지?"
          },
          {
            text: "줄무늬 옷을 입은 남자아이 유령이 있어.",
            speaker: "침착한 소년",
            reply: "농담으로 치부하기엔 묘하게 자세한 표현이네..."
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
    triggerDistance: 170,
    destinationDistance: 130,

    events: [
      {
        type: "dialogue",
        lines: [
          {
            speaker: " ",
            text: "길가에 서있는 누군가가 손을 흔들고 있다."
          },

          {
            speaker: "안경을 쓴 소년",
            text: "잠깐 신세질 수 있을까? 언제까지 같은 길일진 모르겠지만... 혼자보단 여럿이 낫잖아."
          },

          {
            speaker: "안경을 쓴 소년",
            text: "흠, 나 말고도 야식으로 준비한 카레랑 커피도 있어. 이것까지 합해서 어때?"
          },
          {
            speaker: " ",
            text: "안경을 쓴 소년을 태웠다.",
            action: () => addPassenger(2)
          }
        ]
      },
      {
        type: "wait",
        move: 20,
        text: "향긋한 커피 냄새가 난다."
      },
      {
        type: "dialogue",
        speaker: "안경을 쓴 소년",
        text: "계속 혼자 운전한 거 같은데, 힘들지 않아?"
      },
      {
        type: "choice",
        text: "뭐라고 대답할까?",
        
        choices: [
          {
            text: "아무래도 상관없어.",
            speaker: "안경을 쓴 소년",
            reply: "쿨한 대답이네. 그래도 기대고 싶을 떈 주위를 둘러봐."
          },
          {
            text: "운전대를 남에게 넘겨줄 순 없으니까.",
            speaker: "안경을 쓴 소년",
            reply: "무슨 의미인지 알 거 같네. 나도 기대는 것보단 지지하는 쪽이 더 편하거든. 음, 그럼 내가 할 물음이 아니었으려나."
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
    triggerDistance: 90,
    destinationDistance: 50,

    events: [
      {
        type: "dialogue",
        lines: [
          {
            speaker: "??",
            text: "아~ 잠시만! 여기여기!"
          },
          {
            speaker: " ",
            text: "노란색 목도리를 두른 소년이 차를 세워달라는 듯 손을 흔들며 소리를 치고있다."
          },
          {
            speaker: "목도리를 두른 소년",
            text: "와아, 큰일 나는 줄 알았어. 날 모른 척하고 지나가면 어떡하나 싶었거든."
          },
          {
            speaker: "목도리를 두른 소년",
            text: "그래도 제대로 왔으니 다행이야! 응? 호, 혹시 안 태워줄거야? 하지만 난... 너를 기다리고 있었다는 생각이 드는데..."
          },
          {
            speaker: " ",
            text: "목도리를 두른 소년을 태웠다.",
            action: () => addPassenger(3)
          }
        ]
      },
      {
        type: "wait",
        move: 20,
        text: "차 안이 소란스럽다..."
      },
      {
        type: "dialogue",
        speaker: "목도리를 두른 소년",
        text: "운전만 하기엔 심심하지 않아? 뭐라도 얘기하자. 아, 좋아하는 사람에 대해서라든가!"
      },
      {
        type: "choice",
        text: "대답을 할까?",

        choices: [
          {
            text: "무시한다.",
            speaker: "목도리를 두른 소년",
            reply: "이런 주제는 별로야? 하지만 궁금한데 말야~"
          },

          {
            text: "좋아하는 사람 없어.",
            speaker: "목도리를 두른 소년",
            reply: "그래? 하지만 너에게도 분명 생길거야. 음~ 네가 반했다면 분명 아주 좋은 사람이겠지."
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
    name: "리본을 맨 소녀",
    triggerDistance: 40,
    destinationDistance: 1,
    
    events: [
      {
        type: "dialogue",
        lines: [
          {
            speaker: "리본을 맨 소녀",
            text: "잠시 실례하겠습니다."
          },
          {
            speaker: "리본을 맨 소녀",
            text: "제가 마코토님의 옆을 지켜도 될까요?"
          },
          {
            speaker: "리본을 맨 소녀",
            text: "어디까지나 저 혼자 정하고, 저 혼자 원하는 소망이지만..."
          }, 
          {
            speaker: " ",
            text: "리본을 맨 소녀를 태웠다.",
            action: () => addPassenger(4)
          }
        ]
      },
      {
        type: "wait",
        move: 20,
        text: "소녀에게서 웅웅거리는 소리가 난다. 왜인지 따뜻하게 느껴진다."
      },
      {
        type: "dialogue",
        speaker: "리본을 맨 소녀",
        text: "갑작스럽지만... 마코토님, 정말 이대로 나아가도 되는 걸까요?"
      },
      {
        type: "choice",
        text: "뭐라고 답할까?",

        choices: [
          {
            text: "모두와 한 약속이 있으니까 괜찮아.",
            speaker: "리본을 맨 소녀",
            reply: "그렇네요. 전 마코토님으로부터, 모두로부터 삶을 배웠으니까요. 분명 다들 저보다 굳게 그 약속을 믿고 있겠죠."
          },
          {
            text: "무서울지도 몰라. 하지만 같이 이겨내자.",
            speaker: "리본을 맨 소녀",
            reply: "같이라는 말은 제 마음에서 울리는 느낌을 줍니다. 하지만 제가 앞장서도록 하겠습니다. 마코토님을 지키는 게 제가 정한 제 역할이니까요."
          }
        ]
      }
    ]
  }
]
// ==================================================
// HTML 요소
// ==================================================

const distanceText =
  document.getElementById("distance");

const distanceDisplay =
  document.getElementById("distanceDisplay");

const speedText =
  document.getElementById("speed");

const passengerText =
  document.getElementById("passenger");

const npcNumberText =
  document.getElementById("npcNumber");

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

  distance = 350;

  speed = 0;

  drivingSpeedBeforeEvents = 0;

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

    runAnomaly(event.kind, event.text, event.dialogueLines);

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
      `${event.move}km 이동한다.`
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
      gameState !== "driving"
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


  distanceText.textContent =
    Math.max(
      0,
      Math.ceil(distance)
    );


  speedText.textContent =
    Math.round(speed);


  // 현재 승객 이름 표시 (NPC 번호 순서)

  if (
    passengers.length === 0
  ) {

    passengerText.textContent =
      "없음";

  } else {

    const names =
      [...passengers]
        .sort((a, b) => a - b)
        .map(index => npcs[index].name);


    passengerText.textContent =
      names.join(", ");
  }


  // 지금까지 만난 NPC 중 가장 마지막 번호

  if (
    lastTriggeredNPCIndex >= 0
  ) {

    npcNumberText.textContent =
      lastTriggeredNPCIndex + 1;

  } else {

    npcNumberText.textContent =
      "-";
  }


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


  distanceDisplay.style.display =
    visible
      ? "block"
      : "none";
}


// ==================================================
// 메시지 출력
// ==================================================

function showMessage(
  title,
  text
) {

  eventTitle.textContent =
    title;

  message.textContent =
    text;
}


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