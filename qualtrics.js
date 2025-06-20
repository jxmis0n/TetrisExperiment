/**
 * Qualtrics Embedded Tetris Game Script (Round-based Chat Experiment)
 *
 * This script dynamically configures and embeds an iframe-based Tetris game within a Qualtrics question
 * based on semantic round type (e.g., "positive", "negative", "ambiguous") set in Embedded Data (ED).
 * It manages round-specific configuration, assigns randomized gameplay conditions if not yet defined,
 * initializes necessary storage fields for chat logging, and listens for postMessage events from the game.
 *
 * Key features:
 * - retrieves 'RoundType' from ED and maps to a numeric index for legacy valence handling
 * - initializes round-specific chat fields in ED if not already present
 * - assigns randomized competition and mode settings if undefined
 * - reads valence and response messages (win/loss/tie) from ED keys (e.g., WinMsg_positive)
 * - constructs an iframe URL with all relevant parameters encoded
 * - injects the game iframe into the Qualtrics question body, with mobile vs desktop layout detection
 * - listens for message events and stores player or opponent responses into ED
 * - triggers auto-advance to the next question when a player response is received
 */

Qualtrics.SurveyEngine.addOnReady(function () {
	var qid = this.questionId;

	// read semantic round from embedded data
	var roundLabel = Qualtrics.SurveyEngine.getEmbeddedData("RoundType") || "positive";

	// map to numeric index if needed for Seq1/Seq2/Seq3 fallback
	var numericMap = { positive: 1, negative: 2, ambiguous: 3 };
	var displayRound = numericMap[roundLabel] || 1;

	console.log(">> Qualtrics init:", { qid, roundLabel, displayRound });

	// create a test marker field to confirm initialization
	var testValue = "WORKING_" + Date.now();
	Qualtrics.SurveyEngine.setEmbeddedData("TestField_" + roundLabel, testValue);
	console.log("   set TestField_" + roundLabel, testValue);

	// fetch valence string for the round, used in game logic
	var valence = Qualtrics.SurveyEngine.getEmbeddedData("Seq" + displayRound) || "";
	console.log("   Seq" + displayRound + " →", valence);

	// ensure the player and opponent fields are initialized
	function initChatFields() {
		var pf = roundLabel,
			of = "opponent_" + roundLabel;
		if (Qualtrics.SurveyEngine.getEmbeddedData(pf) == null) {
			Qualtrics.SurveyEngine.setEmbeddedData(pf, "");
			console.log("   init player field:", pf);
		}
		if (Qualtrics.SurveyEngine.getEmbeddedData(of) == null) {
			Qualtrics.SurveyEngine.setEmbeddedData(of, "");
			console.log("   init opponent field:", of);
		}
	}
	initChatFields();

	// get or assign competition and game mode randomly
	var competition = Qualtrics.SurveyEngine.getEmbeddedData("Competition"),
		mode        = Qualtrics.SurveyEngine.getEmbeddedData("GameMode");
	if (!competition) {
		var pick = [{competition:"High",mode:"vs"},{competition:"Low",mode:"vs"}]
			[Math.floor(Math.random()*2)];
		competition = pick.competition;
		mode        = pick.mode;
		Qualtrics.SurveyEngine.setEmbeddedData("Competition", competition);
		Qualtrics.SurveyEngine.setEmbeddedData("GameMode",    mode);
		console.log("   new Competition/Mode:", competition, mode);
	} else {
		console.log("   existing Competition/Mode:", competition, mode);
	}

	// get valence-specific messages from embedded data
	var winMsg  = Qualtrics.SurveyEngine.getEmbeddedData("WinMsg_"  + roundLabel) || "";
	var lossMsg = Qualtrics.SurveyEngine.getEmbeddedData("LossMsg_" + roundLabel) || "";
	var tieMsg  = Qualtrics.SurveyEngine.getEmbeddedData("TieMsg_"  + roundLabel) || "";
	console.log("   pulled valence messages:", { winMsg, lossMsg, tieMsg });

	// build the full iframe source URL with query parameters
	var src = "https://exale1n.github.io/jxm-test"
		+ "?competition=" + encodeURIComponent(competition)
		+ "&valence="     + encodeURIComponent(valence)
		+ "&mode="        + encodeURIComponent(mode)
		+ "&round="       + encodeURIComponent(roundLabel)
		+ "&winMsg="      + encodeURIComponent(winMsg)
		+ "&lossMsg="     + encodeURIComponent(lossMsg)
		+ "&tieMsg="      + encodeURIComponent(tieMsg);
	console.log("   iframe src:", src);

	// determine whether user is on mobile for layout styling
	var isMobile = window.innerWidth <= 480 ||
		/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/.test(navigator.userAgent);
	var style = isMobile
		? "font-family:sans-serif;width:100%;height:600px;overflow:hidden;margin:0 auto;"
		: "font-family:sans-serif;width:130vh;height:90vh;overflow:hidden;";

	// inject the iframe container and header into the question element
	var html = '<div style="' + style + '">'
		+ '<h3 style="font-size:1.2em;margin:4px 0;">'
		+ 'Round ' + roundLabel.charAt(0).toUpperCase() + roundLabel.slice(1)
		+ ' (' + competition + ' ' + (mode==="solo"?"Solo":"Competition") + ')'
		+ '</h3>'
		+ '<iframe src="' + src + '" style="width:100%;height:calc(100% - 30px);border:0;" allowfullscreen>'
		+ '</iframe></div>';
	console.log("   injecting HTML snippet");
	jQuery("#" + qid + " .QuestionText").html(html);

	// listen for postMessage events from the game iframe
	window.addEventListener("message", function(evt) {
		var d = evt.data;
		console.log("<< postMessage received:", d);
		if (!d || d.round !== roundLabel) {
			console.log("   ignoring round:", d && d.round);
			return;
		}

		// determine field to store the message (player vs opponent)
		var field = (d.type==="chatResponse" ? roundLabel : "opponent_" + roundLabel);
		console.log("   saving embedded:", field, "=", d.text);
		Qualtrics.SurveyEngine.setEmbeddedData(field, d.text);

		// auto-advance if this was a player chat response
		if (d.type==="chatResponse") {
			console.log("   advancing question");
			setTimeout(function(){ jQuery("#NextButton").click() },100);
		}
	});
});
