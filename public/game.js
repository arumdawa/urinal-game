// ========================================
// URL / 게임 설정
// ========================================

const urlParams =
    new URLSearchParams(
        window.location.search
    );


function readIntegerParam(
    name,
    fallback
) {

    const value =
        Number(
            urlParams.get(name)
        );


    if (
        !Number.isInteger(value)
    ) {

        return fallback;
    }


    return value;
}


const GAME_MODE =
    urlParams.get("mode") ||
    "test";


const AI_DIFFICULTY =
    urlParams.get("difficulty") ||
    "easy";


const HUMAN_NAME =
    urlParams.get("name") ||
    "PLAYER";


let GAME_LAYOUT =
    urlParams.get("layout") ||
    "line";


if (
    GAME_LAYOUT !== "line" &&
    GAME_LAYOUT !== "circle"
) {

    GAME_LAYOUT =
        "line";
}


// ========================================
// 변기 수
// 8 ~ 40
// ========================================

const URINAL_COUNT =
    Math.min(
        40,
        Math.max(
            8,
            readIntegerParam(
                "urinals",
                12
            )
        )
    );


// ========================================
// 카드 설정
// ========================================

let ZERO_CARD_COUNT =
    Math.max(
        0,
        readIntegerParam(
            "zero",
            1
        )
    );


let WHITE_SET_COUNT =
    Math.max(
        0,
        readIntegerParam(
            "white",
            7
        )
    );


let GRAY_SET_COUNT =
    Math.max(
        0,
        readIntegerParam(
            "gray",
            3
        )
    );


let BLACK_SET_COUNT =
    Math.max(
        0,
        readIntegerParam(
            "black",
            1
        )
    );


let totalConfiguredSets =
    WHITE_SET_COUNT +
    GRAY_SET_COUNT +
    BLACK_SET_COUNT;


if (
    totalConfiguredSets < 7 ||
    totalConfiguredSets > 100
) {

    WHITE_SET_COUNT = 7;
    GRAY_SET_COUNT = 3;
    BLACK_SET_COUNT = 1;

    totalConfiguredSets = 11;
}


// ========================================
// 청소 이벤트 설정
// ========================================

const CLEANING_ENABLED =
    urlParams.get("cleaning") ===
    "yes";


const CLEANING_DURATION =
    Math.min(
        50,
        Math.max(
            2,
            readIntegerParam(
                "cleaningTurns",
                10
            )
        )
    );


const CLEANING_EVENT_CHANCE =
    0.02;


const CLEANING_NOTICE_MIN =
    2;


const CLEANING_NOTICE_MAX =
    12;


// ========================================
// 게임 설정
// ========================================

const IS_AI_GAME =
    GAME_MODE === "ai";


const TURN_TIME_LIMIT =
    50;


// ========================================
// 게임 데이터
// ========================================

let deck = [];

let retiredCards = [];

let refillCount = 0;


let player1Hand = [];

let player2Hand = [];


let currentPlayer = 1;

let turnNumber = 1;


let selectedCardIndex =
    null;

let selectedUrinal =
    null;


let boardPlayers = [];


let gameEnded =
    false;


// ========================================
// 청소 이벤트 데이터
// ========================================
//
// null
//
// 또는
//
// {
//     status: "announced",
//     turnsUntilStart: 5
// }
//
// 또는
//
// {
//     status: "active",
//     urinal: 7,
//     remainingTurns: 10
// }
// ========================================

let cleaningEvent =
    null;


let cleaningNoticeInterval =
    null;


let cleaningNoticeTimeout =
    null;


// ========================================
// 타이머
// ========================================

let turnTimeRemaining =
    TURN_TIME_LIMIT;


let turnTimerInterval =
    null;


let aiActionTimeout =
    null;


// ========================================
// HTML
// ========================================

const board =
    document.getElementById(
        "urinal-board"
    );


const myCards =
    document.getElementById(
        "my-cards"
    );


const turnNumberElement =
    document.getElementById(
        "turn-number"
    );


const myPlayerName =
    document.getElementById(
        "my-player-name"
    );


const opponentCards =
    document.querySelector(
        ".opponent-cards"
    );


const opponentPlayerName =
    document.querySelector(
        ".player-area.opponent .player-name"
    );


const endButton =
    document.getElementById(
        "end-button"
    );


const giveUpButton =
    document.getElementById(
        "give-up-button"
    );


// ========================================
// 플레이어 이름
// ========================================

function getPlayerName(
    playerNumber
) {

    if (
        !IS_AI_GAME
    ) {

        return (
            "PLAYER " +
            playerNumber
        );
    }


    if (
        playerNumber === 1
    ) {

        return HUMAN_NAME;
    }


    return (
        "AI - " +
        AI_DIFFICULTY.toUpperCase()
    );
}


// ========================================
// 턴 / 타이머 UI
// ========================================

const turnNumberParent =
    turnNumberElement.parentElement;


const turnStatusRow =
    document.createElement(
        "div"
    );


turnStatusRow.style.display =
    "flex";

turnStatusRow.style.justifyContent =
    "center";

turnStatusRow.style.alignItems =
    "center";

turnStatusRow.style.gap =
    "18px";

turnStatusRow.style.margin =
    "6px 0";


const turnTimerElement =
    document.createElement(
        "div"
    );


turnTimerElement.style.padding =
    "6px 12px";

turnTimerElement.style.background =
    "rgba(0,0,0,0.65)";

turnTimerElement.style.border =
    "1px solid rgba(255,255,255,0.35)";

turnTimerElement.style.borderRadius =
    "8px";

turnTimerElement.style.color =
    "white";

turnTimerElement.style.fontSize =
    "15px";

turnTimerElement.style.fontWeight =
    "bold";

turnTimerElement.style.whiteSpace =
    "nowrap";


if (
    turnNumberParent
) {

    turnNumberParent.insertBefore(
        turnStatusRow,
        turnNumberElement
    );


    turnStatusRow.appendChild(
        turnTimerElement
    );


    turnStatusRow.appendChild(
        turnNumberElement
    );
}


// ========================================
// 덱 정보 UI
// ========================================

const deckInfoPanel =
    document.createElement(
        "div"
    );


