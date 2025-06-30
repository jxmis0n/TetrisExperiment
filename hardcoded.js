/**
 * Qualtrics Embedded Game Script – Tetris Experiment
 *
 * This script embeds a custom Tetris game into a Qualtrics survey question and manages all logic
 * for valence assignment, sequence tracking, gameplay interaction logging, and data collection.
 *
 * Key functionality:
 * - initializes embedded data fields required for storing player and opponent chat
 * - tracks sequence round number using embedded data to align responses with round index
 * - defines valence-based messaging logic (positive, negative, neutral) mapped by round number
 * - constructs and injects the Tetris game iframe with game configuration via URL parameters
 * - listens for postMessage events from the game to capture chat, results, and score
 * - auto-advances the survey after 30 seconds if no interaction is received
 * - supports mobile and desktop layouts based on device detection
 *
 * The script is hardcoded for round 1 (`FILE_ROUND = 1`) and assumes embedded data is pre-piped.
 * Some legacy variables are retained for compatibility but are no longer strictly needed.
 */
Qualtrics.SurveyEngine.addOnReady(function() {
	// configuration variables (change these as needed for each round)
	const TEST_FIELD = "TestField_Round1";  // used to verify embedded data works
	const VALENCE_FIELD = "positive";          // semantic valence condition for this round
	const PIPE_SEQ_FIELD = "Seq1";              // embedded data field for piped valence value
	const FILE_ROUND = 1;                   // static file-based round number
	const COMPETITION = "${e://Field/Competition}";  // piped embedded competition value
	const MODE = "${e://Field/Mode}";         // piped embedded mode value

	// fixed valence message sets by sequence round
	// the numbers correspond to the file-based round number
	var valenceMessages = {
		1: {
			win: "Thanks for playing. That was great!",
			loss: "Thanks for playing. That was great!",
			tie: "Thanks for playing. That was great!"
		},
		2: {
			win: "Lol, whatever. I let you win.",
			loss: "Lol, I beat you. You lost.",
			tie: "Lol. You still couldn't beat me."
		},
		3: {
			win: "That was something.",
			loss: "That was something.",
			tie: "That was something."
		}
	};

	// disabled for now, its competing with the chat timer
	// // timeout safeguard: auto-advance after 60 seconds of inactivity
	// let advanced = false;
	// const timeoutID = setTimeout(() => {
	// 	if (!advanced) {
	// 		advanced = true;
	// 		jQuery("#NextButton").click();
	// 	}
	// }, 60000);

	// force-write a test value into embedded data to confirm data layer is working
	Qualtrics.SurveyEngine.setEmbeddedData(TEST_FIELD, "WORKING_" + Date.now());
	console.log("FORCE TEST: Created", TEST_FIELD);

	// core vars – valence is piped, but we don't use it anymore
	// can get rid of this later
	var valence = "${e://Field(" + PIPE_SEQ_FIELD + ")}"; // not used
	var qid = this.questionId; // current question DOM id

	// ensures required embedded data fields for chat logs are present
	function initializeChatDataFields() {
		for (var i = 1; i <= 3; i++) {
			if (Qualtrics.SurveyEngine.getEmbeddedData("ChatResponse" + i) == null)
				Qualtrics.SurveyEngine.setEmbeddedData("ChatResponse" + i, "");
			if (Qualtrics.SurveyEngine.getEmbeddedData("OpponentChat" + i) == null)
				Qualtrics.SurveyEngine.setEmbeddedData("OpponentChat" + i, "");
		}
		console.log("Initialized ChatResponse1-3 and OpponentChat1-3");
	}

	// we dont technically need this anymore but dont want to break anything
	function getOrSetSequenceRound() {
		var cur = Qualtrics.SurveyEngine.getEmbeddedData("CurrentSequence");
		if (!cur) {
			// on first run, initialize to file round
			Qualtrics.SurveyEngine.setEmbeddedData("CurrentSequence", String(FILE_ROUND));
			return FILE_ROUND;
		}
		// on subsequent runs, increment
		var next = parseInt(cur, 10) + 1;
		Qualtrics.SurveyEngine.setEmbeddedData("CurrentSequence", String(next));
		return next;
	}

	// run setup routines
	initializeChatDataFields();
	var displayRound = getOrSetSequenceRound(); // used to index into message/field maps
	console.log("Display round:", displayRound);

	// ensure embedded data for competition and mode are up-to-date
	Qualtrics.SurveyEngine.setEmbeddedData("Competition", COMPETITION);
	Qualtrics.SurveyEngine.setEmbeddedData("GameMode", MODE);

	// resolve the correct valence messages for the current round
	var currentValenceMessages = valenceMessages[displayRound] || valenceMessages[1];
	console.log("Valence messages:", currentValenceMessages);

	// constructs the iframe src and injects the game into the survey DOM
	function startGame(comp, mode) {
		// url should not be hardcoded, fix for later
		var src = "https://exale1n.github.io/jxm-test/"
			+ "?competition=" + encodeURIComponent(comp)
			+ "&valence=" + encodeURIComponent(VALENCE_FIELD)
			+ "&mode=" + encodeURIComponent(mode)
			+ "&round=" + displayRound
			+ "&winMsg=" + encodeURIComponent(currentValenceMessages.win)
			+ "&lossMsg=" + encodeURIComponent(currentValenceMessages.loss)
			+ "&tieMsg=" + encodeURIComponent(currentValenceMessages.tie);

		// responsive styling based on device type
		var isMobile = window.innerWidth <= 480 || /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
		// this is so dirty i hate myself for it...
		var style = isMobile
			? "width:calc(100% + 20px);height:600px;overflow:hidden;margin:0 0 -30px -10px;"
			: "width:120vh;height:90vh;overflow:hidden;";

		var html = '<div style="' + style + '">'
			+ '<iframe src="' + src + '" '
			+ 'style="width:100%;height:calc(100% - 20px);border:0;" allowfullscreen>'
			+ '</iframe>'
			+ '</div>';

		console.log("Injecting iframe:", src);
		jQuery("#" + qid + " .QuestionText").html(html);
	}

	startGame(COMPETITION, MODE);

	// maps to match round index to embedded data field names
	var chatFieldMap = { 1: "PosChat", 2: "NegChat", 3: "AmbChat" };
	var scoreFieldMap = { 1: "PosScore", 2: "NegScore", 3: "AmbScore" };
	var resultFieldMap = { 1: "PosResult", 2: "NegResult", 3: "AmbResult" };

	// listens for messages sent from the embedded game
	window.addEventListener("message", function(evt) {
		var d = evt.data;
		if (!d || d.round !== displayRound) return;

		// gameEnd message → record result and score
		if (d.type === "gameEnd") {
			Qualtrics.SurveyEngine.setEmbeddedData(resultFieldMap[displayRound], d.result);
			Qualtrics.SurveyEngine.setEmbeddedData(scoreFieldMap[displayRound], d.score);
			console.log("Recorded", resultFieldMap[displayRound], d.result, scoreFieldMap[displayRound], d.score);
			return;
		}

		// player chat response → record and auto-advance
		if (d.type === "chatResponse") {
			var chatField = chatFieldMap[displayRound];
			Qualtrics.SurveyEngine.setEmbeddedData(chatField, d.text);
			console.log("Recorded", chatField + ":", d.text);

			jQuery("#NextButton").click();
			return;
		}

		// opponent chat → store in round-specific field
		if (d.type === "opponentChat") {
			Qualtrics.SurveyEngine.setEmbeddedData("OpponentChat" + displayRound, d.text);
			console.log("Recorded OpponentChat" + displayRound + ":", d.text);
			return;
		}
	});
});
