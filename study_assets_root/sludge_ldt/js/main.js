/* =========================================================================
   Lexical Decision Task — main.js
   Requires: jsPsych v7, @jspsych/plugin-html-keyboard-response,
             @jspsych/plugin-preload, PapaParse, (optional) jatos.js
   ========================================================================= */

/* -------------------------------------------------------------------------
   Step 1 — Initialise jsPsych and assign participant to a Latin-Square group
   ------------------------------------------------------------------------- */
const jsPsych = initJsPsych({
  display_element: 'jspsych-target',
  on_finish: function () {
    // Save data to JATOS if available, otherwise log to console
    if (typeof jatos !== "undefined") {
      jatos.submitResultData(jsPsych.data.get().csv(), jatos.startNextComponent);
    } else {
      console.log("Experiment finished. Data:");
      console.log(jsPsych.data.get().csv());
    }
  },
});

/**
 * Group assignment (0, 1, or 2) using the JATOS worker ID modulo 3.
 * Falls back to a random assignment when running outside of JATOS.
 */
const group = (function () {
  if (typeof jatos !== "undefined") {
    const id = parseInt(jatos.workerId, 10);
    return isNaN(id) ? 0 : id % 3;
  }
  return Math.floor(Math.random() * 3);
}());

/* -------------------------------------------------------------------------
   Step 2 — Latin-Square condition and block-order mappings
   conditionMap: Set → video condition for each group
     Group 0 : Set 1 = Color,  Set 2 = BW,     Set 3 = Static
     Group 1 : Set 1 = Static, Set 2 = Color,  Set 3 = BW
     Group 2 : Set 1 = BW,     Set 2 = Static, Set 3 = Color
   blockOrderMap: presentation order of stimulus lists for each group
   ------------------------------------------------------------------------- */
const conditionMap = {
  0: { "1": "Color", "2": "BW", "3": "Static" },
  1: { "1": "Static", "2": "Color", "3": "BW" },
  2: { "1": "BW", "2": "Static", "3": "Color" },
};

// Each row lists the stimulus_list keys in the order they are presented.
// Latin-square counterbalancing ensures every list appears equally in each position.
const blockOrderMap = {
  0: ["1", "2", "3"],
  1: ["2", "3", "1"],
  2: ["3", "1", "2"],
};

/* -------------------------------------------------------------------------
   Step 3 — Load stimuli and build blocks grouped by stimulus_list
   ------------------------------------------------------------------------- */

/**
 * Parse the stimuli CSV and return a map of stimulus_list key → trial array.
 * Falls back to the Set column when stimulus_list is absent.
 * Returns a Promise that resolves with the blockMap object.
 */
function loadStimuli() {
  return new Promise(function (resolve, reject) {
    Papa.parse("stimuli/stimuli.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        const blockMap = {};
        results.data.forEach(function (row) {
          // Use stimulus_list as the block key, fall back to Set
          const rawKey = (row["stimulus_list"] || row["Set"] || "").toString().trim();
          const key = rawKey || "unknown";
          if (!blockMap[key]) blockMap[key] = [];

          const target = row["Target"].trim();
          const set = String(row["Set"]).trim();
          const condition = conditionMap[group][set] || "Color";

          blockMap[key].push({
            // Raw CSV columns preserved for jsPsych data output
            Target: target,
            StimulusType: row["StimulusType"],
            WordFrequency: row["WordFrequency"],
            corr_ans: row["corr_ans"],
            stimulus_list: row["stimulus_list"],
            ItemID: row["ItemID"],
            Set: set,
            // Derived condition for the current participant
            Condition: condition,
            // Convenience alias used by the trial stimulus
            stimulus: target,
          });
        });
        resolve(blockMap);
      },
      error: function (err) {
        reject(err);
      },
    });
  });
}

/* -------------------------------------------------------------------------
   Step 4 — Trial definitions
   ------------------------------------------------------------------------- */