deckInfoPanel.style.width =
    "fit-content";

deckInfoPanel.style.minWidth =
    "140px";

deckInfoPanel.style.margin =
    "8px auto 16px auto";

deckInfoPanel.style.padding =
    "7px 16px";

deckInfoPanel.style.background =
    "rgba(0,0,0,0.65)";

deckInfoPanel.style.border =
    "1px solid rgba(255,255,255,0.3)";

deckInfoPanel.style.borderRadius =
    "8px";

deckInfoPanel.style.color =
    "white";

deckInfoPanel.style.fontSize =
    "14px";

deckInfoPanel.style.fontWeight =
    "bold";

deckInfoPanel.style.textAlign =
    "center";

deckInfoPanel.style.lineHeight =
    "1.5";


if (
    turnStatusRow.parentElement
) {

    turnStatusRow
        .insertAdjacentElement(
            "afterend",
            deckInfoPanel
        );
}


// ========================================
// 청소 예고 메시지 UI
// ========================================

const cleaningNoticeElement =
    document.createElement(
        "div"
    );


cleaningNoticeElement.style.position =
    "fixed";

cleaningNoticeElement.style.top =
    "22%";

cleaningNoticeElement.style.left =
    "50%";

cleaningNoticeElement.style.transform =
    "translateX(-50%)";

cleaningNoticeElement.style.padding =
    "14px 26px";

cleaningNoticeElement.style.background =
    "rgba(0, 80, 150, 0.9)";

cleaningNoticeElement.style.border =
    "2px solid #6ec6ff";

cleaningNoticeElement.style.borderRadius =
    "10px";

cleaningNoticeElement.style.color =
    "white";

cleaningNoticeElement.style.fontSize =
    "20px";

cleaningNoticeElement.style.fontWeight =
    "bold";

cleaningNoticeElement.style.textAlign =
    "center";

cleaningNoticeElement.style.zIndex =
    "5000";

cleaningNoticeElement.style.pointerEvents =
    "none";

cleaningNoticeElement.style.display =
    "none";

cleaningNoticeElement.style.opacity =
    "1";

cleaningNoticeElement.style.textShadow =
    "0 1px 4px black";


document.body.appendChild(
    cleaningNoticeElement
);


// ========================================
// 청소 예고 메시지
// 5초간 점멸
// ========================================

function showCleaningNotice(
    turns
) {

    clearInterval(
        cleaningNoticeInterval
    );


    clearTimeout(
        cleaningNoticeTimeout
    );


    cleaningNoticeElement.textContent =
        "앞으로 " +
        turns +
        "턴 후 청소가 시작됩니다.";


    cleaningNoticeElement.style.display =
        "block";


    cleaningNoticeElement.style.opacity =
        "1";


    let visible =
        true;


    cleaningNoticeInterval =
        setInterval(
            () => {

                visible =
                    !visible;


                cleaningNoticeElement.style.opacity =
                    visible
                        ? "1"
                        : "0.2";

            },
            350
        );


    cleaningNoticeTimeout =
        setTimeout(
            () => {

                clearInterval(
                    cleaningNoticeInterval
                );


                cleaningNoticeElement.style.display =
                    "none";


                cleaningNoticeElement.style.opacity =
                    "1";

            },
            5000
        );
}


// ========================================
// 시작 덱 생성
// ========================================

function createBaseDeck() {

    const newDeck = [];


    // 2 ~ 4

    for (
        let value = 2;
        value <= 4;
        value++
    ) {

        for (
            let i = 0;
            i < WHITE_SET_COUNT;
            i++
        ) {

            newDeck.push(
                value
            );
        }
    }


    // 5 ~ 7

    for (
        let value = 5;
        value <= 7;
        value++
    ) {

        for (
            let i = 0;
            i < GRAY_SET_COUNT;
            i++
        ) {

            newDeck.push(
                value
            );
        }
    }


    // 8 ~ 10

    for (
        let value = 8;
        value <= 10;
        value++
    ) {

        for (
            let i = 0;
            i < BLACK_SET_COUNT;
            i++
        ) {

            newDeck.push(
                value
            );
        }
    }


    // 0

    for (
        let i = 0;
        i < ZERO_CARD_COUNT;
        i++
    ) {

        newDeck.push(
            0
        );
    }


    return newDeck;
}


// ========================================
// 덱 초기화
// ========================================

function initializeDeck() {

    deck =
        createBaseDeck();


    retiredCards =
        [];


    refillCount =
        0;


    shuffleDeck();


    updateDeckInfo();
}


// ========================================
// 셔플
// ========================================

function shuffleDeck() {

    for (
        let i =
            deck.length - 1;

        i > 0;

        i--
    ) {

        const randomIndex =
            Math.floor(
                Math.random() *
                (i + 1)
            );


        const temp =
            deck[i];


        deck[i] =
            deck[randomIndex];


        deck[randomIndex] =
            temp;
    }
}


// ========================================
// 손패
// ========================================

function getCurrentHand() {

    return (
        currentPlayer === 1
            ? player1Hand
            : player2Hand
    );
}


function getOpponentHand() {

    return (
        currentPlayer === 1
            ? player2Hand
            : player1Hand
    );
}


// ========================================
// 카드 색
// ========================================

function getCardClass(
    value
) {

    if (
        value === 0
    ) {

        return "card-zero";
    }


    if (
        value >= 2 &&
        value <= 4
    ) {

        return "card-white";
    }


    if (
        value >= 5 &&
        value <= 7
    ) {

        return "card-gray";
    }


    return "card-black";
}


function getCardColorGroup(
    value
) {

    if (
        value >= 2 &&
        value <= 4
    ) {

        return "white";
    }


    if (
        value >= 5 &&
        value <= 7
    ) {

        return "gray";
    }


    return "black";
}


// ========================================
// 덱 정보
// ========================================

function updateDeckInfo() {

    deckInfoPanel.innerHTML = `
        <div>
            남은 덱: ${deck.length}장
        </div>

        <div>
            리필: ${refillCount}회
        </div>
    `;
}


// ========================================
// 턴 표시
// ========================================

