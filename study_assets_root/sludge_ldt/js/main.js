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
const group =
  typeof jatos !== "undefined"
    ? parseInt(jatos.workerId, 10) % 3
    : Math.floor(Math.random() * 3);

/* -------------------------------------------------------------------------
   Step 2 — Latin-Square condition mapping
   Group 0 : Set 1 = Color,  Set 2 = BW,     Set 3 = Static
   Group 1 : Set 1 = Static, Set 2 = Color,  Set 3 = BW
   Group 2 : Set 1 = BW,     Set 2 = Static, Set 3 = Color
   ------------------------------------------------------------------------- */
const conditionMap = {
  0: { "1": "Color",  "2": "BW",     "3": "Static" },
  1: { "1": "Static", "2": "Color",  "3": "BW"     },
  2: { "1": "BW",     "2": "Static", "3": "Color"  },
};

/**
 * Parse the stimuli CSV and build the jsPsych timeline-variable array.
 * Returns a Promise that resolves with the array of timeline variable objects.
 */
function loadStimuli() {
  return new Promise(function (resolve, reject) {
    Papa.parse("stimuli/stimuli.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        const timelineVariables = results.data.map(function (row) {
          // Trim whitespace from the Target field
          const target = row["Target"].trim();
          const set = String(row["Set"]).trim();
          const condition = conditionMap[group][set] || "Color";

          return {
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
          };
        });
        resolve(timelineVariables);
      },
      error: function (err) {
        reject(err);
      },
    });
  });
}

/* -------------------------------------------------------------------------
   Step 3 — Trial definitions
   ------------------------------------------------------------------------- */

/** Preload the distractor video before the experiment begins */
const preloadTrial = {
  type: jsPsychPreload,
  video: ["stimuli/background_small.mp4"],
};

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

/**
 * Build the LDT trial object.
 * Timeline variables are resolved at runtime by jsPsych.
 */
const ldtTrial = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: function () {
    return jsPsych.timelineVariable("stimulus");
  },
  choices: ["z", "m"],
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
   Step 4 — Assemble timeline and run
   ------------------------------------------------------------------------- */

/**
 * Build the full timeline once stimuli are loaded, then start jsPsych.
 * Accepts the parsed timeline-variable array as its argument.
 */
function runExperiment(timelineVariables) {
  const ldtProcedure = {
    timeline: [ldtTrial],
    timeline_variables: timelineVariables,
    randomize_order: true,
  };

  const timeline = [preloadTrial, instructions, ldtProcedure];

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