/** Welcome / instruction screen */
const instructions = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <p>In this task you will see a word appear on the screen.</p>
    <p>Press <strong>M</strong> if it is a <strong>real word</strong>.</p>
    <p>Press <strong>Z</strong> if it is <strong>NOT a real word</strong>.</p>
    <p>Respond as quickly and accurately as possible.</p>
    <p>Press any key to begin.</p>
  `,
  choices: "ALL_KEYS",
};

/** 250 ms fixation / gaze target shown before each word */
const fixationTrial = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: "<p style='font-size:2em;'>+</p>",
  choices: "NO_KEYS",
  trial_duration: 500,
};

/**
 * Tracks the outcome of the most recent LDT trial so feedback trials can
 * read it without relying on jsPsych data timing.
 *  1 = correct response
 *  0 = incorrect response
 * -1 = timeout (no response within 2000 ms)
 *
 * jsPsych 7 executes trials strictly sequentially, so this variable is
 * always set by ldtTrial.on_finish before any feedback node reads it.
 */
let currentTrialCorrect = null;

/**
 * Main LDT trial.
 * Times out after 2000 ms; accuracy is coded as 1 / 0 / -1.
 */
const ldtTrial = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: function () {
    return jsPsych.timelineVariable("stimulus");
  },
  choices: ["z", "m"],
  trial_duration: 2000,
  // Carry all item metadata into the jsPsych data store
  data: function () {
    return {
      Target: jsPsych.timelineVariable("Target"),
      StimulusType: jsPsych.timelineVariable("StimulusType"),
      WordFrequency: jsPsych.timelineVariable("WordFrequency"),
      corr_ans: jsPsych.timelineVariable("corr_ans"),
      stimulus_list: jsPsych.timelineVariable("stimulus_list"),
      ItemID: jsPsych.timelineVariable("ItemID"),
      Set: jsPsych.timelineVariable("Set"),
      Condition: jsPsych.timelineVariable("Condition"),
      group: group,
    };
  },
  // Code accuracy and update the shared feedback variable
  on_finish: function (data) {
    if (data.response === null) {
      data.correct = -1; // timeout
    } else {
      data.correct = data.response === data.corr_ans ? 1 : 0;
    }
    currentTrialCorrect = data.correct;
  },
};

/* -------------------------------------------------------------------------
   Step 5 — Feedback trial definitions
   ------------------------------------------------------------------------- */

/**
 * "Too slow!" feedback — shown for 1000 ms only when the trial timed out.
 * Wrapped in a timeline node so conditional_function can gate it.
 */
const timeoutFeedbackNode = {
  timeline: [{
    type: jsPsychHtmlKeyboardResponse,
    stimulus: "<p style='color:red; font-size:1.5em;'>Too slow!</p>",
    choices: "NO_KEYS",
    trial_duration: 1000,
  }],
  conditional_function: function () {
    return currentTrialCorrect === -1;
  },
};

/**
 * Correct / Incorrect feedback — shown only when a response was given.
 * Duration: 200 ms for correct, 500 ms for incorrect.
 */
const correctnessFeedbackNode = {
  timeline: [{
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function () {
      return currentTrialCorrect === 1
        ? "<p aria-label='Correct' style='color:green; font-size:1.5em;'>&#10003;</p>"
        : "<p aria-label='Incorrect' style='color:red; font-size:1.5em;'>&#10007;</p>";
    },
    choices: "NO_KEYS",
    trial_duration: function () {
      return currentTrialCorrect === 1 ? 200 : 500;
    },
  }],
  conditional_function: function () {
    return currentTrialCorrect !== -1;
  },
};

/* -------------------------------------------------------------------------
   Step 6 — Assemble timeline and run
   ------------------------------------------------------------------------- */

/**
 * Apply the video condition for the given condition string.
 * Called once at the start of each block.
 */
function applyVideoCondition(condition) {
  const video = document.getElementById("distractor-video");
  if (!video) return;
  if (condition === "Color") {
    video.style.filter = "";
    video.currentTime = 0;
    video.play();
  } else if (condition === "BW") {
    video.style.filter = "grayscale(100%)";
    video.currentTime = 0;
    video.play();
  } else if (condition === "Static") {
    video.style.filter = "";
    video.currentTime = 0;
    video.pause();
  }
}

/**
 * Build the full timeline once stimuli are loaded, then start jsPsych.
 * One randomised procedure is created per block; the video condition is
 * switched once at the start of each block via on_timeline_start.
 */
function runExperiment(blockMap) {
  const blockOrder = blockOrderMap[group];

  const blockProcedures = blockOrder.map(function (listKey) {
    const items = blockMap[listKey] || [];
    // All items in a block share the same Condition because stimulus_list
    // maps 1-to-1 with Set, and Condition is derived solely from Set.
    const condition = items.length > 0 ? items[0].Condition : "Color";

    return {
      timeline: [fixationTrial, ldtTrial, timeoutFeedbackNode, correctnessFeedbackNode],
      timeline_variables: items,
      randomize_order: true,
      on_timeline_start: function () {
        applyVideoCondition(condition);
      },
    };
  });

  const timeline = [instructions].concat(blockProcedures);
  jsPsych.run(timeline);
}

/**
 * Entry point.
 * Uses jatos.onLoad() when running inside JATOS; falls back to a direct
 * call when running locally without JATOS.
 */
if (typeof jatos !== "undefined") {
  jatos.onLoad(function () {
    loadStimuli()
      .then(runExperiment)
      .catch(function (err) {
        console.error("Failed to load stimuli:", err);
      });
  });
} else {
  // Local / standalone testing fallback
  loadStimuli()
    .then(runExperiment)
    .catch(function (err) {
      console.error("Failed to load stimuli:", err);
    });
}
