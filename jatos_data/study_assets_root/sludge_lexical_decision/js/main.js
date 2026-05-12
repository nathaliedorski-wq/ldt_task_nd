/* =========================================================================
   Lexical Decision Task — main.js
   Requires: jsPsych v8, @jspsych/plugin-html-keyboard-response, @jspych/chinrest-plugin
             @jspsych/plugin-preload, @jspsych/psychophysics-plugin, PapaParse, (optional) jatos.js
   ========================================================================= */

/* ---------------------------------------ss----------------------------------
   Step 1 — Initialise jsPsych + add global variable to store physical scaling 
   ------------------------------------------------------------------------- */
let px2deg = 30;

const jsPsych = initJsPsych({
  display_element: 'jspsych-target',
  on_finish: function () {
    if (typeof jatos !== "undefined") {
      // Only get data where is_practice is NOT true
      const realData = jsPsych.data.get().filter({is_practice: false}).csv();
      jatos.submitResultData(realData, jatos.startNextComponent);
    } else {
      console.log("Experiment finished. Real Data:");
      console.log(jsPsych.data.get().filter({is_practice: false}).csv());
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

//const group = (function () {
//  return 5; // <--- CHANGE THIS to 0, 1, 2, 3, 4, or 5 for each test to test counterbalancing 
//}());  

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
   Step 4 — Virtual Chinrest Definition
   ------------------------------------------------------------------------- */


const chinrest = {
  type: jsPsychVirtualChinrest,
  blindspot_reps: 3,
  resize_units: "none", 
  pixels_per_unit: 100,
  
  on_start: function() {
    const style = document.createElement('style');
    style.id = 'chinrest-white-bg';
    style.innerHTML = `
      /* 1. Force white background and REMOVE ALL BLUR FILTERS */
      body, .jspsych-display-element, #jspsych-target, .jspsych-content-wrapper {
        background: white !important;
        background-image: none !important;
        filter: none !important; 
        backdrop-filter: none !important;
      }
      /* 2. Hide the Subway Surfers video */
      video, .background-video, iframe {
        display: none !important;
      }
      /* 3. Make text sharp and black */
      .jspsych-content, p, span, div, h2 {
        color: black !important;
        filter: none !important; 
        text-shadow: none !important;
        -webkit-filter: blur(0px) !important; /* Force Safari to stop blurring */
      }
    `;
    document.head.appendChild(style);
  },

  on_finish: function(data) {
    const style = document.getElementById('chinrest-white-bg');
    if (style) style.remove();

    px2deg = data.px2deg;
    console.log("Measured px2deg:", px2deg);
  }
};


/* -------------------------------------------------------------------------
   Step 6 — Load stimuli and build blocks grouped by stimulus_list
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

function loadStimuli(url) { // Added 'url' here
  return new Promise(function (resolve, reject) {
    Papa.parse(url, { // Changed the hardcoded path to 'url'
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        const blockMap = {};
        try {
        results.data.forEach(function (row) {
          // Use stimulus_list as the block key, fall back to Set
          //const rawKey = (row["stimulus_list"] || row["Set"] || "").toString().trim();
          const rawKey = (row["stimulus_list"] || row["Set"] || "").toString().trim();
          //const key = rawKey || "unknown";
          const key = rawKey || "practice";
          if (!blockMap[key]) blockMap[key] = [];

          const target   = row["Target"].trim();
          const set      = String(row["Set"]).trim();
          const stimType = row["StimulusType"].trim();
          const condition = conditionMap[set] || "Color";

          // Derive the correct answer from the stimulus type and the current
          // key map, so corr_ans is always the right physical key.
          // Reject unknown StimulusType values immediately so CSV data errors
          // are caught early rather than silently mis-scored as nonwords.
          let corrAns;
          if (stimType === "WORD") {
            corrAns = keyMap.word;
          } else if (stimType === "NONWORD") {
            corrAns = keyMap.nonword;
          } else {
            throw new Error(
              "Unknown StimulusType \"" + stimType + "\" for Target \"" + target +
              "\" (ItemID: " + row["ItemID"] + "). Expected \"WORD\" or \"NONWORD\"."
            );
          }

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
        } catch (err) {
          reject(err);
          return;
        }
        resolve(blockMap);
      },
      error: function (err) {
        reject(err);
      },
    });
  });
}

/* -------------------------------------------------------------------------
   Step 7 — Trial definitions
   ------------------------------------------------------------------------- */

/** Welcome / instruction screen — shows the participant's actual key assignment */
const instructions = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: function() {
    return `
    <div style="background: rgba(0,0,0,0.8); padding: 40px; border-radius: 15px; max-width: 700px;">

      <p>In this task you will see a word appear on the screen.</p>
      <p>Press <strong>${keyMap.word.toUpperCase()}</strong> if it is a <strong>real word</strong>.</p>
      <p>Press <strong>${keyMap.nonword.toUpperCase()}</strong> if it is <strong>NOT a real word</strong>.</p>
      <p>Respond as quickly and accurately as possible.</p>
      <p>Press any key to begin.</p>
    </div>
  `;
  },
  choices: "ALL_KEYS",
};

/** Custom text screen between instructions and practice */
const customFillerText = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <div style="background: rgba(0,0,0,0.8); padding: 40px; border-radius: 15px; max-width: 700px;">
      <h2> Information</h2>
      <p> Thank you for taking part in this experiment. Before starting, we need to calibrate by measurig your distance to your screen. Please follow the instructions. </p>
      <p>Press any key to continue.</p>
    </div>
  `,
  choices: "ALL_KEYS",
};


/** 500 ms fixation / gaze target shown before each word */
const fixationTrial = {
  type: jsPsychPsychophysics,
  canvas_width: 1000,
  canvas_height: 600,
  background_color: 'rgba(0,0,0,0)',
  clear_canvas: true, // This wipes the previous trial's feedback
  stimuli: [
    {
      obj_type: 'text',
      content: '+', // Just a simple plus sign
      font: "40px Arial",
      text_color: 'white',
      startX: 'center',
      startY: 'center'
    }
  ],
  choices: "NO_KEYS",
  trial_duration: 500
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
let errorCountInBlock = 0; // track consecutive errors to decide when to show key reminder
let currentTarget = "";  // Intermediate variable 

/**
 * Main LDT trial.
 * Times out after 2000 ms; accuracy is coded as 1 / 0 / -1.
 */
const ldtTrial = {
  type: jsPsychPsychophysics,
//making the Canvas large and transparent
  canvas_width: 1000,
  canvas_height: 600,
  background_color: 'rgba(0,0,0,0)',

  trial_duration: 2000,
  choices: [keyMap.word, keyMap.nonword],

    on_start: function(trial) {
  const allData = jsPsych.data.get().last(1).values()[0];
  trial.stimuli[0].content = jsPsych.evaluateTimelineVariable("Target");
  trial.stimuli[1].content = jsPsych.evaluateTimelineVariable("Target");
  console.log("WORD:", trial.stimuli[0].content);
},

stimuli: [
  {
    obj_type: 'text',
      content: "placeholder",
      font: function() {
        let size = 1.5 * px2deg;
        // Adding 'bold' makes the halo slightly thicker and easier to see
        return "bold " + Math.round(size) + "px Arial"; 
      },
      text_color: 'rgba(0,0,0,0.9)', // Deep shaded black/grey
      // Offset by 2 pixels to create the depth/halo effect
      startX: 502, 
      startY: 302,
      show_start_time: 0
    },
    {
    obj_type: 'text',
    content: "placeholder",  // ← fixed value, replaced in on_start
    font: function() {
      let size = 1.5 * px2deg;
      return Math.round(size) + "px Arial";
    },
    text_color: 'white',
    startX: 'center',
    startY: 'center',
    show_start_time: 0
  }
],
  
  data: function () {
    return {
      Target:            jsPsych.timelineVariable("Target"),
      StimulusType:      jsPsych.timelineVariable("StimulusType"),
      WordFrequency:     jsPsych.timelineVariable("WordFrequency"),
      corr_ans:          jsPsych.timelineVariable("corr_ans"),
      stimulus_list:     jsPsych.timelineVariable("stimulus_list"),
      stimulus_list_csv: jsPsych.timelineVariable("stimulus_list_csv"),
      ItemID:            jsPsych.timelineVariable("ItemID"),
      Set:               jsPsych.timelineVariable("Set"),
      Condition:         jsPsych.timelineVariable("Condition"),
      group:             group,
      conditionGroup:    conditionGroup,
      keyAssign:         keyAssign,
      wordKey:           keyMap.word,
      nonwordKey:        keyMap.nonword,
      measured_px2deg:   px2deg
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

    // Fixed: Logic is now INSIDE the function
    if (data.correct === 0) { 
       errorCountInBlock++; 
    } else if (data.correct === 1) {
       errorCountInBlock = 0; 
    }
  } 
};

/* -------------------------------------------------------------------------
   Step 8 — Feedback trial definitions
   ------------------------------------------------------------------------- */

/**
 * "Too slow!" feedback — shown when the trial timed out.
 * Includes a reminder of the key assignment.
 * Wrapped in a timeline node so conditional_function can gate it.
 */
const timeoutFeedbackNode = {
  timeline: [{
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function() {
      return `
        <div style="height: 400px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <div style="color:red; font-size:2.5em; font-weight: bold;">Too slow!</div>
          <div style="margin-top: 150px; color: #888; font-size: 1em;">
            Reminder: <strong>${keyMap.word.toUpperCase()}</strong> = Word,
            <strong>${keyMap.nonword.toUpperCase()}</strong> = Non-word
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

/**
 * Correct / Incorrect feedback — shown only when a response was given.
 * Duration: 500 ms for correct, 1500 ms for incorrect.
 * After 3 or more consecutive errors, also shows a key assignment reminder.
 */
const correctnessFeedbackNode = {
  timeline: [{
    type: jsPsychPsychophysics,
    canvas_width: 1000,
    canvas_height: 600,
    background_color: 'rgba(0,0,0,0)',
    on_start: function(trial) {
      const isCorrect = currentTrialCorrect === 1;
      trial.stimuli[0].content    = isCorrect ? "✓" : "✗";
      trial.stimuli[0].text_color = isCorrect ? "#00FF00" : "#FF0000";
      trial.stimuli[1].content    = (currentTrialCorrect === 0 && errorCountInBlock >= 3)
        ? `Reminder: ${keyMap.word.toUpperCase()}=Word, ${keyMap.nonword.toUpperCase()}=Non-word`
        : "";
    },
    stimuli: [
      {
        obj_type: 'text',
        content: "",           // set in on_start
        font: function() { return Math.round(3 * px2deg) + "px Arial"; },
        text_color: "#FFFFFF", // placeholder, overwritten in on_start
        startX: 'center',
        startY: 'center'
      },
      {
        obj_type: 'text',
        content: "",           // set in on_start
        font: "20px Arial",
        text_color: "#888888",
        startX: 'center',
        startY: function() { return 150; }
      }
    ],
    choices: "NO_KEYS",
    trial_duration: function () {
      return currentTrialCorrect === 1 ? 500 : 1500;
    },
    on_finish: function() {
      currentTrialCorrect = null;
    }
  }],
  conditional_function: function () {
    return currentTrialCorrect !== -1;
  }
};
/* -------------------------------------------------------------------------
   Step 9 — Break screen between blocks
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
   Step 10 — Assemble timeline and run
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
 * Build the full experiment timeline once both practice and main stimuli are loaded.
 * 
 * The experiment begins with a practice phase (17 trials) using the background video 
 * condition of the first experimental block. Participants must achieve a 75% accuracy 
 * score (13/17) to proceed; failing this, the practice block repeats. 
 *
 * Following practice, three randomized experimental blocks are presented. 
 * Presentation order is determined by blockOrderMap[group], which combines with 
 * conditionMap to provide full counterbalancing: each condition appears in every 
 * block position 2×, every stimulus list appears in every condition 2×, and every 
 * list appears in every block position 2× across the six groups.
 *
 * Practice data is tagged with 'is_practice: true' so it can be filtered out
 * during the final JATOS data submission in Step 1.
 *
 * Simulation mode: append ?simulate=1 to the URL to run the experiment
 * automatically (data-only mode).
 * 
 * @param {Object} practiceMap - Stimulus trials for the practice phase.
 * @param {Object} mainMap - Stimulus blocks for the three main conditions.
 */
/* -------------------------------------------------------------------------
   Step 8 — Assemble timeline and run (Updated with Practice Loop)
   ------------------------------------------------------------------------- */
function runExperiment(practiceMap, mainMap) {
  const blockOrder = blockOrderMap[group];
  console.log("Practice Data Loaded:", practiceMap); // THE SPY
  console.log("Main Data Loaded:", mainMap);         // THE SPY
  const timeline = [
    customFillerText,
    chinrest,
    instructions, 
    
    {
      type: jsPsychHtmlKeyboardResponse,
      stimulus :'<div style="background: rgba(0,0,0,0.8); padding: 20px; border-radius: 10px;">' +
                '<p>The following trials will be practice trials.</p>' +
                '<p>Press any key to begin.</p></div>'
    }
  ];                
  

  // 1. Determine practice condition (matches first block of their group)
  const firstList = blockOrder[0];
  const practiceCondition = conditionMap[firstList];

  // 2. Setup Practice Trials Logic
  const practiceItems = practiceMap["practice"] || []; // Practice CSV uses default key "unknown"
  let practiceCorrect = 0; // Counter for the 75% gate

  const practiceBlock = {
    timeline: [
      fixationTrial, 
      {
        ...ldtTrial, 
        // We override the data/on_finish for practice only
        data: function() {
          return {
            ...ldtTrial.data(), // keep original data fields
            is_practice: true   // mark so Step 1 filter ignores this
          };
        },
        on_finish: function(data) {
          // Standard scoring logic
          if (data.response === null) {
            data.correct = -1;
          } else {
            data.correct = data.response === data.corr_ans ? 1 : 0;
          }
          currentTrialCorrect = data.correct;
          // Practice specific counter
          if (data.correct === 1) practiceCorrect++;
        }
      }, 
      timeoutFeedbackNode, 
      correctnessFeedbackNode
    ],
    timeline_variables: practiceItems,
    randomize_order: true,
    on_timeline_start: function() {
      applyVideoCondition(practiceCondition);
      errorCountInBlock = 0;
    }
  };

  const practiceLoop = {
    timeline: [
      {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: function() {
          return `
           <div style="background: rgba(0,0,0,0.8); padding: 40px; border-radius: 15px; max-width: 600px;">
             <h2>Practice Phase</h2>
             <p>Remember:<br>
               <strong>${keyMap.word.toUpperCase()}</strong> = WORD<br>
               <strong>${keyMap.nonword.toUpperCase()}</strong> = NOT A WORD
             </p>
             <p>Press any key to begin.</p>
           </div>`;
        }, 
      },
      practiceBlock,
      {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: function() {
          const passed = practiceCorrect >= 13;
          const color = passed ? "green" : "red";
          const msg = passed ? "Great job. Press any key to start the experiment." : "You need 75% correct. Let's try again.";
          
          return `<div style="background: rgba(0,0,0,0.8); padding: 40px; border-radius: 15px; color:${color};">
                    <h2>Practice ${passed ? 'Complete' : 'Incomplete'}</h2>
                    <p>Score: ${practiceCorrect} / ${practiceItems.length}</p>
                    <p>${msg}</p>
                  </div>`;
        },
        on_finish: function(data) {
          // Reset counter if they have to try again
          if (practiceCorrect < 13) {
            practiceCorrect = 0;
          }
          if (data.correct === 0) { 
            errorCountInBlock++; 
          } else if (data.correct === 1) {
            errorCountInBlock = 0;
          }

        }
      }
    ],
    loop_function: function() {
      // Loop the practice if they scored < 75%
      return practiceCorrect < 13;
    }
  };

  // Add the practice gate to the timeline
  timeline.push(practiceLoop);

  // 3. Assemble Main Experiment Blocks
  blockOrder.forEach(function (listKey, index) {
    const items = mainMap[listKey] || [];
    //const smallItems = items.slice(0, 3);
    const condition = items.length > 0 ? items[0].Condition : "Color";

    const blockProcedure = {
      timeline: [
        fixationTrial, 
        {
          ...ldtTrial,
          data: function() {
            return {
              ...ldtTrial.data(), 
              is_practice: false 
            };
          }
        }, 
        timeoutFeedbackNode, 
        correctnessFeedbackNode
      ],
      timeline_variables: items,
      //timeline_variables: smallItems,
      randomize_order: true,
      on_timeline_start: function () {
        applyVideoCondition(condition);
        errorCountInBlock = 0;
      },
    };

    timeline.push(blockProcedure);

    if (index < blockOrder.length - 1) {
      timeline.push(blockBreak);
    }
  });

  // Activate simulation or run
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("simulate") === "1") {
    jsPsych.simulate(timeline, "data-only");
  } else {
    jsPsych.run(timeline);
  }
}
/* -------------------------------------------------------------------------
   Step 11 — Entry point
   ------------------------------------------------------------------------- */

/**
 * Uses jatos.onLoad() when running inside JATOS; falls back to a direct
 * call when running locally without JATOS.
 */
//if (typeof jatos !== "undefined") {
//  jatos.onLoad(function () {
//    loadStimuli()
//      .then(runExperiment)
//      .catch(function (err) {
//        console.error("Failed to load stimuli:", err);
//      });
//  });
//} else {
  // Local / standalone testing fallback
//  loadStimuli()
//    .then(runExperiment)
//    .catch(function (err) {
//      console.error("Failed to load stimuli:", err);
//    });


function start() {
  // Load both files in parallel
  Promise.all([
    loadStimuli("stimuli/trials_list_practice.csv"), 
    loadStimuli("stimuli/stimuli.csv")
  ])
  .then(function(results) {
    // results[0] is the Practice data
    // results[1] is the Main data
    runExperiment(results[0], results[1]); 
  })
  .catch(function (err) {
    console.error("Failed to load stimuli:", err);
  });
}

if (typeof jatos !== "undefined") {
  jatos.onLoad(start);
} else {
  start();
} 