function updateTurnDisplay() {

    turnNumberElement.textContent =
        turnNumber;


    if (
        IS_AI_GAME
    ) {

        myPlayerName.textContent =
            HUMAN_NAME;


        if (
            opponentPlayerName
        ) {

            opponentPlayerName.textContent =
                "AI - " +
                AI_DIFFICULTY.toUpperCase();
        }


        return;
    }


    myPlayerName.textContent =
        "PLAYER " +
        currentPlayer;


    if (
        opponentPlayerName
    ) {

        opponentPlayerName.textContent =
            "PLAYER " +
            (
                currentPlayer === 1
                    ? 2
                    : 1
            );
    }
}


// ========================================
// 내 카드
// ========================================

function renderCards() {

    myCards.innerHTML =
        "";


    const hand =
        IS_AI_GAME
            ? player1Hand
            : getCurrentHand();


    hand.forEach(
        (
            value,
            index
        ) => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "card";


            card.classList.add(
                getCardClass(
                    value
                )
            );


            card.textContent =
                value;


            if (
                index ===
                selectedCardIndex
            ) {

                card.classList.add(
                    "selected"
                );
            }


            card.addEventListener(
                "click",
                () => {

                    if (
                        gameEnded
                    ) {

                        return;
                    }


                    if (
                        IS_AI_GAME &&
                        currentPlayer === 2
                    ) {

                        return;
                    }


                    selectedCardIndex =
                        index;


                    renderCards();


                    updateUrinalSelection();
                }
            );


            myCards.appendChild(
                card
            );
        }
    );
}


// ========================================
// 상대 카드
// ========================================

function renderOpponentCards() {

    if (
        !opponentCards
    ) {

        return;
    }


    opponentCards.innerHTML =
        "";


    const hand =
        IS_AI_GAME
            ? player2Hand
            : getOpponentHand();


    hand.forEach(
        (value) => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "hidden-card";


            card.textContent =
                "";


            card.style.backgroundImage =
                "none";


            const colorGroup =
                value === 0
                    ? "black"
                    : getCardColorGroup(
                        value
                    );


            if (
                colorGroup === "white"
            ) {

                card.style.background =
                    "white";

                card.style.border =
                    "3px solid #aaa";

            }

            else if (
                colorGroup === "gray"
            ) {

                card.style.background =
                    "#777";

                card.style.border =
                    "3px solid #999";

            }

            else {

                card.style.background =
                    "#111";

                card.style.border =
                    "3px solid #333";
            }


            opponentCards.appendChild(
                card
            );
        }
    );
}


// ========================================
// 변기 번호
// ========================================

function getUrinalNumber(
    urinal
) {

    return Number(
        urinal.dataset.number
    );
}


// ========================================
// 옆자리 번호
// ========================================

function getNeighborNumbers(
    number
) {

    if (
        GAME_LAYOUT === "circle"
    ) {

        const left =
            number === 1
                ? URINAL_COUNT
                : number - 1;


        const right =
            number === URINAL_COUNT
                ? 1
                : number + 1;


        return [
            left,
            right
        ];
    }


    return [
        number - 1,
        number + 1
    ];
}


// ========================================
// 플레이어 카드 점유 여부
// ========================================

function isUrinalOccupied(
    number
) {

    if (
        number < 1 ||
        number > URINAL_COUNT
    ) {

        return false;
    }


    return boardPlayers.some(
        (person) =>
            person.urinal ===
            number
    );
}


// ========================================
// 청소 중인지
// ========================================

function isUrinalCleaning(
    number
) {

    return (
        cleaningEvent !== null &&
        cleaningEvent.status ===
            "active" &&
        cleaningEvent.urinal ===
            number
    );
}


// ========================================
// 플레이어 카드의 옆자리
// ========================================

function hasOccupiedNeighbor(
    number
) {

    const neighbors =
        getNeighborNumbers(
            number
        );


    return neighbors.some(
        (neighbor) =>
            isUrinalOccupied(
                neighbor
            )
    );
}


// ========================================
// 청소 변기의 옆자리
// ========================================

function hasCleaningNeighbor(
    number
) {

    if (
        !cleaningEvent ||
        cleaningEvent.status !==
            "active"
    ) {

        return false;
    }


    const neighbors =
        getNeighborNumbers(
            number
        );


    return neighbors.includes(
        cleaningEvent.urinal
    );
}


// ========================================
// 플레이어가 사용할 수 있는 변기
// ========================================

function canPlayerUseUrinal(
    number
) {

    // 사람이 이미 있음

    if (
        isUrinalOccupied(
            number
        )
    ) {

        return false;
    }


    // 그 변기를 청소 중

    if (
        isUrinalCleaning(
            number
        )
    ) {

        return false;
    }


    // 플레이어 카드 옆자리

    if (
        hasOccupiedNeighbor(
            number
        )
    ) {

        return false;
    }


    // 청소중인 변기 옆자리

    if (
        hasCleaningNeighbor(
            number
        )
    ) {

        return false;
    }


    return true;
}


// ========================================
// 사용 가능한 변기 목록
// ========================================

function getLegalUrinals() {

    const result = [];


    for (
        let number = 1;
        number <= URINAL_COUNT;
        number++
    ) {

        if (
            canPlayerUseUrinal(
                number
            )
        ) {

            result.push(
                number
            );
        }
    }


    return result;
}


// ========================================
// 청소 이벤트 시작
// ========================================

function startCleaning() {

    /*
    중요:

    청소는 플레이어의 거리 규칙을
    무시한다.

    오직 "비어있는 변기"인지만
    확인한다.
    */


    const emptyUrinals = [];


    for (
        let number = 1;
        number <= URINAL_COUNT;
        number++
    ) {

        if (
            !isUrinalOccupied(
                number
            )
        ) {

            emptyUrinals.push(
                number
            );
        }
    }


    /*
    구조상 거의 발생하지 않지만
    만약 빈 변기가 하나도 없으면
    이번 이벤트는 종료한다.
    */

    if (
        emptyUrinals.length === 0
    ) {

        cleaningEvent =
            null;


        return;
    }


    const selectedNumber =
        emptyUrinals[
            Math.floor(
                Math.random() *
                emptyUrinals.length
            )
        ];


    cleaningEvent = {

        status:
            "active",

        urinal:
            selectedNumber,

        remainingTurns:
            CLEANING_DURATION
    };


    renderBoardColors();

    renderRemainingTurns();
}


