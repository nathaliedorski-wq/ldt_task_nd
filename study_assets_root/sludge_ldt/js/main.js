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
 * Group assignment (0 to 5) using the JATOS worker ID modulo 3.
 * Groups 0, 2, 4 -> M=Word, Z=Non-word
 * Groups 1, 3, 5 -> Z=Word, M=Non-word
 * Falls back to a random assignment when running outside of JATOS.
 */

const group = (function () {
  if (typeof jatos !== "undefined") {
    const id = parseInt(jatos.workerId, 10);
    return isNaN(id) ? 0 : id % 6;
  }
  return Math.floor(Math.random() * 6);
}());
/* Determine the key assignment based on even/odd group 
*/
const isEven = group % 2 === 0;
const keyAssignment = {
    word: isEven ? 'm' : 'z',
    nonword: isEven ? 'z' : 'm',
    label_word: isEven ? 'M' : 'Z',
    label_nonword: isEven ? 'Z' : 'M'
};

// Map the 6 groups back to the 3 condition sets (0, 1, 2)
const conditionGroup = Math.floor(group / 2);

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
    <p>Press <strong>${keyAssignment.label_word}</strong> if it is a <strong>real word</strong>.</p>
    <p>Press <strong>${keyAssignment.label_nonword}</strong> if it is <strong>NOT a real word</strong>.</p>
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
let errorCoundInBlock = 0; // track errors to see when reminder is needed 
/**
 * Main LDT trial.
 * Times out after 2000 ms; accuracy is coded as 1 / 0 / -1.
 */
const ldtTrial = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: function () {
    return jsPsych.timelineVariable("stimulus");
  },
  choices: [keyAssignment.word, keyAssignment.nonword], //Dynamic keys
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
      key_assignment: keyAssignment.label_word + "=Word",
    };
  },
  // Code accuracy and update the shared feedback variable
 // on_finish: function (data) {
   // if (data.response === null) {
   //   data.correct = -1; // timeout
   // } else {
   //   data.correct = data.response === data.corr_ans ? 1 : 0;
   // }
   // currentTrialCorrect = data.correct;
 // },
//};
on_finish: function (data) {
  // Determine which key is correct for THIS specific participant
  const correctKey = (data.StimulusType === "WORD") ? keyAssignment.word : keyAssignment.nonword;

  if (data.response === null) {
    data.correct = -1; // timeout
  } else {
    // Compare their response to the dynamic correctKey, NOT the CSV column
    data.correct = (data.response === correctKey) ? 1 : 0;
  }
  currentTrialCorrect = data.correct;
},
};
/* -------------------------------------------------------------------------
   Step 5 — Feedback trial definitions with Hints
   ------------------------------------------------------------------------- */

/**
 * "Too slow!" feedback — shown for 1000 ms only when the trial timed out.
 * Wrapped in a timeline node so conditional_function can gate it.
 */
//const timeoutFeedbackNode = {
//  timeline: [{
//    type: jsPsychHtmlKeyboardResponse,
//    stimulus: "<p style='color:red; font-size:1.5em;'>Too slow!</p>",
//    choices: "NO_KEYS",
//    trial_duration: 1000,
//  }],
//  conditional_function: function () {
//    return currentTrialCorrect === -1;
//  },
//};

/**
 * Correct / Incorrect feedback — shown only when a response was given.
 * Duration: 200 ms for correct, 500 ms for incorrect.
 * - Correct: Just a quick green tick.
 * - Incorrect: Red cross + Reminder of key assignment.
 */
//const correctnessFeedbackNode = {
//  timeline: [{
//    type: jsPsychHtmlKeyboardResponse,
//    stimulus: function () {
//      return currentTrialCorrect === 1
//        ? "<p aria-label='Correct' style='color:green; font-size:1.5em;'>&#10003;</p>"
//        : "<p aria-label='Incorrect' style='color:red; font-size:1.5em;'>&#10007;</p>";
//    },
//    choices: "NO_KEYS",
//    trial_duration: function () {
//      return currentTrialCorrect === 1 ? 200 : 500;
//    },
//  }],
//  conditional_function: function () {
//    return currentTrialCorrect !== -1;
//  },
//};
/* -------------------------------------------------------------------------
   Step 5 — Feedback trial definitions (Improved Spacing & Logic)
   ------------------------------------------------------------------------- */

