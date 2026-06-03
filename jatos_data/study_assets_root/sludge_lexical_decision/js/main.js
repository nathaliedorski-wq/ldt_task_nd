/* =========================================================================
   Lexical Decision Task — main.js
   Requires: jsPsych v8, @jspsych/plugin-html-keyboard-response, @jspych/chinrest-plugin
             @jspsych/plugin-preload, @jspsych/psychophysics-plugin, PapaParse, (optional) jatos.js
   ========================================================================= */

/* ---------------------------------------------------------------------------
   Step 1 — Initialise jsPsych + add global variable to store physical scaling 
   ------------------------------------------------------------------------- */
let px2deg = 30;

const jsPsych = initJsPsych({
  display_element: 'jspsych-target',
  use_webaudio: true,
  case_sensitive_responses: false,
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
   Step 2 — Automatic Group Assignment (8 Groups)
   ------------------------------------------------------------------------- */
const group = (function () {
  if (typeof jatos !== "undefined") {
    const id = parseInt(jatos.workerId, 10);
    return isNaN(id) ? 0 : id % 8;
  }
  return Math.floor(Math.random() * 8);
}());

// 0-3 start with Audio, 4-7 start with Visual
const startModality = group < 4 ? "Audio" : "Visual";
const otherModality = group < 4 ? "Visual" : "Audio";

// Key assignment rotation (Z/M)
const keyAssign = group % 2;
const keyMap = {
  word:    keyAssign === 0 ? "m" : "z",
  nonword: keyAssign === 0 ? "z" : "m",
};

/* -------------------------------------------------------------------------
   Step 3 — Condition Mapping Logic
   We map your CSV "Set"
   ------------------------------------------------------------------------- */
const mappingGroup = group % 4;
const CONDITION_ROTATIONS = [
  { "1": ["Audio", "Video"],   "2": ["Visual", "Frozen"] },
  { "1": ["Visual", "Frozen"], "2": ["Audio", "Video"]   },
  { "1": ["Audio", "Frozen"],  "2": ["Visual", "Video"]  },
  { "1": ["Visual", "Video"],  "2": ["Audio", "Frozen"]  },
];
const currentMapping = CONDITION_ROTATIONS[mappingGroup];

/* -------------------------------------------------------------------------
   Step 4 — Welcome scrren and Virtual Chinrest Definition
   ------------------------------------------------------------------------- */

const welcome_screen = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
        <div class="jspsych-standard-look">
            <h1>Welcome to our experiment!</h1>
            <p>Thank you so much for your participation!</p>
            <p>In this task, you will decide if the word you hear or see exists in the English Language.</p>
            <p>In the next step, we will calibrate your screen settings to ensure accuracy.</p>
            <p><strong>Press any key to begin.</strong></p>
        </div>
    `
};

const chinrest = {
  type: jsPsychVirtualChinrest,
  blindspot_reps: 3,
  resize_units: "none",
  pixels_per_unit: 100,

  on_start: function() {
    const style = document.createElement('style');
    style.id = 'chinrest-white-bg';
    style.innerHTML = `
      body, .jspsych-display-element, #jspsych-target, .jspsych-content-wrapper {
        background: white !important;
        background-image: none !important;
        filter: none !important;
        backdrop-filter: none !important;
      }
      video, .background-video, iframe {
        display: none !important;
      }
      .jspsych-content, p, span, div, h2 {
        color: black !important;
        filter: none !important;
        text-shadow: none !important;
        -webkit-filter: blur(0px) !important;
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
   Step 6 — STIMULUS LOADER & COUNTERBALANCING ENGINE
   ------------------------------------------------------------------------- */
function loadStimuli(url, groupMapping) {
  console.log("loadStimuli delimiter: semicolon"); // add this
  return new Promise(function (resolve, reject) {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      delimiter: ";",
      complete: function (results) {
        const blockMap = {};
        try {
          results.data.forEach(function (row) {
            const set = String(row["Set"] || "").trim();
            const rawKey = (row["stimulus_list"] || "").toString().trim();
            const ItemID = (row["ItemID"] || "").trim();
            const target = (row["Target"] || "").trim();
            const stimType = (row["StimulusType"] || "").trim();

            let key;
            let modality = "Visual";
            let condition = "Frozen";

            if (rawKey === "practice" || url.includes("practice")) {
              key = "practice";
              condition = "Video";
            } else {
              const mapping = groupMapping[set];
              if (mapping) {
                modality = mapping[0];
                condition = mapping[1];
                key = modality + "_" + condition;
              } else {
                key = "unknown";
              }
            }

            if (!blockMap[key]) blockMap[key] = [];

            let corrAns;
            if (stimType === "WORD") {
              corrAns = keyMap.word;
            } else if (stimType === "NONWORD") {
              corrAns = keyMap.nonword;
            } else {
              // After
              throw new Error(
                "Unknown StimulusType \"" + stimType + "\" for Target \"" + target + 
                "\" (ItemID: " + (row["ItemID"] || "unknown") + "). Expected \"WORD\" or \"NONWORD\"."
              );                          }

            blockMap[key].push({
              Target: target,
              DisplayTarget: row["DisplayTarget"],
              StimulusType: stimType,
              WordFrequency: row["WordFrequency"],
              corr_ans: corrAns,
              stimulus_list: key,
              stimulus_list_csv: row["stimulus_list"],
              ItemID: row["ItemID"],
              Set: set,
              Modality: modality,
              Condition: condition,
              AudioFile: "stimuli/audio/" + ItemID + ".wav",
              stimulus: target,
            });
          });

          resolve(blockMap);
        } catch (err) {
          reject(err);
        }
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
const instructions = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: function() {
    const action = startModality === "Audio" ? "HEAR words" : "SEE words";

    return `
    <div class="instr-view">
      <h1>Experiment Instructions</h1>
      
      <div class="instr-accent-box">
        <strong>Phase 1:</strong> You will start with <strong>${startModality.toUpperCase()}</strong> trials. 
        In this part, you will ${action}.
      </div>

      <p>Is the item a real English word or a not?</p>

      <div class="key-row">
        <div class="key-card">
          <span class="key-val word-color">${keyMap.word.toUpperCase()}</span>
          <span class="key-label">Real Word</span>
        </div>
        <div class="key-card">
          <span class="key-val nonword-color">${keyMap.nonword.toUpperCase()}</span>
          <span class="key-label">Non Word</span>
        </div>
      </div>

      <p>Please respond as <strong>quickly</strong> and <strong>accurately</strong> as possible.</p>
      <p class="prompt-footer">Press any key to begin the practice block.</p>
    </div>
  `;
  }
};

const customFillerText = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <div class="welcome-screen-clean"> <!-- Using the same class as Welcome -->
      <h2>Information</h2>
      <p>Before starting, we need to calibrate by measuring your distance to your screen.</p>
      <p>Please make sure you are in a comfortable position and <br>
         won't need to move too much during the experiment.</p>
      <p class="prompt">Press any key to continue.</p>
    </div>
  `,
  choices: "ALL_KEYS",
};

let currentTrialCorrect = null;
let errorCountInBlock = 0;
let currentTarget = "";

function makeFixationTrial() {
  return {
    type: jsPsychPsychophysics,
    canvas_width: 1000,
    canvas_height: 600,
    background_color: 'rgba(0,0,0,0)',
    clear_canvas: true,
    stimuli: [{
      obj_type: 'text',
      content: '+',
      font: "40px Arial",
      text_color: 'white',
      startX: 'center',
      startY: 'center'
    }],
    choices: "NO_KEYS",
    trial_duration: 500
  };
}

function makeLdtTrial(isPractice) {
  return {
    type: jsPsychPsychophysics,
    canvas_width: 1000,
    canvas_height: 600,
    background_color: 'rgba(0,0,0,0)',
    clear_canvas: true,
    response_ends_trial: true,
    trial_duration: 2000,
    choices: [keyMap.word, keyMap.nonword],

    stimuli: [
      {
        // Visual word — content set dynamically in on_start
        obj_type: 'text',
        content: '',
        font: "bold 36px Arial",
        text_color: 'white',
        startX: 'center',
        startY: 'center',
        show_start_time: 0
      },
      {
        // Audio word — file set dynamically in on_start, null if visual trial
        obj_type: 'sound',
        file: '',
        show_start_time: 0
      }
    ],

    on_start: function(trial) {
      const mod = jsPsych.evaluateTimelineVariable("Modality");
      const target = jsPsych.evaluateTimelineVariable("Target");
      const audioPath = jsPsych.evaluateTimelineVariable("AudioFile");

      if (mod === "Visual") {
        trial.stimuli[0].content = target;
        trial.stimuli[1].file = null; // no audio
      } else {
        trial.stimuli[0].content = '';  // no text
        trial.stimuli[1].file = audioPath;
      }

      // Fix canvas keyboard focus
      setTimeout(() => {
        const canvas = document.querySelector('#jspsych-target canvas');
        if (canvas) {
          canvas.tabIndex = 0;
          canvas.focus({ preventScroll: true });
        }
      }, 10);
    },

    data: function() {
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
        Modality:          jsPsych.timelineVariable("Modality"),
        group:             group,
        mappingGroup:      mappingGroup,
        keyAssign:         keyAssign,
        wordKey:           keyMap.word,
        nonwordKey:        keyMap.nonword,
        measured_px2deg:   px2deg,
        is_practice:       isPractice || false
      };
    },

    on_finish: function(data) {
      data.correct = data.response === null ? -1 : (data.response === data.corr_ans ? 1 : 0);
      currentTrialCorrect = data.correct;
      if (data.correct === 0) errorCountInBlock++;
      else if (data.correct === 1) errorCountInBlock = 0;
    }
  };
}

function makeTimeoutFeedback() {
  return {
    timeline: [{
      type: jsPsychPsychophysics,
      canvas_width: 1000,
      canvas_height: 600,
      background_color: 'rgba(0,0,0,0)',
      clear_canvas: true,
      stimuli: [
        {
          obj_type: 'text',
          content: "Too slow!",
          font: "bold 40px Arial",
          text_color: 'red',
          startX: 'center',
          startY: 'center'
        },
        {
          obj_type: 'text',
          content: function() {
            return `${keyMap.word.toUpperCase()} = Word    ${keyMap.nonword.toUpperCase()} = Non-word`;
          },
          font: "20px Arial",
          text_color: '#cccccc',
          startX: 'center',
          startY: 450
        }
      ],
      choices: "NO_KEYS",
      trial_duration: 1000
    }],
    conditional_function: function() {
      return currentTrialCorrect === -1;
    }
  };
}

function makeCorrectnessFeedback() {
  return {
    timeline: [{
      type: jsPsychPsychophysics,
      canvas_width: 1000,
      canvas_height: 600,
      background_color: 'rgba(0,0,0,0)',
      clear_canvas: true,
      stimuli: [
        {
          obj_type: 'text',
          content: '',
          font: function() { return Math.round(3 * px2deg) + "px Arial"; },
          text_color: 'white',
          startX: 'center',
          startY: 'center'
        },
        {
          obj_type: 'text',
          content: '',
          font: "22px Arial",
          text_color: '#bbbbbb',
          startX: 'center',
          startY: 450
        }
      ],
      on_start: function(trial) {
        const isCorrect = currentTrialCorrect === 1;
        trial.stimuli[0].content    = isCorrect ? "✓" : "✗";
        trial.stimuli[0].text_color = isCorrect ? "#00FF00" : "#FF0000";
        trial.stimuli[1].content    = (currentTrialCorrect === 0 && errorCountInBlock >= 3)
          ? `${keyMap.word.toUpperCase()} = Word    ${keyMap.nonword.toUpperCase()} = Non-word`
          : "";
      },
      choices: "NO_KEYS",
      trial_duration: function() {
        return currentTrialCorrect === 1 ? 500 : 1500;
      },
      on_finish: function() {
        currentTrialCorrect = null;
      }
    }],
    conditional_function: function() {
      return currentTrialCorrect !== -1 && currentTrialCorrect !== null;
    }
  };
}

/* -------------------------------------------------------------------------
   Step 10 — Break screen between blocks
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
   Step 10b — Video condition helper
   FIX: now accepts a videoSrc parameter so the correct video file is applied
   ------------------------------------------------------------------------- */
function applyVideoCondition(condition, videoSrc) {
  const video = document.getElementById("distractor-video");
  if (!video) return;
  // Switch the source if a new one is provided and it differs from the current
  if (videoSrc && video.getAttribute("src") !== videoSrc) {
    video.src = videoSrc;
    video.load();
  }
  if (condition === "Video") {
    video.style.filter = "";
    video.currentTime = 0;
    video.play();
  } else if (condition === "Frozen") {
    video.style.filter = "";
    video.currentTime = 5.0;
    video.pause();
  }
}

/* -------------------------------------------------------------------------
   Step 11 — Assemble timeline and run
   ------------------------------------------------------------------------- */
function runExperiment(practiceMap, mainMap, audioList) {
  const modalities = [startModality, otherModality];

  
  const timeline = [
    welcome_screen,
    customFillerText,
    chinrest,
    instructions,
    {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: '<div style="background: rgba(0,0,0,0.8); padding: 20px; border-radius: 10px;">' +
                '<p>The following trials will be practice trials.</p>' +
                '<p>Press any key to begin.</p></div>'
    }
  ];

  // Preload is now pushed after timeline is declared
  timeline.unshift({
    type: jsPsychPreload,
    audio: audioList,
    video: ['stimuli/videoA.mp4', 'stimuli/videoB.mp4'],
    message: "Loading experiment assets..."
  });

  /* --- PRACTICE PHASE --- */
  const practiceItems = (practiceMap["practice"] || []).map(item => ({
    ...item,
    Modality: startModality,
    Condition: "Video"
  }));

  let practiceCorrect = 0;

const practiceBlock = {
  timeline: [
    makeFixationTrial(),
    {
      ...makeLdtTrial(),
      data: function() {
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
          Modality:          jsPsych.timelineVariable("Modality"),
          group:             group,
          mappingGroup:      mappingGroup,
          keyAssign:         keyAssign,
          wordKey:           keyMap.word,
          nonwordKey:        keyMap.nonword,
          measured_px2deg:   px2deg,
          is_practice:       true
        };
      },
      on_finish: function(data) {
        if (data.response === null) { data.correct = -1; }
        else { data.correct = data.response === data.corr_ans ? 1 : 0; }
        currentTrialCorrect = data.correct;
        if (data.correct === 1) practiceCorrect++;
      }
    },
    makeTimeoutFeedback(),
    makeCorrectnessFeedback()
  ],
  timeline_variables: practiceItems,
  randomize_order: true,
  on_timeline_start: function() {
    applyVideoCondition("Video", "stimuli/videoA.mp4");
    errorCountInBlock = 0;
  }
};

  const practiceLoop = {
    timeline: [
      {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: function() {
          return `
           <div style="background: rgba(0,0,0,0.85); padding: 40px; border-radius: 15px; max-width: 600px; border: 2px solid #555;">
             <h2 style="color: #FFD700;">Practice Phase</h2>
             <p>You will start with <strong>${startModality.toUpperCase()}</strong> trials.</p>
             <p>Remember: <strong>${keyMap.word.toUpperCase()}</strong> = WORD, <strong>${keyMap.nonword.toUpperCase()}</strong> = NON-WORD</p>
             <p>Press any key to begin.</p>
           </div>`;
        }
      },
      practiceBlock,
      {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: function() {
          const passed = practiceCorrect >= 13;
          const color = passed ? "#00FF00" : "#FF0000";
          return `
            <div style="background: rgba(0,0,0,0.9); padding: 40px; border-radius: 15px; border: 2px solid ${color};">
              <h2 style="color: ${color};">Practice ${passed ? 'Complete' : 'Incomplete'}</h2>
              <p>Score: ${practiceCorrect} / ${practiceItems.length}</p>
              <p>${passed ? 'Great job. Press any key to start the experiment.' : "You need 75% correct. Let's try again."}</p>
            </div>`;
        },
        on_finish: function() { if (practiceCorrect < 13) { practiceCorrect = 0; } }
      }
    ],
    loop_function: function() { return practiceCorrect < 13; }
  };

  timeline.push(practiceLoop);

  /* --- MAIN EXPERIMENT MEGA-BLOCKS --- */
  modalities.forEach((mod, megaIndex) => {

    if (megaIndex === 1) {
      timeline.push({
        type: jsPsychHtmlKeyboardResponse,
        stimulus: `
          <div style="background: #000; padding: 50px; border: 4px solid #FFD700; border-radius: 20px;">
            <h1 style="color: #FFD700;">MODALITY SWITCH</h1>
            <p style="font-size: 1.3em;">You will now switch to <strong>${mod.toUpperCase()}</strong> trials.</p>
            <p>Press any key to continue.</p>
          </div>`,
        on_start: () => {
          const v = document.getElementById("distractor-video");
          if (v) { v.pause(); v.style.visibility = "hidden"; }
        },
        on_finish: () => {
          const v = document.getElementById("distractor-video");
          if (v) { v.style.visibility = "visible"; }
        }
      });
    }

    const videoFile = megaIndex === 0 ? "stimuli/videoA.mp4" : "stimuli/videoB.mp4";
    const videoKey  = mod + "_Video";
    const frozenKey = mod + "_Frozen";
    const videoSet  = mainMap[videoKey]  || [];
    const frozenSet = mainMap[frozenKey] || [];

    [0, 1, 2, 3].forEach((pairIndex) => {
      const videoItems  = videoSet.slice(pairIndex * 25, (pairIndex + 1) * 25);
      const frozenItems = frozenSet.slice(pairIndex * 25, (pairIndex + 1) * 25);

      if (videoItems.length > 0) {
        timeline.push({
          timeline: [makeFixationTrial(), makeLdtTrial(), makeTimeoutFeedback(), makeCorrectnessFeedback()],
          timeline_variables: videoItems,
          randomize_order: true,
          on_timeline_start: () => applyVideoCondition("Video", videoFile)
        });
        timeline.push(blockBreak);
      }

      if (frozenItems.length > 0) {
        timeline.push({
          timeline: [makeFixationTrial(), makeLdtTrial(), makeTimeoutFeedback(), makeCorrectnessFeedback()],
          timeline_variables: frozenItems,
          randomize_order: true,
          on_timeline_start: () => applyVideoCondition("Frozen", videoFile)
        });
        timeline.push(blockBreak);
      }
    });
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("simulate") === "1") {
    jsPsych.simulate(timeline, "data-only");
  } else {
    jsPsych.run(timeline);
  }
}

/* -------------------------------------------------------------------------
   Step 12 — Entry Point
   ------------------------------------------------------------------------- */
function start() {
  console.log("DEBUG: Start function triggered.");
  Promise.all([
    loadStimuli("stimuli/trials_list_practice.csv", currentMapping),
    loadStimuli("stimuli/stimuli.csv", currentMapping)
  ])
  .then(function(results) {
    const allItems = Object.values(results[0]).flat().concat(Object.values(results[1]).flat());
    const audioList = allItems.map(item => item.AudioFile);
    console.log("Assets ready. Starting experiment...");
    runExperiment(results[0], results[1], audioList);
  })
  .catch(function (err) {
    console.error("Failed to load stimuli:", err);
    document.body.innerHTML = `<div style="color:white; background:red; padding:20px;">
      <h1>Loading Error</h1>
      <p>Could not find the stimuli CSV files. Check your /stimuli folder.</p>
      <p>Error: ${err}</p>
    </div>`;
  });
}

if (typeof jatos !== "undefined") {
  jatos.onLoad(start);
} else {
  start();
}