// ========================================
// 청소 종료
// ========================================

function endCleaning() {

    cleaningEvent =
        null;


    renderBoardColors();

    renderRemainingTurns();
}


// ========================================
// 턴 시작 청소 이벤트 처리
// ========================================

function processCleaningTurnStart() {

    if (
        !CLEANING_ENABLED
    ) {

        return;
    }


    /*
    ====================================
    예고 상태
    ====================================
    */

    if (
        cleaningEvent &&
        cleaningEvent.status ===
            "announced"
    ) {

        cleaningEvent.turnsUntilStart -=
            1;


        if (
            cleaningEvent.turnsUntilStart <=
            0
        ) {

            startCleaning();
        }


        return;
    }


    /*
    ====================================
    청소 중
    ====================================
    */

    if (
        cleaningEvent &&
        cleaningEvent.status ===
            "active"
    ) {

        cleaningEvent.remainingTurns -=
            1;


        if (
            cleaningEvent.remainingTurns <=
            0
        ) {

            endCleaning();
        }


        return;
    }


    /*
    ====================================
    아무 이벤트도 없을 때만
    2% 판정
    ====================================
    */

    if (
        Math.random() <
        CLEANING_EVENT_CHANCE
    ) {

        const noticeTurns =
            Math.floor(
                Math.random() *
                (
                    CLEANING_NOTICE_MAX -
                    CLEANING_NOTICE_MIN +
                    1
                )
            ) +
            CLEANING_NOTICE_MIN;


        cleaningEvent = {

            status:
                "announced",

            turnsUntilStart:
                noticeTurns
        };


        showCleaningNotice(
            noticeTurns
        );
    }
}


// ========================================
// 변기판 배치
// ========================================

function renderBoardLayout() {

    const urinals =
        Array.from(
            board.querySelectorAll(
                ".urinal"
            )
        );


    board.style.marginLeft =
        "auto";

    board.style.marginRight =
        "auto";

    board.style.boxSizing =
        "border-box";


    // ====================================
    // 직선
    // ====================================

    if (
        GAME_LAYOUT === "line"
    ) {

        const columns =
            Math.min(
                12,
                URINAL_COUNT
            );


        board.style.display =
            "grid";


        board.style.position =
            "relative";


        board.style.width =
            "min(96vw, 1100px)";


        board.style.height =
            "auto";


        board.style.aspectRatio =
            "";


        board.style.gridTemplateColumns =
            `repeat(${columns}, minmax(0, 1fr))`;


        board.style.columnGap =
            "10px";


        board.style.rowGap =
            "34px";


        board.style.justifyContent =
            "center";


        board.style.alignItems =
            "start";


        board.style.padding =
            "10px 12px 28px 12px";


        board.style.overflow =
            "visible";


        urinals.forEach(
            (urinal) => {

                urinal.style.position =
                    "relative";


                urinal.style.left =
                    "";


                urinal.style.top =
                    "";


                urinal.style.transform =
                    "";


                urinal.style.width =
                    "100%";


                urinal.style.maxWidth =
                    "72px";


                urinal.style.minWidth =
                    "0";


                urinal.style.height =
                    "64px";


                urinal.style.margin =
                    "0 auto";


                urinal.style.marginBottom =
                    "26px";


                urinal.style.fontSize =
                    URINAL_COUNT > 24
                        ? "15px"
                        : "18px";
            }
        );


        return;
    }


    // ====================================
    // 원형
    // ====================================

    board.style.display =
        "block";


    board.style.position =
        "relative";


    board.style.width =
        "min(78vh, 86vw, 820px)";


    board.style.height =
        "min(78vh, 86vw, 820px)";


    board.style.aspectRatio =
        "1 / 1";


    board.style.padding =
        "0";


    board.style.overflow =
        "visible";


    let tileSize =
        58;


    if (
        URINAL_COUNT > 20
    ) {

        tileSize =
            52;
    }


    if (
        URINAL_COUNT > 28
    ) {

        tileSize =
            46;
    }


    if (
        URINAL_COUNT > 34
    ) {

        tileSize =
            42;
    }


    const radiusPercent =
        URINAL_COUNT > 30
            ? 44
            : 41;


    urinals.forEach(
        (
            urinal,
            index
        ) => {

            const angle =
                (
                    Math.PI *
                    2 *
                    index /
                    URINAL_COUNT
                ) -
                Math.PI / 2;


            const x =
                50 +
                Math.cos(
                    angle
                ) *
                radiusPercent;


            const y =
                50 +
                Math.sin(
                    angle
                ) *
                radiusPercent;


            urinal.style.position =
                "absolute";


            urinal.style.left =
                x + "%";


            urinal.style.top =
                y + "%";


            urinal.style.transform =
                "translate(-50%, -50%)";


            urinal.style.width =
                tileSize +
                "px";


            urinal.style.minWidth =
                tileSize +
                "px";


            urinal.style.maxWidth =
                tileSize +
                "px";


            urinal.style.height =
                tileSize +
                "px";


            urinal.style.margin =
                "0";


            urinal.style.fontSize =
                URINAL_COUNT > 28
                    ? "13px"
                    : "16px";
        }
    );
}


// ========================================
// 게임판 색
// ========================================

function renderBoardColors() {

    const urinals =
        board.querySelectorAll(
            ".urinal"
        );


    urinals.forEach(
        (urinal) => {

            const number =
                getUrinalNumber(
                    urinal
                );


            /*
            ====================================
            청소중인 변기

            최우선으로 파란색
            ====================================
            */

            if (
                isUrinalCleaning(
                    number
                )
            ) {

                urinal.style.background =
                    "#1689d8";


                urinal.style.color =
                    "white";


                urinal.style.borderColor =
                    "#74c7ff";


                return;
            }


            const person =
                boardPlayers.find(
                    (item) =>
                        item.urinal ===
                        number
                );


            /*
            빈 변기
            */

            if (
                !person
            ) {

                urinal.style.background =
                    "";


                urinal.style.color =
                    "";


                urinal.style.borderColor =
                    "";


                return;
            }


            const colorGroup =
                getCardColorGroup(
                    person.originalValue
                );


            if (
                colorGroup ===
                "white"
            ) {

                urinal.style.background =
                    "white";


                urinal.style.color =
                    "#111";


                urinal.style.borderColor =
                    "#aaa";

            }

            else if (
                colorGroup ===
                "gray"
            ) {

                urinal.style.background =
                    "#777";


                urinal.style.color =
                    "white";


                urinal.style.borderColor =
                    "#999";

            }

            else {

                urinal.style.background =
                    "#111";


                urinal.style.color =
                    "white";


                urinal.style.borderColor =
                    "#333";
            }
        }
    );
}