const timeoutFeedbackNode = {
  timeline: [{
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
      return `
        <div style="height: 400px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <div style="color:red; font-size:2.5em; font-weight: bold;">Too slow!</div>
          <div style="margin-top: 150px; color: #888; font-size: 1em;">
            Reminder: <strong>${keyAssignment.label_word}</strong> = Word, 
            <strong>${keyAssignment.label_nonword}</strong> = Non-word
          </div>
        </div>
      `;
    },
    choices: "NO_KEYS",
    trial_duration: 1500,
  }],
  conditional_function: function () {
    return currentTrialCorrect === -1;
  },
};

const correctnessFeedbackNode = {
  timeline: [{
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function () {
      if (currentTrialCorrect === 1) {
        errorCountInBlock = 0; // Reset counter on correct answer
        return "<p style='color:green; font-size:4em;'>&#10003;</p>";
      } else {
        errorCountInBlock++; // Increment on error
        
        // Show hint only if they have made 3 or more CONSECUTIVE errors
        const showHint = errorCountInBlock >= 3;
        
        return `
          <div style="height: 400px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
            <div style="color:red; font-size:4em;">&#10007;</div>
            ${showHint ? `
              <div style="margin-top: 150px; color: #888; font-size: 1.2em;">
                Reminder: <strong>${keyAssignment.label_word}</strong> = Word, 
                <strong>${keyAssignment.label_nonword}</strong> = Non-word
              </div>
            ` : ''}
          </div>
        `;
      }
    },
    choices: "NO_KEYS",
    trial_duration: function () {
      return currentTrialCorrect === 1 ? 200 : 1200;
    },
  }],
  conditional_function: function () {
    return currentTrialCorrect !== -1;
  },
};
/*-------------------------------------------------------------------------
  Step 6 - Define Break screen between Blocks (only first 2)
  ------------------------------------------------------------------------- */
  const blockBreak = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <div style="max-width: 600px; margin: auto; line-height: 1.8;">
      <h2 style="margin-bottom: 40px;">Break</h2>
      <p style="margin-bottom: 25px;">You have finished a block. Take a short break if you need to.</p>
      <p>Press any key to continue to the next part.</p>
    </div>
  `,
  choices: "ALL_KEYS",
};

/* -------------------------------------------------------------------------
   Step 7 — Assemble timeline and run
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
 * Build the full experiment timeline once stimuli are loaded.
 * 
 * This function iterates through the stimulus lists (blocks) based on the group's 
 * Latin-Square order. For each block, it:
 * 1. Determines the specific video condition (Color, BW, or Static).
 * 2. Creates a randomized procedure of trials.
 * 3. Switches the distractor video and resets error counters at the block's start.
 * 4. Inserts a self-paced break trial between blocks (but not after the final one).
 */

function runExperiment(blockMap) {
  const blockOrder = blockOrderMap[conditionGroup];
  const timeline = [instructions];

  blockOrder.forEach(function (listKey, index) {
    const items = (blockMap[listKey] || []).slice(0,3);
    const condition = items.length > 0 ? items[0].Condition : "Color";
    console.log("DEBUG: Running block with " + items.length + " trials."); // Add this

    const blockProcedure = {
      timeline: [fixationTrial, ldtTrial, timeoutFeedbackNode, correctnessFeedbackNode],
      timeline_variables: items,
      randomize_order: true,
      on_timeline_start: function () {
        applyVideoCondition(condition);
        errorCountInBlock = 0; // Ensure counter resets per block
      },
    };

    // Add the block of trials
    timeline.push(blockProcedure);

    // Add break after block 1 and 2, but not after the 3rd (last) block
    if (index < blockOrder.length - 1) {
      timeline.push(blockBreak);
    }
  });

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
