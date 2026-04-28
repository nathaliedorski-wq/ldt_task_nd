/* =========================================================================
   Lexical Decision Task — main.js
   Requires: jsPsych v7, @jspsych/plugin-html-keyboard-response,
             @jspsych/plugin-preload, PapaParse, (optional) jatos.js
   ========================================================================= */

/* -------------------------------------------------------------------------
   Step 1 — Initialise jsPsych
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

/* -------------------------------------------------------------------------
   Step 2 — Group assignment (6 groups: 3 condition rotations × 2 key maps)

   conditionGroup (0–2): which Latin-square rotation maps stimulus lists to
                         distractor conditions (item-level counterbalancing).
   keyAssign      (0–1): which physical key is designated "word".
     0 → M = word,  Z = non-word   (default)
     1 → Z = word,  M = non-word   (swapped)

   Condition sequence actually experienced per group:
     group 0 (cg 0, key A): Color  → BW     → Static
     group 1 (cg 1, key A): BW     → Static → Color
     group 2 (cg 2, key A): Static → Color  → BW
     group 3 (cg 0, key B): Static → Color  → BW
     group 4 (cg 1, key B): Color  → BW     → Static
     group 5 (cg 2, key B): BW     → Static → Color
   Across all 6 groups, every (set × condition) pair appears 2×, every
   (condition × block-position) pair appears 2×, every (list × position)
   pair appears 2×, and each key assignment covers exactly 3 groups.
   ------------------------------------------------------------------------- */

/**
 * Assign participant to one of 6 fully-crossed counterbalancing groups.
 * Uses JATOS worker ID modulo 6; falls back to random when outside JATOS.
 */
const group = (function () {
  if (typeof jatos !== "undefined") {
    const id = parseInt(jatos.workerId, 10);
    return isNaN(id) ? 0 : id % 6;
  }
  return Math.floor(Math.random() * 6);
}());

const conditionGroup = group % 3;             // 0, 1, or 2
const keyAssign      = Math.floor(group / 3); // 0 or 1

/**
 * Key map: which physical key the participant should press for each type.
 *   keyMap.word    — correct key for a real word
 *   keyMap.nonword — correct key for a non-word
 */
const keyMap = {
  word:    keyAssign === 0 ? "m" : "z",
  nonword: keyAssign === 0 ? "z" : "m",
};

/* -------------------------------------------------------------------------
   Step 3 — Latin-Square condition and block-order mappings
   conditionMap: Set → video condition, indexed by conditionGroup
     conditionGroup 0 : Set 1 = Color,  Set 2 = BW,     Set 3 = Static
     conditionGroup 1 : Set 1 = Static, Set 2 = Color,  Set 3 = BW
     conditionGroup 2 : Set 1 = BW,     Set 2 = Static, Set 3 = Color
   blockOrderMap: presentation order of stimulus lists, indexed by group (0-5)
   The blockOrderMap is designed so that combined with conditionMap it achieves
   full balance: each condition in each position 2×, each list in each position
   2×, each list in each condition 2× (see group comment above for sequences).
   ------------------------------------------------------------------------- */
const CONDITION_MAPS = [
  { "1": "Color",  "2": "BW",     "3": "Static" },
  { "1": "Static", "2": "Color",  "3": "BW"     },
  { "1": "BW",     "2": "Static", "3": "Color"  },
];
const conditionMap = CONDITION_MAPS[conditionGroup];

// Indexed by group (0–5). Each row is the order in which stimulus lists
// ("1"/"2"/"3") are presented.  Together with conditionMap this ensures
// every condition appears in every block-position exactly twice and every
// list appears in every block-position exactly twice.
const blockOrderMap = {
  0: ["1", "2", "3"],  // group 0 (cg0, ka0): Color  → BW     → Static
  1: ["3", "1", "2"],  // group 1 (cg1, ka0): BW     → Static → Color
  2: ["2", "3", "1"],  // group 2 (cg2, ka0): Static → Color  → BW
  3: ["3", "1", "2"],  // group 3 (cg0, ka1): Static → Color  → BW
  4: ["2", "3", "1"],  // group 4 (cg1, ka1): Color  → BW     → Static
  5: ["1", "2", "3"],  // group 5 (cg2, ka1): BW     → Static → Color
};

/* -------------------------------------------------------------------------
   Step 4 — Load stimuli and build blocks grouped by stimulus_list
   ------------------------------------------------------------------------- */