// ========================================
// 선택 해제
// ========================================

function clearUrinalSelection() {

    board
        .querySelectorAll(
            ".urinal"
        )
        .forEach(
            (urinal) => {

                urinal.style.boxShadow =
                    "";
            }
        );


    renderBoardColors();
}


// ========================================
// 선택 표시
// ========================================

function updateUrinalSelection() {

    clearUrinalSelection();


    if (
        selectedUrinal ===
        null
    ) {

        return;
    }


    selectedUrinal.style.borderColor =
        "#4da6ff";


    selectedUrinal.style.boxShadow =
        "0 0 0 3px rgba(77,166,255,0.35)";
}


// ========================================
// 남은 턴
// ========================================

function renderRemainingTurns() {

    board
        .querySelectorAll(
            ".urinal"
        )
        .forEach(
            (urinal) => {

                const oldDisplays =
                    urinal.querySelectorAll(
                        ".remaining-turns"
                    );


                oldDisplays.forEach(
                    (display) =>
                        display.remove()
                );


                const number =
                    getUrinalNumber(
                        urinal
                    );


                /*
                ====================================
                청소 남은 턴

                모든 플레이어가 볼 수 있음
                ====================================
                */

                if (
                    isUrinalCleaning(
                        number
                    )
                ) {

                    const display =
                        document.createElement(
                            "div"
                        );


                    display.className =
                        "remaining-turns";


                    display.textContent =
                        "청소: " +
                        cleaningEvent.remainingTurns +
                        "턴";


                    display.style.position =
                        "absolute";


                    display.style.top =
                        "100%";


                    display.style.left =
                        "50%";


                    display.style.transform =
                        "translateX(-50%)";


                    display.style.marginTop =
                        "5px";


                    display.style.whiteSpace =
                        "nowrap";


                    display.style.fontSize =
                        URINAL_COUNT > 24
                            ? "11px"
                            : "14px";


                    display.style.fontWeight =
                        "bold";


                    display.style.color =
                        "#6ec6ff";


                    display.style.textShadow =
                        "0 1px 3px black";


                    display.style.pointerEvents =
                        "none";


                    display.style.zIndex =
                        "20";


                    urinal.appendChild(
                        display
                    );


                    return;
                }


                /*
                ====================================
                플레이어 카드의 남은 턴
                ====================================
                */

                const person =
                    boardPlayers.find(
                        (item) =>
                            item.urinal ===
                            number
                    );


                if (
                    !person
                ) {

                    return;
                }


                const visiblePlayer =
                    IS_AI_GAME
                        ? 1
                        : currentPlayer;


                if (
                    person.player !==
                    visiblePlayer
                ) {

                    return;
                }


                const display =
                    document.createElement(
                        "div"
                    );


                display.className =
                    "remaining-turns";


                display.textContent =
                    "남은 턴: " +
                    person.remainingTurns;


                display.style.position =
                    "absolute";


                display.style.top =
                    "100%";


                display.style.left =
                    "50%";


                display.style.transform =
                    "translateX(-50%)";


                display.style.marginTop =
                    "5px";


                display.style.whiteSpace =
                    "nowrap";


                display.style.fontSize =
                    URINAL_COUNT > 24
                        ? "12px"
                        : "14px";


                display.style.fontWeight =
                    "bold";


                display.style.color =
                    "white";


                display.style.textShadow =
                    "0 1px 3px black";


                display.style.pointerEvents =
                    "none";


                display.style.zIndex =
                    "20";


                urinal.appendChild(
                    display
                );
            }
        );
}


// ========================================
// 퇴장 카드
// ========================================

function retireCard(
    value
) {

    retiredCards.push(
        value
    );
}


// ========================================
// 리필
// ========================================

function refillDeck() {

    if (
        retiredCards.length === 0
    ) {

        return false;
    }


    refillCount +=
        1;


    const shouldIncrease =
        refillCount %
        2 ===
        0;


    deck =
        retiredCards.map(
            (value) => {

                if (
                    value === 0
                ) {

                    return 0;
                }


                if (
                    shouldIncrease
                ) {

                    return (
                        value + 1
                    );
                }


                return value;
            }
        );


    retiredCards =
        [];


    shuffleDeck();


    updateDeckInfo();


    return true;
}


// ========================================
// 드로우
// ========================================

function drawCardToPlayer(
    playerNumber
) {

    if (
        deck.length === 0
    ) {

        if (
            !refillDeck()
        ) {

            return false;
        }
    }


    const card =
        deck.shift();


    if (
        playerNumber === 1
    ) {

        player1Hand.push(
            card
        );

    }

    else {

        player2Hand.push(
            card
        );
    }


    updateDeckInfo();


    return true;
}


function drawCard() {

    return drawCardToPlayer(
        currentPlayer
    );
}


function dealInitialHands() {

    player1Hand =
        [];


    player2Hand =
        [];


    for (
        let i = 0;
        i < 4;
        i++
    ) {

        drawCardToPlayer(
            1
        );


        drawCardToPlayer(
            2
        );
    }
}


// ========================================
// 플레이어 카드 턴 감소
// ========================================

function decreaseRemainingTurns() {

    const leavingPlayers =
        [];


    boardPlayers.forEach(
        (person) => {

            person.remainingTurns -=
                1;


            if (
                person.remainingTurns <=
                0
            ) {

                leavingPlayers.push(
                    person
                );
            }
        }
    );


    leavingPlayers.forEach(
        (person) => {

            retireCard(
                person.originalValue
            );


            boardPlayers =
                boardPlayers.filter(
                    (item) =>
                        item !==
                        person
                );
        }
    );


    renderBoardColors();
}


