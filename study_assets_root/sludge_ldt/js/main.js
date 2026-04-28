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

   conditionGroup (0–2): which Latin-square rotation maps stimulus sets to
                         distractor conditions (item-level counterbalancing).
   keyAssign      (0–1): which physical key is designated "word".
     0 → M = word,  Z = non-word   (default)
     1 → Z = word,  M = non-word   (swapped)

   Condition order experienced per group (blocks always presented Set 1→2→3):
     group 0 (cg 0, key A): Color  → BW     → Static
     group 1 (cg 1, key A): Static → Color  → BW
     group 2 (cg 2, key A): BW     → Static → Color
     group 3 (cg 0, key B): Color  → BW     → Static
     group 4 (cg 1, key B): Static → Color  → BW
     group 5 (cg 2, key B): BW     → Static → Color
   Each condition appears in each block position exactly twice across all 6
   groups, and each stimulus set appears in each condition exactly twice.
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

const conditionGroup = group % 3;            // 0, 1, or 2
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
   Step 3 — Latin-Square condition mapping (indexed by conditionGroup)

   conditionGroup 0 : Set 1 = Color,  Set 2 = BW,     Set 3 = Static
   conditionGroup 1 : Set 1 = Static, Set 2 = Color,  Set 3 = BW
   conditionGroup 2 : Set 1 = BW,     Set 2 = Static, Set 3 = Color
   ------------------------------------------------------------------------- */
const CONDITION_MAPS = [
  { "1": "Color",  "2": "BW",     "3": "Static" },
  { "1": "Static", "2": "Color",  "3": "BW"     },
  { "1": "BW",     "2": "Static", "3": "Color"  },
];
const conditionMap = CONDITION_MAPS[conditionGroup];

/* -------------------------------------------------------------------------
   Step 4 — Load stimuli
   ------------------------------------------------------------------------- */

/**
 * Parse the stimuli CSV, derive the participant-specific condition and
 * correct-response key for every item, and return a Promise resolving with
 * an object mapping Set key ("1"/"2"/"3") to its array of trial variables.
 *
 * corr_ans is computed from StimulusType + keyMap so that it always reflects
 * the physically correct key for this participant's key assignment, regardless
 * of the values stored in the CSV.
 */
function loadStimuli() {
  return new Promise(function (resolve, reject) {
    Papa.parse("stimuli/stimuli.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        const bySet = { "1": [], "2": [], "3": [] };

        results.data.forEach(function (row) {
          const target    = row["Target"].trim();
          const set       = String(row["Set"]).trim();
          const stimType  = row["StimulusType"].trim();
          const condition = conditionMap[set] || "Color";

          // Derive the correct answer from the stimulus type and the current
          // key map, so corr_ans is always the right physical key.
          const corrAns = stimType === "WORD" ? keyMap.word : keyMap.nonword;

          const item = {
            Target:        target,
            StimulusType:  stimType,
            WordFrequency: row["WordFrequency"],
            corr_ans:      corrAns,
            stimulus_list: row["stimulus_list"],
            ItemID:        row["ItemID"],
            Set:           set,
            Condition:     condition,
            stimulus:      target,
          };

          if (bySet[set]) {
            bySet[set].push(item);
          }
        });

        resolve(bySet);
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

/**
 * Single LDT trial — timeline variables are resolved at runtime by jsPsych.
 */
const ldtTrial = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: function () {
    return jsPsych.timelineVariable("stimulus");
  },
  choices: [keyMap.word, keyMap.nonword],
  // Carry all item metadata and counterbalancing info into the data store
  data: function () {
    return {
      Target:        jsPsych.timelineVariable("Target"),
      StimulusType:  jsPsych.timelineVariable("StimulusType"),
      WordFrequency: jsPsych.timelineVariable("WordFrequency"),
      corr_ans:      jsPsych.timelineVariable("corr_ans"),
      stimulus_list: jsPsych.timelineVariable("stimulus_list"),
      ItemID:        jsPsych.timelineVariable("ItemID"),
      Set:           jsPsych.timelineVariable("Set"),
      Condition:     jsPsych.timelineVariable("Condition"),
      group:          group,
      conditionGroup: conditionGroup,
      keyAssign:      keyAssign,
      wordKey:        keyMap.word,
      nonwordKey:     keyMap.nonword,
    };
  },
  // Manipulate the background video as soon as the trial DOM is ready
  on_load: function () {
    const video = document.getElementById("distractor-video");
    if (!video) return;

    const condition = jsPsych.timelineVariable("Condition");

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
  },
  // Mark whether the response was correct
  on_finish: function (data) {
    data.correct = data.response === data.corr_ans;
  },
};

/* -------------------------------------------------------------------------
   Step 6 — Assemble timeline and run
   ------------------------------------------------------------------------- */

/**
 * Build the full timeline from stimuli grouped by set, then start jsPsych.
 *
 * The experiment is structured into three sequential blocks (one per stimulus
 * set, presented in order Set 1 → Set 2 → Set 3).  Trials are randomised
 * within each block.  Because the conditionMap rotates which condition is
 * associated with each set, the order of conditions experienced by the
 * participant varies across groups while every set appears in every condition
 * equally often across the six counterbalancing groups.
 *
 * Simulation mode: append ?simulate=1 to the URL to run the experiment
 * automatically without any participant input (uses jsPsych's built-in
 * data-only simulation).  Useful for automated testing.
 */
function runExperiment(bySet) {
  // One procedure node per set; trials randomised within each block
  const blocks = ["1", "2", "3"].map(function (setKey) {
    return {
      timeline: [ldtTrial],
      timeline_variables: bySet[setKey],
      randomize_order: true,
    };
  });

  const timeline = [instructions, ...blocks];

  // Activate simulation mode with ?simulate=1 in the URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("simulate") === "1") {
    jsPsych.simulate(timeline, "data-only");
  } else {
    jsPsych.run(timeline);
  }
}

/* -------------------------------------------------------------------------
   Step 7 — Entry point
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