/**
 * Parse the stimuli CSV, derive the participant-specific condition and
 * correct-response key for every item, and return a map of
 * stimulus_list key → trial array.
 *
 * Falls back to the Set column when stimulus_list is absent.
 * corr_ans is computed from StimulusType + keyMap so that it always reflects
 * the physically correct key for this participant's key assignment, regardless
 * of the values stored in the CSV.
 *
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

          const target   = row["Target"].trim();
          const set      = String(row["Set"]).trim();
          const stimType = row["StimulusType"].trim();
          const condition = conditionMap[set] || "Color";

          // Derive the correct answer from the stimulus type and the current
          // key map, so corr_ans is always the right physical key.
          const corrAns = stimType === "WORD" ? keyMap.word : keyMap.nonword;

          blockMap[key].push({
            // Raw CSV columns preserved for jsPsych data output
            Target:        target,
            StimulusType:  stimType,
            WordFrequency: row["WordFrequency"],
            corr_ans:      corrAns,
            // Use the derived key so downstream data always has a value even
            // when the CSV omits the stimulus_list column (falls back to Set).
            stimulus_list: key,
            // Preserve the original CSV value for reference; undefined when absent.
            stimulus_list_csv: row["stimulus_list"],
            ItemID:        row["ItemID"],
            Set:           set,
            // Derived condition for the current participant
            Condition:     condition,
            // Convenience alias used by the trial stimulus
            stimulus:      target,
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
   Step 5 — Trial definitions
   ------------------------------------------------------------------------- */

/** Welcome / instruction screen — shows the participant's actual key assignment */
const instructions = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <p>In this task you will see a word appear on the screen.</p>
    <p>Press <strong>${keyMap.word.toUpperCase()}</strong> if it is a <strong>real word</strong>.</p>
    <p>Press <strong>${keyMap.nonword.toUpperCase()}</strong> if it is <strong>NOT a real word</strong>.</p>
    <p>Respond as quickly and accurately as possible.</p>
    <p>Press any key to begin.</p>
  `,
  choices: "ALL_KEYS",
};

/** 500 ms fixation / gaze target shown before each word */
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
  choices: [keyMap.word, keyMap.nonword],
  trial_duration: 2000, // 2000 ms to respond; no response → timeout (correct = -1)
  // Carry all item metadata and counterbalancing info into the data store
  data: function () {
    return {
      Target:        jsPsych.timelineVariable("Target"),
      StimulusType:  jsPsych.timelineVariable("StimulusType"),
      WordFrequency: jsPsych.timelineVariable("WordFrequency"),
      corr_ans:          jsPsych.timelineVariable("corr_ans"),
      stimulus_list:     jsPsych.timelineVariable("stimulus_list"),
      stimulus_list_csv: jsPsych.timelineVariable("stimulus_list_csv"),
      ItemID:            jsPsych.timelineVariable("ItemID"),
      Set:           jsPsych.timelineVariable("Set"),
      Condition:     jsPsych.timelineVariable("Condition"),
      group:          group,
      conditionGroup: conditionGroup,
      keyAssign:      keyAssign,
      wordKey:        keyMap.word,
      nonwordKey:     keyMap.nonword,
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
   Step 6 — Feedback trial definitions
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
   Step 7 — Assemble timeline and run
   ------------------------------------------------------------------------- */

/**
 * Apply the video condition for the given condition string.
 * Called once at the start of each block via on_timeline_start.
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
 *
 * Block presentation order is determined by blockOrderMap[group], which
 * combines with conditionMap to give fully balanced counterbalancing: every
 * condition appears in every block position 2×, every stimulus list appears
 * in every condition 2×, and every list appears in every block position 2×
 * across the six counterbalancing groups.
 *
 * Simulation mode: append ?simulate=1 to the URL to run the experiment
 * automatically without any participant input (uses jsPsych's built-in
 * data-only simulation).  Useful for automated testing.
 * jsPsych.simulate() accepts two mode strings:
 *   "data-only" — runs without rendering; fastest for automated testing
 *   "visual"    — renders each trial but drives interactions programmatically
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

  // Activate simulation mode with ?simulate=1 in the URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("simulate") === "1") {
    jsPsych.simulate(timeline, "data-only");
  } else {
    jsPsych.run(timeline);
  }
}

/* -------------------------------------------------------------------------
   Step 8 — Entry point
   ------------------------------------------------------------------------- */

/**
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