// ========================================
// 타이머
// ========================================

function updateTurnTimerDisplay() {

    turnTimerElement.textContent =
        "남은 시간: " +
        turnTimeRemaining +
        "초";


    if (
        turnTimeRemaining <=
        10
    ) {

        turnTimerElement.style.color =
            "#ff6b6b";


        turnTimerElement.style.borderColor =
            "#ff6b6b";

    }

    else {

        turnTimerElement.style.color =
            "white";


        turnTimerElement.style.borderColor =
            "rgba(255,255,255,0.35)";
    }
}


function startTurnTimer() {

    clearInterval(
        turnTimerInterval
    );


    if (
        gameEnded
    ) {

        return;
    }


    turnTimeRemaining =
        TURN_TIME_LIMIT;


    updateTurnTimerDisplay();


    turnTimerInterval =
        setInterval(
            () => {

                if (
                    gameEnded
                ) {

                    clearInterval(
                        turnTimerInterval
                    );


                    return;
                }


                turnTimeRemaining -=
                    1;


                updateTurnTimerDisplay();


                if (
                    turnTimeRemaining <=
                    0
                ) {

                    clearInterval(
                        turnTimerInterval
                    );


                    finishGame(
                        currentPlayer,
                        "시간 초과"
                    );
                }

            },
            1000
        );
}


// ========================================
// 버튼 상태
// ========================================

function updateControls() {

    if (
        gameEnded
    ) {

        endButton.disabled =
            true;


        giveUpButton.disabled =
            true;


        return;
    }


    if (
        IS_AI_GAME &&
        currentPlayer === 2
    ) {

        endButton.disabled =
            true;


        giveUpButton.disabled =
            true;

    }

    else {

        endButton.disabled =
            false;


        giveUpButton.disabled =
            false;
    }
}


// ========================================
// 전체 UI
// ========================================

function renderGameUI() {

    updateTurnDisplay();


    renderCards();


    renderOpponentCards();


    renderBoardColors();


    renderRemainingTurns();


    updateDeckInfo();


    updateTurnTimerDisplay();


    updateControls();
}


// ========================================
// 게임 종료
// ========================================

function finishGame(
    losingPlayer,
    reason
) {

    if (
        gameEnded
    ) {

        return;
    }


    gameEnded =
        true;


    clearInterval(
        turnTimerInterval
    );


    clearTimeout(
        aiActionTimeout
    );


    clearInterval(
        cleaningNoticeInterval
    );


    clearTimeout(
        cleaningNoticeTimeout
    );


    const winningPlayer =
        losingPlayer === 1
            ? 2
            : 1;


    const loserName =
        getPlayerName(
            losingPlayer
        );


    const winnerName =
        getPlayerName(
            winningPlayer
        );


    if (
        reason ===
        "시간 초과"
    ) {

        alert(
            loserName +
            "의 제한시간 50초가 종료되었습니다.\n\n" +
            "자동 기권 처리됩니다.\n\n" +
            winnerName +
            "의 승리입니다."
        );

    }

    else if (
        reason ===
        "진행 불가"
    ) {

        alert(
            loserName +
            "이 더 이상 진행할 수 없습니다.\n\n" +
            winnerName +
            "의 승리입니다."
        );

    }

    else {

        alert(
            loserName +
            "의 기권입니다.\n\n" +
            winnerName +
            "의 승리입니다."
        );
    }


    window.location.href =
        "/";
}


// ========================================
// 실제 카드 배치
// ========================================

function placeCard(
    playerNumber,
    hand,
    cardIndex,
    urinalNumber
) {

    const selectedCard =
        hand[
            cardIndex
        ];


    boardPlayers.push({

        player:
            playerNumber,

        urinal:
            urinalNumber,

        originalValue:
            selectedCard,

        remainingTurns:
            selectedCard
    });


    hand.splice(
        cardIndex,
        1
    );
}


// ========================================
// 0 카드
// ========================================

function useZeroCard(
    hand,
    cardIndex
) {

    hand.splice(
        cardIndex,
        1
    );


    retireCard(
        0
    );
}


// ========================================
// AI 공통
// ========================================

function getRandomItem(
    array
) {

    return array[
        Math.floor(
            Math.random() *
            array.length
        )
    ];
}


// ========================================
// AI 시뮬레이션
// ========================================

function isOccupiedOnBoard(
    simulatedBoard,
    number
) {

    if (
        number < 1 ||
        number > URINAL_COUNT
    ) {

        return false;
    }


    return simulatedBoard.some(
        (person) =>
            person.urinal ===
            number
    );
}


function hasNeighborOnBoard(
    simulatedBoard,
    number
) {

    const neighbors =
        getNeighborNumbers(
            number
        );


    return neighbors.some(
        (neighbor) =>
            isOccupiedOnBoard(
                simulatedBoard,
                neighbor
            )
    );
}


function countLegalUrinalsForBoard(
    simulatedBoard
) {

    let count =
        0;


    for (
        let number = 1;
        number <= URINAL_COUNT;
        number++
    ) {

        if (
            isOccupiedOnBoard(
                simulatedBoard,
                number
            )
        ) {

            continue;
        }


        if (
            hasNeighborOnBoard(
                simulatedBoard,
                number
            )
        ) {

            continue;
        }


        /*
        청소 변기
        */

        if (
            isUrinalCleaning(
                number
            )
        ) {

            continue;
        }


        /*
        청소 변기 옆
        */

        if (
            hasCleaningNeighbor(
                number
            )
        ) {

            continue;
        }


        count +=
            1;
    }


    return count;
}


function simulatePlacement(
    urinalNumber,
    value
) {

    const simulated =
        boardPlayers.map(
            (person) => ({
                ...person
            })
        );


    simulated.push({

        player:
            2,

        urinal:
            urinalNumber,

        originalValue:
            value,

        remainingTurns:
            value
    });


    return simulated;
}


// ========================================
// EASY AI
// ========================================

function chooseEasyAiMove() {

    const legalUrinals =
        getLegalUrinals();


    const actions =
        [];


    player2Hand.forEach(
        (
            value,
            index
        ) => {

            if (
                value === 0
            ) {

                actions.push({

                    type:
                        "zero",

                    cardIndex:
                        index
                });


                return;
            }


            legalUrinals.forEach(
                (urinal) => {

                    actions.push({

                        type:
                            "place",

                        cardIndex:
                            index,

                        urinal:
                            urinal
                    });
                }
            );
        }
    );


    if (
        actions.length === 0
    ) {

        return null;
    }


    return getRandomItem(
        actions
    );
}


// ========================================
// NORMAL AI
// ========================================

function chooseNormalAiMove() {

    const legalUrinals =
        getLegalUrinals();


    if (
        legalUrinals.length ===
        0
    ) {

        const zeroIndex =
            player2Hand.indexOf(
                0
            );


        if (
            zeroIndex !== -1
        ) {

            return {

                type:
                    "zero",

                cardIndex:
                    zeroIndex
            };
        }


        return null;
    }


    const candidates =
        [];


    player2Hand.forEach(
        (
            value,
            index
        ) => {

            if (
                value === 0
            ) {

                return;
            }


            legalUrinals.forEach(
                (urinal) => {

                    const simulated =
                        simulatePlacement(
                            urinal,
                            value
                        );


                    const legalAfter =
                        countLegalUrinalsForBoard(
                            simulated
                        );


                    const blockingScore =
                        legalUrinals.length -
                        legalAfter;


                    let colorScore =
                        1;


                    if (
                        value >= 8
                    ) {

                        colorScore =
                            3;

                    }

                    else if (
                        value >= 5
                    ) {

                        colorScore =
                            2;
                    }


                    candidates.push({

                        type:
                            "place",

                        cardIndex:
                            index,

                        urinal:
                            urinal,

                        score:
                            (
                                blockingScore *
                                10
                            ) +
                            colorScore
                    });
                }
            );
        }
    );


    if (
        candidates.length === 0
    ) {

        return null;
    }


    candidates.sort(
        (
            a,
            b
        ) =>
            b.score -
            a.score
    );


    return candidates[0];
}


// ========================================
// HARD AI
// ========================================

function chooseHardAiMove() {

    const legalUrinals =
        getLegalUrinals();


    const zeroIndex =
        player2Hand.indexOf(
            0
        );


    if (
        legalUrinals.length === 0
    ) {

        if (
            zeroIndex !== -1
        ) {

            return {

                type:
                    "zero",

                cardIndex:
                    zeroIndex
            };
        }


        return null;
    }


    const humanHasZero =
        player1Hand.includes(
            0
        );


    const humanBlackCards =
        player1Hand.filter(
            (value) =>
                value >= 8
        ).length;


    const futureCards = [
        ...deck,
        ...retiredCards
    ];


    const candidates =
        [];


    player2Hand.forEach(
        (
            value,
            index
        ) => {

            if (
                value === 0
            ) {

                return;
            }


            legalUrinals.forEach(
                (urinal) => {

                    const simulated =
                        simulatePlacement(
                            urinal,
                            value
                        );


                    const legalAfter =
                        countLegalUrinalsForBoard(
                            simulated
                        );


                    let score =
                        0;


                    score +=
                        (
                            legalUrinals.length -
                            legalAfter
                        ) *
                        20;


                    if (
                        legalAfter === 0
                    ) {

                        score +=
                            humanHasZero
                                ? 20
                                : 100;
                    }


                    score +=
                        humanBlackCards *
                        2;


                    score +=
                        value *
                        0.8;


                    const sameValueCount =
                        futureCards.filter(
                            (card) =>
                                card ===
                                value
                        ).length;


                    if (
                        sameValueCount === 0
                    ) {

                        score -=
                            3;

                    }

                    else {

                        score +=
                            Math.min(
                                sameValueCount,
                                4
                            );
                    }


                    candidates.push({

                        type:
                            "place",

                        cardIndex:
                            index,

                        urinal:
                            urinal,

                        score:
                            score
                    });
                }
            );
        }
    );


    if (
        zeroIndex !== -1
    ) {

        const boardAfterDecay =
            boardPlayers
                .map(
                    (person) => ({

                        ...person,

                        remainingTurns:
                            person.remainingTurns -
                            1
                    })
                )
                .filter(
                    (person) =>
                        person.remainingTurns >
                        0
                );


        const futureLegal =
            countLegalUrinalsForBoard(
                boardAfterDecay
            );


        candidates.push({

            type:
                "zero",

            cardIndex:
                zeroIndex,

            score:
                futureLegal *
                5
        });
    }


    if (
        candidates.length === 0
    ) {

        return null;
    }


    candidates.sort(
        (
            a,
            b
        ) =>
            b.score -
            a.score
    );


    return candidates[0];
}


// ========================================
// AI 선택
// ========================================

function chooseAiMove() {

    if (
        AI_DIFFICULTY ===
        "easy"
    ) {

        return chooseEasyAiMove();
    }


    if (
        AI_DIFFICULTY ===
        "normal"
    ) {

        return chooseNormalAiMove();
    }


    return chooseHardAiMove();
}


// ========================================
// AI 행동
// ========================================

function performAiTurn() {

    if (
        gameEnded ||
        !IS_AI_GAME ||
        currentPlayer !== 2
    ) {

        return;
    }


    const decision =
        chooseAiMove();


    if (
        !decision
    ) {

        finishGame(
            2,
            "진행 불가"
        );


        return;
    }


    if (
        decision.type ===
        "zero"
    ) {

        useZeroCard(
            player2Hand,
            decision.cardIndex
        );


        alert(
            "AI가 0 카드를 사용했습니다."
        );


        nextTurn();


        return;
    }


    const value =
        player2Hand[
            decision.cardIndex
        ];


    placeCard(
        2,
        player2Hand,
        decision.cardIndex,
        decision.urinal
    );


    renderBoardColors();


    const colorGroup =
        getCardColorGroup(
            value
        );


    let colorText =
        "검은색";


    if (
        colorGroup ===
        "white"
    ) {

        colorText =
            "흰색";

    }

    else if (
        colorGroup ===
        "gray"
    ) {

        colorText =
            "회색";
    }


    alert(
        "AI가 " +
        decision.urinal +
        "번 변기에 카드를 배치했습니다.\n" +
        "카드 색상: " +
        colorText
    );


    nextTurn();
}


// ========================================
// AI 행동 예약
// ========================================

function scheduleAiTurn() {

    clearTimeout(
        aiActionTimeout
    );


    if (
        !IS_AI_GAME ||
        currentPlayer !== 2 ||
        gameEnded
    ) {

        return;
    }


    aiActionTimeout =
        setTimeout(
            performAiTurn,
            700
        );
}


// ========================================
// 다음 턴
// ========================================

function nextTurn() {

    if (
        gameEnded
    ) {

        return;
    }


    /*
    기존 플레이어 카드 턴 감소
    */

    decreaseRemainingTurns();


    /*
    다음 플레이어
    */

    currentPlayer =
        currentPlayer === 1
            ? 2
            : 1;


    turnNumber +=
        1;


    selectedCardIndex =
        null;


    selectedUrinal =
        null;


    clearUrinalSelection();


    /*
    새 턴 카드 드로우
    */

    drawCard();


    /*
    ====================================
    새 턴 시작

    청소 이벤트 처리
    ====================================
    */

    processCleaningTurnStart();


    /*
    UI
    */

    renderGameUI();


    startTurnTimer();


    scheduleAiTurn();
}


// ========================================
// 변기 생성
// ========================================

board.innerHTML =
    "";


for (
    let i = 1;
    i <= URINAL_COUNT;
    i++
) {

    const urinal =
        document.createElement(
            "div"
        );


    urinal.className =
        "urinal";


    urinal.dataset.number =
        i;


    urinal.dataset.occupied =
        "false";


    urinal.textContent =
        i;


    urinal.addEventListener(
        "click",
        () => {

            if (
                gameEnded
            ) {

                return;
            }


            if (
                IS_AI_GAME &&
                currentPlayer === 2
            ) {

                return;
            }


            selectedUrinal =
                urinal;


            updateUrinalSelection();
        }
    );


    board.appendChild(
        urinal
    );
}


// 변기 배치
renderBoardLayout();


window.addEventListener(
    "resize",
    () => {

        renderBoardLayout();

        renderRemainingTurns();
    }
);


// ========================================
// 사람 카드 사용
// ========================================

endButton.addEventListener(
    "click",
    () => {

        if (
            gameEnded
        ) {

            return;
        }


        if (
            IS_AI_GAME &&
            currentPlayer === 2
        ) {

            return;
        }


        if (
            selectedCardIndex ===
            null
        ) {

            alert(
                "카드를 먼저 선택하세요."
            );


            return;
        }


        const hand =
            getCurrentHand();


        const selectedCard =
            hand[
                selectedCardIndex
            ];


        // ====================================
        // 0
        // ====================================

        if (
            selectedCard === 0
        ) {

            useZeroCard(
                hand,
                selectedCardIndex
            );


            selectedCardIndex =
                null;


            selectedUrinal =
                null;


            clearUrinalSelection();


            alert(
                getPlayerName(
                    currentPlayer
                ) +
                "이 0 카드를 사용했습니다."
            );


            nextTurn();


            return;
        }


        // ====================================
        // 일반 카드
        // ====================================

        if (
            selectedUrinal ===
            null
        ) {

            alert(
                "변기를 선택하세요."
            );


            return;
        }


        const selectedNumber =
            getUrinalNumber(
                selectedUrinal
            );


        /*
        사람이 있는 자리
        */

        if (
            isUrinalOccupied(
                selectedNumber
            )
        ) {

            alert(
                "이미 사람이 있는 변기입니다."
            );


            return;
        }


        /*
        청소중인 자리
        */

        if (
            isUrinalCleaning(
                selectedNumber
            )
        ) {

            alert(
                "현재 청소중인 변기입니다."
            );


            return;
        }


        /*
        사람 옆자리
        */

        if (
            hasOccupiedNeighbor(
                selectedNumber
            )
        ) {

            alert(
                "옆 변기에 사람이 있어서 사용할 수 없습니다."
            );


            return;
        }


        /*
        청소 변기 옆자리
        */

        if (
            hasCleaningNeighbor(
                selectedNumber
            )
        ) {

            alert(
                "옆 변기를 청소중이어서 사용할 수 없습니다."
            );


            return;
        }


        const value =
            selectedCard;


        placeCard(
            currentPlayer,
            hand,
            selectedCardIndex,
            selectedNumber
        );


        selectedCardIndex =
            null;


        selectedUrinal =
            null;


        clearUrinalSelection();


        renderBoardColors();


        renderRemainingTurns();


        alert(
            getPlayerName(
                currentPlayer
            ) +
            "이 " +
            selectedNumber +
            "번 변기에 배치되었습니다.\n" +
            "남은 턴: " +
            value
        );


        nextTurn();
    }
);


// ========================================
// 기권
// ========================================

giveUpButton.addEventListener(
    "click",
    () => {

        if (
            gameEnded
        ) {

            return;
        }


        if (
            IS_AI_GAME &&
            currentPlayer === 2
        ) {

            return;
        }


        const result =
            confirm(
                getPlayerName(
                    currentPlayer
                ) +
                "이 기권하시겠습니까?"
            );


        if (
            !result
        ) {

            return;
        }


        finishGame(
            currentPlayer,
            "기권"
        );
    }
);


// ========================================
// 게임 시작
// ========================================

initializeDeck();


dealInitialHands();


// PLAYER 1 첫 드로우
drawCard();


/*
첫 번째 턴도
청소 이벤트 2% 판정 대상
*/

processCleaningTurnStart();


renderGameUI();


startTurnTimer();


scheduleAiTurn();


// ========================================
// 테스트용 콘솔
// ========================================

console.log(
    "게임 설정:",
    {

        layout:
            GAME_LAYOUT,

        urinals:
            URINAL_COUNT,

        zeroCards:
            ZERO_CARD_COUNT,

        whiteSets:
            WHITE_SET_COUNT,

        graySets:
            GRAY_SET_COUNT,

        blackSets:
            BLACK_SET_COUNT,

        cleaning:
            CLEANING_ENABLED,

        cleaningTurns:
            CLEANING_DURATION,

        cleaningChance:
            "2%"
    }
);